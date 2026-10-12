#!/usr/bin/env bash
set -euo pipefail
test "$(hostname)" = vorlen
python3 - <<'PY'
import urllib.request,json
r=urllib.request.Request('http://169.254.169.254/opc/v2/instance/',headers={'Authorization':'Bearer Oracle'})
d=json.load(urllib.request.urlopen(r,timeout=5))
assert d['id']=='ocid1.instance.oc1.uk-london-1.anwgiljtdycw3nacke4vonqaqm7nt3pca47x4fzlhozzeeqnypzrogqudg7a'
print('Exact Vorlen VM verified')
PY
test -x /opt/vorlen-session-venv/bin/python
sudo install -d -m 755 /opt/vorlen-session
sudo install -m 644 /tmp/vorlen-session-release/session_worker.py /opt/vorlen-session/session_worker.py
sudo install -m 644 /tmp/vorlen-session-release/vorlen-session.service /etc/systemd/system/vorlen-session.service
echo 'Installing session service'
sudo systemctl daemon-reload
sudo systemctl enable vorlen-session.service
echo 'Starting session service'
sudo timeout 60 systemctl restart vorlen-session.service
sudo systemctl is-active --quiet vorlen-session.service
echo 'Testing browser under service privileges'
# Same user/sandbox policy as the service, no account credentials involved.
sudo timeout 90 systemd-run --quiet --wait --pipe --uid=vorlen-worker --property=NoNewPrivileges=true --setenv=PLAYWRIGHT_BROWSERS_PATH=/opt/vorlen-session-browsers --setenv=HOME=/var/lib/vorlen-session /opt/vorlen-session-venv/bin/python -c 'from playwright.sync_api import sync_playwright; p=sync_playwright().start(); b=p.chromium.launch(channel="chromium",headless=True,chromium_sandbox=True,args=["--disable-dev-shm-usage"]); page=b.new_page(); page.goto("about:blank"); assert page.evaluate("1+1")==2; b.close(); p.stop(); print("SANDBOXED_DEPLOYMENT_PASS")'
sudo systemctl show vorlen-session.service -p ActiveState -p SubState -p MemoryCurrent -p MemoryMax
