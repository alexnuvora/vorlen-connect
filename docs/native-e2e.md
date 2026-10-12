# Vorlen Connect native integration: live acceptance test

This is a test plan, not a statement that LinkupAPI parity is complete. Code version
0.6.0 / worker session-broker-1.2.0 introduces native compatibility routing and more
adapters. A blocked, unverified or partial row is not a pass. Record actual results
in `docs/native-parity.json`; do not mark a whole group passed from one sample.

## 1. Release prerequisites

1. In GitHub Actions, open **Verify and deploy native session broker** for the exact
   release commit. `verify`, `migrate` and `worker` must all succeed.
2. Confirm Vercel has a READY production deployment of that commit assigned to
   `connect.vorlen.co.uk`. A successful Oracle deployment alone does not release
   the dashboard/MCP server. If Vercel reports `api-deployments-free-per-day`, wait
   for quota reset and redeploy that commit; do not upgrade or create another
   project to evade the quota.
3. Ask ChatGPT: **Use Vorlen Connect capabilities and report its version and native
   coverage.** Expected version: `0.6.0` (or a newer verified release), primary
   provider `vorlen_native`. `parity_complete` remains false until all acceptance
   criteria actually pass. Refresh the plugin connection if its tool list is stale.
4. Open `https://connect.vorlen.co.uk/?tab=direct`, sign in as the workspace owner,
   and confirm **Worker online**. The session health tool should show a heartbeat
   within three minutes and worker `session-broker-1.2.0` or newer.
5. Keep Oracle FREE_TIER. The worker uses the existing London Micro instance,
   one browser, bounded memory and a 120-second action deadline. No paid proxies,
   extra instances or disks are required for these tests.

## 2. Connect your own LinkedIn account

1. Under **Native account connections**, choose LinkedIn, enter a label and add it.
2. Select it, enter your LinkedIn email/password in the site, then connect. Never
   put credentials, cookies or verification codes in ChatGPT or GitHub issues.
3. Complete any email/TOTP/push prompt. A CAPTCHA/manual check must be completed
   by you in your own browser; the worker does not bypass it. If needed, use the
   site's **Import my existing session** method with your own `li_at`/`JSESSIONID`.
4. Expect **Connected**, your member identity and an expiry. Click **Read my profile**
   and compare it with LinkedIn. Record connection ID and non-sensitive job ID.
5. Ask ChatGPT to list Vorlen's native accounts. The account ID must equal the
   connection UUID. Do not substitute the separate official OAuth publishing ID.

All native reads are asynchronous: a tool returns `job_id`; use
`vorlen_connect_session_job` with `{ "id": "JOB_UUID" }` until `succeeded`, `failed`,
`unknown` or `cancelled`. Read the decrypted `result` only after completion.
Do not equate an enqueued job with a successful provider request.

## 3. LinkedIn read tests

Ask ChatGPT to execute each read one at a time, waiting for its result before the
next job for that connection. Compare against your signed-in LinkedIn account.

| Test | Compatibility tool / action | Acceptance |
| --- | --- | --- |
| Own profile | channel_get_profile / get_me | Correct member; no credentials in output |
| Full profile | channel_get_profile / get, params.profile_url | Correct person, headline and available experience/education |
| Visible contacts | channel_get_profile / get_contact | Only contact information visible to your account |
| People search | channel_get_profile / search_people | Correct keyword and each supported filter applied |
| Company lookup | channel_get_profile / get_company, params.company_url | Correct company and available details |
| Company search | channel_get_profile / search_companies | Company results; filter correctness |
| Connections | channel_list_network / list_connections | Matches connection list; page 2 contains new records |
| Received invitations | channel_list_network / list_invitations | Matches received list |
| Sent invitations | channel_list_network / list_sent | Matches sent list |
| Relationship | channel_list_network / check_invitation | Explicit provider state; unknown must stay unknown |
| Inbox / unread | channel_list_messages, category INBOX then UNREAD | Unread results match; reading does not intentionally mark seen |
| Conversation | channel_get_conversation, conversation_id OR profile_url | Correct participants, existing text and ordering |
| Feed | channel_search_content / get_feed | Real feed records and pagination |
| LinkedIn job search | enrich / search_jobs, params.keywords | Correct keyword/location/type; source explicitly LinkedIn only |
| Company employees | enrich / extract_employees, params.company_url | Company resolved before employee filter; matching people |
| Post comments | channel_search_content / get_comments, params.post_url | Correct post, comments and available identities |

Tool names above have the `vorlen_connect_` prefix. Account reads take top-level
`account_id`. Grouped tools take `action` and `params`. Use `offset` and `count`
(maximum 25) for native pagination. People/company entity filters currently need
LinkedIn numeric IDs, not place/company names; unsupported inputs must return an
explicit error. No silent dropping of filters is a pass.

