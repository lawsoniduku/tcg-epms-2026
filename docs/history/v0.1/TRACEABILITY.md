# First-slice requirements trace

The attached policy governs outcomes; the PRD manual-finalisation addendum governs the manual flow. Historical policy/PRD version labels disagree; reconcile document control before an approved live configuration. Source files remain outside this public repository.

| Source | Implementation | Verification / limit |
|---|---|---|
| ORG-02, policy employee tracks | `trackFor`, register, Track C precedence | Domain and scope tests; effective-dated HRIS import not built |
| FIN-01/02 | Employee profile, applicable base, zero-deduction lock | Domain, workflow, HTTP tests |
| FIN-03/05 | Exact hundredths, nonzero reason/basis/evidence, server preview/recompute | Calibrated 4.00 − 0.20 = 3.80 test; controlled policy only |
| FIN-04 | No supervisor mutation endpoint; separate calibration decisions | Tampering rejection tests; source assessment authoring is next phase |
| FIN-06 | Disabled policy default; complete explicit configuration required | Disabled/cap/floor/authority/track tests; production approval management is next phase |
| FIN-07 | Transactional lock, immutable score ledger, authorised reopen and new revision | Lock/reopen/history, DB triggers, stale-version tests |
| FIN-08 | Queue filters by department, status and name/ID/role | UI; manager-specific filter remains a backlog item |
| FIN-09/10 | Optional deduction CSV import | Not implemented; no import button or claim of completion |
| FIN-11 | Register + CSV of source/calibration/deduction/final/rating/reason/actor/time/revision | Reconciliation tests; no import batch because import is absent |
| FIN-12 | No salary mutations or payroll execution | No payroll integration exists; reward exports remain unimplemented |
| Policy §15 | Track A helper + two-decimal score bands | Boundary tests; actual KPI/manager assessment authoring is next phase |
| Policy §14 / Appendix E | Approved-rule-only 360 aggregate helper | Cohort-suppression test; protected rater intake/UI is not built |
| Policy §16 | Evidence-based calibration with actor/time/reason | Scoped permissions, negative/state tests; multi-approver panel workflow is next phase |
| Policy continuous feedback | Basic check-in and self-review notes | Note permission/state tests; not a complete check-in or goal workflow |
| Security | Scoped server reads/writes; HttpOnly sessions; CSRF; JSON limits; escaped HTML; CSP | HTTP tests; corporate SSO, TLS, encryption, retention and security assessment are release gates |

Supervisor submission, score lock, employee release and full policy closure are separate concepts. This first slice implements the middle two actions. It does not label a supervisor-scored or locked appraisal as fully policy-completed.
