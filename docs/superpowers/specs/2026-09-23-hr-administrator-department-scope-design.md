# HR Administrator department scope — design

**Date:** 2026-09-23
**Status:** approved for planning

## Problem

The HR Administrator role, added in `AddHrAdministratorRole`, runs Leave & Time
across every department. There is no way to give an HR Administrator a subset of
the company. The Edit User / Create User dialog offers the role but nothing to
say *which* departments that person is responsible for, and the backend has no
scope for the role at all: roughly fourteen handlers carry an
`if (request.IsAdmin) { /* sees everything */ }` branch that the HR Administrator
passes through, and four endpoints (company attendance, presence, the Users list,
all timesheet histories) have no scope of any kind and rely on the
`[Authorize(Roles = AdministratorRoles)]` gate alone.

The request: when the HR Administrator role is selected, the System Administrator
picks one or more departments, and that HR Administrator sees and acts on **only
those departments**, everywhere HR reaches.

## Decisions taken

| Question | Decision |
|---|---|
| How far does the restriction reach? | Everything HR touches: leave, timesheets, attendance, the HR dashboard, the Users list used for filing on behalf, email digests and live notifications. |
| An HR Administrator with no departments? | Cannot be saved: at least one department is required, following the `DepartmentId` rule for an Employee. A legacy row with none sees nothing until assigned, it does not fall back to "everything". |
| Where is the set stored? | The existing `UserDepartment` join table. Its meaning widens from "an extra department a Manager covers" to "a department this Manager or HR Administrator covers beyond their own profile". No schema migration. |

## 1. Data and rules

**Storage.** `UserDepartment (UserId, DepartmentId, AssignedAt, AssignedByUserId)`
rows, one per assigned department. The entity, `DbSet`, keys and `Restrict`
foreign keys already exist (`Persistence/AppDbContext.cs:229-235`).

**Rule, mirroring the `DepartmentId` role rule.** On both admin write paths:

- **HR Administrator:** `DepartmentIds` is required and must be non-empty. Every
  id must name an existing, active department. Duplicates are collapsed.
- **Every other role:** `DepartmentIds` must be empty or absent, with a message in
  the `PersonFieldRules` style: "Only an HR Administrator is assigned departments."
  A Manager's extra departments are not editable through this feature (there is no
  UI for them and this change does not add one); the rule refuses them on the
  admin endpoints the same as for an Employee, so an admin cannot accidentally
  widen a manager through the HR field.

**What does not change for the HR Administrator.** No department, gender,
employment start date or coverage of their own; the Profile section of the dialog
stays hidden; they are still excluded from attendance and from the leave and
timesheet result sets as an *employee*. `AppRoles.Administrators`,
`AdministratorRoles` and `IsAdministrator` keep meaning "may open the
company-wide pages and is subject to the administrator rules"; what changes is
that the data behind those pages is scoped for HR.

**Row lifecycle.**

- `CreateAdminUser` writes the rows on hire, `AssignedByUserId` = the caller.
- New command `SetAdminUserDepartments` (full replace: add missing, delete
  surplus) behind `PUT /api/adminusers/{id}/departments`, System Administrator
  only, action-level attribute ANDed with the class gate like the other writes on
  `AdminUsersController`. Refused (400) when the stored role is not HR
  Administrator. Payload `{ departmentIds: int[] }`.
- `SetAdminUserRoles` (`Application/AdminUsers/Commands/SetAdminUserRoles.cs:63-80`)
  keeps the rows when the new role is Manager **or HR Administrator** and deletes
  them otherwise. Consequence: a promotion from HR to System Administrator clears
  the set, matching how the same promotion clears `DepartmentId`, gender and start
  date.
- `DbInitializer.RemoveNonManagerUserDepartments` becomes
  `RemoveUnscopedUserDepartments`: deletes rows whose user holds neither Manager
  nor HR Administrator. The demo seeder assigns
  `hradmin@annualleave.com` every department, so a seeded database saves without
  repair.
- `DeleteAdminUser` already removes the leaver's rows. `DeleteDepartment` already
  counts the rows as a blocker; its message changes from "assigned manager" to
  "person assigned to it" since the row may now be an HR Administrator's.

