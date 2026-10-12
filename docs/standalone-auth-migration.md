# Standalone authentication migration — release gate

**Status: blocked pending access to the correct Supabase project. No production switch has been made.**

The production application `https://connect.vorlen.co.uk` is hosted on Vercel. Its current login is a **legacy ChatGPT Sites assertion bridge**. The URL `https://vorlen-connect.fresh-charm-4046.chatgpt.site` is referenced by `lib/auth-tokens.mjs` and `app/signin-with-chatgpt/route.ts`.

## Critical ownership constraints

- Vorlen Connect uses **Supabase project `oulypjxpbrlxbjrxzryf`**, enforced by `lib/supabase-store.mjs`. **Do not use Talent Flow project `mzkaodoruhklzluikagy`**.
- Existing provider credentials, LinkedIn tokens, drafts, activity and suppressions are queried by a fixed **owner key** (`ZERNIO_OWNER_ID`), NOT by the Supabase Auth user UUID.
- Encryption contexts in `lib/linkedin-service.mjs` bind stored secrets and tokens to that existing owner string. **Changing it or re-encrypting blindly breaks access**.
- The server-only `SUPABASE_SERVICE_ROLE_KEY` must never be sent to browsers. Current data RPCs use a service credential; they must remain gated by strong server-side identity + owner authorization.
- `VORLEN_MCP_API_KEY` is a distinct server-to-server credential; preserve protected MCP integrations until replaced with scoped OAuth.
- `APP_ORIGIN` is already set to `https://connect.vorlen.co.uk` on Vercel. Do not change LinkedIn developer secrets or existing direct connection settings as part of login migration.

## Implementation requirements

1. Verify administrator access to **project `oulypjxpbrlxbjrxzryf`**; obtain the Supabase URL and **publishable key** from the actual project. Do not store credentials in git. Set production/preview Vercel env separately.
2. Use Supabase Auth's supported server-side Next.js SSR approach with secure HttpOnly cookies and server verification (`getUser` or equivalent verified user call; do not trust client-provided email, metadata or `getSession` alone as authorization).
3. Provision and confirm the exact authorized Supabase Auth user ID, in server-only `VORLEN_SUPABASE_OWNER_UID` or in a strictly controlled mapping table. Check **verified UID** against this allowlist on every session and server API request. A validated user maps to the **existing `ZERNIO_OWNER_ID`** for all old owner-scoped data and cryptographic contexts.
4. Reject all other users (403); never infer ownership from editable user metadata, email strings alone, or sign-up status. Disable public signup for this owner-only migration.
5. Implement login, logout, refresh/expiry and route protection; enforce CSRF controls for state-changing browser requests, secure cookie attributes, safe redirects and rate limits. Prevent inadvertent cache of authenticated responses.
6. Keep legacy sign-in routes **disabled or deprecated** only after testing; remove reliance on the hosted assertion issuer from production code once rollback is ready. Do not preserve a backdoor or weaken bearer-key validation.
7. Ensure existing LinkedIn and Zernio account lists, draft `ee3e7aab-1734-4b22-bc3b-503f6d2a3d73`, suppressions, logs and credential decryptions are visible with the new login; test server-side before cutover. Do not publish a draft as a test.
8. Run unit tests, login negative tests, token expiry/refresh tests, CSRF and cross-account tests, production-preview checks and a single real login. Keep old deployment and restore instructions until verified.
9. Inspect Supabase Auth settings, allowed redirect URLs and email provider settings for `https://connect.vorlen.co.uk`, and configure credentials exclusively in the Supabase/Vercel dashboards.
10. ChatGPT MCP connector authentication is **separate** from web login; validate existing caller before changing any remote MCP configuration.

## Release gate

**Do not merge or deploy auth changes** until Vorlen Connect's actual Supabase project is accessible and its owner identity and data have been verified. Existing browser sessions may currently be non-functional after the domain migration, but replacing authentication without owner verification creates a higher-risk data disclosure or orphaning failure.
