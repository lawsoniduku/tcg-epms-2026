# Release audit remediation

## Cycle, task and merit corrections

- Opening a cycle checks the roster, policy, strategy, reviewed assignments and active schedule for the selected period. Activating a compatible schedule keeps the configured draft and its deadlines, weights and questions.
- Employee task lists show outstanding 360 nominations alongside self-review. Manager assessment becomes actionable after self-review submission.
- Track A merit proposals default to the calibrated ledger score. Finance must record signed authority when selecting final scores. Existing approved proposals retain their evidence.
- KPI uploads share server preview validation across the standalone service and private workspace. The private workspace supports cycle XLSX reports and KPI workbook downloads.


This register maps the original release audit IDs to the implementation shipped for engineering acceptance. Run npm test, npm run check and the Chromium journeys described in START-HERE.md. Collect the environment-specific evidence below before a live appraisal cycle.

| Finding | Change | Engineering acceptance check |
|---|---|---|
| H01 | Scoped account listing, linking and disabling | Verify the delegated administrator sees only permitted employees. |
| H02 | Confidential questionnaires and evidence use the same reader and purpose restrictions | Check each review participant’s evidence visibility before and after access expiry. |
| H03 | Archived employees lose active sessions and effective access | Archive a synthetic employee with two active sessions. |
| H04 | Evidence uploads require a permitted action on the target record | Check role visibility and upload results across review stages. |
| H05 | Reward calculations select salary certified for the reward window | Reconcile historical and current salary changes against payroll fixtures. |
| H06 | Reopening resets affected moderation and calibration decisions | Reopen a review and confirm the required decisions occur again. |
| H07 | Dialog submissions retain the opening record, version, actor and role | Change routes with an open form and check that no other record changes. |
| H08 | Finance approval checks the payment beneficiaries and prior signers | Exercise maker, independent checker and beneficiary cases. |
| M01 | Password verification uses bounded asynchronous work and account throttling | Monitor gateway and service response times during concurrent sign-ins. |
| M02 | Roster import checks manager and employee company alignment | Validate a mixed-company roster fixture. |
| M03 | Session authority is checked after reading a mutation request body | Verify revocation takes effect for pending submissions. |
| M04 | Completion reporting includes cohort records | Reconcile report totals with the cycle roster. |
| M05 | CSV exports apply report filters and role scope | Compare filtered score and completion rows against the screen. |
| M06 | Evidence retries use stable upload keys and content receipts | Retry one interrupted upload and verify a single attachment. |
| M07 | Notification claims use timed leases and bounded retry handling | Verify independent consumers, provider deduplication and failed-delivery monitoring. |
| M08 | Requests time out, retries retain their operation ID, and refresh failure is identified separately | Interrupt a refresh after a successful save and reconcile the record. |
| M09 | Sign-out invalidates pending views and clears role state | Switch accounts during a slow request and inspect the new session. |
| M10 | Deadline processing uses a persisted watermark | Restart after missed dates and reconcile due work. |
| M11 | A successful confirmation appeal suspends the disputed effective confirmation | ER should approve the effective-date behaviour with a dated fixture. |
| M12 | Reopened reviews require fresh feedback release approval | Confirm a prior approval cannot release a revised summary. |
| M13 | SQLite state caching, indexed projections and pagination reduce repeated work | Benchmark reporting and writes at the expected headcount and concurrency. |
| M14 | Hosted persistence uses row storage, atomic version checks and expiring receipts | Rehearse migration, conflicting writes and recovery on staging D1. |
| M15 | Updated contrast for text and controls | Check contrast in default, focus and selected states. |
| M16 | Mobile navigation contains focus and makes the background inert | Use keyboard and screen reader to open, traverse and dismiss navigation. |
| M17 | Filter updates restore focus | Refine a filter repeatedly by keyboard. |
| M18 | Form fields have associated labels and validation instructions | Verify each invalid field’s announcement with the supported screen reader. |
| M19 | Responsive layout wraps and allows child regions to shrink | Review six browser widths, enlarged text and long employee names. |
| M20 | Effective-dated roster changes trigger track recomputation | Compare the assigned track on either side of an effective date. |
| L01 | Review terminology supports configured cadences | Inspect quarterly and half-year configurations. |
| L02 | Task views share queue logic | Reconcile dashboard tasks with the queue. |
| L03 | Deductions support two decimal places | Enter a fractional deduction and reconcile the saved value. |
| L04 | Repeated Open and Download controls have contextual accessible names | Inspect the screen reader’s links and buttons lists. |
| L05 | Reports use an explicit allowlist | Verify supported report names against the API contract. |
| L06 | Hosted request bodies enforce a byte limit while streaming | Verify normal and oversized synthetic requests on staging. |

Corporate identity, payroll, notification delivery, backup restoration, assistive technology and representative load require acceptance in the target environment. Retain results with the release ticket.

For the subsequent four-phase upgrade and the disposition of hosted-only findings, see [the change register](../../CHANGELOG.md).
