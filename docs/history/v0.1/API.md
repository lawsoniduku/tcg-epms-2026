# Reference service API

All `/api` responses are JSON except the CSV report. Writes require JSON, a session cookie and `X-CSRF-Token`; cross-origin writes are rejected. The demonstrator has no external dependencies or CORS grants. Authentication is a synthetic demonstration selector, not corporate authentication. Production startup fails closed.

| Method | Path | Contract / authority |
|---|---|---|
| GET | `/api/health` | Reference-mode liveness only |
| GET | `/api/demo/users` | Fictional role choices, demo service only |
| POST | `/api/demo/login` | `{userId}` → HttpOnly/SameSite session + CSRF token; local synthetic mode only |
| GET | `/api/bootstrap` | Actor, scoped employees/appraisals, cycle, policy decisions and permitted audit events |
| POST | `/api/logout` | Revoke current session |
| POST | `/api/appraisals/{id}/finalise` | PM; `{expectedVersion,deductionPoints?,reason?,evidence?,basis?}` |
| POST | `/api/appraisals/{id}/calibrate` | Scoped PM/HOD; `{expectedVersion,score,reason,evidence}` |
| POST | `/api/appraisals/{id}/reopen` | PM; `{expectedVersion,reason,approvalReference}` |
| POST | `/api/appraisals/{id}/release` | PM; `{expectedVersion}`; locked result only |
| POST | `/api/appraisals/{id}/check-in` | Scoped manager/HOD/PM; `{expectedVersion,note}` |
| POST | `/api/appraisals/{id}/self-review` | Employee's own record; `{expectedVersion,note}` |
| GET | `/api/reports/final-scores.csv` | PM/executive/auditor; current and historical immutable revisions; audited export |

`expectedVersion` is mandatory. Successful mutations increment the appraisal version; stale writes return 409. Locking creates a distinct immutable finalisation revision. `supervisorScore`, `calibratedScore` and `finalScore` in a finalise request are rejected. Finalisation returns only the changed record ID, version and status; the client reloads the authorised projection. Error responses are `{error:string}` with 401/403/404/409/415/422/429 as applicable.

The applicable base is the approved calibrated score, otherwise the supervisor submission. Deductions default to 0.00 and are disabled. A test-only controlled policy must explicitly supply mode, authority, approval reference, applicable tracks, cap, floor and evidence requirement. There is no public API to activate that policy. No salary or employment events are emitted.

## Repository adapter

`server/store.mjs` implements the store used by `public/shared/workflow.mjs`: transactional read/write, version checks, immutable revision insertion and append-only audit. `public/api.mjs` supplies a separate browser demonstration adapter over the same workflow; it is never a production persistence option. The service never falls back to browser storage when requests fail.

The initial SQL migration creates `metadata`, `users`, `employees`, `appraisals`, `finalisations` and `audit_events`. JSON payloads are a reference-build choice, not the target enterprise analytical schema. Before production, engineering should normalise the HRIS snapshots, cycle/configuration versions, calibration approvals, policy/delegation approvals, workflow tasks, evidence ACLs and event outbox in the chosen production database. Preserve atomicity, version leases, revision immutability and the API's role/record scope when replacing the adapter.
