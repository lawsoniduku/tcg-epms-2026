# TCG PMS · engineering handover

The engineering ZIP contains the source in application/, the supplied policy and PRD in requirements/, and Chromium screenshots in evidence/screenshots/. From the extracted root, run sha256sum -c SHA256SUMS. Use fictional employees for staging.

## Start the service

Install Node 24 and Python 3. Python's standard library implements the XLSX adapter. No Python packages are required by the running application. The bundled Dockerfile includes both runtimes.

From application/ run:

```sh
npm run check
npm test
npm run build
npm run demo
```

Open http://127.0.0.1:3000. As Performance Management, open Administration → Set up a review cycle and choose the year. As a line manager, open a draft under Performance reviews → Upload scorecard KPIs. Download a workbook, edit the KPIs sheet, preview the policy totals, then confirm. Submitting the draft starts the normal approval chain.

## Configure staging

Use a fresh database and the settings in .env.example. Generate separate 32-byte secrets for EPMS_DATA_KEY and EPMS_FEEDBACK_KEY, and retain both in the approved secret manager. Provide the bootstrap email and EPMS_ADMIN_SUBJECT for gateway sign-in. Run npm run provision. Set EPMS_LOCAL_LOGIN=off when the gateway is mandatory and configure its verification key, issuer and audience. Configure HTTPS and secure cookies. See docs/API.md and docs/HANDOVER.md for integration endpoints and production startup gates.

## Upgrade and recover

Before replacing a prior standalone installation, stop writers, make a consistent backup with npm run backup using a new EPMS_BACKUP_PATH, and copy the original deployment and keys into controlled recovery storage. Rehearse the upgrade using a restored staging copy. First startup moves response versions from the general store into the feedback vault. Check restored response access and historical revision counts. Rotate the feedback data key using npm run rekey. A local feedback-key file, when used instead of a managed key, must be restored alongside the database at the matching filename. For rollback restore the matched pre-upgrade database, keys and application together. Do not start older code against the migrated database.

## Verify and approve

Read CHANGELOG.md, docs/pms/phase-upgrade.md and docs/pms/uat-evidence.md. Run test/browser/feedback.py and test/browser/visual.py using Python Playwright and Chromium as configured in .github/workflows/ci.yml. Retain the resulting screenshots and CI evidence with the release ticket.

HR and Performance should reconcile a quarterly appraisal and a sales or confirmation score by hand, validate 360 confidentiality, and record the policy decisions requiring approval. Engineering should test corporate SSO, roster import, notification leases, scanner integration and payroll export; review access logging and backups; check keyboard and screen-reader use; and load-test at the expected headcount. Record owners, results and rollback thresholds before opening a live cycle.
