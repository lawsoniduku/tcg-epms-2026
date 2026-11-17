# Privacy and deployment review

The service derives the actor from its session or a verified upstream assertion. It checks record scope, permitted state and role again on every command. Source scores and final outcomes are calculated server-side. Employee projections hide provisional scores and raw rater submissions. Finance, capability cases and talent have separate access rules. Company scope and role-specific projection tests cover representative denials.

The standalone database encrypts workflow payloads and snapshots with AES-256-GCM. Account lookup emails, indexed identifiers, session metadata and operational access logs remain available to the database for lookup and audit. Protect the volume, backups and key separately. Credentials use scrypt password hashes. The server stores hashed session tokens and expiry, uses HTTP-only same-site cookies and validates CSRF tokens and request origins.

Audit snapshots and events reject modification or deletion through ordinary database operations. Database administrators retain privileged filesystem access. Integrate the corporate audit archive, retention/hold process and access review. Define privileged MFA, identity revocation, secret/key rotation, signed-document verification, backup ownership and deletion controls with Security. Keep evidence references in an access-controlled corporate document system.

Perform adversarial tests for cross-subsidiary access, anonymous cohort inference, pay-export forgery, CSRF, stale writes, repeated delivery, privilege escalation and improper case disclosure. Automated tests cover selected paths. Independent security assessment and DPO sign-off are outstanding.
