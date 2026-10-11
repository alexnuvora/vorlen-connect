# Vorlen Connect

Private social publishing, engagement and enrichment workspace with a REST API and stateless MCP server. **Direct LinkedIn is the first Vorlen-owned connector; Zernio remains optional for existing social features.** This is not a full LinkupAPI replacement and does not call LinkupAPI.

## Direct LinkedIn (v0.3)

Open **Direct & access** for the developer credential form, exact callback URL, application instructions and all 40 LinkupAPI access requirements. See `docs/direct-access-guide.md`.

- Backend authorization-code flow with 10-minute, atomic single-use state bound to the trusted owner and a Secure/HttpOnly/SameSite cookie. Fixed callback origin.
- Developer secrets and member tokens encrypted with owner/context binding. Three additional backend-only RLS tables and a SECURITY INVOKER RPC. Changing app credentials clears direct connections and pending authorization; reconnecting creates a new account ID so old drafts cannot switch destinations.
- Scopes: `openid profile w_member_social`. Reads identity from the authenticated userinfo endpoint; ignores the ID token rather than using unverified JWT claims for application sign-in. Sites remains the application identity provider.
- Local drafts for public text-only member posts, reviewed through Outreach. Exact author/content retained; a single atomic claim precedes publishing with Posts API version `202609`. A 201 response plus x-restli-id is required for acknowledgement. No invented provider idempotency key; uncertain sends never retry automatically.
- Direct MCP tools: `vorlen_connect_linkedin_read` (`status` or `profile`) and `vorlen_connect_linkedin_draft`. Status lists owner-scoped direct account IDs. Direct account IDs are separate from Zernio IDs.
- Tokens expire at the provider's returned expiry. Reauthorization is required; automatic refresh, media, scheduling, Page APIs and comment/analytics adapters are not implemented directly yet.

**Live OAuth/publishing remains unverified until the owner registers the app and connects.** All provider publication tests are mocked; no actual post was sent. Full Linkup parity is not established: personal inbox, invitations, broad search, recruitment, mail and enrichment require separate access and implementation. Do not interpret a generic partner approval as all-endpoint access.

## Zernio integration (retained from v0.2)

The supplied Zernio API key is a server-only runtime secret, restricted to the trusted Sites user ID in `ZERNIO_OWNER_ID`. It is never embedded in source, client bundles or database query arguments. Other user identities cannot inherit the owner's provider access. API requests use `https://zernio.com/api/v1`, Bearer authentication, bounded timeouts, explicit redirect rejection and no automatic retries.

- Connected account listing and identity, profile listing, account health and hosted OAuth connection links.
- Posts list/detail, post analytics, LinkedIn aggregate/post analytics and administered organizations.
- Comments and replies; LinkedIn reactor identities for organization pages only.
- Supported social inboxes, conversation details and messages. Text replies to existing conversations.
- Local review drafts for publishing/scheduling posts, comments and inbox replies. Atomic send claims, deduplication and provider idempotency keys. An uncertain or partial result is never automatically replayed.
- Text and public-HTTPS media composer for LinkedIn, Facebook, X, Threads, Bluesky, Instagram, Telegram, Discord and Slack. One video, LinkedIn PDF, or image sets within the implemented limits.
- Hunter remains optional for professional email discovery/verification and enrichment.

**Zernio cannot replace LinkedIn DMs, invitations, prospect/profile search, job/recruiter/CV search, network scraping, home feeds, or Gmail/Outlook/IMAP mailboxes.** Those compatibility operations explicitly return `UNSUPPORTED_BY_ZERNIO`. Existing Unipile drafts cannot be sent after the switch. The legacy adapter is retained in source and its regression fixtures but is not reachable through the production service.

The original 40 LinkupAPI operations remain in the capability matrix; 17 Zernio operations and 3 direct LinkedIn operations bring the current matrix to 60. There are 21 MCP tools: 16 compatibility groups, capability discovery, Zernio reads/drafts and direct LinkedIn reads/drafts. Check `vorlen_connect_capabilities` before choosing a tool.

## Use

1. Open Connections and select **Verify & load accounts**. Connect additional accounts through Zernio's hosted flow or dashboard.
2. Use **Social & API** to read posts, comments, account health and analytics. Parameters are snake_case, with opaque IDs returned verbatim by Zernio.
3. In **Outreach**, select destinations, enter the exact post/reply and optionally a future schedule or public media URLs. Save for review.
4. Review the queue, including destinations, schedule and media. **Approve & send** is the only action that sends to Zernio. A scheduled post is accepted for later publication, not reported as already published. Open the stored provider result or query `zernio.get_post` for its current status.
5. Suppress an inbox conversation using `zernio:account_id:conversation_id`. Suppression is checked again at send time. Existing legacy suppressions are retained.

