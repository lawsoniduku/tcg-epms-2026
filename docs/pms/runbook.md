# Installation and operations

Use Node.js 24. The standalone service needs no package installation. Supply environment values through the shell, service manager or secrets platform. The program does not automatically read a .env file.

## Empty staging installation

1. Generate a 32-byte random encryption key and keep its base64 representation in the corporate secret manager. Set EPMS_DATA_KEY and EPMS_DB_PATH. The key is needed for every subsequent startup and restore.
2. Supply EPMS_ADMIN_EMAIL, EPMS_ADMIN_NAME and EPMS_ADMIN_PASSWORD (at least 12 characters) and run `npm run provision`. Remove the bootstrap password from the runtime environment after provisioning.
3. Set EPMS_STAGE=staging, HOST and PORT. Run `npm start`. The default bind address is loopback. For local HTTP testing use EPMS_SECURE_COOKIE=0. For HTTPS set EPMS_PUBLIC_ORIGIN to the canonical origin and EPMS_SECURE_COOKIE=1.
4. Sign in as the administrator and use User accounts to provision independent workflow roles. Create at least two Finance users for modelling and export checking. Scope department heads to the department name from HRIS. A blank company scope grants group-wide access appropriate to the role.
5. Create manager accounts, add or import the staff roster, then create employee-linked accounts. Use PM and Executive accounts to draft and publish the effective policy. Create and approve the Group, BU, department, team and individual objectives. HR opens the cycle with its policy snapshot and dates.
6. Test corporate authentication, notification delivery and HRIS/payroll contracts. Use Migration reconciliation to review historical extracts. Record rollout approval in the named environment with independent PM, Security administrator, Finance, ER and Executive signatories.

## Production start

Set EPMS_STAGE=production, EPMS_ENVIRONMENT to the exact approved rollout record title, EPMS_PUBLIC_ORIGIN to the HTTPS origin and EPMS_SECURE_COOKIE=1. The production startup gate checks the live database and rollout approval. Enforce MFA through the corporate identity system and network policy, secure the service behind TLS, restrict local credential use and monitor authentication and access logs.

Use the supplied Dockerfile if TCG's deployment platform runs containers. Mount a persistent, writable volume at /app/data for the non-root node user. Inject configuration and secrets at runtime. Container build and orchestration acceptance belong to the target environment.

## Backup, restore and rollback

Set EPMS_BACKUP_PATH to a new filename and run `npm run backup` with the same DB path and encryption key. The command makes a consistent SQLite backup. Protect the backup plus a separately controlled recovery copy of the key. A running database may have WAL files, so use the backup command for a live snapshot.

Restore into an isolated directory, configure the same key, mode and restored DB path, and compare record, event and score-revision counts. Exercise a test account, scoped view and an approved export. Confirm the separate backup and external integration consumers before switching traffic. Use the prior application release and its matching pre-cutover backup to roll back. Reconcile any external notifications or payroll batches by stable ID.

The service evaluates due-date processing every minute while running. Repeated evaluation deduplicates escalation messages. Monitor process health, failed deliveries, backup age, database volume capacity and overdue workflow owners. Test RTO, RPO, representative concurrency and certificate/key rotation before go-live.
