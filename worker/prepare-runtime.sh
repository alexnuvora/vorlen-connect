set -euo pipefail
test "$(hostname)" = vorlen
python3 - <<'PY'
import urllib.request,json
r=urllib.request.Request('http://169.254.169.254/opc/v2/instance/',headers={'Authorization':'Bearer Oracle'})
d=json.load(urllib.request.urlopen(r,timeout=5))
assert d['id']=='ocid1.instance.oc1.uk-london-1.anwgiljtdycw3nacke4vonqaqm7nt3pca47x4fzlhozzeeqnypzrogqudg7a'
assert d['shape']=='VM.Standard.E2.1.Micro', 'Paid or unapproved shape refused'
assert d['region']=='uk-london-1', 'Unexpected region refused'
print('Exact Vorlen VM and approved Always Free-eligible shape verified')
PY
sudo -n apt-get update -qq
sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3-venv
sudo -n python3 -m venv /opt/vorlen-session-venv
sudo -n /opt/vorlen-session-venv/bin/pip install --disable-pip-version-check --quiet playwright==1.63.0 cryptography==46.0.3
sudo -n /opt/vorlen-session-venv/bin/python -m playwright install-deps chromium
sudo -n env PLAYWRIGHT_BROWSERS_PATH=/opt/vorlen-session-browsers /opt/vorlen-session-venv/bin/python -m playwright install chromium
sudo -n install -d -o vorlen-worker -g vorlen-worker -m 0700 /var/lib/vorlen-session
sudo -n -u vorlen-worker /opt/vorlen-session-venv/bin/python - <<'PY'
from pathlib import Path
import os
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
p=Path('/var/lib/vorlen-session')
os.umask(0o077)
if not (p/'signing.pem').exists():
 key=Ed25519PrivateKey.generate()
 (p/'signing.pem').write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
if not (p/'vault.key').exists(): (p/'vault.key').write_bytes(os.urandom(32))
key=serialization.load_pem_private_key((p/'signing.pem').read_bytes(),password=None)
print('WORKER_PUBLIC_KEY_BEGIN')
print(key.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo).decode())
print('WORKER_PUBLIC_KEY_END')
PY
# Ubuntu restricts unprivileged user namespaces. Permit only this browser's
# executable to create its Chromium sandbox; do not disable the host policy.
if command -v apparmor_parser >/dev/null; then
 sudo -n tee /etc/apparmor.d/vorlen-session-chromium >/dev/null <<'PROFILE'
abi <abi/4.0>,
include <tunables/global>
profile vorlen-session-chromium /opt/vorlen-session-browsers/chromium-*/chrome-linux*/chrome flags=(unconfined) {
  userns,
}
PROFILE
 sudo -n apparmor_parser -r /etc/apparmor.d/vorlen-session-chromium
fi
sudo -n -u vorlen-worker env PLAYWRIGHT_BROWSERS_PATH=/opt/vorlen-session-browsers /opt/vorlen-session-venv/bin/python - <<'PY'
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(channel='chromium',headless=True,chromium_sandbox=True,args=['--disable-dev-shm-usage'])
 c=b.new_context()
 page=c.new_page()
 page.goto('about:blank')
 assert page.evaluate('1+1')==2
 print('SANDBOXED_BROWSER_RUNTIME_PASS',b.version)
 b.close()
PY
free -m
df -h /
