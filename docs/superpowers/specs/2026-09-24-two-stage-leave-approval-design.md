# Two-stage leave approval (Manager, then HR) — design

**Date:** 2026-09-24
**Status:** approved for planning

## Problem

A leave type has one approval switch, `LeaveType.RequiresApproval`. On, a request
is filed `Pending` and **either** a Manager in the employee's department **or** an
HR Administrator covering it approves it in one step; off, it is approved the
moment it is filed. There is no way to say that a type needs HR's sign-off, nor
that it needs the manager's *and then* HR's.

The request: rename the switch to "Requires approval from Manager" and add a
second, "Requires approval from HR", on the Edit Leave Type dialog — and make both
mean what they say.

## Decisions taken

| Question | Decision |
|---|---|
| Both switches on — how do the two approvals relate? | **Two stages, Manager first, then HR.** The manager's Approve advances the request to a new state; an HR Administrator's Approve finishes it. |
| Manager-only type — may an HR Administrator still approve, as today? | **Yes.** HR stands in for the manager inside their assigned departments. "Requires approval from HR" therefore adds a *mandatory HR sign-off*, not merely permission. |
| Who decides the stage a request lands in? | **The server.** The client always asks for `Approved`; the server computes whether that means the HR stage or the final approval. No page can put a request into the wrong state. |
| Property name | `RequiresApproval` is **renamed** to `RequiresManagerApproval` (column, entity, DTOs, client type). A second flag with the old name beside it would mislead. |
| Which seeded types turn HR approval on? | **None.** Every existing type keeps today's behaviour until an admin flips the switch. |

## 1. Leave type settings

**Storage.** `LeaveType.RequiresApproval` → `RequiresManagerApproval` (rename in
place, values kept). New `LeaveType.RequiresHrApproval`, `bit not null default 0`.
One migration, `SplitLeaveApprovalIntoManagerAndHr`: `RenameColumn` then
`AddColumn`. No data rewrite is needed: a stored `true` in the old column meant
"a manager (or HR standing in) approves", which is exactly what the renamed column
means, and the new column's default is the old behaviour.

**DTOs.** `UpsertLeaveTypeRequest`, `LeaveTypeDto`, the hand-written projection
in `GetLeaveTypeList`, and the client `LeaveType` / `UpsertLeaveTypeRequest`
types all carry `requiresManagerApproval` (default `true`) and
`requiresHrApproval` (default `false`). No validator rule relates the two: every
combination is legal, including neither (auto-approve, as today).

