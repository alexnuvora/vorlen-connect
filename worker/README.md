The active native LinkedIn session service is `vorlen-session.service`. See [the broker runbook](../docs/native-session-broker.md) for deployment, connection and recovery. The older `vorlen-worker.service` below remains a separate health/queue service.

# Vorlen Oracle worker

This isolated service intentionally starts in **standby**. It uses Python's
standard library, runs as an unprivileged systemd user, and writes an atomic
heartbeat to `/var/lib/vorlen-worker/status.json`.

No LinkedIn session, browser, outreach, job consumption or public network
listener is enabled. Production account integrations require a separate
reviewed implementation with approved API access.

## Deployment
On successful deployment from GitHub Actions, systemd starts the worker.
Only the new Oracle host `145.241.230.145` is targeted. Existing services
and the previous instance are not changed.

## Verification
```
sudo systemctl status vorlen-worker --no-pager
sudo journalctl -u vorlen-worker --no-pager -n 30
sudo cat /var/lib/vorlen-worker/status.json
```

The unit is restart-on-failure and enabled at boot. The deployment workflow
does not install Docker or run arbitrary package upgrades.
