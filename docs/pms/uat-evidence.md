# Verification evidence

For current v4.2 scenarios and the Chromium test suite, see [formal review acceptance](release-4.2.md). The results below record the earlier build tested on 5 November 2026.

The 5 November build passed 49 automated tests and JavaScript syntax checks with Node 24. The suite includes 29 regressions for the original score-finalisation implementation. The additional 20 tests cover the integrated workflow engine and deployable service. Run the complete suite with `npm test`.

| Exercise | Observed outcome |
|---|---|
| Desktop browser, fresh quarterly scorecard | Using Line manager, PM, HOD and Employee accounts, entered four KPIs weighted 20/20/50/10, submitted, passed QA, locked baseline, recorded a mid-quarter check-in and behavioural evidence, self-assessed and submitted actual performance. The supervisor score calculated to 4.00. An independently appointed chair calibrated it. PM locked and released 4.00. Manager recorded the conversation, employee acknowledged and PM closed the review at revision 20 |
| Full 360, automated | Valid nominations, invitations, individual responses and moderation led to categorised aggregation. Two peers were suppressed. Three qualified. Unapproved redistribution and access to another person's response were denied |
| Other pathways, automated | Three commercial months exercised progressive recovery. Confirmation progressed through the three checkpoints and an effective-dated decision. Appeals returned a record to calibration and preserved its previous score revision. A PIP required support, separate approvals and a checkpoint before hearing |
| Rewards and governance, automated | Finance simulated a capped pool, HR checked equity, Executive approved, a separate Finance checker exported, and payroll acknowledgement reconciled. Talent, recognition, comparable-period inflation, CSV deductions, commercial imports and multi-role rollout approval were exercised |
| Empty installation and integration, automated | Provisioned individual accounts, imported an employee, replayed the identical command safely, rejected unauthorised changes, verified corporate assertion signature/issuer and replay controls, tested role switching, quarantined file scanning and protected downloads, created a consistent encrypted backup and restored the employee record and audit event |
| Packaging | Standalone distribution and optional hosted Worker build are separate outputs. The public source contains synthetic test data. The private hosted workspace is for acceptance exercises |

## Standalone engineering candidate, 13 November

The current standalone suite has 62 Node tests. The count excludes tests retired with the legacy server and hosted adapter. The current Chromium suites run the quarterly and half-year journeys, exercise role navigation and check seven screens at 390, 768 and 1440 pixels. The browser checks assert page width and horizontal access to the selected primary control. The engineering archive includes the screenshots. Manual screen-reader, corporate identity, representative load and disaster-recovery acceptance belong in staging.

## Suggested TCG acceptance session

Begin with a blank staging installation and TCG-approved fixtures. Run the entire quarterly journey for an IC and people manager, include a qualifying and suppressed cohort, test delegated reviewers and sanctioned score correction, reconcile monthly sales/confirmation and validate benefit/payroll amounts with Finance. Repeat the adverse-case scenarios with ER, validate access with Security, and rehearse recovery with IT. Only the quarterly journey above was manually run in this browser session. The other automated journeys still require business-owner browser UAT.