**Dialog** (`LeaveTypesPanel`'s edit dialog). Two switches in the toggle grid
where the one is now:

- "Requires approval from Manager"
- "Requires approval from HR"

**Card.** The "Rules & approval" line reads exactly one of:

| Manager | HR | Line |
|---|---|---|
| off | off | Auto-approved (no review) |
| on | off | Requires **manager** approval |
| off | on | Requires **HR** approval |
| on | on | Requires **manager, then HR** approval |

**The Enabled/Disabled toggle** (`toggleActive`) resubmits the whole type and
must carry both flags, per the trap documented in CLAUDE.md.

## 2. Statuses and the path a request takes

**New status.** `AnnualLeaveStatus.AwaitingHrApproval = 4`, appended after
`Cancelled` so every stored value keeps its meaning. Client union gains
`'AwaitingHrApproval'`.

**Initial status on filing** (`CreateAnnualLeave`), from the type's two flags:

| Manager | HR | Filed as |
|---|---|---|
| off | off | `Approved` — the existing auto-approve branch, unchanged |
| on | off | `Pending` |
| off | on | `AwaitingHrApproval` |
| on | on | `Pending` |

**Transitions when a caller asks for `Approved`** (`UpdateLeaveStatus`, and the
status path of `EditAnnualLeave`). `IsAdmin` on both commands already means "the
caller is an HR Administrator" and the scope check already ran:

| From | Type needs HR | Caller | Result |
|---|---|---|---|
| `Pending` | no | Manager or HR | `Approved` |
| `Pending` | yes | Manager | `AwaitingHrApproval` |
| `Pending` | yes | HR | `Approved` — HR stands in for the manager and is the HR sign-off |
| `AwaitingHrApproval` | — | HR | `Approved` |
| `AwaitingHrApproval` | — | Manager | **Refused**: "This request is awaiting HR approval; only an HR Administrator can decide it." |
| `Rejected` / `Cancelled` | — | HR (reopen from the edit dialog) | as from `Pending` |

**Rejection.** From `Pending`, a Manager or HR may reject, as today. From
`AwaitingHrApproval`, only HR may reject; a Manager is refused with the same
message. The manager has already had their say at stage one.

**A caller may not ask for `AwaitingHrApproval` directly.** Both commands refuse
it: the stage is derived, never chosen.

**Where the rule lives.** `Application/AnnualLeaves/Commands/ApprovalStageRule.cs`:

- `InitialStatus(LeaveType)` — the filing table above.
- `Resolve(LeaveType?, AnnualLeaveStatus current, AnnualLeaveStatus requested, bool isHrAdministrator)`
  → `Result`-style outcome: the status to store, or an error string. A `null`
  leave type (a legacy row with no type) treats the type as manager-only, which
  is what it was.

`client/src/lib/approval-stage.ts` mirrors it so no page offers an Approve or
Reject the API is certain to refuse:

- `canDecide(leave, leaveType, { isHrAdministrator })` — true for `Pending` for
  either role; true for `AwaitingHrApproval` only for HR.
- `approveOutcome(leave, leaveType, { isHrAdministrator })` — `'approved'` or
  `'awaiting-hr'`, used for button wording ("Approve" vs "Approve & send to HR").
- `isDecidable(status)` — `Pending` or `AwaitingHrApproval`, for the queues.

Keep the two in step, the same way `AttachmentPolicyRule` and
`attachment-policy.ts` are kept in step. A mirror may under-refuse (a type not
yet loaded reads as manager-only); it must never over-refuse.

## 3. What each stage does and does not do

- **Balance, per-child ledger, coverage announcement, `ApprovedAt` /
  `ApprovedById`**: only on the transition into `Approved`, exactly where they
  run today. Both balance calculators already filter on `Approved`, so an
  `AwaitingHrApproval` row charges nothing.
- **Attachment policy** (`AttachmentPolicyRule`): runs on both transitions out of
  `Pending`, so a manager cannot pass an undocumented request to HR. The client's
  `isAwaitingDocument` already disables Approve on a `Pending` row; it applies to
  an `AwaitingHrApproval` row too.
- **`AwaitingHrApproval` counts as "still open" everywhere `Pending` does**:
  the date-overlap checks in both leave validators, the employee's own Cancel
  (`DeleteAnnualLeave`), the pending-approvals reminder
  (`ReminderDispatcher.PendingApprovalsAsync`, counted for the department's
  managers as today), the Topbar badge, and status history.
- **But it is locked for editing like `Approved` is.** `EditAnnualLeave` refuses
  a non-admin edit of an Approved or Rejected row today; `AwaitingHrApproval`
  joins that list, with the message "This request has been approved by your
  manager and is awaiting HR; cancel it and file again to change it." A manager
  has approved specific dates, and an edit that quietly kept the stage would put
  different dates in front of HR under the manager's name. An HR Administrator in
  scope (`actsAsAdmin`) may still edit it, as they may an Approved row. The client
  mirrors the lock: My Leave and `AnnualLeaveCard` offer Cancel but not Edit on
  such a row.
- **`ManagerScope` / `HrAdministrator` scope checks are untouched.** The HR
  stage is decided by an HR Administrator *within their assigned departments*, or
  any HR Administrator for a department-less request, through the existing
  `isInManagedDepartment || isDirectReport || isUnscopedAdminLeave` test.

Known consequence, accepted: a department with no HR Administrator assigned
leaves an HR-stage request stuck, the same way a department with no manager
leaves a `Pending` one stuck today. The System Administrator assigns one.

## 4. Notifications

**Manager advances a request to the HR stage** (`UpdateLeaveStatus` and the edit
path):

- **HR Administrators** covering the leave's department — resolved as every
  active user in the HR Administrator role with a `UserDepartment` row for that
  department; for a department-less leave, every active HR Administrator — get
  "Leave request awaiting your approval" with the employee, type, dates and the
  manager who approved. New helper `HrApprovalRecipients.ResolveAsync` beside
  `ManagerNotificationRecipients`. The `Reason` is included, as it is in the
  manager's new-request email: the apply form promises the reason reaches the
  people deciding the request and nobody else, and at this stage that is the
  HR Administrator. Coverage is still not announced — see section 3.
- **The employee** gets the existing status email with the sentence adapted:
  "…has been approved by {manager} and is awaiting HR approval." Subject: "Your
  leave request is awaiting HR approval".

**Final approval and rejection** emails are unchanged. **SignalR**: no hub
change. The controller already fans `notificationsUpdated` to the department
manager group (which HR Administrators covering the department join) and to
`HrAdministratorGroup` for a department-less leave.

## 5. Changing the switches on a type with live requests

`UpdateLeaveType`'s existing sweep (turning approval off auto-approves every
`Pending` row, balance-checked, `Conflict` on a shortfall) generalises to the
new pair. Let `before` and `after` be the (Manager, HR) flags:

