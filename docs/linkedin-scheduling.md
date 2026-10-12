# LinkedIn scheduling

Supabase Cron owns the schedule in project `oulypjxpbrlxbjrxzryf`.
`vorlen-connect-linkedin-publish` runs `* * * * *` (every minute, UTC).
It calls `vorlen_internal.dispatch_linkedin_posts()`, which uses `pg_net` to POST
to `https://connect.vorlen.co.uk/api/cron/linkedin-publish`.
The publishing worker remains on Vercel; Vercel Cron is no longer configured.

The worker authenticates a dedicated production `VORLEN_SCHEDULER_SECRET`.
Its matching value is encrypted in Supabase Vault under
`vorlen_linkedin_scheduler_token`. Neither value belongs in Git or cron SQL.
The dispatcher is a private, invoker-rights function callable only by the database
administrator. It does not expose a public RPC or grant browser roles access.

Each run processes at most five due posts within a 220-second start budget.
Overlapping dispatches wait up to six minutes for the previous request; each post
also retains its existing atomic, permanent publication claim. No automatic retry
occurs after a claimed publication has an uncertain result. Rejected, edited,
future, already-claimed and published posts cannot be newly claimed by this worker.
Normal low-volume publication starts on the next minute tick after the saved time;
backlogs, outages, provider limits and expired OAuth tokens can delay it.

## Deployment and operations

The migration creates the job **paused**. Set the Vault and Vercel secrets, deploy
the matching worker, then run an authenticated probe before activating the job:

```sql
select vorlen_internal.dispatch_linkedin_posts(true); -- read-only application probe
select j.jobname, j.schedule, j.active, s.request_id, r.status_code, r.error_msg, r.content
from cron.job j
cross join vorlen_internal.linkedin_scheduler_dispatch s
left join net._http_response r on r.id=s.request_id
where j.jobname='vorlen-connect-linkedin-publish';
select cron.alter_job(jobid,active:=true)
from cron.job where jobname='vorlen-connect-linkedin-publish';
```

Cron execution success alone does not prove HTTP delivery: inspect the HTTP status
and response content above. Successful probes return `probe: true` and `processed: 0`.
For normal runs inspect per-post outcomes for `failed_or_uncertain` and check those
posts individually. Do not reset an uncertain publication claim to retry it.

Pause using `cron.alter_job(jobid,active:=false)` filtered to this job name.
To rotate the scheduler credential, pause the job, update Vault and the Vercel
production secret together, redeploy, probe, then reactivate. Migration replay also
pauses the job deliberately until configuration has been verified.