## 2. Backend: one resolver, no HR bypass

**Resolver.** `ManagerAccessScopeResolver.ResolveAsync`
(`Application/Core/ManagerAccessScope.cs`) unions the caller's
`UserDepartment.DepartmentId` values into `ManagedDepartmentIds`, for any caller.
For a Manager this is a no-op in practice (no write path exists for their rows
beyond the seed, which assigns their own department); for an HR Administrator it
is their whole scope. `ProjectScope.DepartmentIdsForAsync` reads the rows for an
HR Administrator too, so project visibility follows.

**Two questions a controller asks, renamed by intent.** Every handler that today
takes `IsAdmin` (meaning "unscoped") now receives:

- `IsAdmin` = `User.IsSystemAdministrator()` (new `ClaimsPrincipal` extension
  beside `IsHrAdministrator`). Unscoped. The System Administrator's own panels are
  untouched.
- `IsManager` (or the handler's equivalent scoped flag) = Manager **or** HR
  Administrator. Scoped through the resolver.

The *decision* powers stay HR's: where a controller passes
`IsAdmin = User.IsHrAdministrator()` to a command so that it may act on
somebody's behalf (create, edit, status, delete), the command now checks that the
target is inside the resolved scope instead of skipping the check. A System
Administrator is still refused there, as today.

**Handlers changed to route HR through scope** (the fourteen `ManagerAccessScopeResolver`
consumers plus the direct readers):

| Area | Handlers |
|---|---|
| Leave | `GetAnnualLeaveList`, `GetAnnualLeaveDetails`, `GetTeamAwayThisWeekCount`, `UpdateLeaveStatus`, `EditAnnualLeave`, `DeleteAnnualLeave`, `CreateAnnualLeave` (on-behalf target in scope), `GetLeaveStatusHistoryList` |
| Timesheets | `TimesheetScope.ApplyAsync`, `TimesheetAccess`, `UpdateTimesheetStatus`, `SubmitTimesheet`, `DeleteTimesheet`, `GetTimesheetStatusHistoryList` (both the per-timesheet and the all-histories path) |
| Attendance | `GetTeamAttendance`, `GetTeamAttendanceHistory` (whose non-admin branch today reads only direct reports and must take the resolver) |
| People | `GetEmployeeProfileList`, `GetTeammateList` (`ForUserId` target in scope), `ChildAccessResolver` (HR read/write within scope, like a Manager's read), `GetStoredFile` |

**Endpoints with no scope today gain a department filter**, resolved from the
caller inside the handler when the caller is an HR Administrator and left open for
a System Administrator:

- `GetCompanyAttendance` and `GetUserPresence` (the HR dashboard's attendance
  cards, "who is away", "today's issues", the activity feed).
- `GetAdminUserList` and `GetAdminUser`: an HR Administrator sees users whose
  profile department is in scope, plus themselves. The list is what the
  file-on-behalf picker reads.
- `GetTimesheetStatusHistoryList` all-histories path.

Each `Query` gains `RequestingUserId` and the two flags where it lacks them; the
controllers fill them the way the leave controller already does.

## 3. Notifications

- **SignalR.** `NotificationsHub.OnConnectedAsync`: an HR Administrator does
  **not** join `AdminGroup`; they join `DepartmentManagerGroup(deptId)` for every
  department in their resolved scope, exactly as a Manager does. The controllers
  already fan `notificationsUpdated` out to both groups, so nothing else moves.
- **Digests.** The birthday digest and the daily attendance report in
  `ReminderDispatcher` (`:276`, `:443`) are sent to a System Administrator in full
  and to each HR Administrator filtered to people in their departments; an HR
  Administrator with nothing in scope that day is not mailed. The
  `GetUsersInRolesAsync(AppRoles.Administrators)` call splits into the two roles.

## 4. Client

**Dialogs** (`client/src/components/admin/AdminUsersPanel.tsx`, both
`EditUserDialog` and `CreateUserDialog`). Under the role radios, when the live
role is HR Administrator, a "Departments" MUI `Autocomplete multiple` with chips,
fed from the existing `['departments']` query, active departments only (an
already-assigned inactive one stays selectable so the edit does not open
invalid). Helper text: "This HR Administrator will see leave, attendance and
timesheets for these departments only." Error "Select at least one department."
holds Save, mirrored in `client/src/lib/validation/person.ts` as
`hrDepartmentsError(role, ids)` next to `genderError`.

`ROLE_DESCRIPTIONS['HR Administrator']` becomes: "Leave, attendance and
timesheets for the departments assigned below, but no access to Users,
Departments, Configuration or System. Has no department or manager of their own."

**Mutation order** in `editMutation` (`:601-643`): roles → **departments** →
user → profile. Departments must follow roles because `SetAdminUserRoles` clears
the rows for a role that is not Manager or HR; the user and profile saves are unaffected by where it sits.
Create sends `departmentIds` in the create payload.

**Users table.** An HR Administrator's row, where the department cell is blank
today (`:1214-1221`, `:1296-1302`), shows the assigned departments as chips.
`AdminUserDto` gains `DepartmentIds: List<int>` so the panel does not need a
second query; the row resolves names from the departments it already has.

**Current user.** `CurrentUserPayload` gains `DepartmentIds: IList<int>` (the
resolved scope: profile department plus assigned rows), mirrored as
`departmentIds?: number[]` in `client/src/lib/types/user.ts`. No page reads it in
this change; it exists so a later change can label the HR dashboard without a
plumbing step. Server-side scoping
means the HR dashboard, Leave Management, Attendance and Timesheets pages need no
client change.

**API modules.** `setAdminUserDepartments(id, { departmentIds })` in
`client/src/lib/api/admin-users.ts`, beside `setAdminUserRoles`;
`AdminCreateUserDto` type gains `departmentIds`.

## 5. Migration, docs, tests

**Migration.** None. The table exists. The deployed database has the HR
Administrator role row and no user in it, so nobody loses access on deploy. If
one is created later with no departments they see nothing until assigned, which
is the rule chosen.

**CLAUDE.md.** Rewrite the **Reach** bullet under *The two administrators are
disjoint*: both roles may open the company-wide pages, but the System
Administrator sees every department and the HR Administrator sees the departments
assigned to them through `UserDepartment`. Add a paragraph on the row lifecycle
and the "required for HR, refused for everyone else" rule, and update the
`UserDepartment` remarks in `Domain/UserDepartment.cs`, `DbInitializer`,
`NonManagerUserDepartmentTests` and `AppRoles` that say the row means one thing.

**Tests (backend, xUnit, `Tests/WorkTrack.Tests/`).**

- `HrDepartmentScopeValidationTests`: create with HR + none refused, HR + unknown
  or inactive department refused, HR + two departments accepted; Employee,
  Manager and System Administrator with any ids refused; `SetAdminUserDepartments`
  refuses a non-HR target and replaces the set.
- `NonManagerUserDepartmentTests` extended: role change to HR keeps rows, to
  System Administrator or Employee clears them; seeder cleanup keeps HR rows.
- `ManagerScopeAuthorizationTests` extended: resolver unions `UserDepartment`.
- `HrAdministratorScopeTests` (SQLite via `TransactionalTestDb` where a
  constraint matters, `TestDb` otherwise): for each area in the table in §2, an HR
  Administrator with department A sees and may act on A's rows and is refused B's,
  and a System Administrator is unchanged. Company attendance, presence and the
  Users list filtered to A. `CreateAnnualLeave` on behalf of someone in B refused.
- `NotificationsHub` group membership and the two digests: HR in department
  groups not `AdminGroup`; digest content filtered.
- `CurrentUserPayloadTests` and `AdminUserJsonContractTests`: the new fields.
- `SystemAdministrationSurfaceTests`: the new endpoint is System Administrator
  only.

**Tests (client, Vitest).** `AdminUsersPanel.test.tsx`: picker appears only for
HR, Save held with none selected, create payload carries `departmentIds`, edit
calls in the order roles, departments, user, profile, HR row shows chips.
`person.test.ts` for `hrDepartmentsError`.

## Out of scope

- Editing a Manager's extra departments through this UI.
- Labelling the HR dashboard with the department names (the payload field is
  added; the label is not).
- Any change to what the System Administrator sees.