Example prompt:

> Use Vorlen Connect's native account ACCOUNT_UUID to read the profile at
> PROFILE_URL. Wait for the session job, then show the result and job status.

## 4. Approved LinkedIn sends — use a consenting test recipient

1. Read the recipient profile and/or conversation first; verify the account,
   recipient and participants. Do not use a real prospect as an accidental test.
2. Ask: **Draft, but do not send, “Vorlen native integration test [unique timestamp]”
   to this test recipient using my native account.**
3. Get the draft with `session_job`. Verify connection, recipient, complete text,
   `state=draft` and `content_hash`. Nothing should appear on LinkedIn yet.
4. Approve that exact content hash with `session_approve` only when ready to send.
   Poll the job. Check LinkedIn on both sender and recipient sides: one message.
5. Attempt approval of that same job again. It must fail without sending again.
   Creating an identical draft inside 24 hours should return the existing job.
6. Repeat with an invitation to a consenting non-connection, note at most 200
   characters. Confirm one received invitation.
7. Create a different draft and reject it using `session_cancel`. Approval of a
   cancelled draft must fail. Suppressed profile recipients must be blocked.
8. If an outcome is `unknown`, check LinkedIn manually. Do not resend automatically.
   Do not simulate network failures on a production send simply to test this;
   the isolated database test covers expired leases and duplicate prevention.

Attachments, InMail and additional inbox categories are not implemented. An
explicit unsupported response is expected today, but does not count as parity.

## 5. Native mailbox

1. Add an **Email (IMAP/SMTP)** connection. Use a dedicated test mailbox that
   permits app-password IMAP/SMTP. Enter hosts from your provider's settings,
   IMAP TLS port 993 and SMTP TLS 465 or STARTTLS 587.
2. Click **Verify and connect mailbox**. Both logins must pass without sending
   email. OAuth-only accounts are not supported by this connector yet.
3. Send a test message to the mailbox from another account. Read via
   `channel_get_emails` with `unread_only=true`. Compare sender, subject, body and
   Message-ID. It should remain unread in the mailbox.
4. Draft an email through `channel_send_email` with account_id, to, subject, text,
   optional html and reply_to. Preview exact fields with session_job, then approve
   its content_hash. Verify the recipient's mailbox, HTML/plain alternatives and
   Reply-To. `accepted=true` means SMTP accepted it; it does not prove delivery.
5. Reapprove the same job: no second message. Suppress the test address and verify
   that a new draft cannot be approved. Do not deliberately email invalid addresses.
6. Known delivery-status reports in the inbox are flagged `is_delivery_report`;
   automated bounce correlation/suppression is a separate unimplemented feature.

## 6. Existing direct LinkedIn publishing regression

The official OAuth connection is separate. Preview an existing or new test post,
edit it, ensure the old approval is invalidated, approve the current revision/hash,
then publish only if you intend it to be public. Check the returned LinkedIn URL.
For scheduling, approve a separate post and schedule at least two minutes ahead;
confirm Supabase Cron publishes it once. Cancel/reject before its due time if you
want a non-public scheduling check instead. Do not reuse an introduction draft
without reviewing the saved text and account.

## 7. Isolation and revocation

- A second owner must not see the first owner's account, jobs, drafts or results.
- Disconnect the test account. New reads/sends must fail; pending drafts must be
  cancelled and the local encrypted state removed on the worker's next poll.
- Reconnect as a new connection. Old drafts must not become sendable on it.
- Review Logs/Usage for queued and completed native events without passwords,
  cookies, email bodies or tokens in activity logs. Exact draft content is visible
  only in the owner-scoped review flow.
- Rerun the read-only Oracle audit. Do not upgrade the tenancy to solve a test failure.

## Failure evidence to share

Share operation, job ID, safe error code, account type, expected versus actual
behaviour, timestamp and a redacted screenshot. Do not share cookie headers,
Authorization headers, HAR archives, OTPs, private keys or applicant CVs. Provider
schema/endpoint failures require a targeted adapter update and repeat of that row.

## Full parity gate

The machine-readable matrix is authoritative. In addition to the tests above,
blocked rows require native implementations and live fixtures: Recruiter jobs,
applicants/CVs, profile viewers/activity, recommendations, content search/reactions,
attachments, all inbox categories, native enrichment and Indeed/Glassdoor job aggregation, mailbox
OAuth and account webhooks. The wider public API also includes Sales Navigator,
invitation mutations, publishing/engagement and job/project management beyond the
40 actions exposed by the connected plugin. Passing this guide's implemented
subset is NOT 100% LinkupAPI parity.
