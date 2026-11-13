# Standalone engineering candidate · 13 November 2026

| Requested change | Implementation and verification |
|---|---|
| 1.1 | Base-ten integer arithmetic for confirmation, commercial scoring, attainment, competency means and merit percentages. See the decimal fixtures and DEC-04 decision in the [phase register](docs/pms/phase-upgrade.md). |
| 1.2–1.3 | Password-login switch, gateway-only privileged roles, per-source and per-account controls, bounded hashing, idle timeout and first-password replacement. Service tests cover disabled login, role restrictions, session expiry and password change. |
| 1.4 | Integration token rotation, transport IP allowlist, audited acceptance/denial, and a privileged-employee reporting-line guard. |
| 1.5–1.6 | Dedicated encrypted version storage for 360 responses; transactional feedback rekey; 0600 SQLite backups. Tests include private-field isolation, rotation and indistinguishable missing/raw-response lookup. |
| 2 | Administration → Set up a review cycle. The year-specific checklist links to each owner’s screen and shows outstanding approvals, managers and track review. Completing roster sign-off persists the roster versions reviewed. The wizard reflects existing permissions and workflow transitions. |
| 3.1–3.2 | Download CSV or XLSX from a draft scorecard. XLSX has an example and instructions plus validation lists. CSV includes the example as its second row. Server preview reports each row, per-employee weight totals and policy errors before writing. |
| 3.3–3.5 | Select individual template KPIs, reuse the preceding baseline, edit targets, or distribute rows to team drafts. Confirmation rechecks versions, manual KPI fields and policy totals. The existing command ledger handles retries. The import batch and affected scorecard revisions are audited. |
| 3.4, 3.6 | Core and advanced manual fields, sticky Save/Cancel controls and file-preview forms for roster, commercial, deductions and migration. The commercial and deduction workflows retain their original second-stage approvals. |
| 4.1–4.4, 4.6–4.7 | Wrapping grids, labelled mobile filters, stacked record rows, scrollable section navigation, deduplicated role subtitles and larger mobile controls. Chromium checks layout and action access at three widths. |
| 4.5 | Role-projected score summary, KPI results, competency aggregates, named calibration and revision history, and a stage-grouped timeline. Protected results continue to pass through the server projection. |
| Cleanup | Removed the legacy server, its browser entry points and tests. Removed hosted-only code and migrations from the standalone GitHub engineering source. The earlier private hosted preview remains on the earlier release. |

In the engineering archive, open `evidence/screenshots/`. Images prefixed `before-` come from the previous release. KPI upload and setup have current images only because those screens are new. Chromium captures the live fixtures at each size. Screenshot review and accessibility testing with TCG's supported assistive technology are separate acceptance activities.

## Review management and cycle reporting

Performance Management can create a cycle or plan the annual schedule from Review management. In a draft cycle use Configure appraisal weights and Add, Edit or Remove 360 question. The existing 70% BSC and 30% 360 split is the default. The two percentages must total 100. Question applicability can be everyone or people managers. Opening freezes the questionnaire and weights. Every eligible validated rater contributes equally to the behaviour score. Unobserved answers are excluded from the rater's mean. Stored results are preserved.

Use Download appraisal report (.xlsx) on Review management, the cycle detail, or Reports. The workbook separates cycle totals, employee-level results, individual KPIs and score revisions. An outstanding appraisal carries its stage and blank score cells.