Expired schedules are rejected before approval; Zernio's automatic immediate publishing of past schedules is not permitted by this integration. Draft content cannot be changed during approval.

## API examples

`POST /api/v1/call` (authenticated Sites identity required):

```json
{"operation":"zernio.list_posts","arguments":{"limit":10}}
```

```json
{"operation":"zernio.linkedin_analytics","arguments":{"account_id":"YOUR_ZERNIO_ACCOUNT_ID"}}
```

MCP `vorlen_connect_zernio_read`: `{ "action": "list_posts", "params": { "limit": 10 } }`.

MCP `vorlen_connect_zernio_draft` saves locally and never publishes:

```json
{"action":"create_post","params":{"content":"Your reviewed content","platforms":[{"platform":"linkedin","account_id":"YOUR_ZERNIO_ACCOUNT_ID"}],"mode":"schedule","scheduled_for":"2030-01-15T10:00:00Z"}}
```

Read actions and strict accepted fields are defined in `lib/zernio.mjs`; the current capability matrix and MCP contracts are in `lib/zernio-catalog.mjs`. Unknown filters are rejected, never silently dropped.

## Runtime configuration

- `SUPABASE_URL` = dedicated project `https://oulypjxpbrlxbjrxzryf.supabase.co`.
- `SUPABASE_SERVICE_ROLE_KEY` = secret, backend only.
- `CREDENTIAL_ENCRYPTION_KEY` = 32-byte hex secret for stored provider credentials. Rotating it requires re-encrypting those records.
- `ZERNIO_API_KEY` = secret; rotate through the site's production environment settings.
- `ZERNIO_OWNER_ID` = the exact trusted Sites user identity permitted to use the managed Zernio key. Never derive from browser input.

Production uses nine owner-scoped Supabase tables with RLS enabled and browser roles revoked. A SECURITY INVOKER RPC supports only fixed repository actions; no dynamic SQL is executed. The direct LinkedIn migration adds three tables and a separate RPC. The Supabase personal access token and anon key are not needed by the application. The old D1 schema is a test fixture; production does not bind D1.

## Verification

```sh
node --test tests/core.test.mjs tests/supabase-store.test.mjs tests/zernio.test.mjs tests/linkedin.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

The original service and transport regression tests remain. Zernio tests additionally cover owner-scoped managed secrets, redaction, unsupported operations, local-only drafts, concurrent approval, exact provider bodies, future schedules, partial/unknown outcomes, suppression, redirect blocking, rate limits and legacy draft blocking.

`tests/zernio-live.mjs` accepts a key through non-echo stdin and only performs reads: accounts, profiles, posts, LinkedIn aggregate analytics and account health. No posts, comments or messages are sent by the verification script. `tests/supabase-live.mjs` verifies the underlying repository with temporary synthetic records and a mocked messaging provider.

The retained Sites/Vinext integration builds and publishes the worker. Managed browser QA is unavailable without the browser-control skill; automated and live API checks do not constitute a visual browser test.

`tests/linkedin-database.sql` exercises the real database inside a rolled-back transaction: RLS/grants, owner isolation, browser binding, expiry, one-use OAuth state, redacted lists and configuration changes.

## Remaining limitations

- Full LinkupAPI parity is impossible with this provider's documented surface. Unsupported operations are explicit in the matrix.
- This is a focused Zernio integration, not every Zernio endpoint. Ads, paid campaigns, voice/SMS, blogs, webhooks, uploads, advanced platform-specific publishing, TikTok/YouTube publishing, and new unsolicited DM conversations are not implemented.
- Messaging platform permissions/windows still apply. LinkedIn DMs are unavailable. Personal LinkedIn accounts cannot return individual reactors through the organization-only endpoint.
- Post/comment analytics may be cached or pending. A provider acknowledgement is not final delivery. Partial publishing remains `unknown` locally and requires provider reconciliation.
- No autonomous follow-ups, standalone API-key authentication, billing engine or existing Vorlen CRM sync.
- Dashboard records show the latest 100 drafts/contacts/suppressions and 50 activity entries. Usage aggregates the full history.

## Sources inspected

- Connected LinkupAPI schemas: `docs/linkupapi-plugin-inventory.json`.
- https://zernio.com/agent-quickstart.md
- https://zernio.com/llms.txt
- https://zernio.com/openapi.yaml
- https://zernio.com/linkedin-mcp
- https://hunter.io/api-documentation/v2
