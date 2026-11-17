# TCG EPMS implementation plan

## Evidence and starting point — 4 November 2026

The repository has only its initial README. No application, database, ERP export, identity provider, deployment configuration, brand assets or production credentials have been supplied. The governing input is the attached Performance Management Policy; the PRD's later manual-finalisation section takes precedence over its older cover/version headers. Source documents remain outside this public repository. Fixtures are fictional.

## Architecture for the first executable slice

Use Node.js 24 LTS, native HTTP and SQLite with SQL migrations for a dependency-free reference service; use semantic HTML, CSS and ES modules for the responsive application. Shared deterministic domain functions serve the API and a clearly labelled browser-only demonstration. This is an engineering reference implementation, not the final enterprise hosting or database decision. Production requires the IT-approved SSO adapter and database with operational encryption/backup controls. The SQLite adapter is replaceable; do not connect real HR data to the demonstration.

The server owns permission checks, record scope, state transitions, scoring, transaction boundaries, optimistic concurrency, append-only score revisions and audit events. Browser identity selection is available only in a synthetic local demonstration; it is not an authentication mechanism for production.

## Ordered delivery and exit gates

| Phase | Deliverable | Exit gate |
|---|---|---|
| 0 | Inventory, source mapping, decision register and architecture | Reviewed engineering backlog; unresolved policy choices visible |
| 1 | Employee/track register, cycle snapshots, role scopes, application shell | Scope denial and probation precedence tests |
| 2a | Supervisor/calibration review, per-person finalisation, zero-deduction approval, immutable lock/reopen, register/export | PRD FIN cases, stale-write and audit tests |
| 2b | Strategy cascade, KPI authoring/QA/approval, check-ins, self and manager assessments, protected 360 intake | Full Track A browser/API/data UAT; approved BSC/evidence rules |
| 3 | Validated commercial data, monthly scores/recovery, confirmation M1/M3/M5/M6, capability/appeals | Track B/C tests; HR/ER approval of consequential actions |
| 4 | Approval-gated reward scenarios, inflation diagnostics, talent and reporting | Finance/HR/DPO acceptance; no automatic pay or employment changes |
| 5 | HRIS/SSO/notifications/payroll adapters, reconciliation, security/privacy, backup/restore and rollout | Signed migration rehearsal, UAT, rollback and go-live approval |

This first commit will deliver phases 0, 1 and 2a, with a useful workbench for later phases and explicit implementation status. A visible module is not evidence that its complete PRD workflow is implemented.

## Policy decisions the software must not invent

- D01: BSC section 10.2 uses 20/20/50/10; Appendix C uses 20/20/40/20. Live template publication stays blocked.
- D-FIN: deduction categories, track applicability, floor, cap, authority and appeal treatment require explicit approval. Default deduction mode is disabled. Controlled test configuration must include all parameters and an approval reference.
- D03/D04: merit cadence, rates, caps, salary-position factors and affordability remain draft. No payroll export.
- D05/D08: commercial schedules, MAPT and recovery thresholds require role-specific approval.
- D06/D11: quarterly behaviour evidence freshness and suppressed 360 weight redistribution require approval. No guessed score for unavailable evidence.
- D09/D15: delegation, suspension and termination require approved HR/ER/legal process. No automatic employment actions.

## Risks and controls

The GitHub repository is public: only fictional people and generic implementation/configuration examples are committed. Local files and in-process session authentication are for development, not employee production use. The prototype must not represent fixture scores or illustrative approvals as live TCG outcomes. Native SQLite needs Node 24 and is not compatible with ephemeral serverless disks. Production deployment remains blocked on SSO, durable database selection, encryption, retention, restore tests, security review and integration reconciliation.

## Verification

Use Node's test runner against domain logic and real HTTP/SQLite integration. Cover permission denial, out-of-scope access, source-score tampering, disabled deductions, approved deduction calculation, decimal boundaries, calibration readiness, stale versions, lock/reopen history, export reconciliation and restart persistence. Exercise the application in a browser when preview infrastructure is available. Record exact evidence and remaining gaps in HANDOVER.md.
