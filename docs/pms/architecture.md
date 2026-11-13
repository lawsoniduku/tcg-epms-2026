# Architecture and deployment choices

The browser renders the record projections and forms returned by the server. Each operation declares its required fields, authorised roles, allowed stages and state transition in public/workspace. The browser submits measurements and evidence. The server computes ratings, applies publication gates and persists the transaction.

The standalone Node service stores accounts, encrypted workflow records, immutable snapshots, audit events, notification messages, session state and idempotency receipts in SQLite. Each command uses BEGIN IMMEDIATE and optimistic record versions. A failed command rolls back the business record, event journal and notification messages together. Budget awards are persisted as integer kobo and calculated with integer products before display.

The working-day calendar skips weekends and configured holidays. Workflow events store UTC timestamps and the user interface displays Africa/Lagos time. Employee, manager and policy snapshots preserve the original cycle context. Dated amendments and track overrides retain their evidence and approvals.

The engineering release runs on the standalone Node service. Excel import and export use an isolated Python standard-library helper; CSV handling stays in the workflow engine. Confidential response versions use a dedicated encrypted table and independently wrapped data key.

The current database adapter reads the working dataset per request. Load testing must establish an acceptable population and concurrency limit. High-volume reporting, multi-instance writes and horizontal scaling require repository and query optimisation or a target database adapter before that deployment pattern is used.
