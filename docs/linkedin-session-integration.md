# Vorlen Connect session-based LinkedIn integration

## Scope and facts

This is the **first-phase foundation**, not a functioning password/session LinkedIn client. The current production OAuth integration already supports limited approved LinkedIn scopes (member profile and public posting). LinkedIn inbox, invitations and Recruiter are **not verified or advertised**.

The LinkedIn session approach requires legal/provider review before live deployment: reverse engineering private LinkedIn endpoints and automated password login can violate platform rules or trigger account locks. The implementation does not attempt to bypass verification, CAPTCHAs, rate limits or access controls.

## Proposed security boundaries
- **Vercel** presents connection state and account-holder initiated verification. Never collect raw LinkedIn passwords, OTP codes or browser cookies in the application or logs.
- **Supabase** stores owner-scoped state and audit history only. Connections are never shared across owners. State changes require service-role server authentication and optimistic version check.
- **Oracle** is the eventual credential/session broker. A separately reviewed secrets vault adapter is required to store encrypted, expiring session material; opaque references point to vault entries. A browser on 1 GB Oracle E2 Micro may exceed memory; evaluate a remote interactive browser or a larger dedicated host before enabling.
- **GitHub Actions** deploys reviewed migrations and releases without logging credentials.
- **Verification** is always completed by the account owner through the provider's supported flow. Account actions require per-job authorization, tenant isolation, idempotency, bounded rate limits and auditing.

## Phase gates
1. **Connection lifecycle**: migration, state machine and tests; no live login.
2. **Authorised browser verification**: secure user-approved login and challenge handoff, vault-backed encrypted session material, expire/revoke, and audits.
3. **Own profile**: use documented LinkedIn OAuth API where possible; integration test with account holder.
4. **Inbox**: only after supported entitlement and an end-to-end verified retrieval test.
5. **Invitations / messaging**: explicit consent, recipient checks, policy/legal review, and per-action approval.
6. **Recruiter**: requires eligible LinkedIn product entitlements; do not claim feature availability until validated.

The Oracle queue currently processes only `health_probe` jobs. No session automation worker jobs are enabled.
