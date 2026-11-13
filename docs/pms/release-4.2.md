# Engineering acceptance for formal reviews

Use the **Formal review schedules** screen as PM. Preview the year, the quarterly or half-year periods, the estimated observer workload and any draft periods to replace. Activate the approved proposal, then open each formal cycle at the appropriate time. Open cycles retain their dates, questionnaire, roster snapshot and policy version. New Track A reviews require a campaign covering that same period.

| Exercise | Expected outcome |
|---|---|
| CAD-01–08. Preview quarterly, switch the same draft year to biannual, then open H1. | Four draft quarters are replaced by two half-years. An attempt to replace the launched year fails. |
| 360 scoring. Submit validated scores 5, 4, 3 and 4 from one manager and three peers. | The behaviour score is 4.00. An absent stakeholder category carries no penalty. A question marked unobserved carries no numerical value. |
| Privacy. Submit feedback from one manager and only two anonymous observers with the anonymous minimum set to three. | Calculation remains pending. Employees receive reviewed narratives and privacy-safe competency summaries only after release. |
| Questionnaire and moderation. Compare IC and manager reviews. | Only the manager bank includes the leadership question. Employee nomination, manager endorsement and PM invitation precede submission. Access to restricted response detail requires a designated administrator and a reason. |
| Cohort sign-off and deductions. Clear a cohort, retain a supervisor base of 4.20 and lock at zero deduction. Enter 0.50 on an approved base of 1.10. | The first result remains 4.20. The second requires a comment and locks at 1.00 with the actual deduction recorded. Individual panel exceptions retain their own history. |
| Release and appeal. Complete the feedback conversation and acknowledge the result. Reopen with authority. | Employee sees the released version, the correction preserves the prior revision, and a new release is required. |

Run `npm test` and the two Chromium journeys using `python test/browser/feedback.py` with Python Playwright and Chromium installed. The browser fixture exercises an individual contributor in a quarterly cycle and a people manager in a half-year cycle through nomination, release, receipt and closure. The fixture uses synthetic accounts.

Review older cycles under their frozen policy version. Production activation needs TCG's signed cadence, privacy and scoring choices, role UAT, integration reconciliation, security validation and recovery rehearsal. The automated fixtures are engineering evidence for the specific scenarios they exercise. A case requires separate evidence before TCG records a pass for its production environment.
