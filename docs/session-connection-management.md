> Historical foundation notes. The implemented native broker is documented in [native-session-broker.md](native-session-broker.md).

## First-party session connection management

This is a safe account-holder connection-management interface, **not** a LinkedIn password login automation. The new authenticated /api/v1/linkedin/sessions endpoint supports listing, registering and revoking empty connection records. No password, verification code, LinkedIn cookie, or secret is accepted.

Database operations are scoped to the authenticated Vorlen user ID. Every create/revoke produces a database audit event. Revocation invalidates the database reference, but **remote LinkedIn sign-out and vault deletion remain unimplemented**: do not describe this as fully revoking a real provider token. Existing official OAuth connections use their existing OAuth disconnect path.

Future login handoff must use an approved provider authentication mechanism or human-controlled browser session, with encrypted short-lived material stored in a separate broker vault. The API must never receive passwords/cookies. Session-capability gates remain off until live verification.

Deployment: the migration is in supabase/migrations/20261012080000_session_management.sql and applies solely to Vorlen Connect project oulypjxpbrlxbjrxzryf. The endpoint must be merged into the actual production deployment branch before use.
