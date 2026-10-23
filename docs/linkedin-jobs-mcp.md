# LinkedIn job intelligence MCP — preview integration

This branch adds two owner-only tools to the **existing Vorlen Connect MCP endpoint** (`/mcp`). It does not change TalentFlow/Vorlen CRM, deploy, enable a cron, or create notifications.

## Tools
- `vorlen_connect_jobs_start`: Starts a **billable** Apify `worldunboxer/rapid-linkedin-scraper` run with job title(s), location/cities, employer names, experience, type, workplace arrangement, timeframe, Easy Apply and job count (10–1000 per search). Returns `run_id`. No LinkedIn account credentials.
- `vorlen_connect_jobs_results`: Polls status and returns up to 100 rows/page with **all original actor fields** inside `raw`. Filters on `criteria.max_applicants`, `criteria.hiring_badge_required`, and `criteria.max_age_minutes` strictly. Unknown badge/count/age is **not** considered a match. Search does not guarantee a source age of one minute.

## Example ChatGPT request

Search for 50 Manchester Software Engineer listings from the past day. Then filter results to maximum 2 applicants, an explicit true hiring badge, and a known age no more than 5 minutes.

MCP start arguments:
```json
{"jobs_titles":["Software Engineer"],"location":"United Kingdom","cities":["Manchester"],"posted_within":"Past 24 hours","jobs_entries":50}
```
MCP results arguments:
```json
{"run_id":"<ACTUAL_RETURNED_ID>","limit":50,"criteria":{"max_applicants":2,"hiring_badge_required":true,"max_age_minutes":5}}
```
The second request can be repeated with `offset` for subsequent pages; don't start a fresh paid run just to poll.

## Server-only credentials and protection
- `APIFY_API_TOKEN` — secret Apify personal token, never put in ChatGPT chat, URL, database field or frontend.
- `JOBS_OWNER_ID` — trusted Vorlen Connect authenticated Sites user ID; if unset, existing `ZERNIO_OWNER_ID` is used. If neither exists, tool calls fail closed.
- Owner restrictions use `getChatGPTUser` before making provider requests. This is not a public proxy.
- The code uses fixed Apify URLs, rejects redirects, limits outbound request duration, validates arguments, and never accepts arbitrary actor IDs or URLs.
- At present there are **no scheduled jobs, notification subscriptions, app integration, independent LinkedIn collector, or source-specific badge-field guarantee**.

## Activation checklist
1. Review and merge branch only after tests pass. Do not merge without approval.
2. Set `APIFY_API_TOKEN` in the deployed Vorlen Connect environment, and configure `JOBS_OWNER_ID` to the exact owner ID.
3. Deploy the MCP service and refresh/reconnect Vorlen Connect in ChatGPT to surface the two new tools.
4. Perform one manually approved low-volume paid run and inspect actual output badge, age and applicant field names. Adjust normalisation if the actor uses other keys.
5. Confirm data-collection permissions/provider terms before routine monitoring. LinkedIn data freshness, completeness and legal permissions are not guaranteed.
