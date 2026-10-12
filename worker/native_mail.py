"""Native TLS IMAP/SMTP, pinned public endpoints, no paid mail relay.

Credentials stay in the local encrypted vault. IMAP reads use readonly INBOX and
BODY.PEEK. SMTP acknowledgement means accepted by the server, not delivered.
"""
import email
from email import policy
from email.message import EmailMessage
from email.utils import make_msgid, getaddresses
import hashlib
import imaplib
import ipaddress
import json
import os
import re
import smtplib
import socket
import ssl
import time
from datetime import datetime, timezone

class MailError(Exception):
    pass

def public_socket(host,port,timeout=15):
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{2,251}[a-z0-9]',host):raise MailError('INVALID_MAIL_HOST')
    addresses=socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)
    if not addresses:raise MailError('MAIL_DNS_FAILED')
    # Reject mixed public/private answers too. Connect to the checked numeric IP,
    # not a second DNS resolution; keep original hostname for TLS validation/SNI.
    for family,_,_,_,addr in addresses:
        ip=ipaddress.ip_address(addr[0])
        if not ip.is_global or getattr(ip,'ipv4_mapped',None) and not ip.ipv4_mapped.is_global:raise MailError('PRIVATE_MAIL_HOST_BLOCKED')
    family,kind,proto,_,addr=addresses[0]
    sock=socket.socket(family,kind,proto);sock.settimeout(timeout)
    try:sock.connect(addr);return sock
    except Exception:sock.close();raise

class Imap(imaplib.IMAP4_SSL):
    def _create_socket(self,timeout):
        sock=public_socket(self.host,self.port,timeout or 15)
        try:return self.ssl_context.wrap_socket(sock,server_hostname=self.host)
        except Exception:sock.close();raise
class Smtp(smtplib.SMTP):
    def _get_socket(self,host,port,timeout):return public_socket(host,port,timeout)
class SmtpSSL(smtplib.SMTP_SSL):
    def _get_socket(self,host,port,timeout):
        sock=public_socket(host,port,timeout)
        try:return self.context.wrap_socket(sock,server_hostname=host)
        except Exception:sock.close();raise

def imap_connection(config):
    client=Imap(config['imap_host'],config['imap_port'],ssl_context=ssl.create_default_context(),timeout=15)
    try:client.login(config['email'],config['password']);return client
    except Exception:
        try:client.shutdown()
        except Exception:pass
        raise

def smtp_connection(config):
    if config['smtp_port']==465:client=SmtpSSL(config['smtp_host'],465,timeout=15,context=ssl.create_default_context())
    elif config['smtp_port']==587:
        client=Smtp(config['smtp_host'],587,timeout=15)
        try:client.ehlo();client.starttls(context=ssl.create_default_context());client.ehlo()
        except Exception:client.close();raise
    else:raise MailError('INVALID_MAIL_PORT')
    try:client.login(config['email'],config['password']);return client
    except Exception:client.close();raise

def messages(config,p):
    with imap_connection(config) as client:
        if client.select('INBOX',readonly=True)[0]!='OK':raise MailError('MAIL_INBOX_UNAVAILABLE')
        status,raw=client.uid('search',None,'UNSEEN' if p.get('unread_only') else 'ALL')
        if status!='OK':raise MailError('MAIL_SEARCH_FAILED')
        ids=raw[0].split()[::-1];start=p.get('start',0);count=p.get('count',10)
        selected=ids[start:start+count];items=[]
        for uid in selected:
            status,parts=client.uid('fetch',uid,'(FLAGS RFC822.SIZE BODY.PEEK[]<0.65536>)')
            if status!='OK':raise MailError('MAIL_FETCH_FAILED')
            chunks=[part for part in parts if isinstance(part,tuple)]
            if not chunks:raise MailError('MAIL_FETCH_FAILED')
            meta,content=chunks[0];msg=email.message_from_bytes(content,policy=policy.default)
            texts=[]
            for part in msg.walk():
                if part.get_content_type()=='text/plain' and part.get_content_disposition()!='attachment':
                    payload=part.get_payload(decode=True) or b''
                    try:texts.append(payload.decode(part.get_content_charset() or 'utf-8',errors='replace')[:12000])
                    except LookupError:texts.append(payload.decode('utf-8',errors='replace')[:12000])
            size_match=re.search(rb'RFC822.SIZE (\d+)',meta);size=int(size_match[1]) if size_match else len(content)
            items.append({'uid':uid.decode(),'message_id':str(msg.get('Message-ID',''))[:500],
                'from':str(msg.get('From',''))[:1000],'to':str(msg.get('To',''))[:1000],
                'subject':str(msg.get('Subject',''))[:1000],'date':str(msg.get('Date',''))[:200],
                'unread':b'\\Seen' not in meta,'text':'\n'.join(texts)[:12000],
                'in_reply_to':str(msg.get('In-Reply-To',''))[:500],
                'is_delivery_report':msg.get_content_type()=='multipart/report' and msg.get_param('report-type')=='delivery-status',
                'truncated':size>len(content)})
        while len(json.dumps(items).encode())>150000:items.pop()
        n=start+len(items)
        return {'items':items,'total':len(ids),'next_offset':n if n<len(ids) else None,'readonly':True}

def compose(config,p,job_id):
    msg=EmailMessage()
    msg['From']=config['email'];msg['To']=p['to'];msg['Subject']=p['subject']
    # Deterministic Message-ID aids reconciliation; SMTP has no idempotency key.
    msg['Message-ID']='<vorlen-'+job_id+'@'+config['email'].rsplit('@',1)[1]+'>'
    if p.get('reply_to'):msg['Reply-To']=p['reply_to']
    msg.set_content(p.get('text') or '')
    if p.get('html'):msg.add_alternative(p['html'],subtype='html')
    return msg

def run(vault,job,error):
    owner,cid,p,op=job['owner_id'],job['connection_id'],job['input'],job['operation']
    try:
        if op=='connect_mail':
            # Verify both services without sending a message.
            with imap_connection(p) as client:
                if client.select('INBOX',readonly=True)[0]!='OK':raise MailError('MAIL_INBOX_UNAVAILABLE')
            with smtp_connection(p):pass
            expires=time.time()+86400
            vault.save(owner,cid,{'expires':expires,'mail':p})
            return {'ok':True,'connection_state':'connected','reference':os.urandom(32).hex(),
                'profile_id':p['email'],'expires_at':datetime.fromtimestamp(expires,timezone.utc).isoformat().replace('+00:00','Z'),
                'data':{'email':p['email'],'imap_verified':True,'smtp_verified':True,'sent':False}}
        config=vault.load(owner,cid).get('mail')
        if not config:raise MailError('WRONG_ACCOUNT_CHANNEL')
        if op=='emails':return {'ok':True,'data':messages(config,p)}
        if op=='send_email':
            msg=compose(config,p,job['id'])
            with smtp_connection(config) as client:
                refused=client.send_message(msg,from_addr=config['email'],to_addrs=[p['to']])
                if refused:raise MailError('MAIL_RECIPIENT_REJECTED')
            return {'ok':True,'data':{'accepted':True,'delivered':False,'message_id':msg['Message-ID'],'to':p['to']}}
        raise MailError('UNSUPPORTED_OPERATION')
    except error:raise
    except MailError as exc:raise error(str(exc)) from None
    except (imaplib.IMAP4.error,smtplib.SMTPAuthenticationError):raise error('MAIL_AUTH_FAILED') from None
    except Exception:raise error('MAIL_OPERATION_FAILED') from None
