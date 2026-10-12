# Standalone Supabase Auth — staged implementation

This branch contains **unreleased** owner-only email/password login code and a build/test workflow. Production remains on the legacy bridge. This feature is intentionally gated until correct Supabase Auth project settings and existing owner identity are confirmed.

## Required Vercel server-side environment
- `SUPABASE_URL=https://oulypjxpbrlxbjrxzryf.supabase.co` (already configured)
- `SUPABASE_PUBLISHABLE_KEY` — obtain from **this project**, never use a service-role key as a publishable key. Read on the server only.
- `VORLEN_SUPABASE_OWNER_UID` — exact UUID of the Supabase Auth user permitted to administer the existing Vorlen Connect owner data. Verify this directly in the correct project's Auth users dashboard; do not infer from email.
- `ZERNIO_OWNER_ID`, `VORLEN_SESSION_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CREDENTIAL_ENCRYPTION_KEY`, `VORLEN_MCP_API_KEY` — preserve current values.
- `APP_ORIGIN=https://connect.vorlen.co.uk` (already configured).

The guard `standaloneConfigured()` remains false until all required settings exist. In that state old login still works (where supported), while new `/login/session` replies 503.

## How it works
The Next.js server authenticates using Supabase Auth's password endpoint, validates the resulting token via `/auth/v1/user`, checks verified user ID against `VORLEN_SUPABASE_OWNER_UID`, and issues an encrypted HttpOnly/Secure/Lax 45-minute cookie. Each protected request revalidates the token against Supabase. The existing owner identifier is passed to the DB/crypto service unchanged. The existing separate MCP bearer credential remains supported.

Short session expiry currently requires re-login: refresh-token rotation and long-lived sessions are **not yet implemented**. A protected production cutover requires testing: owner login, rejected non-owner credentials, expiration, login/logout, LinkedIn credential retrieval and drafts, API and MCP access, and restoration procedure. Never publish an existing draft during test.

## Before production cutover
1. Inspect Auth users in the correct Supabase project and confirm the owner UUID; confirm owner has a verified email and password sign-in enabled. Configure anti-abuse protections, MFA if available, and disable unneeded public signup.
2. Set Vercel credentials in preview first; preview must use its own canonical `APP_ORIGIN` and approved host if testing on preview deployment. Do not change production env yet.
3. Run the workflow and resolve all lint/build/test failures.
4. Manually verify credentials and existing owner data (including encrypted provider tokens), as well as access denial for another test user. The runtime uses one immutable owner, not the authenticated user's editable metadata.
5. Design/test refresh-token rotation and secure logout; review CSRF and session idle timeout for production readiness. Only then enable production settings and remove Sites login routes in a separate, reviewed change.