| Change | Rows swept | Become |
|---|---|---|
| `after` = (off, off) | `Pending` and `AwaitingHrApproval` | `Approved` (balance checked, coverage announced, history "Automatically approved based on leave type settings.") |
| HR on → off, Manager stays on | `AwaitingHrApproval` | `Approved` — the manager stage is done |
| Manager on → off, HR stays on | `Pending` | `AwaitingHrApproval` — there is no manager stage any more |
| HR off → on | none | a `Pending` row will be advanced by the manager; `AwaitingHrApproval` cannot exist yet |
| Manager off → on, HR stays on | none | an `AwaitingHrApproval` row keeps its place; it is not sent back to the manager |

Sweeps only run for an **active** type, as today.

## 6. Client surfaces

- **Status chip**: `AwaitingHrApproval` renders "Awaiting HR approval" in the
  `info` (blue) palette on `AnnualLeaveCard`, My Leave, Team Leave, All Leave and
  the dashboards, distinct from `Pending`'s amber.
- **My Leave**: the row's status label reads "Approved by manager · awaiting
  HR"; the Pending tab and the "awaiting approval" count include it; Cancel
  stays available, Edit does not (section 3).
- **Team Leave and All Leave**: rows in either open state are listed in the
  pending section. Approve/Reject appear when `canDecide` says so; a manager's
  Awaiting-HR row shows a "With HR" chip and no buttons. The bulk approve on All
  Leave skips rows the caller cannot decide, the way it already skips rows
  awaiting a document. The Approve button reads "Approve & send to HR" when
  `approveOutcome` is `'awaiting-hr'`.
- **Dashboards**: `buildApprovalQueue` takes both open states. The HR dashboard's
  queue shows Approve on all of them; the manager's queue shows the Awaiting-HR
  rows as "With HR" with no buttons.
- **Topbar** badge counts both open states.
- **`AnnualLeaveForm`** (edit dialog): the "this type auto-approves" hint reads
  `requiresManagerApproval === false && requiresHrApproval === false`.
- **`LeaveTypesPanel`**: as in section 1.

## 7. Migration, seed, tests, docs

- **Migration** `SplitLeaveApprovalIntoManagerAndHr` as in section 1.
- **Seeder** (`DbInitializer`): rename the property on every seeded type;
  `RequiresHrApproval` left `false` everywhere.
- **Backend tests** (`ApprovalStageTests`, in-memory `TestDb`):
  - `ApprovalStageRule.InitialStatus` table (4 cases) and `Resolve` table (the
    six rows in section 2 plus the direct-`AwaitingHrApproval` refusal).
  - `CreateAnnualLeave` files an HR-only type as `AwaitingHrApproval` and charges
    no balance.
  - `UpdateLeaveStatus`: manager on a both-flags type lands `AwaitingHrApproval`,
    HR recipients are emailed, balance unchanged; HR from `Pending` lands
    `Approved`; manager from `AwaitingHrApproval` refused; HR from
    `AwaitingHrApproval` lands `Approved`, balance synced, coverage announced.
  - `EditAnnualLeave` status path follows the same table.
  - `UpdateLeaveType` sweep: the three transforming rows of section 5's table.
  - `GetLeaveTypeList` projects both flags (round trip, in the style of
    `MinServiceMonthsPlumbingTests`).
- **Client tests**: `LeaveTypesPanel` shows the two switches with the new labels
  and `toggleActive` sends both flags; `approval-stage.test.ts` mirrors the
  server table; `TeamLeavePage` hides Approve on an Awaiting-HR row for a
  manager and shows it for an HR Administrator; `HrDashboard` queue includes
  the Awaiting-HR row.
- **Docs**: a CLAUDE.md subsection under Domain Model Summary, "Approval can
  take two stages", stating the tables above, the HR-stands-in rule, the
  server-decides-the-stage rule, and the mirror to keep in step.

## Out of scope

- Any change to timesheet approval.
- A per-department HR approver distinct from the assigned HR Administrators.
- Re-announcing coverage or re-checking notice at the HR stage.
