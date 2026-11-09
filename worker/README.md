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


## Public candidate discovery and Open to Work verification

The queue also accepts `public_candidate_search`. It uses Bing's public RSS
index to discover public LinkedIn profile URLs for a role and location, then
attempts to read only ordinary public profile metadata and the public avatar.
It does not sign in to LinkedIn, reuse cookies, use Recruiter, or bypass access
controls.

A candidate is included in results only when the avatar detector confirms both
the green Open to Work frame and matching OCR text. Profiles whose images are
unavailable, blocked, or ambiguous are counted as unverified and excluded.
Public CV search is supplementary: a verified candidate remains included when
no accessible CV is found. CV links are checked for public HTTPS availability
and document content before they are returned.

The MCP tools are `vorlen_connect_candidate_search` (returns a job ID) and
`vorlen_connect_candidate_job` (returns state and results). Search is bounded
to 30 profiles. Search-engine coverage, public profile visibility, avatar
representation, and CV indexing vary; a zero-result search is not proof that
no suitable candidates exist. Live production verification is required before
describing the feature as operational.
