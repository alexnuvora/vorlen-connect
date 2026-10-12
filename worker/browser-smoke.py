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
