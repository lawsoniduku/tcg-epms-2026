# The Concept Group performance management system

This release candidate runs quarterly scorecards, commercial monthly reviews, probation confirmation and the decisions that follow. The employee, manager, HOD, PM, ER, Finance, executive and talent workspaces share a server-side workflow engine.

## Run the acceptance application

Install Python 3 for Excel workbook import/export and Node.js 24 and run the following from the project root.

```sh
npm run demo
```

Open http://127.0.0.1:3000 and select **Line manager**. Open **Quarterly appraisals → Ada Okeke · 2026 Q4** to author a fresh scorecard. The four earlier closed quarters use fictional records for talent and merit testing. Switch roles to carry out each approval. The standalone service has no third-party runtime dependencies.

## Install for engineering acceptance

An empty installation supports individual accounts, encrypted SQLite records, corporate sign-in assertions, roster import, notifications and payroll reconciliation. Start with [the engineering handover](docs/HANDOVER.md) and [installation runbook](docs/pms/runbook.md).

| Resource | Use |
|---|---|
| [Delivery and acceptance plan](docs/pms/DELIVERY_PLAN.md) | Business owners, delivery order and acceptance exercises |
| [Requirements mapping](docs/pms/policy-mapping.md) | Workflow coverage and remaining acceptance work |
| [Configuration decisions](docs/pms/decisions.md) | TCG decisions required for live use |
| [Architecture](docs/pms/architecture.md) | Runtime, transaction and persistence contracts |
| [Integration API](docs/API.md) | Identity, HRIS, notifications, reporting and payroll |
| [Verification evidence](docs/pms/uat-evidence.md) | Automated and browser verification with limits |
| [Migration](docs/pms/migration-reconciliation.md) | Historical data, reconciliation and cutover |
| [Privacy review](docs/pms/privacy-threat-model.md) | Access boundaries, sensitive records and deployment controls |

```sh
npm run check
npm test
npm run build
```

The portable application is written to `build/tcg-epms/`.  The standalone service is the engineering deployment target.
