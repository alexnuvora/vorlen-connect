# Vorlen-owned job collector (experimental)

## Scope
This replaces the **runtime Apify integration** behind `vorlen_connect_jobs_start` and `vorlen_connect_jobs_results` with our own Node.js collection code. It retrieves jobs directly from configured employers' **Greenhouse public job boards**, without using Apify, LinkedIn cookies, proxy networks or third-party scraping actors.

**It is not LinkedIn job scraping parity.** Employer ATS feeds do not normally supply LinkedIn applicant counts, an Actively Hiring badge, Easy Apply, hiring-manager profiles or true LinkedIn posting times. Such fields return `null`; the existing strict filters exclude unknown values.

The old Apify adapter remains in source for existing regression tests but is **not imported by the live MCP handler**. It can be retired separately after migrating common normalisation helpers.

## Configuration
Set these server-side environment values before enabling the feature:
- `JOBS_GREENHOUSE_BOARDS`: comma-delimited Greenhouse board tokens for employers that expose public feeds and permit automated retrieval, e.g. `exampleboard,anotherboard` (placeholders, not validated real employers).
- `JOBS_RUN_SIGNING_KEY`: random high-entropy string of 32+ chars; if absent the current server-only `CREDENTIAL_ENCRYPTION_KEY` is used.
- Existing `ZERNIO_OWNER_ID` or `JOBS_OWNER_ID` scopes access to the trusted owner.

Do not use an Apify token: this collector has no Apify outbound calls. Deleting an existing `APIFY_API_TOKEN` is an independent configuration change and is not part of this PR.

## MCP workflow
1. Start tool: `{"jobs_titles":["Software Engineer"],"cities":["Manchester"],"jobs_entries":50,"posted_within":"Any Time"}`
2. Read returned `native1.*` signed run ID; valid for 24 hours.
3. Results tool: `{"run_id":"<native1.*>","limit":50}`
4. Results are fetched live from the configured boards, normalised with complete raw fields, then filtered. The signed ID is not a stored job or persisted asynchronous queue. Changing employer postings between calls changes results.

Filtering for applicant count and a hiring badge will return **zero** for Greenhouse-only records because those fields are unavailable. Posting-time searches other than `Any Time`, and other unverified source filters, are rejected rather than silently ignored.

## Reliability
- Maximum 20 employer boards, 250 jobs per board, input result cap 1000; max 12s per board request.
- Server-owned fixed upstream hostname and validated board slugs prevent arbitrary URL requests.
- A failed board is reported in `source_errors`; all-source failure errors instead of pretending to find zero jobs.
- No cron, push notifications or Vorlen CRM sync.
- Respect each publisher's permission/terms and do not crawl LinkedIn without express authorization.
- Independent permission and data quality checks required before production rollout.

## Testing
`node --test tests/native-jobs.test.mjs`
