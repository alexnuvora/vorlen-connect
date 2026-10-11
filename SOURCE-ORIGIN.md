# Original Vorlen Connect cloud source

Exported from existing Sites project `appgprj_6acace6d803c81919da2d784d8471b7a`.

- Cloud application: https://vorlen-connect.fresh-charm-4046.chatgpt.site
- Saved cloud version: 7
- Original source commit: `c0512c8dc499568e7f597ecd672c23f46ebc1e84`
- This is a source export, not a rebuilt or regenerated application.

The export includes the frontend, backend routes, MCP tool implementations,
provider adapters, database migrations, tests, lockfile, maintained build/hosting
integration and original hosting manifest.

All application source files are copied byte-for-byte from the original commit.
`.gitignore` receives additional secret/generated-file exclusions. `.env.example`
contains empty configuration names. `EXPORT-MANIFEST.json` records source hashes.
Generated TypeScript metadata and Supabase CLI cache are excluded. Git history,
installed dependencies, built output, runtime data and secret-bearing local files
are not part of this export. Runtime secrets are stored separately in the cloud
and are not copied. Database migrations are included; database rows and encrypted
provider credentials/tokens are not exported.

## Local use

Use Node 22.13 or later and the package-manager version in `package.json`.
Install with `corepack pnpm install --frozen-lockfile`, then `corepack pnpm dev`.
Configuration names are in `.env.example`; never commit populated secret files.
The original backend uses Cloudflare Worker bindings and trusted Sites identity
headers. Merely cloning the repository does not reproduce the hosted sign-in or
provision a new deployment. The direct LinkedIn callback is intentionally the
original cloud URL. No authentication bypass or localhost redesign was added.

The source export does not change the existing cloud deployment or its sharing.
