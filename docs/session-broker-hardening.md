> Historical foundation notes. The implemented native broker is documented in [native-session-broker.md](native-session-broker.md).

# First-party session broker — encryption guardrails

The `session-vault.mjs` envelope provides authenticated AES-GCM encryption for **opaque references** to a future authorised provider session broker. It binds the ciphertext to the Vorlen tenant owner and connection UUID, validates expiry, and limits its maximum lifetime to 24 hours.

This module is a cryptographic primitive, **not a functioning LinkedIn login or remote browser**. It must not be used to save LinkedIn credentials or browser cookies inside Supabase. A new broker needs user approval, an approved provider authentication route, a secure vault to store credentials (prefer non-exportable keys and audit access), and a working revoke call that also deletes provider credentials. No such broker credentials are currently provisioned.

`lib/security.mjs` already provides AES-GCM and requires `CREDENTIAL_ENCRYPTION_KEY` to be exactly 32 random bytes as hex; the new module reuses it rather than inventing a second encryption secret.

The previous API `POST /api/v1/linkedin/sessions` with `action=revoke` **only invalidates the local reference**. It does not revoke a remote LinkedIn session or token. To avoid dangerous false expectations, UI must label this 'Remove local connection record' unless remote session revocation is implemented and verified.

Further work: complete and verify broker network/authentication, deploy Vercel API, release connection management UI, and enforce tenant authorization on every worker operation. No private LinkedIn endpoints, challenge bypass or automated outreach in this change.
