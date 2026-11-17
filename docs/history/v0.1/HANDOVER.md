# Engineering handover — first working slice

Build date: 4 November 2026. Version: 0.1.0. This is a runnable synthetic reference implementation of the foundation and manual-finalisation slice, not a claim that the complete PRD has been delivered.

Repository target: `lawsoniduku/tcg-epms-2026`, branch `codex/pms-foundation`. Public publication of this implementation has been expressly authorised by the repository owner. The original internal policy/PRD attachments and real employee records are excluded from the source.

## Review the product

Run `npm run demo` with Node 24 LTS and open `http://127.0.0.1:3000`. No dependency installation is needed. The synthetic data persists in `data/epms.sqlite`; it is excluded from Git. The static private preview uses isolated browser storage and does not call the SQLite service.

The initial design uses the attached document's navy palette, a teal interaction accent, a text wordmark and a restrained enterprise layout. An official TCG design-system/logo asset has not been supplied; brand validation remains open.

Suggested review:

1. Choose Performance Management; inspect Overview and Score finalisation.
2. Open Ada Okeke. The submitted score is 4.20, deduction is disabled at 0.00, and calibration is complete. Approve as final.
3. Reopen with a factual reason and an authorisation reference. Record a separate evidence-based calibration decision, then relock. Score history retains both immutable revisions.
4. Release the locked result. Switch to Employee and open Ada's profile. Only the released final score is exposed; no provisional supervisor/calibration scores or approver identities are returned in the employee projection.
5. Switch to Line Manager. Only assigned reports plus the manager's own employee record are visible. The manager cannot lock final scores or access other departments. The manager's own review uses the employee projection.
6. Export the score register as PM, Executive or Auditor. Confirm the source score, calibration, deduction, final, rating, actor/time and revision reconcile.

## Verification evidence

- Node syntax checks pass across the application, service, scripts and test modules.
- 29 domain/workflow/HTTP tests cover deterministic score bands, 70/30 helper arithmetic, probation precedence, disabled/controlled deductions, source-score tampering, scope/role denial, CSRF and origin checks, stale writes, calibration gates, immutable ledger/audit constraints, release privacy, CSV formula protection and database reopen persistence.
- Live desktop browser UAT against the real Node/SQLite service verified PM sign-in, dashboard navigation, Ada's 4.20 lock, authorised reopening, separate 4.00 calibration with evidence, relock as revision 2, employee release, and the employee's restricted released-result view.
- Static preview uses the shared workflow engine but is not server/database end-to-end evidence. Responsive CSS is implemented; a dedicated mobile-device and assistive-technology audit is still required.
- GitHub CI is configured to run syntax checks, tests and the static build on pushes/PRs. A local pass is not a claim that remote CI or production security UAT passed.

## Operational boundaries

The service is intentionally available only in `--demo` mode, and refuses a database without the synthetic marker. Demo role selection is public within that isolated demonstration; it must never protect real employee data. Sessions are in process and are invalidated at restart. Cookies use HttpOnly/SameSite; production TLS/Secure-cookie behaviour must come from the SSO integration. SQLite is suitable for this local reference slice, not an ephemeral serverless deployment or the final corporate platform decision.

The approval-reference fields record the demonstrator's traceability; verification against a signed delegation/approval registry is not implemented. Reopening currently has a single PM authority. Any live separation of duties or dual approval must be implemented against the approved authority matrix. Audit triggers protect records through the application database connection; they do not replace a production tamper-evident audit/retention service.

Fixture supervisor submissions are immutable through the application, but the full goal/assessment authoring and source-ingestion workflow has not yet been built. Configurations are a current metadata snapshot with deduction policy copied into each finalisation; enterprise configuration approval/version history is a further phase. No raw 360 intake or identifying rater records are present.

## Next engineering work

Follow [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Next is the full Track A vertical slice: organisation snapshots and corporate identity, strategy/KPI cascade, quality review/approval and baseline locking, check-in workflow, self/manager assessments, 360 protected intake, evidence freshness and approved redistribution, calibration panel authority, acknowledgement/development actions and final policy closure. Then build monthly commercial/recovery, confirmation, capability/PIP/appeals, reward/talent, integration and cutover gates.

Specific gaps in this slice include cycle/manager queue filters, optional deduction CSV import/preview/idempotency, attachment ACLs, independent appeals, notifications/outbox, effective-dated HRIS sync, retention/deletion, pagination, encryption, backup/restore, deployment hardening and load/security/accessibility testing. No payroll, salary mutation, automated warning, suspension or exit is implemented.

All policy decisions in the in-app register remain unresolved. In particular, the conflicting BSC perspective weights must be resolved by HR/Executive; deduction parameters require express authority; merit and commercial decision rules remain inactive. Production cutover requires approved policy configuration, organisation/delegation reconciliation, SSO, a durable managed database, privacy/security validation, formal HR/Finance/ER UAT and a tested rollback plan.
