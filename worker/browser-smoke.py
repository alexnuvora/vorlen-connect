"""Credential-free browser check under the production service's sandbox settings."""
from playwright.sync_api import sync_playwright
print('Starting Playwright',flush=True)
with sync_playwright() as p:
 print('Launching sandboxed Chromium',flush=True)
 with p.chromium.launch(channel='chromium',headless=True,chromium_sandbox=True,args=['--disable-dev-shm-usage'],timeout=60000) as browser:
  print('Creating page',flush=True)
  page=browser.new_page()
  page.set_default_timeout(15000)
  page.goto('data:text/html,<title>Vorlen smoke</title><p>Ready</p>',wait_until='domcontentloaded',timeout=20000)
  assert page.title()=='Vorlen smoke'
  assert page.evaluate('1+1')==2
  print('SANDBOXED_DEPLOYMENT_PASS',flush=True)
  from session_worker import login_controls
  page.set_content('<form><input type="email" autocomplete="username" id="dynamic-1"><input type="password" autocomplete="current-password" id="dynamic-2"><button type="button">Sign in with Apple</button><button type="submit">Sign in</button></form><form style="display:none"><input type="email" autocomplete="username"><input type="password"><button type="submit">Sign in</button></form>')
  username,password,submit=login_controls(page)
  username.fill('synthetic@example.test');password.fill('synthetic-only')
  assert username.input_value()=='synthetic@example.test'
  assert password.input_value()=='synthetic-only'
  assert submit.inner_text()=='Sign in'
  print('VISIBLE_LOGIN_SELECTOR_FIXTURE_PASS',flush=True)
  # Public, credential-free reachability and selector check. Never fill or submit.
  import json
  from urllib.parse import urlparse
  try:
   response=page.goto('https://www.linkedin.com/login',wait_until='domcontentloaded',timeout=45000)
   parsed=urlparse(page.url)
   if parsed.hostname not in ('www.linkedin.com','linkedin.com'):raise RuntimeError('Unexpected host')
   username,password,submit=login_controls(page)
   print(json.dumps({'check':'public_linkedin_login','status':response.status if response else None,
    'linkedin_host':True,'login_controls_ready':True,'credentials_entered':False,'submitted':False}),flush=True)
  except Exception as exc:
   print(json.dumps({'check':'public_linkedin_login','login_controls_ready':False,'error_code':getattr(exc,'code',type(exc).__name__)}),flush=True)
