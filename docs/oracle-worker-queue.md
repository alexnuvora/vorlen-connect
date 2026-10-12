# Vorlen Oracle queue activation

The Oracle service is deployed in safe **standby** by default. Only `health_probe` jobs are accepted; no LinkedIn account automation is implemented.

1. Review and apply `supabase/migrations/20261012060000_worker_queue.sql` to **only** Supabase project `oulypjxpbrlxbjrxzryf`. This provides owner-partitioned job storage, short leases, one-time lease tokens, bounded retries and service-role-only access.
2. Deploy the `app/api/worker/route.ts` backend through Vercel.
3. Generate one random 32+ character `VORLEN_WORKER_API_TOKEN` and store it in Vercel production encrypted secrets. **Never** store Supabase service-role credentials on Oracle.
4. Put the same API token, with `VORLEN_WORKER_API_URL=https://connect.vorlen.co.uk/api/worker`, into a root-owned `/etc/vorlen-worker/worker.env` on Oracle (mode 0600), then restart `vorlen-worker`. Use a secret-safe provisioning pipeline; don't paste tokens into logs, chat or git.
5. Insert a test job through an authorised service-role connection, e.g. `insert into public.vc_worker_jobs(owner_id,kind,dedupe_key) values('<Vorlen owner>', 'health_probe','first-probe');`
6. Check the job transitions to `succeeded`, verify its result and the Oracle heartbeat; also test wrong token (401), concurrent claims, expired leases and retries.
7. Keep unrelated Zernio, LinkedIn OAuth and production scheduler flows unchanged.

**Not yet demonstrated:** actual queue credentials provisioned, Vercel deployment, SQL migration applied, complete health-probe round trip. There is no general-purpose browser/session job executor here.

**Queue security:** Fail-closed HTTP bearer validation, no anonymous database grants, restricted job types, lease UUID required for completion, SQL SKIP LOCKED for concurrency. The API currently accepts a worker ID and is a single-worker deployment; further tenant and per-worker permissions need review before multiple users/workers are enabled.
