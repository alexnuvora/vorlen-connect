# Vercel deployment

This is the original Vorlen Connect application adapted to the Next.js Node runtime. The original UI, API, MCP tools and Supabase storage implementation are retained. The original Cloudflare source remains available in the export commit and Sites source repository.

## Runtime configuration

Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CREDENTIAL_ENCRYPTION_KEY`, `ZERNIO_API_KEY` and `ZERNIO_OWNER_ID` from the existing application's environment. Preserve the exact encryption key and owner ID to retain access to existing stored credentials and data.

Set `APP_ORIGIN` to the canonical production HTTPS origin. Set new random 32-byte hexadecimal values for `VORLEN_SESSION_KEY`, `VORLEN_AUTH_BRIDGE_KEY` and `VORLEN_MCP_API_KEY`. These are server secrets, never public browser environment variables.

The existing private ChatGPT Site authenticates its owner and returns an encrypted assertion bound to the Vercel browser's login challenge. Configure its `VORLEN_VERCEL_ORIGIN` and matching `VORLEN_AUTH_BRIDGE_KEY`. This sign-in requires that original Site to remain deployed. Sessions expire after eight hours. Vercel does not trust client-supplied Sites identity headers.

The Vercel MCP endpoint is `/mcp`. Authenticated tool calls require a session or `Authorization: Bearer <VORLEN_MCP_API_KEY>`. Existing ChatGPT plugin registrations remain connected to the original Site; moving plugin registration is a separate operation. Outbound actions continue to create reviewable drafts.

Add `APP_ORIGIN/api/linkedin/callback` to your LinkedIn developer app's authorized redirect URLs before connecting LinkedIn directly on Vercel. The Supabase management access token and public anon key are not used by this backend and are not needed in Vercel.

Build: `pnpm install --frozen-lockfile && pnpm build`. Tests: `pnpm test`.

`EXPORT-MANIFEST.json` describes the historical original export, before these hosting changes.
