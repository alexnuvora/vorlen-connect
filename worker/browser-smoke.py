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
  # Public, credential-free reachability check. This is not an authenticated test.
  import json
  from urllib.parse import urlparse
  try:
   response=page.goto('https://www.linkedin.com/login',wait_until='domcontentloaded',timeout=45000)
   try:page.locator('input[type="password"]').first.wait_for(state='attached',timeout=15000)
   except Exception:pass
   parsed=urlparse(page.url)
   print(json.dumps({'check':'public_linkedin_login','status':response.status if response else None,
    'linkedin_host':parsed.hostname in ('www.linkedin.com','linkedin.com'),
    'checkpoint':'/checkpoint/' in parsed.path,'path':parsed.path[:150],
    'title':page.title()[:150],
    'inputs':page.locator('input').evaluate_all('(els)=>els.slice(0,12).map(e=>({id:e.id,name:e.name,type:e.type,autocomplete:e.autocomplete}))'),
    'buttons':page.locator('button').all_text_contents()[:12],
    'public_page_text':page.locator('body').inner_text()[:700],
    'username_fields':page.locator('input#username').count(),
    'password_fields':page.locator('input#password').count(),
    'submit_buttons':page.locator('form:has(input#password) button[type="submit"]').count()}),flush=True)
  except Exception as exc:
   print(json.dumps({'check':'public_linkedin_login','error_type':type(exc).__name__}),flush=True)
