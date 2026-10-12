#!/usr/bin/env bash
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
test -x /opt/vorlen-session-venv/bin/python
# Bound smoke-test units and clean only previous Vorlen browser test units.
for unit in $(sudo -n systemctl list-units --all --type=service 'run-*.service' --plain --no-legend | awk '{print $1}'); do
  command=$(sudo -n systemctl show "$unit" -p ExecStart --value)
  if [[ "$command" == *'/opt/vorlen-session-venv/bin/python'* && "$command" == *'about:blank'* ]]; then
    sudo -n systemctl stop "$unit"
  fi
done
# Provide headroom on the 1 GB instance without replacing an existing swap file.
if ! swapon --show=NAME --noheadings | grep -q .; then
  if ! test -e /var/swap-vorlen; then
    sudo -n fallocate -l 1G /var/swap-vorlen
    sudo -n chmod 600 /var/swap-vorlen
    sudo -n mkswap /var/swap-vorlen >/dev/null
  fi
  sudo -n swapon /var/swap-vorlen
  if ! grep -q '^/var/swap-vorlen ' /etc/fstab; then
    printf '/var/swap-vorlen none swap sw 0 0\n' | sudo -n tee -a /etc/fstab >/dev/null
  fi
fi
sudo install -d -m 755 /opt/vorlen-session
sudo install -m 644 /tmp/vorlen-session-release/session_worker.py /tmp/vorlen-session-release/native_linkedin.py /tmp/vorlen-session-release/native_mail.py /opt/vorlen-session/
sudo install -m 644 /tmp/vorlen-session-release/browser-smoke.py /opt/vorlen-session/browser-smoke.py
sudo install -m 644 /tmp/vorlen-session-release/vorlen-session.service /etc/systemd/system/vorlen-session.service
echo 'Installing session service'
sudo systemctl daemon-reload
sudo systemctl enable vorlen-session.service
echo 'Stopping worker gracefully before isolated browser check'
sudo timeout --kill-after=5s 175 systemctl stop vorlen-session.service
# Always restore service after the bounded smoke check, even if it fails.
trap 'sudo systemctl start vorlen-session.service' EXIT
echo 'Testing browser under service privileges'
# Same user/sandbox policy as the service, no account credentials involved.
sudo -n systemctl stop vorlen-session-smoke.service 2>/dev/null || true
sudo -n systemd-run --unit=vorlen-session-smoke --collect --quiet --wait --pipe --uid=vorlen-worker --property=RuntimeMaxSec=120 --property=NoNewPrivileges=true --property=ProtectSystem=strict --property=ProtectHome=true --property=PrivateTmp=true --property=ReadWritePaths=/var/lib/vorlen-session --setenv=PLAYWRIGHT_BROWSERS_PATH=/opt/vorlen-session-browsers --setenv=HOME=/var/lib/vorlen-session /opt/vorlen-session-venv/bin/python /opt/vorlen-session/browser-smoke.py </dev/null
sudo systemctl start vorlen-session.service
sudo systemctl is-active --quiet vorlen-session.service
trap - EXIT
sudo systemctl show vorlen-session.service -p ActiveState -p SubState -p MemoryCurrent -p MemoryMax
