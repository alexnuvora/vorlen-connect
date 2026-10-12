# Vorlen-owned provider transition

## Deployment boundary
Only Supabase project `oulypjxpbrlxbjrxzryf` belongs to this service. Never execute this migration against the Talent Flow database.

## Scheduler switchover
1. Keep the current Vercel daily trigger active during migration; publishing claims in `vc_linkedin_post_control` are one-use and protect against duplicate sends.
2. Migration `20261012040000_native_scheduling.sql` enables Supabase `pg_cron` + `pg_net` and schedules a minute-level dispatcher. It **fails closed** when `vorlen_connect_cron_secret` is absent from Vault.
3. Provision the value of Vercel's existing production `CRON_SECRET` as a **Supabase Vault secret** named `vorlen_connect_cron_secret`. Never commit the value to GitHub, logs or SQL migrations. Rotate in both stores atomically if the old value cannot be recovered.
4. Query `cron.job_run_details` and `net._http_response` to confirm successful authenticated callbacks and monitor failures. Conduct a benign invocation with no due posts.
5. Only after verified minute-level delivery, remove the legacy entry from `vercel.json` and deploy. Keep the authenticated Next.js worker for now; moving the worker into Supabase Edge Functions is a separate tested change.
6. Maintain the verified one-time publishing claim. Never automatically retry unknown outcomes and never mark posts successful without LinkedIn acknowledgement.

## Zernio replacement matrix

| Capability | Direct approach | Blockers |
|---|---|---|
| Text posts on LinkedIn | Vorlen OAuth + LinkedIn Posts REST API | Already production-verified |
| Post approval, scheduling and audit | Vorlen MCP + Supabase | Minute scheduler provisioning required |
| LinkedIn comments, reactions, analytics | LinkedIn official APIs where account app grants scope | Review developer app granted scope and access |
| Other social platforms | Provider-specific official OAuth, tokens, APIs, webhooks | Each provider requires developer access, review and distinct permissions |
| LinkedIn invitations | Partner Invitations API | LinkedIn approval/API agreement |
| LinkedIn member DMs | Approved provider/API integration where available | Access is not bundled with `w_member_social` |
| LinkedIn Recruiter and candidate lookups | Approved Talent Solutions integrations + Vorlen's own CRM/recruitment records | Requires Talent Solutions partner access for Recruiter data |
| Email discovery/enrichment | Company website, consented contact data, business registry and lawful providers | Evidence/provenance, opt-outs, UK GDPR/PECR checks |
| Email sending/replies | First-party mailbox OAuth/SMTP/IMAP and provider webhooks | Sender permissions, abuse safeguards and reply correlation |
| Multi-account composer/media | Vorlen storage, FFmpeg render pipeline, provider adapters | Format and scope parity per platform |

## Principles
- Build a provider-neutral `AccountConnection`, `Draft`, `PublicationAttempt`, `InboxMessage` and `WebhookEvent` contract with tenant-scoped RLS.
- Draft, review, approve and claim publication transactionally; permanent idempotency on unknown send outcomes.
- Use only official platform access; never scrape member private data or automate LinkedIn account sessions to bypass platform permissions.
- Keep Zernio enabled only for functions not yet reproduced and verified, and remove it per-provider after parity checks.
- Remove unsupported legacy ChatGPT tool entries, rather than advertising capabilities that return `UNSUPPORTED_BY_ZERNIO`.
