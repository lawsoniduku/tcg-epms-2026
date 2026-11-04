# TCG Enterprise Performance Management System

First executable engineering slice for the 2026 PMS build: a responsive performance workspace with manual employee-level score finalisation, calibration, immutable score history and scoped APIs.

**Status: synthetic reference build, not a production PMS.** Source policy/PRD attachments and real employee records are intentionally absent from this public repository. See [the build plan](docs/IMPLEMENTATION_PLAN.md), [API contracts](docs/API.md), [requirements mapping](docs/TRACEABILITY.md) and [handover](docs/HANDOVER.md).

## Run the working service

Requires Node.js 24 LTS. There are no third-party runtime dependencies and no installation step.

```sh
npm run demo
```

Open `http://127.0.0.1:3000`, choose **Performance Management**, and open **Ada Okeke** or **Tunde Balogun** from the finalisation queue. Approve the unchanged supervisor/calibrated score as final. Reopen with a reason and authorisation reference to review the immutable revision history. Release a result, switch to Employee and verify that only the released final result is visible.

The service persists synthetic records to `data/epms.sqlite`. Set `EPMS_DB_PATH`, `PORT` and `HOST` through the process environment if needed. `npm start` refuses production startup because corporate identity and production infrastructure adapters are not yet configured. Demo role selection is not an authentication solution for real data.

```sh
npm run check
npm test
npm run build
```

`npm run build` creates a static **browser-storage demonstration** in `dist/` for private visual review. It shares the same calculation and workflow functions; it does not host the SQLite service. Do not upload employee records to it. A failing API never silently switches to browser storage.

## Included

- Overview, scoped employee/track register, finalisation filters, employee profiles and record history.
- PM finalisation after calibration, separate evidence-based calibration decisions, immutable lock/reopen and explicit employee release.
- Disabled-by-default deductions with controlled-config validation, decimal score arithmetic and recalculated rating bands.
- Server sessions for synthetic roles, role and record scope, CSRF controls, append-only audit, SQLite migration and concurrency checks.
- Basic self-review/check-in notes, live score reports and formula-safe CSV score-register export.
- Policy decision register, visible implementation progress and GitHub Actions checks.

## Next delivery

Complete strategy/KPI authoring and approvals, manager assessment, protected 360 intake, formal cycle closure, monthly commercial/recovery, probation checkpoints, capability/PIP/appeals, rewards/talent and corporate integrations. No automatic pay, deduction, suspension or employment action is implemented. Deduction CSV import is an optional later feature.
