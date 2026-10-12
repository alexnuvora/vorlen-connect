# Native LinkedIn session broker

This integration uses Vorlen's Oracle VM, independently of LinkupAPI and Zernio.
The existing official OAuth publishing and Supabase minute scheduler remain separate.

## Connecting

Sign in at https://connect.vorlen.co.uk, open Direct & access, and find **LinkedIn session connection**.
Create/select a connection and sign in using your own LinkedIn account. Enter email/authenticator codes here, or approve a push in LinkedIn and select **Check verification again**.
Manual security checks are surfaced, not automated or bypassed. You can instead import your own verified `li_at` and `JSESSIONID` cookies in the password fields. Never put these in ChatGPT, issues, commits or workflow logs.
The worker verifies `/me` before marking the connection connected. Cookie presence alone is insufficient. Sessions expire within 24 hours and can be disconnected from Direct & access or MCP.

## Tools and status

Nine new tools are exposed under `vorlen_connect_session_`:
`connections`, `health`, `read`, `draft`, `jobs`, `job`, `approve`, `cancel`, `disconnect`.
Reconnect the ChatGPT connector if the new tool list is cached.

Read operations: profile, inbox, conversation, invitations, connections, search_people and recruiter.
Recruiter returns the current entitled workspace only; candidate search, CV download and job management are not implemented. Country proxy routing is not implemented. These adapters depend on LinkedIn's current session interfaces and must be live-validated with the account. A provider change returns an explicit error instead of an empty success.

Reads return a job ID. Poll `session_job` for content. For messages, first retrieve the conversation and review participants. For invitations, retrieve the profile first. Draft, display exact recipient/account/text, then approve the content hash after explicit owner authorization. Approval queues a real send. Reject/edit by cancelling and creating a new draft; drafts cannot be mutated after approval.
Identical outbound content to the same connection/recipient is deduplicated for 24 hours. Approved sends run at most once. A lost acknowledgment, crash or expired lease results in `unknown`; check LinkedIn before another attempt. The integration never claims exactly-once delivery across LinkedIn and the database.

## Deployment

Canonical VM: `ubuntu@145.241.230.145`, hostname `vorlen`, instance OCID ending `nypzrogqudg7a`.
`session-runtime.yml` installs pinned Playwright and bundled Chromium, confirms the exact instance, and performs a sandboxed browser smoke test. A targeted AppArmor profile permits Chromium user namespaces; Chromium sandboxing stays enabled.
`session-broker-release.yml` tests signatures/encryption and a disposable PostgreSQL state machine, applies the additive migration through Supabase CLI to `oulypjxpbrlxbjrxzryf`, audits grants, then deploys the worker with `VORLEN_WORKER_SSH_PRIVATE_KEY` from GitHub Secrets.
Vercel deploys the Next.js API/UI/MCP from the repository. `VORLEN_SESSION_WORKER_PUBLIC_KEY` contains only the VM's Ed25519 public key. Never set a private key in that variable.

The worker polls outbound HTTPS; it has no public listening port. One browser is active at a time on the 1 GB VM. Switching accounts can discard an in-progress verification challenge; reconnect that account if necessary.

Runtime paths:
- `/opt/vorlen-session/session_worker.py` and `vorlen-session.service`
- `/opt/vorlen-session-venv` and `/opt/vorlen-session-browsers`
- `/var/lib/vorlen-session/signing.pem` and `vault.key` (private, host-only, mode 0600)
- `/var/lib/vorlen-session/*.session` (AES-GCM encrypted browser state)
- `/var/lib/vorlen-session/status.json` (non-sensitive heartbeat)

For diagnostics use `sudo systemctl status vorlen-session` and read `status.json`. Do not dump browser state, process input, private keys or cookies into logs. Restarting the service loses in-memory verification challenges, but retains encrypted verified sessions.

## Security and recovery

Owner-only API/MCP authorization; server-side service-role database calls; no anon/authenticated queue grants. Inputs are encrypted with AES-GCM bound to owner and job ID, then erased atomically from the queue on claim. LinkedIn credentials are not logged or returned. Verified browser state is encrypted separately on the VM. A single fixed owner is assigned server-side.
Ed25519 signatures bind exact body bytes, a timestamp and a one-use nonce. Queue transactions reject replays, stale revisions and wrong leases. Disconnect immediately prevents new jobs, cancels queued work and signals local vault deletion on the next successful worker poll. An action already executing may have reached LinkedIn and cannot be undone by disconnecting.
Audit events contain job operation/state only. Content results are encrypted and owner-scoped. Result bodies are bounded; pagination is capped at 25. The worker never automatically retries a LinkedIn write.

The additive SQL migration does not modify post approval, scheduling or OAuth tables. For a rollback stop `vorlen-session.service`, disable the new UI/tools by reverting the application commit, and retain the queue for auditing uncertain outcomes. Do not drop or replay pending jobs casually.
