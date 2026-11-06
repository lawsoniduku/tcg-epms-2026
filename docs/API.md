# Integration contracts

The standalone service accepts JSON at `/api/platform`. All application writes require the authenticated session cookie, a matching CSRF token and a permitted role and record scope. Unknown fields in workflow commands are rejected. Responses return the record ID, type, status and new version. Errors include an actionable message. Stale records return HTTP 409.

| Operation | Route | Contract |
|---|---|---|
| Health and environment | GET /api/health, GET /api/platform/info | Liveness and sign-in mode |
| Local sign-in | POST /api/platform/login | Email and password in live mode. Role selection is restricted to the fictional acceptance database |
| Corporate sign-in | POST /api/platform/sso | RS256 assertion from the identity gateway. Match configured issuer, audience, public key and a pre-provisioned subject. Short expiry and unique jti prevent replay |
| Workspace and forms | GET /api/platform/view?id=... | Role-filtered records, available operations, field specifications, notifications, reports and CSRF token |
| Transition | POST /api/platform/command | Supply requestId, type, id, version, action, values. Omit id for a create. Replaying the same command returns the prior response |
| Users | GET or POST /api/platform/accounts | Live administrator creates and deactivates users. Link a staff record by employeeId. Supply password or trusted SSO subject |
| Session | POST /api/platform/password, POST /api/platform/logout | Change password and invalidate sessions, or revoke the current session |
| Roster inbound | POST /api/integration/roster | Scoped bearer secret. JSON contains requestId and CSV. Atomic batch processing rejects unknown managers, duplicate staff IDs and invalid fields |
| Notification delivery | GET /api/integration/outbox | Notification-consumer bearer secret. Up to 100 pending messages with stable IDs, recipients, message and due date |
| Delivery receipt | POST /api/integration/outbox/ack | Supply id and delivered boolean. Deduplicate by message ID at the receiving provider. Undelivered messages remain available |
| Report export | GET /api/platform/export?report=completion or scores | Scoped CSV. The score register preserves all revisions and marks the current version |
| Payroll instructions | GET /api/platform/export?report=payroll&id=... | Finance-only download of the approved batch. Includes employee ID, annual NGN amount, effective date, decision authority and export ID |

The SSO integration is an assertion bridge. TCG's gateway handles IdP discovery, browser redirects, authentication, MFA and token exchange. It must deliver the assertion through the documented POST flow, establish the returned cookie on the PMS origin and redirect the browser into the application. The PMS never accepts a caller-supplied role from this endpoint.

The roster import header is `staffId,name,email,company,department,jobTitle,managerId,confirmed,commercial,peopleManager,joinedAt`. Flags use Yes/No; dates use ISO calendar format. managerId is the PMS account ID. Upsert by staff ID and explicitly reconcile deactivation. Historical cycle membership retains its own employee/manager snapshot.

Commercial owners may preview and apply a monthly signed extract in the Commercial reviews workspace. Finance independently validates the frozen inputs. A separate CSV fallback in CSV deductions previews matched appraisals and errors and locks accepted rows through the same finalisation calculation. Payroll executes approved instructions outside the PMS and Finance records the reconciled acknowledgement in the merit window.

## Additional identity and evidence interfaces

Administrators may grant additional roles at provisioning. Supported role codes are admin, pm, employee, manager, hod, executive, finance, sales, er, talent and auditor. POST /api/platform/role selects a granted role, rotates the session and retains the same actor ID for independent approvals.

POST /api/platform/files receives entity, name, base64 and visibility. PDF, PNG, JPEG and text files up to 2 MiB enter encrypted quarantine. GET /api/platform/files?entity=ID returns visible metadata. The scanner uses its own EPMS_SCAN_TOKEN to GET /api/integration/scanner/queue and POST /api/integration/scanner/receipt with id, sha256, result and reference. A Clean receipt enables a scoped attachment download at GET /api/platform/files?download=ID. Rejected or unscanned files remain unavailable. Configure and test the actual scanner before relying on attachments. The hosted fictional workspace uses document references.

Commercial import rows use staff_id, month, actual, quality, execution, breach and source. The source owner names a unique signed extract and supplies an attestation reference, reviews rejected rows, then freezes accepted rows. Finance independently validates them. The recipient verifies source signatures according to TCG's published commercial controls.
