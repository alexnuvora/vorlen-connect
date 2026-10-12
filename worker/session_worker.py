#!/usr/bin/env python3
"""Owner-scoped LinkedIn browser/session worker. No public listener.

The server grants one-use, expiring jobs. Credentials arrive only in the claimed
job over TLS. Browser state is AES-GCM encrypted with a host-only key. Challenges
are surfaced to the account holder, never solved or bypassed by this worker.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import time
import urllib.error
import urllib.request
from urllib.parse import quote, urlencode, urlparse
import uuid
from datetime import datetime, timezone
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import native_linkedin
import native_mail

VERSION = 'session-broker-1.1.1'
API = 'https://connect.vorlen.co.uk/api/session-worker'
ROOT = Path(os.environ.get('VORLEN_SESSION_STATE_DIR', '/var/lib/vorlen-session'))
STOP = False


class BrokerError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def connection_key(owner, connection):
    uuid.UUID(connection)
    return hashlib.sha256((owner + ':' + connection).encode()).hexdigest()


class Vault:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.cipher = AESGCM((self.root / 'vault.key').read_bytes())

    def path(self, owner, connection):
        return self.root / (connection_key(owner, connection) + '.session')

    def save(self, owner, connection, state):
        aad = (owner + ':' + connection).encode()
        nonce = os.urandom(12)
        payload = nonce + self.cipher.encrypt(nonce, json.dumps(state).encode(), aad)
        path = self.path(owner, connection)
        tmp = path.with_suffix('.tmp')
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'wb') as f:
            f.write(payload)
        os.replace(tmp, path)

    def load(self, owner, connection):
        try:
            data = self.path(owner, connection).read_bytes()
            result = json.loads(self.cipher.decrypt(data[:12], data[12:], (owner + ':' + connection).encode()))
            if result['expires'] <= time.time():
                self.remove(owner, connection)
                raise BrokerError('SESSION_EXPIRED')
            return result
        except FileNotFoundError:
            raise BrokerError('SESSION_EXPIRED') from None

    def remove(self, owner, connection):
        self.path(owner, connection).unlink(missing_ok=True)

    def prune(self, owner, active_connections):
        keep = {self.path(owner, c).name for c in active_connections}
        # Single owner is assigned by the server, never by caller-controlled jobs.
        for p in self.root.glob('*.session'):
            if p.name not in keep:
                p.unlink()


def signed_api(action, **values):
    body = json.dumps({'action': action, 'version': VERSION, **values}, separators=(',', ':'), ensure_ascii=False).encode()
    timestamp, nonce = str(int(time.time() * 1000)), str(uuid.uuid4())
    key = serialization.load_pem_private_key((ROOT / 'signing.pem').read_bytes(), password=None)
    signature = key.sign((timestamp + '\n' + nonce + '\n' + hashlib.sha256(body).hexdigest()).encode())
    req = urllib.request.Request(API, data=body, method='POST', headers={
        'Content-Type': 'application/json', 'X-Vorlen-Timestamp': timestamp,
        'X-Vorlen-Nonce': nonce, 'X-Vorlen-Signature': base64.b64encode(signature).decode()})
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    with urllib.request.build_opener(NoRedirect).open(req, timeout=25) as response:
        data = response.read(300000)
        if len(data) >= 300000:
            raise BrokerError('RESPONSE_TOO_LARGE')
        return json.loads(data)['data']


def objects(value):
    if isinstance(value, dict):
        yield value
        for v in value.values():
            yield from objects(v)
    elif isinstance(value, list):
        for v in value:
            yield from objects(v)


def profile(data):
    for p in objects(data):
        if p.get('firstName') and (p.get('publicIdentifier') or p.get('entityUrn')):
            identifier = str(p.get('publicIdentifier') or p.get('entityUrn', '').split(':')[-1])
            urn = str(p.get('entityUrn', ''))
            return {'id': identifier, 'urn': urn[:300],
                    'name': (str(p.get('firstName', '')) + ' ' + str(p.get('lastName', ''))).strip()[:300],
                    'headline': str(p.get('occupation') or p.get('headline') or '')[:500],
                    'url': 'https://www.linkedin.com/in/' + quote(identifier, safe='')}
    raise BrokerError('PROVIDER_SCHEMA_CHANGED')


def clean_records(data, count):
    # Explicitly select content fields; never return raw provider response objects.
    rows = data.get('elements')
    if not isinstance(rows, list):
        raise BrokerError('PROVIDER_SCHEMA_CHANGED')
    result = []
    for row in rows[:count]:
        obj = list(objects(row))
        people = []
        for p in obj:
            if p.get('firstName'):
                people.append({'name': (str(p.get('firstName', '')) + ' ' + str(p.get('lastName', ''))).strip()[:300],
                               'identifier': str(p.get('publicIdentifier', ''))[:300]})
        texts = []
        for p in obj:
            for field in ('body', 'text', 'message', 'headline'):
                if isinstance(p.get(field), str) and p[field] and p[field] not in texts:
                    texts.append(p[field][:5000])
        result.append({'id': str(row.get('entityUrn') or row.get('id') or '')[:500],
                       'people': people[:20], 'text': texts[:10],
                       'created_at': row.get('createdAt') if isinstance(row.get('createdAt'), (int, float)) else None,
                       'last_activity_at': row.get('lastActivityAt') if isinstance(row.get('lastActivityAt'), (int, float)) else None})
    truncated = False
    while len(json.dumps(result, ensure_ascii=False).encode()) > 100000:
        result.pop()
        truncated = True
    paging = data.get('paging') or {}
    return {'items': result, 'truncated': truncated, 'paging': {k: paging[k] for k in ('start', 'count', 'total') if isinstance(paging.get(k), int)}}


class LinkedInBrowser:
    def __init__(self, playwright, vault):
        self.playwright, self.vault = playwright, vault
        self.browser = self.context = self.page = None
        self.scope = None
        self.challenge_until = 0
        self.last_use = 0
        self.stage = 'IDLE'

    def close(self):
        try:
            if self.browser:
                self.browser.close()
        finally:
            self.browser = self.context = self.page = None
            self.scope = None

    def open(self, owner, connection, fresh=False):
        scope = (owner, connection)
        if not fresh:
            self.vault.load(owner,connection)
        if not fresh and self.scope == scope and self.browser and self.browser.is_connected():
            self.last_use = time.time()
            return
        self.close()
        state = None
        if not fresh:
            state = self.vault.load(owner, connection)['storage']
        self.stage='BROWSER_LAUNCH'
        self.browser = self.playwright.chromium.launch(channel='chromium', headless=True,
            chromium_sandbox=True, args=['--disable-dev-shm-usage'])
        self.stage='BROWSER_CONTEXT'
        self.context = self.browser.new_context(storage_state=state, locale='en-GB', accept_downloads=False)
        self.context.set_default_timeout(20000)
        self.page = self.context.new_page()
        self.scope, self.last_use = scope, time.time()

    def request(self, path, params=None, method='GET', data=None):
        if not path.startswith('/') or '://' in path:
            raise BrokerError('INVALID_OPERATION')
        cookies = {c['name']: c['value'] for c in self.context.cookies('https://www.linkedin.com')}
        csrf = cookies.get('JSESSIONID', '').strip('"')
        if not cookies.get('li_at') or not csrf:
            raise BrokerError('AUTH_REQUIRED')
        url = 'https://www.linkedin.com/voyager/api' + path
        if params:
            url += '?' + urlencode(params)
        self.stage='PROVIDER_REQUEST'
        r = self.context.request.fetch(url, method=method, data=data,
            headers={'csrf-token': csrf, 'x-restli-protocol-version': '2.0.0', 'accept': 'application/json'},
            timeout=25000, max_redirects=0)
        try:
            if r.status in (401, 302, 303):
                raise BrokerError('SESSION_EXPIRED')
            if r.status == 429:
                raise BrokerError('RATE_LIMITED')
            if r.status == 403:
                raise BrokerError('ACCESS_RESTRICTED')
            if r.status in (404, 410):
                raise BrokerError('PROVIDER_ENDPOINT_CHANGED')
            if not r.ok:
                raise BrokerError('PROVIDER_REQUEST_FAILED')
            raw = r.body()
            if len(raw) > 2000000:
                raise BrokerError('RESPONSE_TOO_LARGE')
            return (json.loads(raw) if raw else {}), r.status
        finally:
            r.dispose()

    def connected(self):
        me = profile(self.request('/me')[0])
        now = time.time()
        cookies = self.context.cookies('https://www.linkedin.com')
        token_expiry = next((c.get('expires', -1) for c in cookies if c['name'] == 'li_at'), -1)
        expires = min(now + 86400, token_expiry) if token_expiry > 0 else now + 86400
        reference = os.urandom(32).hex()
        self.vault.save(*self.scope, {'storage': self.context.storage_state(), 'expires': expires, 'profile': me})
        return {'ok': True, 'connection_state': 'connected', 'reference': reference, 'profile_id': me['id'],
                'expires_at': datetime.fromtimestamp(expires, timezone.utc).isoformat().replace('+00:00', 'Z'), 'data': me}

    def login_result(self):
        # A cookie alone is not proof: require authenticated member identity.
        if any(c['name'] == 'li_at' for c in self.context.cookies('https://www.linkedin.com')):
            return self.connected()
        current = urlparse(self.page.url)
        if current.hostname not in ('www.linkedin.com', 'linkedin.com'):
            raise BrokerError('UNEXPECTED_LOGIN_REDIRECT')
        text = self.page.locator('body').inner_text(timeout=5000).lower()
        code = self.page.locator('input[name="pin"],input#input__phone_verification_pin,input[autocomplete="one-time-code"]')
        if code.count():
            kind = 'totp' if 'authenticator' in text else 'email'
        elif 'captcha' in text or self.page.locator('iframe[src*="captcha"]').count():
            kind = 'captcha'
        elif 'check your' in text or 'approve' in text or '/checkpoint/' in current.path:
            kind = 'push' if 'app' in text else 'other'
        else:
            raise BrokerError('LOGIN_FAILED')
        self.challenge_until = time.time() + 600
        return {'ok': True, 'connection_state': 'verification_required', 'verification_kind': kind,
                'data': {'message': 'Enter the verification code or approve the sign-in in LinkedIn, then check again. CAPTCHA or identity checks require manual completion; use an existing verified session if necessary.'}}

    def run(self, job):
        owner, cid, op, p = job['owner_id'], job['connection_id'], job['operation'], job['input']
        self.stage='BROWSER_OPERATION'
        if op in ('connect', 'import'):
            self.vault.remove(owner, cid)
            self.open(owner, cid, fresh=True)
            if op == 'import':
                self.context.add_cookies([{'name': name, 'value': value, 'domain': '.linkedin.com',
                                          'path': '/', 'secure': True, 'httpOnly': True}
                                         for name, value in [('li_at', p['li_at']), ('JSESSIONID', p['jsessionid'])]])
                return self.connected()
            self.stage='LOGIN_NAVIGATION'
            self.page.goto('https://www.linkedin.com/login',wait_until='domcontentloaded',timeout=45000)
            current=urlparse(self.page.url)
            if current.hostname not in ('www.linkedin.com','linkedin.com'):raise BrokerError('UNEXPECTED_LOGIN_REDIRECT')
            username=self.page.locator('input#username')
            password=self.page.locator('input#password')
            if username.count()!=1 or password.count()!=1:
                # Surface checkpoints without trying to fill a different page.
                if '/checkpoint/' in current.path:return self.login_result()
                raise BrokerError('LOGIN_FORM_UNAVAILABLE')
            self.stage='LOGIN_FORM_FILL'
            username.fill(p['email']);password.fill(p['password'])
            form=password.locator('xpath=ancestor::form')
            submit=form.locator('button[type="submit"]')
            if submit.count()!=1:raise BrokerError('LOGIN_FORM_UNAVAILABLE')
            self.stage='LOGIN_SUBMIT'
            submit.click()
            self.page.wait_for_timeout(2500)
            return self.login_result()
        if op in ('verify', 'refresh'):
            if self.scope != (owner, cid) or not self.page or time.time() > self.challenge_until:
                raise BrokerError('VERIFICATION_EXPIRED')
            if op == 'verify':
                locator = self.page.locator('input[name="pin"],input#input__phone_verification_pin,input[autocomplete="one-time-code"]')
                if not locator.count():
                    raise BrokerError('MANUAL_VERIFICATION_REQUIRED')
                locator.first.fill(p['code'])
                self.page.locator('button[type="submit"]').first.click()
                self.page.wait_for_timeout(2000)
            return self.login_result()
        if op in ('connect_mail','emails','send_email'):
            return native_mail.run(self.vault,job,BrokerError)
        self.open(owner, cid)
        # Persisted sessions can expire or be revoked remotely at any time.
        own = profile(self.request('/me')[0])
        if op == 'profile' and not p.get('identifier'):
            return {'ok': True, 'data': own}
        if op in ('profile','contact','company','search_companies','search_people','network_status','sent_invitations','feed','post_comments'):
            return {'ok':True,'data':native_linkedin.read(self,op,p,BrokerError)}
        paging = {'start': p.get('start', 0), 'count': p.get('count', 10)}
        if op == 'inbox':
            params={'keyVersion':'LEGACY_INBOX',**paging}
            if p.get('category')=='UNREAD':params['q']='unread'
            data = self.request('/messaging/conversations', params)[0]
        elif op == 'conversation':
            conversation=p.get('conversation_id')
            if not conversation:
                _,conversation=native_linkedin.find_conversation(self,p['identifier'],BrokerError)
                if not conversation:return {'ok':True,'data':{'items':[],'conversation_exists':False}}
            conversation=conversation.split(':')[-1]
            data = self.request('/messaging/conversations/' + quote(conversation, safe='') + '/events', paging)[0]
        elif op == 'invitations':
            data = self.request('/relationships/invitationViews', {'q': 'receivedInvitation', 'includeInsights': 'true', **paging})[0]
        elif op == 'connections':
            data = self.request('/relationships/connections', {'q': 'search', **paging})[0]
        elif op == 'search_people':
            data = self.request('/search/blended', {'q': 'all', 'keywords': p['keywords'], 'filters': 'List(resultType->PEOPLE)', **paging})[0]
        elif op == 'recruiter':
            self.page.goto('https://www.linkedin.com/talent/home', wait_until='domcontentloaded', timeout=30000)
            self.page.wait_for_timeout(2000)
            u = urlparse(self.page.url)
            if u.hostname != 'www.linkedin.com' or not u.path.startswith('/talent/'):
                raise BrokerError('RECRUITER_ENTITLEMENT_REQUIRED')
            main = self.page.locator('main')
            if not main.count():
                raise BrokerError('PROVIDER_SCHEMA_CHANGED')
            visible = main.inner_text()[:12000]
            if not re.search(r'recruiter|projects|candidates', visible, re.I):
                raise BrokerError('RECRUITER_ENTITLEMENT_REQUIRED')
            return {'ok': True, 'data': {'url': self.page.url, 'visible_workspace': visible,
                'scope': 'Current account Recruiter workspace only; CV and job management are not implemented.'}}
        elif op == 'send_message':
            event = {'eventCreate': {'originToken': job['id'], 'value': {'com.linkedin.voyager.messaging.create.MessageCreate':
                {'attributedBody': {'text': p['content'], 'attributes': []}, 'attachments': []}},
                'trackingId': base64.b64encode(os.urandom(16)).decode()}, 'dedupeByClientGeneratedToken': True}
            conversation=p.get('conversation_id')
            member=None
            if p.get('identifier'):member,conversation=native_linkedin.find_conversation(self,p['identifier'],BrokerError)
            if conversation:
                response,status=self.request('/messaging/conversations/'+quote(conversation.split(':')[-1],safe='')+'/events',{'action':'create'},'POST',event)
            else:
                event.update({'recipients':[member],'subtype':'MEMBER_TO_MEMBER'})
                response,status=self.request('/messaging/conversations',{'action':'create'},'POST',{'keyVersion':'LEGACY_INBOX','conversationCreate':event})
            if status != 201:
                raise BrokerError('PUBLICATION_UNCONFIRMED')
            return {'ok': True, 'data': {'sent': True, 'conversation_id': conversation,
                'provider_id': str(response.get('entityUrn') or response.get('value', {}).get('entityUrn') or '')[:300]}}
        elif op == 'send_invitation':
            recipient = profile(self.request('/identity/profiles/' + quote(p['identifier'], safe='') + '/profileView')[0])
            member = recipient['urn'].split(':')[-1]
            if not member or member == recipient['urn']:
                raise BrokerError('PROVIDER_SCHEMA_CHANGED')
            payload = {'trackingId': base64.b64encode(os.urandom(16)).decode(), 'message': p.get('content', ''),
                       'invitations': [], 'excludeInvitations': [],
                       'invitee': {'com.linkedin.voyager.growth.invitation.InviteeProfile': {'profileId': member}}}
            _, status = self.request('/growth/normInvitations', method='POST', data=payload)
            if status not in (200, 201):
                raise BrokerError('PUBLICATION_UNCONFIRMED')
            return {'ok': True, 'data': {'sent': True, 'recipient': recipient}}
        else:
            raise BrokerError('UNSUPPORTED_OPERATION')
        return {'ok': True, 'data': native_linkedin.collection(data,paging['count'],BrokerError)}


def stop(*_):
    global STOP
    STOP = True


def main():
    from playwright.sync_api import sync_playwright
    os.umask(0o077)
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(BrokerError('JOB_DEADLINE_EXCEEDED')))
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    vault = Vault(ROOT)
    with sync_playwright() as playwright:
        browser = LinkedInBrowser(playwright, vault)
        print('Vorlen session worker started; no public listener', flush=True)
        while not STOP:
            try:
                data = signed_api('claim')
                vault.prune(data['owner_id'], data.get('connections', []))
                for job in data.get('rows', [])[:1]:
                    vault.prune(job['owner_id'], data.get('connections', []))
                    try:
                        signal.alarm(120)
                        result = browser.run(job)
                    except BrokerError as exc:
                        result = {'ok': False, 'error_code': exc.code}
                        if exc.code in ('AUTH_REQUIRED', 'SESSION_EXPIRED', 'LOGIN_FAILED', 'VERIFICATION_EXPIRED'):
                            vault.remove(job['owner_id'], job['connection_id'])
                            browser.close()
                    except Exception as exc:
                        # Only fixed stage/type codes; Playwright exception text can contain credentials.
                        kind='TIMEOUT' if type(exc).__name__=='TimeoutError' else 'FAILED'
                        stage=browser.stage if browser.stage in ('BROWSER_LAUNCH','BROWSER_CONTEXT','LOGIN_NAVIGATION','LOGIN_FORM_FILL','LOGIN_SUBMIT','PROVIDER_REQUEST') else 'BROWSER_OPERATION'
                        code=stage+'_'+kind
                        print(json.dumps({'event':'job_failed','operation':job['operation'],'code':code}),flush=True)
                        result = {'ok': False, 'error_code': code}
                        browser.close()
                    finally:
                        signal.alarm(0)
                    job['input'] = {}
                    if len(json.dumps(result,ensure_ascii=False).encode())>220000:
                        result={'ok':False,'error_code':'RESPONSE_TOO_LARGE'}
                    # Retry completion transport only, never the account action.
                    for attempt in range(3):
                        try:
                            signed_api('finish', id=job['id'], lease_token=job['lease_token'], result=result)
                            break
                        except Exception:
                            time.sleep(2)
                if browser.scope:
                    owner, cid = browser.scope
                    vault.prune(owner, data.get('connections', []))
                    if cid not in data.get('connections', []) or time.time() - browser.last_use > 600:
                        browser.close()
                status = {'version': VERSION, 'last_poll': datetime.now(timezone.utc).isoformat(), 'worker_api': 'ok', 'browser_open': bool(browser.browser)}
            except Exception:
                status = {'version': VERSION, 'last_poll': datetime.now(timezone.utc).isoformat(), 'worker_api': 'unavailable'}
            (ROOT / 'status.json').write_text(json.dumps(status))
            for _ in range(5):
                if STOP:
                    break
                time.sleep(1)
        browser.close()


if __name__ == '__main__':
    main()
