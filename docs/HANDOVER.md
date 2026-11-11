# Engineering handover

Current engineering baseline: PRD v4.2 (11 November 2026). See [formal review acceptance](pms/release-4.2.md).

**Deliverable:** TCG PMS 1.0 release candidate. Run the application against a persistent local volume with Node 24. The standalone application can start from an empty database with independently authenticated users. The private acceptance site uses fictional records and supports switching workflow roles.

## Handover sequence

1. Run `npm test` and `npm run demo`. Verify a quarterly review from goal setting to closure using the [acceptance exercises](pms/uat-evidence.md).
2. Provision the initial administrator on a clean staging database. Create the manager, HR, HOD, employee and approver accounts. Import staff by stable staff ID and link each employee account to a roster record. See the [runbook](pms/runbook.md).
3. Configure the actual identity gateway, HRIS feed, notification consumer, payroll acknowledgement process, TLS, secrets, monitoring and backup destination. [Interface contracts](API.md).
4. Obtain signed policy choices and delegated authorities from the business owners. Publish a policy version, reconcile the migration and rehearse the actual cycle timetable.
5. Run HR, ER, Finance, Security and executive acceptance on representative data. Record rollout approvals. Start the production service with the approved environment name.

## Review boundaries

The quarterly journey, including score entry, calibration and finalisation, has both automated coverage and a multi-role desktop browser walkthrough. The other paths have differing levels of automated and manual verification. See the evidence table before scheduling a cutover.

SQLite is the supplied single-instance database. Keep it on a durable local filesystem. A clustered installation or a mandatory corporate database requires a replacement repository adapter and concurrency testing. Review retention, access scopes, privileged MFA, independent penetration testing, capacity and recovery objectives in TCG's environment. The optional hosted acceptance workspace has separate per-viewer storage and a smaller deployment envelope.

The standalone service accepts evidence references and encrypted PDF, image or text attachments. Attachments stay quarantined until the corporate malware scanner attests to the file digest. The hosted acceptance site uses evidence references. Approval references record a human's authorisation in the audit trail. TCG must verify its own signed source documents and delegated powers.

The source repository contains application code and fictional fixtures. Original internal documents and employee datasets are held separately.
