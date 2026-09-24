# Two-stage leave approval (Manager, then HR) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the leave type's one "Requires approval" switch into "Requires approval from Manager" and "Requires approval from HR", and make a request on a type with both go through the manager first and an HR Administrator second.

**Architecture:** `LeaveType.RequiresApproval` is renamed `RequiresManagerApproval` and `RequiresHrApproval` is added. A new status `AnnualLeaveStatus.AwaitingHrApproval` holds a request between the two stages. One server rule, `ApprovalStageRule`, decides the status a request is filed in and the status an "Approve" lands it in, given the type's flags and whether the caller is an HR Administrator; `CreateAnnualLeave`, `UpdateLeaveStatus` and `EditAnnualLeave` call it. `client/src/lib/approval-stage.ts` mirrors it so pages only offer buttons the API will honour.

**Tech Stack:** ASP.NET Core 10, EF Core 9 (SQL Server; in-memory provider in tests), MediatR, xUnit; React 19 + TypeScript, MUI 7, React Query, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-24-two-stage-leave-approval-design.md`

## Global Constraints

- Branch: `feat/two-stage-leave-approval` (already created off `main`).
- The client **always** requests `Approved`; the server derives the stage. A client-supplied `AwaitingHrApproval` is refused.
- An HR Administrator stands in for the manager: from `Pending` their Approve finishes the request even when the type requires HR.
- Balance, per-child ledger, coverage announcement and `ApprovedAt`/`ApprovedById` move **only** on the transition into `Approved`.
- `AwaitingHrApproval` is *open* (like `Pending`) for overlap checks, Cancel, reminders, queues and badges, but *locked for editing* (like `Approved`) for anyone but an HR Administrator in scope.
- No seeded type turns `RequiresHrApproval` on.
- The card's Enabled/Disabled toggle (`toggleActive`) must send both flags — the whole-type-resubmit trap from CLAUDE.md.
- Backend tests: run from the solution root. If the API is running, use `dotnet test Tests/WorkTrack.Tests --artifacts-path C:\Users\user\AppData\Local\Temp\claude\c--Practice-Own-2026-WorkTrack\2ed59a1a-69c0-434d-a962-a97668e33d0b\scratchpad\artifacts`; if the test host crashes at start, prefix `DOTNET_EnableWriteXorExecute=0`. Filter with `--filter "FullyQualifiedName~<ClassName>"`.
- Client tests: run from `client/` with `node_modules/.bin/vitest run <path>` (never bare `npx vitest`). Run one directory or file at a time, never the whole suite in one go.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **A legacy row whose `LeaveTypeId` is null** (a leave type deleted since) — `ApprovalStageRule.Resolve` receives a null type and must treat it as manager-only, so a manager's Approve still lands `Approved`. Pinned in Task 2.
2. **An HR Administrator approving from `Pending` on a type that requires HR** — must land `Approved` in one click, charge the balance and announce coverage; a test that only checks the manager path would miss a double-click regression. Pinned in Task 5.
3. **A manager pressing Approve on a row already at `AwaitingHrApproval`** (a stale page) — refused with the awaiting-HR message and the row untouched. Pinned in Task 5.
4. **The type's flags changing while a request sits at `AwaitingHrApproval`** — turning HR off must approve it (balance checked); turning HR *on* while Manager turns off must not push a `Pending` row back to the manager. Pinned in Task 8.
5. **The card's Enabled toggle on a type with `requiresHrApproval: true`** — must send `true` back, or disabling and re-enabling a type silently drops the HR stage. Pinned in Task 10.

---

### Task 1: Rename the flag, add the second one, migrate

**Files:**
- Modify: `Domain/LeaveType.cs:29`
- Modify: `Application/LeaveTypes/DTOs/UpsertLeaveTypeRequest.cs:12`
- Modify: `Application/LeaveTypes/DTOs/LeaveTypeDto.cs:9`
- Modify: `Application/LeaveTypes/Queries/GetLeaveTypeList.cs:25`
- Modify: `Application/LeaveTypes/Commands/UpdateLeaveType.cs:28,87`
- Modify: `Application/AnnualLeaves/Commands/CreateAnnualLeave.cs:128,177,187` (rename only here; behaviour changes in Task 4)
- Modify: `Persistence/DbInitializer.cs` (every `RequiresApproval = true`)
- Modify: every `Tests/WorkTrack.Tests/*.cs` that sets `RequiresApproval`
- Modify: `client/src/lib/types/leave-type.ts`, `client/src/lib/api/leave-types.ts`, `client/src/components/admin/LeaveTypesPanel.tsx`, `client/src/components/annual-leave/AnnualLeaveForm.tsx`, and every client test fixture that spells `requiresApproval`
- Create: `Persistence/Migrations/<timestamp>_SplitLeaveApprovalIntoManagerAndHr.cs` (+ Designer, snapshot update — generated)
- Test: `Tests/WorkTrack.Tests/ApprovalFlagsPlumbingTests.cs`

**Interfaces:**
- Produces: `LeaveType.RequiresManagerApproval : bool`, `LeaveType.RequiresHrApproval : bool` (default `false`); same two names on `UpsertLeaveTypeRequest` (defaults `true` / `false`) and `LeaveTypeDto`; client `LeaveType.requiresManagerApproval`, `LeaveType.requiresHrApproval?: boolean` and `UpsertLeaveTypeRequest.requiresManagerApproval`, `requiresHrApproval`.

- [ ] **Step 1: Write the failing round-trip test**

Create `Tests/WorkTrack.Tests/ApprovalFlagsPlumbingTests.cs`:

```csharp
using Application.LeaveTypes.Queries;
using Domain;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// GetLeaveTypeList projects its columns by hand, so a flag left out of it saves
/// with a 200 and reads back at its default — and the card's Enabled toggle, a
/// full replace, would then write that default back. Both approval flags have to
/// make the round trip.
/// </summary>
public class ApprovalFlagsPlumbingTests
{
    [Fact]
    public async Task Both_approval_flags_survive_the_list_projection()
    {
        using var db = TestDb.Create();
        db.LeaveTypes.Add(new LeaveType
        {
            Id = 1, Name = "Sabbatical", IsActive = true,
            RequiresManagerApproval = false, RequiresHrApproval = true,
        });
        await db.SaveChangesAsync();

        var list = await new GetLeaveTypeList.Handler(db).Handle(new GetLeaveTypeList.Query(), CancellationToken.None);

        var dto = Assert.Single(list);
        Assert.False(dto.RequiresManagerApproval);
        Assert.True(dto.RequiresHrApproval);
    }
}
```

- [ ] **Step 2: Run it to verify it fails to compile**

Run: `dotnet test Tests/WorkTrack.Tests --filter "FullyQualifiedName~ApprovalFlagsPlumbingTests"`
Expected: build error `'LeaveType' does not contain a definition for 'RequiresManagerApproval'`.

- [ ] **Step 3: Rename the property everywhere on the server**

From the solution root in Git Bash (the migrations folder is excluded on purpose — history stays as it was):

```bash
grep -rl "RequiresApproval" --include=*.cs Domain Application Persistence API Tests \
  | grep -v "/Migrations/" \
  | xargs sed -i 's/RequiresApproval/RequiresManagerApproval/g'
```

Then in `Domain/LeaveType.cs` replace the renamed line with both properties and a comment:

```csharp
    /* Two switches, two stages. Manager on: a request is filed Pending and a Manager
       in the department — or an HR Administrator covering it, who stands in for the
       manager — approves it. HR on: an HR Administrator must sign it off; with
       Manager also on that is a second stage (AnnualLeaveStatus.AwaitingHrApproval)
       after the manager's, with Manager off the request is filed straight into it.
       Neither: approved on filing. ApprovalStageRule is the one place this is
       decided. RequiresHrApproval defaults to false, so every type predating it
       keeps the single-stage behaviour the old RequiresApproval column meant. */
    public bool RequiresManagerApproval { get; set; }
    public bool RequiresHrApproval { get; set; }
```

In `Application/LeaveTypes/DTOs/UpsertLeaveTypeRequest.cs` after the renamed line add:

```csharp
    public bool RequiresHrApproval { get; set; } = false;
```

In `Application/LeaveTypes/DTOs/LeaveTypeDto.cs` after the renamed line add:

```csharp
    public bool RequiresHrApproval { get; set; }
```

In `Application/LeaveTypes/Queries/GetLeaveTypeList.cs` after `RequiresManagerApproval = lt.RequiresManagerApproval,` add:

```csharp
                    RequiresHrApproval = lt.RequiresHrApproval,
```

- [ ] **Step 4: Run the test to verify it passes, and the whole backend suite still compiles**

Run: `dotnet test Tests/WorkTrack.Tests --filter "FullyQualifiedName~ApprovalFlagsPlumbingTests"`
Expected: PASS (1 test). Then `dotnet build` — Expected: 0 errors.

- [ ] **Step 5: Add the migration and fix the scaffolded rename**

Run from the solution root (this reads `launchSettings.json` and targets the local `jpeople_dev` database; it does not apply anything):

```bash
dotnet ef migrations add SplitLeaveApprovalIntoManagerAndHr --project Persistence --startup-project API
```

Open the generated `Persistence/Migrations/<timestamp>_SplitLeaveApprovalIntoManagerAndHr.cs`. EF scaffolds a property rename as a drop plus an add, which would wipe every stored value. Replace the body of `Up` so it reads exactly:

```csharp
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // A rename, not a drop-and-add: the old column's true meant "a manager
            // (or HR standing in) approves", which is exactly what the new name
            // means, so every stored value carries over.
            migrationBuilder.RenameColumn(
                name: "RequiresApproval",
                table: "LeaveTypes",
                newName: "RequiresManagerApproval");

            // Off everywhere: nothing changes in behaviour until an admin flips it.
            migrationBuilder.AddColumn<bool>(
                name: "RequiresHrApproval",
                table: "LeaveTypes",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }
```

and `Down`:

```csharp
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RequiresHrApproval",
                table: "LeaveTypes");

            migrationBuilder.RenameColumn(
                name: "RequiresManagerApproval",
                table: "LeaveTypes",
                newName: "RequiresApproval");
        }
```

Add a `/// <summary>` on the class: "Splits the one approval switch into Manager and HR. The rename keeps every stored value; the new column defaults to off. See ApprovalStageRule." Confirm the table name is `LeaveTypes` by checking `AppDbContextModelSnapshot.cs` for `b.ToTable("LeaveTypes")`.

- [ ] **Step 6: Rename on the client and add the new field**

From `client/`:

```bash
grep -rl "requiresApproval" src | xargs sed -i 's/requiresApproval/requiresManagerApproval/g'
```

In `client/src/lib/types/leave-type.ts` replace `requiresManagerApproval: boolean` with:

```ts
    /**
     * The two approval stages. Manager on: filed Pending, approved by a Manager
     * in the department or an HR Administrator covering it. HR on: an HR
     * Administrator must sign it off — a second stage after the manager's when
     * both are on, the only stage when Manager is off. Neither: approved on
     * filing. Mirrored from `ApprovalStageRule` by `lib/approval-stage.ts`.
     * `requiresHrApproval` is optional because an API predating the column
     * sends none, which reads as off.
     */
    requiresManagerApproval: boolean
    requiresHrApproval?: boolean
```

In `client/src/lib/api/leave-types.ts` after `requiresManagerApproval: boolean` add `requiresHrApproval: boolean`.

In `client/src/components/admin/LeaveTypesPanel.tsx`:
- `toggleActive`: after `requiresManagerApproval: t.requiresManagerApproval,` add `requiresHrApproval: !!t.requiresHrApproval,`.
- The dialog's state: after the `requiresManagerApproval` `useState` line add `const [requiresHrApproval, setRequiresHrApproval] = useState(!!i?.requiresHrApproval)`.
- The dialog's `submit`: after `requiresManagerApproval,` add `requiresHrApproval,`.
- Leave the switch labels and the card line for Task 10.

- [ ] **Step 7: Type-check and lint the client**

Run from `client/`: `npx tsc -b && npm run lint`
Expected: no errors. (The `UpsertLeaveTypeRequest` now requires `requiresHrApproval`, so the compiler tells you every payload you missed.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Split LeaveType.RequiresApproval into Manager and HR flags

Renames the column in place (values kept) and adds RequiresHrApproval,
default off, so nothing changes in behaviour yet. Both flags make the
GetLeaveTypeList round trip; the card's Enabled toggle sends both.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The new status and `ApprovalStageRule`

**Files:**
- Modify: `Domain/AnnualLeave.cs:8-14`
- Create: `Application/AnnualLeaves/Commands/ApprovalStageRule.cs`
- Test: `Tests/WorkTrack.Tests/ApprovalStageRuleTests.cs`

**Interfaces:**
- Produces:
  - `AnnualLeaveStatus.AwaitingHrApproval = 4`
  - `static AnnualLeaveStatus ApprovalStageRule.InitialStatus(LeaveType leaveType)`
  - `static bool ApprovalStageRule.IsOpen(AnnualLeaveStatus status)` — `Pending` or `AwaitingHrApproval`
  - `readonly record struct ApprovalStageRule.Outcome(AnnualLeaveStatus? Status, string? Error)`
  - `static Outcome ApprovalStageRule.Resolve(LeaveType? leaveType, AnnualLeaveStatus current, AnnualLeaveStatus requested, bool isHrAdministrator)`
  - `const string ApprovalStageRule.AwaitingHrMessage`, `ApprovalStageRule.StageIsDerivedMessage`

- [ ] **Step 1: Write the failing table tests**

Create `Tests/WorkTrack.Tests/ApprovalStageRuleTests.cs`:

```csharp
using Application.AnnualLeaves.Commands;
using Domain;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// The one place the two approval switches are turned into a status. Every path
/// that files or decides a leave calls this, so the tables here are the
/// behaviour; the handler tests only check the plumbing around them.
/// </summary>
public class ApprovalStageRuleTests
{
    private static LeaveType Type(bool manager, bool hr) =>
        new() { Id = 1, Name = "T", RequiresManagerApproval = manager, RequiresHrApproval = hr };

    [Theory]
    [InlineData(false, false, AnnualLeaveStatus.Approved)]
    [InlineData(true, false, AnnualLeaveStatus.Pending)]
    [InlineData(false, true, AnnualLeaveStatus.AwaitingHrApproval)]
    [InlineData(true, true, AnnualLeaveStatus.Pending)]
    public void A_request_is_filed_in_the_stage_the_flags_say(bool manager, bool hr, AnnualLeaveStatus expected) =>
        Assert.Equal(expected, ApprovalStageRule.InitialStatus(Type(manager, hr)));

    [Fact]
    public void Pending_and_awaiting_hr_are_the_open_states()
    {
        Assert.True(ApprovalStageRule.IsOpen(AnnualLeaveStatus.Pending));
        Assert.True(ApprovalStageRule.IsOpen(AnnualLeaveStatus.AwaitingHrApproval));
        Assert.False(ApprovalStageRule.IsOpen(AnnualLeaveStatus.Approved));
        Assert.False(ApprovalStageRule.IsOpen(AnnualLeaveStatus.Rejected));
        Assert.False(ApprovalStageRule.IsOpen(AnnualLeaveStatus.Cancelled));
    }

    [Theory]
    // From Pending on a manager-only type: either role approves outright.
    [InlineData(false, AnnualLeaveStatus.Pending, false, AnnualLeaveStatus.Approved)]
    [InlineData(false, AnnualLeaveStatus.Pending, true, AnnualLeaveStatus.Approved)]
    // From Pending on a type needing HR: a manager advances it, HR finishes it.
    [InlineData(true, AnnualLeaveStatus.Pending, false, AnnualLeaveStatus.AwaitingHrApproval)]
    [InlineData(true, AnnualLeaveStatus.Pending, true, AnnualLeaveStatus.Approved)]
    // From the HR stage, HR finishes it.
    [InlineData(true, AnnualLeaveStatus.AwaitingHrApproval, true, AnnualLeaveStatus.Approved)]
    // Reopening a rejected request from the edit dialog follows the Pending row.
    [InlineData(true, AnnualLeaveStatus.Rejected, true, AnnualLeaveStatus.Approved)]
    [InlineData(true, AnnualLeaveStatus.Rejected, false, AnnualLeaveStatus.AwaitingHrApproval)]
    public void Approve_lands_where_the_stage_table_says(bool needsHr, AnnualLeaveStatus current, bool isHr, AnnualLeaveStatus expected)
    {
        var outcome = ApprovalStageRule.Resolve(Type(true, needsHr), current, AnnualLeaveStatus.Approved, isHr);

        Assert.Null(outcome.Error);
        Assert.Equal(expected, outcome.Status);
    }

    [Theory]
    [InlineData(AnnualLeaveStatus.Approved)]
    [InlineData(AnnualLeaveStatus.Rejected)]
    [InlineData(AnnualLeaveStatus.Cancelled)]
    public void A_manager_cannot_decide_a_request_that_is_with_hr(AnnualLeaveStatus requested)
    {
        var outcome = ApprovalStageRule.Resolve(Type(true, true), AnnualLeaveStatus.AwaitingHrApproval, requested, isHrAdministrator: false);

        Assert.Null(outcome.Status);
        Assert.Equal(ApprovalStageRule.AwaitingHrMessage, outcome.Error);
    }

    [Fact]
    public void Hr_may_reject_a_request_that_is_with_them()
    {
        var outcome = ApprovalStageRule.Resolve(Type(true, true), AnnualLeaveStatus.AwaitingHrApproval, AnnualLeaveStatus.Rejected, isHrAdministrator: true);

        Assert.Equal(AnnualLeaveStatus.Rejected, outcome.Status);
    }

    [Fact]
    public void Rejecting_from_pending_is_open_to_both_roles()
    {
        Assert.Equal(AnnualLeaveStatus.Rejected, ApprovalStageRule.Resolve(Type(true, true), AnnualLeaveStatus.Pending, AnnualLeaveStatus.Rejected, false).Status);
        Assert.Equal(AnnualLeaveStatus.Rejected, ApprovalStageRule.Resolve(Type(true, true), AnnualLeaveStatus.Pending, AnnualLeaveStatus.Rejected, true).Status);
    }

    [Fact]
    public void The_hr_stage_cannot_be_asked_for_directly()
    {
        var outcome = ApprovalStageRule.Resolve(Type(true, true), AnnualLeaveStatus.Pending, AnnualLeaveStatus.AwaitingHrApproval, isHrAdministrator: true);

        Assert.Null(outcome.Status);
        Assert.Equal(ApprovalStageRule.StageIsDerivedMessage, outcome.Error);
    }

    /// <summary>
    /// A row whose leave type has since been deleted carries no flags. It was
    /// filed under the one-switch rule, so it is treated as manager-only rather
    /// than refused or sent to HR.
    /// </summary>
    [Fact]
    public void A_missing_leave_type_reads_as_manager_only()
    {
        var outcome = ApprovalStageRule.Resolve(null, AnnualLeaveStatus.Pending, AnnualLeaveStatus.Approved, isHrAdministrator: false);

        Assert.Equal(AnnualLeaveStatus.Approved, outcome.Status);
    }
}
```

- [ ] **Step 2: Run to verify it fails to compile**

Run: `dotnet test Tests/WorkTrack.Tests --filter "FullyQualifiedName~ApprovalStageRuleTests"`
Expected: build errors on `AwaitingHrApproval` and `ApprovalStageRule`.

- [ ] **Step 3: Add the status and the rule**

In `Domain/AnnualLeave.cs` change the enum to:

```csharp
public enum AnnualLeaveStatus
{
    Pending,
    Approved,
    Rejected,
    Cancelled,
    /// <summary>
    /// Past the manager's approval, waiting on an HR Administrator's — the second
    /// stage a type with both approval switches asks for, and the only stage for
    /// a type that asks for HR alone. Appended so every stored value keeps its
    /// meaning. Open like Pending (overlaps, Cancel, queues), locked for editing
    /// like Approved. See ApprovalStageRule.
    /// </summary>
    AwaitingHrApproval = 4,
}
```

Create `Application/AnnualLeaves/Commands/ApprovalStageRule.cs`:

```csharp
using Domain;

namespace Application.AnnualLeaves.Commands;

/// <summary>
/// Turns a leave type's two approval switches into the status a request is filed
/// in and the status an "Approve" lands it in. The client always asks for
/// <see cref="AnnualLeaveStatus.Approved"/>; this decides whether that means the
/// HR stage or the end. <c>client/src/lib/approval-stage.ts</c> mirrors it so no
/// page offers a button the API is certain to refuse — keep the two in step, the
/// way <see cref="AttachmentPolicyRule"/> and <c>attachment-policy.ts</c> are.
///
/// <para>
/// Manager first, then HR. An HR Administrator stands in for the manager inside
/// their assigned departments, so their Approve from Pending finishes the request
/// in one step even when the type requires HR: they are the HR sign-off. A Manager
/// cannot decide a request that is with HR — approve, reject or cancel — because
/// they already had their say at stage one.
/// </para>
///
/// A <c>null</c> leave type (a row whose type has since been deleted) is treated as
/// manager-only, which is the one-switch rule it was filed under.
/// </summary>
public static class ApprovalStageRule
{
    public const string AwaitingHrMessage =
        "This request is awaiting HR approval; only an HR Administrator can decide it.";

    public const string StageIsDerivedMessage =
        "A request cannot be put into 'Awaiting HR approval' directly. Approve it and the stage is decided for you.";

    /// <summary>The status a fresh request is filed in.</summary>
    public static AnnualLeaveStatus InitialStatus(LeaveType leaveType) =>
        (leaveType.RequiresManagerApproval, leaveType.RequiresHrApproval) switch
        {
            (false, false) => AnnualLeaveStatus.Approved,
            (false, true) => AnnualLeaveStatus.AwaitingHrApproval,
            _ => AnnualLeaveStatus.Pending,
        };

    /// <summary>Still waiting on somebody's decision.</summary>
    public static bool IsOpen(AnnualLeaveStatus status) =>
        status is AnnualLeaveStatus.Pending or AnnualLeaveStatus.AwaitingHrApproval;

    /// <summary>The status to store, or why the request cannot be changed by this caller.</summary>
    public readonly record struct Outcome(AnnualLeaveStatus? Status, string? Error);

    public static Outcome Resolve(
        LeaveType? leaveType,
        AnnualLeaveStatus current,
        AnnualLeaveStatus requested,
        bool isHrAdministrator)
    {
        if (requested == AnnualLeaveStatus.AwaitingHrApproval)
            return new Outcome(null, StageIsDerivedMessage);

        if (current == AnnualLeaveStatus.AwaitingHrApproval && !isHrAdministrator)
            return new Outcome(null, AwaitingHrMessage);

        if (requested != AnnualLeaveStatus.Approved)
            return new Outcome(requested, null);

        var needsHr = leaveType?.RequiresHrApproval == true;
        if (needsHr && !isHrAdministrator)
            return new Outcome(AnnualLeaveStatus.AwaitingHrApproval, null);

        return new Outcome(AnnualLeaveStatus.Approved, null);
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `dotnet test Tests/WorkTrack.Tests --filter "FullyQualifiedName~ApprovalStageRuleTests"`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add Domain/AnnualLeave.cs Application/AnnualLeaves/Commands/ApprovalStageRule.cs Tests/WorkTrack.Tests/ApprovalStageRuleTests.cs
git commit -m "Add AwaitingHrApproval and the rule that decides the approval stage

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Who hears that a request is waiting on HR

**Files:**
- Create: `Application/Core/HrApprovalRecipients.cs`
- Create: `Application/AnnualLeaves/Commands/HrApprovalNotification.cs`
- Test: `Tests/WorkTrack.Tests/HrApprovalRecipientsTests.cs`

**Interfaces:**
- Consumes: `ManagerContact(string UserId, string Email, string? DisplayName)` from `Application/Core/ManagerNotificationRecipients.cs`; `AppRoles.HrAdministrator` (Domain); `CoverageNotification.DescribeAsync(context, delegateId, ct)`; `NotificationEmail` builder.
- Produces:
  - `static Task<List<ManagerContact>> HrApprovalRecipients.ResolveAsync(AppDbContext context, int? departmentId, string excludeUserId, CancellationToken ct)`
  - `static Task HrApprovalNotification.SendAsync(AppDbContext context, IEmailService emailService, AnnualLeave annualLeave, LeaveType leaveType, EmployeeProfile employeeProfile, string? approvedByUserId, CancellationToken ct)`

- [ ] **Step 1: Write the failing recipients test**

Create `Tests/WorkTrack.Tests/HrApprovalRecipientsTests.cs`:

```csharp
using Application.Core;
using Domain;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// The HR Administrators who are told a request is waiting on them: those whose
/// assigned departments cover the leave's department, or every one of them for a
/// department-less leave (an administrator's own). Never the employee, never a
/// deactivated account, never somebody who merely holds another role.
/// </summary>
public class HrApprovalRecipientsTests
{
    private const int Eng = 1;
    private const int Fin = 2;

    private static Persistence.AppDbContext Seed()
    {
        var db = TestDb.Create();
        db.Roles.Add(new Role { Id = "r-hr", Name = AppRoles.HrAdministrator, NormalizedName = AppRoles.HrAdministrator.ToUpperInvariant() });
        db.Roles.Add(new Role { Id = "r-mgr", Name = AppRoles.Manager, NormalizedName = AppRoles.Manager.ToUpperInvariant() });
        db.Users.AddRange(
            new User { Id = "hr-eng", UserName = "hr-eng", Email = "hr-eng@t.local", DisplayName = "HR Eng" },
            new User { Id = "hr-fin", UserName = "hr-fin", Email = "hr-fin@t.local", DisplayName = "HR Fin" },
            new User { Id = "hr-off", UserName = "hr-off", Email = "hr-off@t.local", DisplayName = "HR Left", IsActive = false },
            new User { Id = "mgr", UserName = "mgr", Email = "mgr@t.local", DisplayName = "Manager" });
        db.UserRoles.AddRange(
            new UserRole { UserId = "hr-eng", RoleId = "r-hr" },
            new UserRole { UserId = "hr-fin", RoleId = "r-hr" },
            new UserRole { UserId = "hr-off", RoleId = "r-hr" },
            new UserRole { UserId = "mgr", RoleId = "r-mgr" });
        db.UserDepartments.AddRange(
            new UserDepartment { UserId = "hr-eng", DepartmentId = Eng },
            new UserDepartment { UserId = "hr-fin", DepartmentId = Fin },
            new UserDepartment { UserId = "hr-off", DepartmentId = Eng },
            new UserDepartment { UserId = "mgr", DepartmentId = Eng });
        db.SaveChanges();
        return db;
    }

    [Fact]
    public async Task Only_the_hr_administrators_covering_the_department_are_told()
    {
        using var db = Seed();

        var recipients = await HrApprovalRecipients.ResolveAsync(db, Eng, excludeUserId: "nobody", CancellationToken.None);

        Assert.Equal(["hr-eng@t.local"], recipients.Select(r => r.Email));
    }

    [Fact]
    public async Task A_department_less_leave_reaches_every_active_hr_administrator()
    {
        using var db = Seed();

        var recipients = await HrApprovalRecipients.ResolveAsync(db, null, excludeUserId: "nobody", CancellationToken.None);

        Assert.Equal(["hr-eng@t.local", "hr-fin@t.local"], recipients.Select(r => r.Email).OrderBy(e => e));
    }

    [Fact]
    public async Task The_excluded_user_is_never_a_recipient()
    {
        using var db = Seed();

        var recipients = await HrApprovalRecipients.ResolveAsync(db, Eng, excludeUserId: "hr-eng", CancellationToken.None);

        Assert.Empty(recipients);
    }
}
```

- [ ] **Step 2: Run to verify it fails to compile**

Run: `dotnet test Tests/WorkTrack.Tests --filter "FullyQualifiedName~HrApprovalRecipientsTests"`
Expected: build error, `HrApprovalRecipients` not found.

- [ ] **Step 3: Write the resolver**

Create `Application/Core/HrApprovalRecipients.cs`:

```csharp
using Domain;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Core;

/// <summary>
/// The HR Administrators to tell that a leave request is waiting on them: the
/// ones whose assigned departments (UserDepartment rows) cover the leave's
/// department, or every active HR Administrator when the leave has none — a
/// department-less leave is an administrator's own, and any HR Administrator may
/// decide it (UpdateLeaveStatus's isUnscopedAdminLeave). Mirrors the reach an HR
/// Administrator has over the request, so nobody is emailed about a decision they
/// cannot open.
///
/// Deactivated accounts are skipped: a leaver decides nothing. The excluded user
/// is whoever this is about — the employee, or the HR Administrator who just
/// approved stage one themselves.
/// </summary>
public static class HrApprovalRecipients
{
    public static async Task<List<ManagerContact>> ResolveAsync(
        AppDbContext context,
        int? departmentId,
        string excludeUserId,
        CancellationToken cancellationToken)
    {
        var hrRoleId = await context.Roles
            .Where(r => r.Name == AppRoles.HrAdministrator)
            .Select(r => r.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (hrRoleId is null)
            return [];

        var query =
            from ur in context.UserRoles
            where ur.RoleId == hrRoleId
            join u in context.Users on ur.UserId equals u.Id
            where u.IsActive && u.Email != null && u.Email != ""
            select u;

        if (departmentId.HasValue)
        {
            var covering = context.UserDepartments
                .Where(ud => ud.DepartmentId == departmentId.Value)
                .Select(ud => ud.UserId);
            query = query.Where(u => covering.Contains(u.Id));
        }

        var users = await query
            .Select(u => new { u.Id, u.Email, u.DisplayName })
            .Distinct()
            .ToListAsync(cancellationToken);

        return users
            .Where(u => u.Id != excludeUserId)
            .Select(u => new ManagerContact(u.Id, u.Email!, u.DisplayName))
            .ToList();
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `dotnet test Tests/WorkTrack.Tests --filter "FullyQualifiedName~HrApprovalRecipientsTests"`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the notification (no test of its own — Tasks 4 and 5 assert on the emails it sends)**

Create `Application/AnnualLeaves/Commands/HrApprovalNotification.cs`:

```csharp
using Application.Core;
using Domain;
using Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.AnnualLeaves.Commands;

/// <summary>
/// "A leave request is waiting on you" to the HR Administrators who can decide
/// it. Sent from the two places a request reaches
/// <see cref="AnnualLeaveStatus.AwaitingHrApproval"/>: filing on a type that asks
/// for HR alone (<see cref="CreateAnnualLeave"/>), and a manager's approval on a
/// type that asks for both (<see cref="UpdateLeaveStatus"/>, and the status path
/// of <see cref="EditAnnualLeave"/>).
///
/// Carries the reason and the coverage line, like the manager's new-request
/// email: the apply form promises the reason reaches the people deciding the
/// request, and at this stage that is HR. Nothing is announced to the delegate
/// or the department — see <see cref="CoverageNotification"/> for why that waits
/// for the final approval.
/// </summary>
public static class HrApprovalNotification
{
    public const string Subject = "Leave request awaiting your approval";

    public static async Task SendAsync(
        AppDbContext context,
        IEmailService emailService,
        AnnualLeave annualLeave,
        LeaveType leaveType,
        EmployeeProfile employeeProfile,
        string? approvedByUserId,
        CancellationToken cancellationToken)
    {
        var recipients = await HrApprovalRecipients.ResolveAsync(
            context, annualLeave.DepartmentId, approvedByUserId ?? annualLeave.EmployeeId, cancellationToken);
        // The employee is never told about their own request this way, whoever approved it.
        recipients.RemoveAll(r => r.UserId == annualLeave.EmployeeId);
        if (recipients.Count == 0)
            return;

        var names = await context.Users
            .AsNoTracking()
            .Where(u => u.Id == annualLeave.EmployeeId || u.Id == approvedByUserId)
            .Select(u => new { u.Id, Name = !string.IsNullOrWhiteSpace(u.DisplayName) ? u.DisplayName : (u.Email ?? u.UserName ?? "") })
            .ToListAsync(cancellationToken);

        var employeeName = names.FirstOrDefault(n => n.Id == annualLeave.EmployeeId)?.Name is { Length: > 0 } e ? e : "Employee";
        var approverName = approvedByUserId is null ? null : names.FirstOrDefault(n => n.Id == approvedByUserId)?.Name;
        var dateRange = $"{annualLeave.StartDate:dd MMM yyyy} to {annualLeave.EndDate:dd MMM yyyy}";
        var coverage = await CoverageNotification.DescribeAsync(context, annualLeave.DelegateId, cancellationToken);

        // Sentence takes a FormattableString so it can encode each interpolated
        // value; a ternary of two interpolations would decay to a plain string.
        FormattableString sentence;
        if (approverName is null)
            sentence = $"A {leaveType.Name} request from {employeeName} for {dateRange} is awaiting HR approval.";
        else
            sentence = $"A {leaveType.Name} request from {employeeName} for {dateRange} has been approved by {approverName} and is awaiting HR approval.";

        foreach (var recipient in recipients)
        {
            var body = NotificationEmail
                .To(recipient.DisplayName ?? recipient.Email)
                .Sentence(sentence)
                .Detail("Reason", annualLeave.Reason)
                .Detail("Coverage", coverage)
                .Closing("Please log in to the Annual Leave system to review and take action.")
                .Build();

            await emailService.SendEmailAsync(recipient.Email, Subject, body.Html, body.Text, cancellationToken);
        }
    }
}
```

`NotificationEmail` (in `Application/Core/NotificationEmail.cs`) has `To(string?)`, `Sentence(FormattableString)`, `Detail(string, string?)`, `Closing(string)`, `Build()` returning `NotificationEmailBody(Html, Text)`, and `Plain(string?)` for a value that must not be emphasised. `Sentence` encodes every interpolated value itself.

- [ ] **Step 6: Build and commit**

Run: `dotnet build` — Expected: 0 errors.

```bash
git add Application/Core/HrApprovalRecipients.cs Application/AnnualLeaves/Commands/HrApprovalNotification.cs Tests/WorkTrack.Tests/HrApprovalRecipientsTests.cs
git commit -m "Resolve and email the HR Administrators a request is waiting on

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Filing lands in the right stage (`CreateAnnualLeave`)

**Files:**
- Modify: `Application/AnnualLeaves/Commands/CreateAnnualLeave.cs:128-190`
- Test: `Tests/WorkTrack.Tests/ApprovalStageHandlerTests.cs` (new; grows in Tasks 5–7)

**Interfaces:**
- Consumes: `ApprovalStageRule.InitialStatus`, `HrApprovalNotification.SendAsync`.

- [ ] **Step 1: Write the failing tests and the shared world**

Create `Tests/WorkTrack.Tests/ApprovalStageHandlerTests.cs`:

```csharp
using Application.AnnualLeaves.Commands;
using Application.AnnualLeaves.DTOs;
using Application.Core;
using AutoMapper;
using Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// The two approval switches through the handlers: where a request is filed,
/// where an Approve lands it, who is emailed, and what the balance does. The
/// table itself lives in ApprovalStageRuleTests; this is the plumbing.
/// </summary>
public class ApprovalStageHandlerTests
{
    private const int Dept = 1;
    private const int ManagerOnlyType = 1;
    private const int HrOnlyType = 2;
    private const int BothType = 3;

    private const string Employee = "u-emp";
    private const string EmployeeProfile = "p-emp";
    private const string Manager = "u-mgr";
    private const string Hr = "u-hr";
    private const string Delegate = "u-del";

    private static readonly DateTime Start = new(2026, 6, 1); // Monday
    private static readonly DateTime End = new(2026, 6, 5);   // Friday: 5 business days

    private static IMapper Mapper() =>
        new MapperConfiguration(cfg => cfg.AddProfile<MappingProfiles>(), NullLoggerFactory.Instance).CreateMapper();

    private static async Task<AppDbContext> WorldAsync()
    {
        var db = TestDb.Create();
        db.AppSettings.Add(new AppSettings { Id = 1, LeaveYearStartMonth = 1 });
        db.Departments.Add(new Department { Id = Dept, Name = "Engineering", Code = "ENG" });
        db.Roles.AddRange(
            new Role { Id = "r-hr", Name = AppRoles.HrAdministrator, NormalizedName = AppRoles.HrAdministrator.ToUpperInvariant() },
            new Role { Id = "r-mgr", Name = AppRoles.Manager, NormalizedName = AppRoles.Manager.ToUpperInvariant() });
        db.Users.AddRange(
            new User { Id = Employee, UserName = Employee, Email = "emp@t.local", DisplayName = "Maria Ioannou" },
            new User { Id = Manager, UserName = Manager, Email = "mgr@t.local", DisplayName = "Nikos Manager" },
            new User { Id = Hr, UserName = Hr, Email = "hr@t.local", DisplayName = "Helen HR" },
            new User { Id = Delegate, UserName = Delegate, Email = "del@t.local", DisplayName = "Andreas Georgiou" });
        db.UserRoles.AddRange(
            new UserRole { UserId = Hr, RoleId = "r-hr" },
            new UserRole { UserId = Manager, RoleId = "r-mgr" });
        db.EmployeeProfiles.AddRange(
            new EmployeeProfile { Id = EmployeeProfile, UserId = Employee, DepartmentId = Dept, AnnualLeaveEntitlement = 20, LeaveBalance = 20 },
            new EmployeeProfile { Id = "p-mgr", UserId = Manager, DepartmentId = Dept, AnnualLeaveEntitlement = 20, LeaveBalance = 20 },
            new EmployeeProfile { Id = "p-del", UserId = Delegate, DepartmentId = Dept, AnnualLeaveEntitlement = 20, LeaveBalance = 20 },
            new EmployeeProfile { Id = "p-hr", UserId = Hr, DepartmentId = null });
        db.UserDepartments.Add(new UserDepartment { UserId = Hr, DepartmentId = Dept });
        db.LeaveTypes.AddRange(
            new LeaveType { Id = ManagerOnlyType, Name = "Annual Leave", IsActive = true, AffectsBalance = true, DefaultAllowance = 20, RequiresManagerApproval = true, RequiresHrApproval = false },
            new LeaveType { Id = HrOnlyType, Name = "Sabbatical", IsActive = true, AffectsBalance = false, DefaultAllowance = 10, RequiresManagerApproval = false, RequiresHrApproval = true },
            new LeaveType { Id = BothType, Name = "Unpaid Leave", IsActive = true, AffectsBalance = true, DefaultAllowance = 20, RequiresManagerApproval = true, RequiresHrApproval = true });
        await db.SaveChangesAsync();
        return db;
    }

    private static Task<Result<string>> CreateAsync(AppDbContext db, FakeEmailService email, int leaveTypeId) =>
        new CreateAnnualLeave.Handler(db, Mapper(), email).Handle(new CreateAnnualLeave.Command
        {
            AnnualLeave = new CreateAnnualLeaveRequest
            {
                EmployeeId = Employee, LeaveTypeId = leaveTypeId, StartDate = Start, EndDate = End,
                Reason = "Family trip", DelegateId = Delegate,
            },
        }, CancellationToken.None);

    private static async Task<AnnualLeave> SeedLeaveAsync(AppDbContext db, int leaveTypeId, AnnualLeaveStatus status, string id = "L1")
    {
        var leave = new AnnualLeave
        {
            Id = id, EmployeeId = Employee, EmployeeProfileId = EmployeeProfile, DepartmentId = Dept,
            LeaveTypeId = leaveTypeId, StartDate = Start, EndDate = End, Reason = "Family trip",
            DelegateId = Delegate, Status = status, CreatedAt = DateTime.UtcNow,
        };
        db.AnnualLeaves.Add(leave);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        return leave;
    }

    private static Task<Result<Unit>> DecideAsync(AppDbContext db, FakeEmailService email, string leaveId, AnnualLeaveStatus status, bool asHr) =>
        new UpdateLeaveStatus.Handler(db, email).Handle(new UpdateLeaveStatus.Command
        {
            LeaveId = leaveId,
            ChangedByUserId = asHr ? Hr : Manager,
            IsAdmin = asHr,
            IsManager = !asHr,
            Request = new UpdateLeaveStatusRequest { Status = status },
        }, CancellationToken.None);

    private static async Task<AnnualLeave> StoredAsync(AppDbContext db, string id = "L1") =>
        (await db.AnnualLeaves.AsNoTracking().FirstAsync(l => l.Id == id));

    private static async Task<decimal> BalanceAsync(AppDbContext db) =>
        (await db.EmployeeProfiles.AsNoTracking().FirstAsync(p => p.Id == EmployeeProfile)).LeaveBalance;

    // ── Filing ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task A_manager_only_type_is_filed_pending_and_the_manager_is_told()
    {
        using var db = await WorldAsync();
        var email = new FakeEmailService();

        var result = await CreateAsync(db, email, ManagerOnlyType);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.Pending, (await StoredAsync(db, result.Value!)).Status);
        Assert.Contains(email.Sent, m => m.Recipient == "mgr@t.local" && m.Subject.StartsWith("New leave request"));
        Assert.DoesNotContain(email.Sent, m => m.Recipient == "hr@t.local");
    }

    [Fact]
    public async Task An_hr_only_type_is_filed_straight_into_the_hr_stage_and_hr_is_told()
    {
        using var db = await WorldAsync();
        var email = new FakeEmailService();

        var result = await CreateAsync(db, email, HrOnlyType);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.AwaitingHrApproval, (await StoredAsync(db, result.Value!)).Status);
        var toHr = Assert.Single(email.Sent, m => m.Recipient == "hr@t.local");
        Assert.Equal(HrApprovalNotification.Subject, toHr.Subject);
        Assert.Contains("Family trip", toHr.HtmlBody);
        Assert.DoesNotContain(email.Sent, m => m.Recipient == "mgr@t.local");
        Assert.Equal(20m, await BalanceAsync(db));
    }

    [Fact]
    public async Task A_type_needing_both_is_filed_pending()
    {
        using var db = await WorldAsync();

        var result = await CreateAsync(db, new FakeEmailService(), BothType);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.Pending, (await StoredAsync(db, result.Value!)).Status);
    }
}
```

- [ ] **Step 2: Run to verify the HR-only filing test fails**

Run: `dotnet test Tests/WorkTrack.Tests --filter "FullyQualifiedName~ApprovalStageHandlerTests"`
Expected: `An_hr_only_type_is_filed_straight_into_the_hr_stage_and_hr_is_told` FAILS (status is `Approved`, since `RequiresManagerApproval` is false and the old branch auto-approves). The other two pass.

- [ ] **Step 3: Route filing through the rule**

In `Application/AnnualLeaves/Commands/CreateAnnualLeave.cs`:

Replace

```csharp
            if (leaveType.RequiresManagerApproval)
            {
                annualLeave.Status = AnnualLeaveStatus.Pending;
            }
            else
            {
                annualLeave.Status = AnnualLeaveStatus.Approved;
```

with

```csharp
            /* Which stage the request opens in — Pending for the manager, straight to
               the HR stage on a type that asks for HR alone, or Approved when nobody
               has to look at it. ApprovalStageRule owns the table. */
            var initialStatus = ApprovalStageRule.InitialStatus(leaveType);
            annualLeave.Status = initialStatus;

            if (initialStatus == AnnualLeaveStatus.Approved)
            {
```

and delete the `}` that closed the old `if` block together with its `else {` — the auto-approve body (attachment check, balance check, history row) now sits inside `if (initialStatus == AnnualLeaveStatus.Approved) { … }`; the comment inside it stays. Then:

- `if (!leaveType.RequiresManagerApproval)` before the balance sync → `if (initialStatus == AnnualLeaveStatus.Approved)`.
- `if (leaveType.RequiresManagerApproval)` before the manager notifications → `if (initialStatus == AnnualLeaveStatus.Pending)`.
- Immediately after that block's closing brace (still before `return`), add:

```csharp
            else if (initialStatus == AnnualLeaveStatus.AwaitingHrApproval)
            {
                // No manager stage on this type, so HR are the first and only people
                // to hear about it.
                await HrApprovalNotification.SendAsync(
                    context, emailService, annualLeave, leaveType, employeeProfile, approvedByUserId: null, cancellationToken);
            }
```

Look at the end of the handler to confirm what the manager block returns; the HR branch must sit on the same path so the method still returns `Result<string>.Success(annualLeave.Id)` after it.

- [ ] **Step 4: Run the tests**

Run: `dotnet test Tests/WorkTrack.Tests --filter "FullyQualifiedName~ApprovalStageHandlerTests|FullyQualifiedName~AttachmentPolicyEnforcementTests|FullyQualifiedName~CoverageNotificationTests"`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add Application/AnnualLeaves/Commands/CreateAnnualLeave.cs Tests/WorkTrack.Tests/ApprovalStageHandlerTests.cs
git commit -m "File a request in the stage its leave type's approval switches say

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Deciding a request (`UpdateLeaveStatus`)

**Files:**
- Modify: `Application/AnnualLeaves/Commands/UpdateLeaveStatus.cs:58-260`
- Test: `Tests/WorkTrack.Tests/ApprovalStageHandlerTests.cs` (append)

**Interfaces:**
- Consumes: `ApprovalStageRule.Resolve`, `HrApprovalNotification.SendAsync`.

- [ ] **Step 1: Append the failing tests**

Add to `ApprovalStageHandlerTests` (inside the class, after the filing tests):

```csharp
    // ── Deciding ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task A_managers_approve_on_a_type_needing_hr_advances_it_and_tells_hr_and_the_employee()
    {
        using var db = await WorldAsync();
        await SeedLeaveAsync(db, BothType, AnnualLeaveStatus.Pending);
        var email = new FakeEmailService();

        var result = await DecideAsync(db, email, "L1", AnnualLeaveStatus.Approved, asHr: false);

        Assert.True(result.IsSuccess, result.Error);
        var stored = await StoredAsync(db);
        Assert.Equal(AnnualLeaveStatus.AwaitingHrApproval, stored.Status);
        Assert.Null(stored.ApprovedAt);
        Assert.Null(stored.ApprovedById);
        Assert.Equal(20m, await BalanceAsync(db));

        var toHr = Assert.Single(email.Sent, m => m.Recipient == "hr@t.local");
        Assert.Equal(HrApprovalNotification.Subject, toHr.Subject);
        Assert.Contains("Nikos Manager", toHr.HtmlBody);
        var toEmployee = Assert.Single(email.Sent, m => m.Recipient == "emp@t.local");
        Assert.Equal("Your leave request is awaiting HR approval", toEmployee.Subject);
        Assert.Contains("awaiting HR approval", toEmployee.HtmlBody);
        // Coverage is not announced before the final approval.
        Assert.DoesNotContain(email.Sent, m => m.Recipient == "del@t.local");

        var history = await db.LeaveStatusHistories.AsNoTracking().SingleAsync();
        Assert.Equal(AnnualLeaveStatus.Pending, history.OldStatus);
        Assert.Equal(AnnualLeaveStatus.AwaitingHrApproval, history.NewStatus);
    }

    [Fact]
    public async Task Hr_approving_from_pending_finishes_the_request_in_one_step()
    {
        using var db = await WorldAsync();
        await SeedLeaveAsync(db, BothType, AnnualLeaveStatus.Pending);
        var email = new FakeEmailService();

        var result = await DecideAsync(db, email, "L1", AnnualLeaveStatus.Approved, asHr: true);

        Assert.True(result.IsSuccess, result.Error);
        var stored = await StoredAsync(db);
        Assert.Equal(AnnualLeaveStatus.Approved, stored.Status);
        Assert.Equal(Hr, stored.ApprovedById);
        Assert.Equal(15m, await BalanceAsync(db));
        Assert.Contains(email.Sent, m => m.Recipient == "del@t.local"); // coverage announced
    }

    [Fact]
    public async Task Hr_approving_from_the_hr_stage_finishes_the_request()
    {
        using var db = await WorldAsync();
        await SeedLeaveAsync(db, BothType, AnnualLeaveStatus.AwaitingHrApproval);
        var email = new FakeEmailService();

        var result = await DecideAsync(db, email, "L1", AnnualLeaveStatus.Approved, asHr: true);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.Approved, (await StoredAsync(db)).Status);
        Assert.Equal(15m, await BalanceAsync(db));
        Assert.Contains(email.Sent, m => m.Recipient == "emp@t.local" && m.Subject == "Your leave request was approved");
    }

    [Theory]
    [InlineData(AnnualLeaveStatus.Approved)]
    [InlineData(AnnualLeaveStatus.Rejected)]
    public async Task A_manager_is_refused_on_a_request_that_is_with_hr(AnnualLeaveStatus attempt)
    {
        using var db = await WorldAsync();
        await SeedLeaveAsync(db, BothType, AnnualLeaveStatus.AwaitingHrApproval);
        var email = new FakeEmailService();

        var result = await DecideAsync(db, email, "L1", attempt, asHr: false);

        Assert.False(result.IsSuccess);
        Assert.Equal(ApprovalStageRule.AwaitingHrMessage, result.Error);
        Assert.Equal(AnnualLeaveStatus.AwaitingHrApproval, (await StoredAsync(db)).Status);
        Assert.Empty(email.Sent);
    }

    [Fact]
    public async Task Nobody_can_ask_for_the_hr_stage_directly()
    {
        using var db = await WorldAsync();
        await SeedLeaveAsync(db, BothType, AnnualLeaveStatus.Pending);

        var result = await DecideAsync(db, new FakeEmailService(), "L1", AnnualLeaveStatus.AwaitingHrApproval, asHr: true);

        Assert.False(result.IsSuccess);
        Assert.Equal(ApprovalStageRule.StageIsDerivedMessage, result.Error);
    }

    [Fact]
    public async Task A_manager_cannot_pass_an_undocumented_request_to_hr()
    {
        using var db = await WorldAsync();
        var type = await db.LeaveTypes.FindAsync(BothType);
        type!.AttachmentPolicy = AttachmentPolicy.Required;
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        await SeedLeaveAsync(db, BothType, AnnualLeaveStatus.Pending);

        var result = await DecideAsync(db, new FakeEmailService(), "L1", AnnualLeaveStatus.Approved, asHr: false);

        Assert.False(result.IsSuccess);
        Assert.Contains("supporting document", result.Error);
        Assert.Equal(AnnualLeaveStatus.Pending, (await StoredAsync(db)).Status);
    }

    [Fact]
    public async Task A_manager_only_type_still_approves_outright()
    {
        using var db = await WorldAsync();
        await SeedLeaveAsync(db, ManagerOnlyType, AnnualLeaveStatus.Pending);

        var result = await DecideAsync(db, new FakeEmailService(), "L1", AnnualLeaveStatus.Approved, asHr: false);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.Approved, (await StoredAsync(db)).Status);
        Assert.Equal(15m, await BalanceAsync(db));
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test Tests/WorkTrack.Tests --filter "FullyQualifiedName~ApprovalStageHandlerTests"`
Expected: the manager-advances, manager-refused, direct-stage and undocumented tests FAIL; the rest pass.

- [ ] **Step 3: Rewrite the status transition in `UpdateLeaveStatus`**

In `Application/AnnualLeaves/Commands/UpdateLeaveStatus.cs`, replace the block from `var oldStatus = annualLeave.Status;` through the end of the attachment-policy `if` (the one that loads `leaveType` and calls `AttachmentPolicyRule.Check`) with:

```csharp
            var oldStatus = annualLeave.Status;

            var leaveType = await context.LeaveTypes
                .AsNoTracking()
                .FirstOrDefaultAsync(type => type.Id == annualLeave.LeaveTypeId, cancellationToken);

            /* The client asks for Approved; the leave type's two switches and who is
               asking decide whether that means the HR stage or the end. A Manager on
               a request that is already with HR is refused here, whatever they ask. */
            var stage = ApprovalStageRule.Resolve(leaveType, oldStatus, request.Request.Status, request.IsAdmin);
            if (stage.Error is not null)
                return Result<Unit>.Failure(stage.Error);
            var newStatus = stage.Status!.Value;

            if (oldStatus == newStatus) return Result<Unit>.Success(Unit.Value);

            annualLeave.Status = newStatus;

            /* The attachment policy gates this transition rather than filing: the
               document a type requires may be dated after the request had to go in
               (call-up papers), so the employee files, attaches it from My Leave,
               and only then can this approve. It gates both steps out of Pending —
               a manager cannot pass an undocumented request along to HR either.
               Rejecting or cancelling asks nothing. No exemption for an admin — the
               rule is about the leave type, not about who is clicking. */
            var isApprovalStep = newStatus is AnnualLeaveStatus.Approved or AnnualLeaveStatus.AwaitingHrApproval;
            if (leaveType is not null && oldStatus != AnnualLeaveStatus.Approved && isApprovalStep)
            {
                var attachmentError = AttachmentPolicyRule.Check(leaveType, annualLeave.EvidenceUrl);
                if (attachmentError is not null)
                    return Result<Unit>.Failure(attachmentError);
            }
```

Remove the now-duplicate `var newStatus = request.Request.Status;` line. The balance, per-child, `ApprovedAt`, history, transaction and coverage blocks that follow stay as they are: they already test `newStatus == AnnualLeaveStatus.Approved`.

Then, right after the transaction commit and the coverage `if/else`, add the HR notification:

```csharp
            if (newStatus == AnnualLeaveStatus.AwaitingHrApproval && leaveType is not null && employeeProfile is not null)
            {
                // The manager has had their say; the HR Administrators covering the
                // department now need to hear it is with them.
                await HrApprovalNotification.SendAsync(
                    context, emailService, annualLeave, leaveType, employeeProfile,
                    approvedByUserId: request.ChangedByUserId, cancellationToken);
            }
```

Finally the employee's email. Replace

```csharp
            var statusLabel = newStatus.ToString();
            var subject = $"Your leave request was {statusLabel.ToLowerInvariant()}";
```

with

```csharp
            var statusLabel = newStatus.ToString();
            var subject = newStatus == AnnualLeaveStatus.AwaitingHrApproval
                ? "Your leave request is awaiting HR approval"
                : $"Your leave request was {statusLabel.ToLowerInvariant()}";
```

and, just above the `var body = NotificationEmail` line, add

```csharp
            // Sentence takes a FormattableString; a ternary of two interpolations
            // would decay to a plain string and lose the per-value encoding.
            FormattableString sentence;
            if (newStatus == AnnualLeaveStatus.AwaitingHrApproval)
                sentence = $"Your {leaveName} request for {dateRange} has been approved by {NotificationEmail.Plain(changedByName)} and is awaiting HR approval.";
            else
                sentence = $"Your {leaveName} request for {dateRange} has been {statusLabel} by {NotificationEmail.Plain(changedByName)}.";
```

and change the existing `.Sentence($"Your {leaveName} … ")` call to `.Sentence(sentence)`.

Note the existing `leaveTypeName` lookup a few lines above can now read `leaveType?.Name` instead of a second query; do that and delete the second query.

- [ ] **Step 4: Run the tests**

Run: `dotnet test Tests/WorkTrack.Tests --filter "FullyQualifiedName~ApprovalStageHandlerTests|FullyQualifiedName~AttachmentPolicyEnforcementTests|FullyQualifiedName~HrAdministratorScopeTests|FullyQualifiedName~ManagerScopeAuthorizationTests|FullyQualifiedName~LeaveBalanceAtomicityTests|FullyQualifiedName~CoverageNotificationTests|FullyQualifiedName~NotificationEmailTests"`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add Application/AnnualLeaves/Commands/UpdateLeaveStatus.cs Tests/WorkTrack.Tests/ApprovalStageHandlerTests.cs
git commit -m "Decide a request through the approval stage rule

A manager's Approve on a type that needs HR advances the request to the
HR stage and tells HR and the employee; an HR Administrator's Approve
finishes it. Balance, coverage and ApprovedAt still move only into
Approved.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The edit dialog's status path and the edit lock (`EditAnnualLeave`)

**Files:**
- Modify: `Application/AnnualLeaves/Commands/EditAnnualLeave.cs:69-72,184-240,278-300`
- Test: `Tests/WorkTrack.Tests/ApprovalStageHandlerTests.cs` (append)

- [ ] **Step 1: Append the failing tests**

```csharp
    // ── Editing ───────────────────────────────────────────────────────────────

    private static Task<Result<Unit>> EditAsync(AppDbContext db, FakeEmailService email, string byUserId, bool isAdmin, bool isManager, AnnualLeaveStatus? status, int leaveTypeId = BothType) =>
        new EditAnnualLeave.Handler(db, email).Handle(new EditAnnualLeave.Command
        {
            ChangedByUserId = byUserId, IsAdmin = isAdmin, IsManager = isManager,
            AnnualLeave = new EditAnnualLeaveRequest
            {
                Id = "L1", LeaveTypeId = leaveTypeId, StartDate = Start, EndDate = End,
                Reason = "Rebooked", DelegateId = Delegate, Status = status,
            },
        }, CancellationToken.None);

    [Fact]
    public async Task The_employee_cannot_edit_a_request_that_is_with_hr()
    {
        using var db = await WorldAsync();
        await SeedLeaveAsync(db, BothType, AnnualLeaveStatus.AwaitingHrApproval);

        var result = await EditAsync(db, new FakeEmailService(), Employee, isAdmin: false, isManager: false, status: null);

        Assert.False(result.IsSuccess);
        Assert.Contains("awaiting HR", result.Error);
        Assert.Equal("Family trip", (await StoredAsync(db)).Reason);
    }

    [Fact]
    public async Task A_manager_cannot_edit_a_request_that_is_with_hr_either()
    {
        using var db = await WorldAsync();
        await SeedLeaveAsync(db, BothType, AnnualLeaveStatus.AwaitingHrApproval);

        var result = await EditAsync(db, new FakeEmailService(), Manager, isAdmin: false, isManager: true, status: null);

        Assert.False(result.IsSuccess);
        Assert.Equal("Family trip", (await StoredAsync(db)).Reason);
    }

    [Fact]
    public async Task Hr_in_scope_may_still_edit_it()
    {
        using var db = await WorldAsync();
        await SeedLeaveAsync(db, BothType, AnnualLeaveStatus.AwaitingHrApproval);

        var result = await EditAsync(db, new FakeEmailService(), Hr, isAdmin: true, isManager: false, status: null);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal("Rebooked", (await StoredAsync(db)).Reason);
        Assert.Equal(AnnualLeaveStatus.AwaitingHrApproval, (await StoredAsync(db)).Status);
    }

    [Fact]
    public async Task A_manager_approving_from_the_edit_dialog_advances_to_hr_and_tells_them()
    {
        using var db = await WorldAsync();
        await SeedLeaveAsync(db, BothType, AnnualLeaveStatus.Pending);
        var email = new FakeEmailService();

        var result = await EditAsync(db, email, Manager, isAdmin: false, isManager: true, status: AnnualLeaveStatus.Approved);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.AwaitingHrApproval, (await StoredAsync(db)).Status);
        Assert.Equal(20m, await BalanceAsync(db));
        Assert.Contains(email.Sent, m => m.Recipient == "hr@t.local" && m.Subject == HrApprovalNotification.Subject);
        Assert.DoesNotContain(email.Sent, m => m.Recipient == "del@t.local");
    }

    [Fact]
    public async Task Hr_approving_from_the_edit_dialog_finishes_the_request()
    {
        using var db = await WorldAsync();
        await SeedLeaveAsync(db, BothType, AnnualLeaveStatus.Pending);
        var email = new FakeEmailService();

        var result = await EditAsync(db, email, Hr, isAdmin: true, isManager: false, status: AnnualLeaveStatus.Approved);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.Approved, (await StoredAsync(db)).Status);
        Assert.Equal(15m, await BalanceAsync(db));
        Assert.Contains(email.Sent, m => m.Recipient == "del@t.local");
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test Tests/WorkTrack.Tests --filter "FullyQualifiedName~ApprovalStageHandlerTests"`
Expected: the three lock tests and the manager-from-dialog test FAIL.

- [ ] **Step 3: Apply the lock and the rule in `EditAnnualLeave`**

Replace

```csharp
            if ((annualLeave.Status == AnnualLeaveStatus.Rejected || annualLeave.Status == AnnualLeaveStatus.Approved) && !actsAsAdmin)
            {
                return Result<Unit>.Conflict("Approved and rejected leave requests cannot be edited.");
            }
```

with

```csharp
            if (!actsAsAdmin)
            {
                // A manager has approved specific dates. An edit that quietly kept
                // the stage would put different dates in front of HR under the
                // manager's name, so the row is locked like an approved one. Cancel
                // and file again is the way to change it.
                if (annualLeave.Status == AnnualLeaveStatus.AwaitingHrApproval)
                    return Result<Unit>.Conflict("This request has been approved by your manager and is awaiting HR; cancel it and file again to change it.");

                if (annualLeave.Status == AnnualLeaveStatus.Rejected || annualLeave.Status == AnnualLeaveStatus.Approved)
                    return Result<Unit>.Conflict("Approved and rejected leave requests cannot be edited.");
            }
```

Replace the status block starting `if (request.AnnualLeave.Status.HasValue && request.AnnualLeave.Status.Value != annualLeave.Status)` — keep its user-exists check — so it reads:

```csharp
            if (request.AnnualLeave.Status.HasValue && request.AnnualLeave.Status.Value != annualLeave.Status)
            {
                var changedByUserId = request.ChangedByUserId;
                var userExists = await context.Users
                    .AnyAsync(u => u.Id == changedByUserId, cancellationToken);
                if (!userExists)
                {
                    return Result<Unit>.Failure("Cannot resolve the user who changed status.");
                }

                var oldStatus = annualLeave.Status;

                /* actsAsAdmin is an HR Administrator inside their scope — the caller
                   for whom Approve finishes a request that asks for HR. A Manager's
                   Approve on such a type advances it to the HR stage instead. */
                var stage = ApprovalStageRule.Resolve(editedLeaveType, oldStatus, request.AnnualLeave.Status.Value, actsAsAdmin);
                if (stage.Error is not null)
                    return Result<Unit>.Failure(stage.Error);
                var newStatus = stage.Status!.Value;

                if (newStatus != oldStatus)
                {
                    annualLeave.Status = newStatus;

                    if (newStatus == AnnualLeaveStatus.Approved)
                    {
                        annualLeave.ApprovedAt = DateTime.UtcNow;
                        annualLeave.ApprovedById = changedByUserId;
                    }
                    else if (oldStatus == AnnualLeaveStatus.Approved)
                    {
                        annualLeave.ApprovedAt = null;
                        annualLeave.ApprovedById = null;
                    }

                    context.LeaveStatusHistories.Add(new LeaveStatusHistory
                    {
                        Id = Guid.NewGuid().ToString(),
                        AnnualLeaveId = annualLeave.Id,
                        ChangedByUserId = changedByUserId,
                        OldStatus = oldStatus,
                        NewStatus = newStatus,
                        Comment = request.AnnualLeave.StatusComment,
                        ChangedAt = DateTime.UtcNow
                    });
                }
            }
```

Change the attachment check condition from `annualLeave.Status == AnnualLeaveStatus.Approved` to:

```csharp
            var reachedAnApprovalStep = annualLeave.Status == AnnualLeaveStatus.Approved
                || (annualLeave.Status == AnnualLeaveStatus.AwaitingHrApproval && statusBeforeEdit != AnnualLeaveStatus.AwaitingHrApproval);
            if (editedLeaveType is not null && reachedAnApprovalStep)
```

(the balance check two blocks below keeps `== Approved`).

After the coverage `if / else if / else if` chain at the end, add:

```csharp
            if (annualLeave.Status == AnnualLeaveStatus.AwaitingHrApproval
                && statusBeforeEdit != AnnualLeaveStatus.AwaitingHrApproval
                && editedLeaveType is not null
                && employeeProfile is not null)
            {
                await HrApprovalNotification.SendAsync(
                    context, emailService, annualLeave, editedLeaveType, employeeProfile,
                    approvedByUserId: request.ChangedByUserId, cancellationToken);
            }
```

Check that `employeeProfile` is in scope there (it is loaded earlier for the balance check); if it is named differently in this handler, use that name.

- [ ] **Step 4: Run the tests**

Run: `dotnet test Tests/WorkTrack.Tests --filter "FullyQualifiedName~ApprovalStageHandlerTests|FullyQualifiedName~AttachmentPolicyEnforcementTests|FullyQualifiedName~HalfDayLeaveTests|FullyQualifiedName~LeaveLimitsEnforcementTests|FullyQualifiedName~CoverageRequiredTests"`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add Application/AnnualLeaves/Commands/EditAnnualLeave.cs Tests/WorkTrack.Tests/ApprovalStageHandlerTests.cs
git commit -m "Lock a request that is with HR, and stage the edit dialog's approval

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `AwaitingHrApproval` is an open request everywhere `Pending` is

**Files:**
- Modify: `Application/AnnualLeaves/Commands/DeleteAnnualLeave.cs:57-58`
- Modify: `Application/AnnualLeaves/Validators/CreateAnnualLeaveRequestValidator.cs:74`
- Modify: `Application/AnnualLeaves/Validators/EditAnnualLeaveRequestValidator.cs:92`
- Modify: `Application/Reminders/ReminderDispatcher.cs:94`
- Test: `Tests/WorkTrack.Tests/ApprovalStageHandlerTests.cs` (append)

- [ ] **Step 1: Append the failing tests**

```csharp
    // ── Still open ────────────────────────────────────────────────────────────

    [Fact]
    public async Task The_employee_can_cancel_a_request_that_is_with_hr()
    {
        using var db = await WorldAsync();
        await SeedLeaveAsync(db, BothType, AnnualLeaveStatus.AwaitingHrApproval);

        var result = await new DeleteAnnualLeave.Handler(db).Handle(new DeleteAnnualLeave.Command
        {
            Id = "L1", RequestingUserId = Employee, IsAdmin = false, IsManager = false,
        }, CancellationToken.None);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Empty(db.AnnualLeaves);
    }

    [Fact]
    public async Task A_request_with_hr_blocks_an_overlapping_one()
    {
        using var db = await WorldAsync();
        await SeedLeaveAsync(db, BothType, AnnualLeaveStatus.AwaitingHrApproval);

        var validator = new Application.AnnualLeaves.Validators.CreateAnnualLeaveRequestValidator(db);
        var outcome = await validator.ValidateAsync(new CreateAnnualLeave.Command
        {
            AnnualLeave = new CreateAnnualLeaveRequest
            {
                EmployeeId = Employee, LeaveTypeId = ManagerOnlyType, StartDate = Start.AddDays(2), EndDate = End.AddDays(2),
                Reason = "Overlaps", DelegateId = Delegate,
            },
        });

        Assert.Contains(outcome.Errors, e => e.ErrorMessage.Contains("overlaps"));
    }
```

(`DeleteAnnualLeave.Handler` takes the context alone; `CreateAnnualLeaveRequestValidator : AbstractValidator<CreateAnnualLeave.Command>` takes the context.)

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test Tests/WorkTrack.Tests --filter "FullyQualifiedName~ApprovalStageHandlerTests"`
Expected: both new tests FAIL (cancel refused; no overlap error).

- [ ] **Step 3: Widen the four reads**

`DeleteAnnualLeave.cs`: replace `&& annualLeave.Status == AnnualLeaveStatus.Pending;` with `&& ApprovalStageRule.IsOpen(annualLeave.Status);` (add `using Application.AnnualLeaves.Commands;` if the file is in another namespace — it is in the same one, so no using is needed).

Both validators: replace `(al.Status == AnnualLeaveStatus.Pending || al.Status == AnnualLeaveStatus.Approved)` with `(al.Status == AnnualLeaveStatus.Pending || al.Status == AnnualLeaveStatus.AwaitingHrApproval || al.Status == AnnualLeaveStatus.Approved)`. (Spelled out rather than calling `IsOpen`: this is inside an EF expression tree, which cannot translate a method call.)

`ReminderDispatcher.cs`: replace `.Where(l => l.Status == AnnualLeaveStatus.Pending)` with `.Where(l => l.Status == AnnualLeaveStatus.Pending || l.Status == AnnualLeaveStatus.AwaitingHrApproval)`.

- [ ] **Step 4: Run the tests**

Run: `dotnet test Tests/WorkTrack.Tests --filter "FullyQualifiedName~ApprovalStageHandlerTests|FullyQualifiedName~DailyAttendanceReportTests|FullyQualifiedName~Reminder"`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add Application/AnnualLeaves/Commands/DeleteAnnualLeave.cs Application/AnnualLeaves/Validators Application/Reminders/ReminderDispatcher.cs Tests/WorkTrack.Tests/ApprovalStageHandlerTests.cs
git commit -m "Treat a request awaiting HR as open for overlaps, Cancel and reminders

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Changing the switches on a type with live requests (`UpdateLeaveType`)

**Files:**
- Modify: `Application/LeaveTypes/Commands/UpdateLeaveType.cs:28,87-128`
- Test: `Tests/WorkTrack.Tests/LeaveTypeApprovalSweepTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `Tests/WorkTrack.Tests/LeaveTypeApprovalSweepTests.cs`:

```csharp
using Application.Core;
using Application.LeaveTypes.Commands;
using Application.LeaveTypes.DTOs;
using AutoMapper;
using Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// What happens to requests already in flight when an admin changes a type's
/// approval switches. Turning every switch off approves everything open (as the
/// one-switch sweep always did); turning HR off approves what was with HR, whose
/// manager stage is done; turning Manager off while HR stays on moves Pending
/// rows to HR, since there is no manager stage left to clear. Turning a switch
/// on moves nothing.
/// </summary>
public class LeaveTypeApprovalSweepTests
{
    private const int TypeId = 1;

    private static IMapper Mapper() =>
        new MapperConfiguration(cfg => cfg.AddProfile<MappingProfiles>(), NullLoggerFactory.Instance).CreateMapper();

    private static async Task<AppDbContext> WorldAsync(bool manager, bool hr)
    {
        var db = TestDb.Create();
        db.AppSettings.Add(new AppSettings { Id = 1, LeaveYearStartMonth = 1 });
        db.LeaveTypes.Add(new LeaveType { Id = TypeId, Name = "Unpaid Leave", IsActive = true, AffectsBalance = false, DefaultAllowance = 10, RequiresManagerApproval = manager, RequiresHrApproval = hr });
        db.EmployeeProfiles.AddRange(
            new EmployeeProfile { Id = "p1", UserId = "u1", AnnualLeaveEntitlement = 20, LeaveBalance = 20 },
            new EmployeeProfile { Id = "p2", UserId = "u2", AnnualLeaveEntitlement = 20, LeaveBalance = 20 });
        db.AnnualLeaves.AddRange(
            new AnnualLeave { Id = "pending", EmployeeId = "u1", EmployeeProfileId = "p1", LeaveTypeId = TypeId, Status = AnnualLeaveStatus.Pending, StartDate = new DateTime(2026, 6, 1), EndDate = new DateTime(2026, 6, 5), Reason = "a" },
            new AnnualLeave { Id = "with-hr", EmployeeId = "u2", EmployeeProfileId = "p2", LeaveTypeId = TypeId, Status = AnnualLeaveStatus.AwaitingHrApproval, StartDate = new DateTime(2026, 7, 6), EndDate = new DateTime(2026, 7, 10), Reason = "b" });
        await db.SaveChangesAsync();
        return db;
    }

    private static Task<Result<LeaveTypeDto>> SaveAsync(AppDbContext db, bool manager, bool hr) =>
        new UpdateLeaveType.Handler(db, Mapper()).Handle(new UpdateLeaveType.Command
        {
            Id = TypeId,
            LeaveType = new UpsertLeaveTypeRequest
            {
                Name = "Unpaid Leave", IsActive = true, AffectsBalance = false, DefaultAllowance = 10,
                RequiresManagerApproval = manager, RequiresHrApproval = hr,
            },
        }, CancellationToken.None);

    private static async Task<AnnualLeaveStatus> StatusAsync(AppDbContext db, string id) =>
        (await db.AnnualLeaves.AsNoTracking().FirstAsync(l => l.Id == id)).Status;

    [Fact]
    public async Task Turning_every_switch_off_approves_everything_open()
    {
        using var db = await WorldAsync(manager: true, hr: true);

        var result = await SaveAsync(db, manager: false, hr: false);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.Approved, await StatusAsync(db, "pending"));
        Assert.Equal(AnnualLeaveStatus.Approved, await StatusAsync(db, "with-hr"));
        Assert.Equal(2, await db.LeaveStatusHistories.CountAsync());
    }

    [Fact]
    public async Task Turning_hr_off_approves_what_was_with_hr_and_leaves_pending_alone()
    {
        using var db = await WorldAsync(manager: true, hr: true);

        var result = await SaveAsync(db, manager: true, hr: false);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.Pending, await StatusAsync(db, "pending"));
        Assert.Equal(AnnualLeaveStatus.Approved, await StatusAsync(db, "with-hr"));
    }

    [Fact]
    public async Task Turning_manager_off_while_hr_stays_on_sends_pending_to_hr()
    {
        using var db = await WorldAsync(manager: true, hr: true);

        var result = await SaveAsync(db, manager: false, hr: true);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.AwaitingHrApproval, await StatusAsync(db, "pending"));
        Assert.Equal(AnnualLeaveStatus.AwaitingHrApproval, await StatusAsync(db, "with-hr"));
        var history = await db.LeaveStatusHistories.SingleAsync();
        Assert.Equal("pending", history.AnnualLeaveId);
        Assert.Equal(AnnualLeaveStatus.AwaitingHrApproval, history.NewStatus);
    }

    [Fact]
    public async Task Turning_a_switch_on_moves_nothing()
    {
        using var db = await WorldAsync(manager: true, hr: false);
        // A stray with-hr row cannot exist on a manager-only type, but the seed has
        // one; the point is that switching HR *on* leaves both rows where they are.
        var result = await SaveAsync(db, manager: true, hr: true);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.Pending, await StatusAsync(db, "pending"));
        Assert.Equal(AnnualLeaveStatus.AwaitingHrApproval, await StatusAsync(db, "with-hr"));
        Assert.Equal(0, await db.LeaveStatusHistories.CountAsync());
    }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test Tests/WorkTrack.Tests --filter "FullyQualifiedName~LeaveTypeApprovalSweepTests"`
Expected: the first three FAIL (the sweep still keys off the one flag); the fourth passes.

- [ ] **Step 3: Generalise the sweep**

In `UpdateLeaveType.cs`, replace `var wasRequiringApproval = leaveType.RequiresManagerApproval;` with:

```csharp
            var wasRequiringManager = leaveType.RequiresManagerApproval;
            var wasRequiringHr = leaveType.RequiresHrApproval;
```

Replace the whole `if (wasRequiringApproval && !leaveType.RequiresManagerApproval && leaveType.IsActive) { … }` block with:

```csharp
            /* Requests already in flight follow the switches. Every switch off:
               approve everything open, balance-checked, as the one-switch sweep
               always did. HR off with Manager still on: approve what was with HR —
               its manager stage is done. Manager off with HR on: Pending rows move
               to HR, since there is no manager stage left for them to clear.
               Switching anything *on* moves nothing: a Pending row will be advanced
               by the manager, and a row with HR stays with HR. */
            if (leaveType.IsActive)
            {
                var nowManager = leaveType.RequiresManagerApproval;
                var nowHr = leaveType.RequiresHrApproval;
                var everythingOff = !nowManager && !nowHr && (wasRequiringManager || wasRequiringHr);
                var hrDropped = wasRequiringHr && !nowHr && nowManager;
                var managerDropped = wasRequiringManager && !nowManager && nowHr;

                if (everythingOff || hrDropped)
                {
                    var toApprove = await context.AnnualLeaves
                        .Where(al => al.LeaveTypeId == leaveType.Id
                            && (al.Status == AnnualLeaveStatus.AwaitingHrApproval
                                || (everythingOff && al.Status == AnnualLeaveStatus.Pending)))
                        .ToListAsync(cancellationToken);

                    foreach (var annualLeave in toApprove)
                    {
                        var employeeProfile = await context.EmployeeProfiles
                            .FirstOrDefaultAsync(ep => ep.Id == annualLeave.EmployeeProfileId, cancellationToken);

                        if (employeeProfile is not null)
                        {
                            var balanceError = await AnnualLeaveBalanceCalculator.CheckSufficientBalanceAsync(
                                context,
                                employeeProfile,
                                annualLeave,
                                excludeLeaveId: annualLeave.Id,
                                cancellationToken);
                            if (balanceError is not null)
                                return Result<LeaveTypeDto>.Conflict(balanceError);

                            affectedProfiles[employeeProfile.Id] = employeeProfile;
                        }

                        var previous = annualLeave.Status;
                        annualLeave.Status = AnnualLeaveStatus.Approved;
                        annualLeave.ApprovedAt = DateTime.UtcNow;
                        annualLeave.ApprovedById = null;

                        context.LeaveStatusHistories.Add(new LeaveStatusHistory
                        {
                            Id = Guid.NewGuid().ToString(),
                            AnnualLeaveId = annualLeave.Id,
                            ChangedByUserId = annualLeave.EmployeeId,
                            OldStatus = previous,
                            NewStatus = AnnualLeaveStatus.Approved,
                            Comment = "Automatically approved based on leave type settings.",
                            ChangedAt = DateTime.UtcNow,
                        });
                    }
                }
                else if (managerDropped)
                {
                    var toHr = await context.AnnualLeaves
                        .Where(al => al.LeaveTypeId == leaveType.Id && al.Status == AnnualLeaveStatus.Pending)
                        .ToListAsync(cancellationToken);

                    foreach (var annualLeave in toHr)
                    {
                        annualLeave.Status = AnnualLeaveStatus.AwaitingHrApproval;
                        context.LeaveStatusHistories.Add(new LeaveStatusHistory
                        {
                            Id = Guid.NewGuid().ToString(),
                            AnnualLeaveId = annualLeave.Id,
                            ChangedByUserId = annualLeave.EmployeeId,
                            OldStatus = AnnualLeaveStatus.Pending,
                            NewStatus = AnnualLeaveStatus.AwaitingHrApproval,
                            Comment = "Moved to HR approval based on leave type settings.",
                            ChangedAt = DateTime.UtcNow,
                        });
                    }
                }
            }
```

Note: as today, this sweep sends no email and announces no coverage — `UpdateLeaveType.Handler` has no `IEmailService`. The spec's table said "coverage announced"; keeping parity with the existing auto-approval sweep is the smaller change, and it is called out in the final summary to the user.

- [ ] **Step 4: Run the tests**

Run: `dotnet test Tests/WorkTrack.Tests --filter "FullyQualifiedName~LeaveTypeApprovalSweepTests|FullyQualifiedName~LeaveTypeAutoApprovalBalanceTests|FullyQualifiedName~AllowanceGovernsEveryoneTests|FullyQualifiedName~ProRatedFirstYearPlumbingTests"`
Expected: all PASS.

- [ ] **Step 5: Run the whole backend suite, then commit**

Run: `dotnet test Tests/WorkTrack.Tests`
Expected: all PASS (note the count).

```bash
git add Application/LeaveTypes/Commands/UpdateLeaveType.cs Tests/WorkTrack.Tests/LeaveTypeApprovalSweepTests.cs
git commit -m "Sweep in-flight requests when a type's approval switches change

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The client mirror (`approval-stage.ts`) and the status union

**Files:**
- Modify: `client/src/lib/types/annual-leave.ts:3-7`
- Modify: `client/src/lib/roles.ts` (add `isHrAdministrator`)
- Create: `client/src/lib/approval-stage.ts`
- Test: `client/src/lib/approval-stage.test.ts`, `client/src/lib/roles.test.ts` (append)

**Interfaces:**
- Produces:
  - `AnnualLeaveStatus` gains `'AwaitingHrApproval'`
  - `isHrAdministrator(roles: readonly string[] | null | undefined): boolean` in `roles.ts`
  - from `approval-stage.ts`: `type ApprovalFlags = Pick<LeaveType, 'requiresManagerApproval' | 'requiresHrApproval'>`, `interface ApprovalViewer { isHrAdministrator: boolean }`, `isOpenStatus(status)`, `canDecide(leave, viewer)`, `approveOutcome(leave, type, viewer): 'approved' | 'awaiting-hr'`, `approveButtonLabel(outcome)`, `autoApproves(type)`, `approvalRule(type): 'auto' | 'manager' | 'hr' | 'manager-then-hr'`, `statusChipLabel(status)`

- [ ] **Step 1: Write the failing tests**

Create `client/src/lib/approval-stage.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
    approvalRule, approveButtonLabel, approveOutcome, autoApproves, canDecide, isOpenStatus, statusChipLabel,
} from './approval-stage'

/**
 * Mirror of `Application/AnnualLeaves/Commands/ApprovalStageRule.cs`. The server
 * decides the stage; this decides which buttons a page offers, so it must never
 * offer one the server refuses — and may under-offer when the type is not loaded.
 */
const MANAGER = { isHrAdministrator: false }
const HR = { isHrAdministrator: true }
const both = { requiresManagerApproval: true, requiresHrApproval: true }
const managerOnly = { requiresManagerApproval: true, requiresHrApproval: false }
const hrOnly = { requiresManagerApproval: false, requiresHrApproval: true }
const neither = { requiresManagerApproval: false, requiresHrApproval: false }

describe('isOpenStatus', () => {
    it('is Pending or AwaitingHrApproval', () => {
        expect(isOpenStatus('Pending')).toBe(true)
        expect(isOpenStatus('AwaitingHrApproval')).toBe(true)
        expect(isOpenStatus('Approved')).toBe(false)
        expect(isOpenStatus('Rejected')).toBe(false)
        expect(isOpenStatus('Cancelled')).toBe(false)
    })
})

describe('canDecide', () => {
    it('lets either role decide a Pending request', () => {
        expect(canDecide({ status: 'Pending' }, MANAGER)).toBe(true)
        expect(canDecide({ status: 'Pending' }, HR)).toBe(true)
    })
    it('lets only HR decide a request that is with HR', () => {
        expect(canDecide({ status: 'AwaitingHrApproval' }, MANAGER)).toBe(false)
        expect(canDecide({ status: 'AwaitingHrApproval' }, HR)).toBe(true)
    })
    it('offers nothing on a decided request', () => {
        expect(canDecide({ status: 'Approved' }, HR)).toBe(false)
        expect(canDecide({ status: 'Rejected' }, HR)).toBe(false)
    })
})

describe('approveOutcome', () => {
    it("sends a manager's approve to HR when the type asks for HR", () => {
        expect(approveOutcome({ status: 'Pending' }, both, MANAGER)).toBe('awaiting-hr')
    })
    it('finishes for HR from either open state', () => {
        expect(approveOutcome({ status: 'Pending' }, both, HR)).toBe('approved')
        expect(approveOutcome({ status: 'AwaitingHrApproval' }, both, HR)).toBe('approved')
    })
    it('finishes for a manager on a manager-only type, or when the type is not loaded', () => {
        expect(approveOutcome({ status: 'Pending' }, managerOnly, MANAGER)).toBe('approved')
        expect(approveOutcome({ status: 'Pending' }, undefined, MANAGER)).toBe('approved')
    })
    it('labels the button accordingly', () => {
        expect(approveButtonLabel('awaiting-hr')).toBe('Approve & send to HR')
        expect(approveButtonLabel('approved')).toBe('Approve')
    })
})

describe('the type-level readings', () => {
    it('autoApproves only when both switches are off', () => {
        expect(autoApproves(neither)).toBe(true)
        expect(autoApproves(managerOnly)).toBe(false)
        expect(autoApproves(hrOnly)).toBe(false)
        expect(autoApproves(undefined)).toBe(false)
    })
    it('names the rule for the card', () => {
        expect(approvalRule(neither)).toBe('auto')
        expect(approvalRule(managerOnly)).toBe('manager')
        expect(approvalRule(hrOnly)).toBe('hr')
        expect(approvalRule(both)).toBe('manager-then-hr')
    })
    it('reads a missing HR flag (an older API) as off', () => {
        expect(approvalRule({ requiresManagerApproval: true })).toBe('manager')
    })
})

describe('statusChipLabel', () => {
    it('spells the HR stage out', () => {
        expect(statusChipLabel('AwaitingHrApproval')).toBe('Awaiting HR approval')
        expect(statusChipLabel('Pending')).toBe('Pending')
    })
})
```

Append to `client/src/lib/roles.test.ts`:

```ts
describe('isHrAdministrator', () => {
    it('recognises the HR Administrator role alone', () => {
        expect(isHrAdministrator(['HR Administrator'])).toBe(true)
        expect(isHrAdministrator(['System Administrator'])).toBe(false)
        expect(isHrAdministrator(['Manager'])).toBe(false)
        expect(isHrAdministrator(null)).toBe(false)
    })
})
```

and add `isHrAdministrator` to that file's import from `./roles`.

- [ ] **Step 2: Run to verify they fail**

Run from `client/`: `node_modules/.bin/vitest run src/lib/approval-stage.test.ts src/lib/roles.test.ts`
Expected: FAIL — module `./approval-stage` not found; `isHrAdministrator` is not exported.

- [ ] **Step 3: Write the module, the role helper and the status**

`client/src/lib/types/annual-leave.ts`:

```ts
export type AnnualLeaveStatus =
    | 'Pending'
    | 'Approved'
    | 'Rejected'
    | 'Cancelled'
    /** Past the manager's approval, waiting on an HR Administrator's. Open like Pending, locked for editing like Approved. */
    | 'AwaitingHrApproval'
```

`client/src/lib/roles.ts`, after `isSystemAdministrator`:

```ts
/** Whether any of `roles` is the HR Administrator — the role that gives the final approval on a leave type that asks for HR. */
export function isHrAdministrator(roles: readonly string[] | null | undefined): boolean {
    return !!roles && roles.includes('HR Administrator')
}
```

Create `client/src/lib/approval-stage.ts`:

```ts
import type { AnnualLeave, AnnualLeaveStatus, LeaveType } from './types'

/**
 * Which approval stage a request is in and who may move it, mirroring
 * `Application/AnnualLeaves/Commands/ApprovalStageRule.cs`. The server decides the
 * stage an Approve lands in — every page sends `'Approved'` — and this only decides
 * which buttons to offer, so a page never shows one the API is certain to refuse.
 * Keep the two in step, the same way `attachment-policy.ts` is kept in step with
 * `AttachmentPolicyRule`. A mirror may under-refuse (a type not yet loaded reads
 * as manager-only); it must never over-refuse.
 *
 * Manager first, then HR. An HR Administrator stands in for the manager, so their
 * Approve from Pending finishes a request even when the type asks for HR. A
 * Manager cannot decide a request that is with HR at all.
 */
export type ApprovalFlags = Pick<LeaveType, 'requiresManagerApproval'> & Partial<Pick<LeaveType, 'requiresHrApproval'>>

export interface ApprovalViewer {
    isHrAdministrator: boolean
}

export type ApproveOutcome = 'approved' | 'awaiting-hr'

export type ApprovalRule = 'auto' | 'manager' | 'hr' | 'manager-then-hr'

/** Still waiting on somebody's decision. */
export function isOpenStatus(status: AnnualLeaveStatus): boolean {
    return status === 'Pending' || status === 'AwaitingHrApproval'
}

/** Whether this viewer may approve or reject the request at its current stage. */
export function canDecide(leave: Pick<AnnualLeave, 'status'>, viewer: ApprovalViewer): boolean {
    if (leave.status === 'Pending') return true
    if (leave.status === 'AwaitingHrApproval') return viewer.isHrAdministrator
    return false
}

/** Where this viewer's Approve lands the request. */
export function approveOutcome(
    leave: Pick<AnnualLeave, 'status'>,
    type: ApprovalFlags | undefined,
    viewer: ApprovalViewer,
): ApproveOutcome {
    if (leave.status === 'Pending' && !!type?.requiresHrApproval && !viewer.isHrAdministrator) return 'awaiting-hr'
    return 'approved'
}

export function approveButtonLabel(outcome: ApproveOutcome): string {
    return outcome === 'awaiting-hr' ? 'Approve & send to HR' : 'Approve'
}

/** Filing is approval: neither switch is on. Undefined (type not loaded) reads as not. */
export function autoApproves(type: ApprovalFlags | undefined): boolean {
    return !!type && !type.requiresManagerApproval && !type.requiresHrApproval
}

/** The one-line reading of the two switches, for the leave type's card. */
export function approvalRule(type: ApprovalFlags): ApprovalRule {
    const manager = type.requiresManagerApproval
    const hr = !!type.requiresHrApproval
    if (manager && hr) return 'manager-then-hr'
    if (hr) return 'hr'
    if (manager) return 'manager'
    return 'auto'
}

export function statusChipLabel(status: AnnualLeaveStatus): string {
    return status === 'AwaitingHrApproval' ? 'Awaiting HR approval' : status
}
```

- [ ] **Step 4: Run the tests and the type check**

Run from `client/`: `node_modules/.bin/vitest run src/lib/approval-stage.test.ts src/lib/roles.test.ts`
Expected: PASS. Then `npx tsc -b` — expect errors in files that switch exhaustively on `AnnualLeaveStatus` (`MyLeavePage.tsx`'s `StatusBadge` `Record<AnnualLeaveStatus, …>`, and possibly `AnnualLeaveCard.tsx`'s `statusColor`). Those are fixed in Task 11; note them and proceed.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/approval-stage.ts client/src/lib/approval-stage.test.ts client/src/lib/roles.ts client/src/lib/roles.test.ts client/src/lib/types/annual-leave.ts
git commit -m "Mirror the approval stage rule on the client

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: The Leave Types panel — two switches, the card line, the toggle

**Files:**
- Modify: `client/src/components/admin/LeaveTypesPanel.tsx` (dialog switches ~line 1271; card rule ~line 637; `toggleActive` already carries both flags from Task 1)
- Test: `client/src/components/admin/LeaveTypesPanel.test.tsx` (append)

- [ ] **Step 1: Append the failing tests**

```ts
it('offers the two approval switches, named for who approves', async () => {
    await renderPanel()
    fireEvent.click(screen.getByTitle('Edit'))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('switch', { name: 'Requires approval from Manager' })).toBeChecked()
    expect(within(dialog).getByRole('switch', { name: 'Requires approval from HR' })).not.toBeChecked()
})

it('sends both approval flags when saving', async () => {
    await renderPanel()
    fireEvent.click(screen.getByTitle('Edit'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Requires approval from HR' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledWith(PATERNITY.id, expect.objectContaining({
        requiresManagerApproval: true,
        requiresHrApproval: true,
    })))
})

it('sends the HR flag back unchanged when toggling a type off from the card', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ name: 'Sabbatical', id: 9, perChildEntitlement: false, requiresHrApproval: true })])
    await renderPanel()
    // No dialog is open, so the card's own switch is the only one on screen.
    fireEvent.click(screen.getAllByRole('switch')[0])

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledWith(9, expect.objectContaining({
        isActive: false,
        requiresManagerApproval: true,
        requiresHrApproval: true,
    })))
})

it('describes the approval rule on the card', async () => {
    api.getLeaveTypes.mockResolvedValue([
        leaveType({ id: 1, name: 'Personal Days', perChildEntitlement: false, requiresManagerApproval: true, requiresHrApproval: true }),
        leaveType({ id: 2, name: 'Sabbatical', perChildEntitlement: false, requiresManagerApproval: false, requiresHrApproval: true }),
        leaveType({ id: 3, name: 'Volunteering', perChildEntitlement: false, requiresManagerApproval: false, requiresHrApproval: false }),
    ])
    await renderPanel()

    expect(screen.getByText(/manager, then HR/)).toBeInTheDocument()
    expect(screen.getByText(/Requires HR approval/)).toBeInTheDocument()
    expect(screen.getByText(/Auto-approved/)).toBeInTheDocument()
})
```

(The card's Edit control is found by `getByTitle('Edit')` and the dialog's save button is named `Save`, as the existing tests at lines 212 and 448 of this file do.)

- [ ] **Step 2: Run to verify they fail**

Run from `client/`: `node_modules/.bin/vitest run src/components/admin/LeaveTypesPanel.test.tsx`
Expected: the four new tests FAIL (label "Requires approval" still, no HR switch, card says "Requires manager approval").

- [ ] **Step 3: Change the dialog and the card**

In the dialog's toggle grid replace

```tsx
                        <FormControlLabel
                            control={<Switch checked={requiresManagerApproval} onChange={(e) => setRequiresManagerApproval(e.target.checked)} />}
                            label="Requires approval"
                        />
```

with

```tsx
                        {/* Two stages, mirrored from ApprovalStageRule: Manager on files
                            the request Pending for the department's manager (or HR standing
                            in); HR on needs an HR Administrator's sign-off — after the
                            manager's when both are on, straight away when Manager is off.
                            Neither: approved on filing. */}
                        <FormControlLabel
                            control={<Switch checked={requiresManagerApproval} onChange={(e) => setRequiresManagerApproval(e.target.checked)} />}
                            label="Requires approval from Manager"
                        />
                        <FormControlLabel
                            control={<Switch checked={requiresHrApproval} onChange={(e) => setRequiresHrApproval(e.target.checked)} />}
                            label="Requires approval from HR"
                        />
```

(The grid is two columns; "Paid leave" then takes the first slot and the two approval switches the next two. If the layout reads better with the pair side by side, move "Paid leave" below them — a layout choice, not a rule.)

On the card replace

```tsx
                <Rule
                    ok={t.requiresManagerApproval}
                    label={t.requiresManagerApproval ? <strong>Requires manager approval</strong> : <>Auto-approved (no manager review)</>}
                />
```

with

```tsx
                <ApprovalRuleLine type={t} />
```

and add beside the `Rule` component:

```tsx
/** The one-line reading of the two approval switches — see lib/approval-stage.ts. */
function ApprovalRuleLine({ type }: { type: LeaveType }) {
    switch (approvalRule(type)) {
        case 'manager-then-hr':
            return <Rule ok label={<>Requires <strong>manager, then HR</strong> approval</>} />
        case 'hr':
            return <Rule ok label={<strong>Requires HR approval</strong>} />
        case 'manager':
            return <Rule ok label={<strong>Requires manager approval</strong>} />
        default:
            return <Rule ok={false} label={<>Auto-approved (no review)</>} />
    }
}
```

Import `approvalRule` from `'../../lib/approval-stage'`.

- [ ] **Step 4: Run the panel tests**

Run from `client/`: `node_modules/.bin/vitest run src/components/admin/LeaveTypesPanel.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/admin/LeaveTypesPanel.tsx client/src/components/admin/LeaveTypesPanel.test.tsx
git commit -m "Offer Manager and HR approval switches on the leave type dialog

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: The HR stage on every leave surface

**Files:**
- Modify: `client/src/components/annual-leave/TeamLeavePage.tsx`
- Modify: `client/src/components/annual-leave/AllLeaveAdminPage.tsx`
- Modify: `client/src/components/annual-leave/DashboardHome.tsx`
- Modify: `client/src/components/annual-leave/MyLeavePage.tsx`
- Modify: `client/src/components/annual-leave/AnnualLeaveCard.tsx`
- Modify: `client/src/components/annual-leave/AnnualLeaveForm.tsx:160`
- Modify: `client/src/components/layout/Topbar.tsx:139`
- Test: `client/src/components/annual-leave/TeamLeavePage.test.tsx`, `client/src/components/annual-leave/HrDashboard.test.tsx` (append to both)

**Interfaces:**
- Consumes everything from Task 9.

- [ ] **Step 1: Append the failing tests**

`TeamLeavePage.test.tsx` — add after the existing `MANAGER` constant:

```ts
const HR_ADMIN: UserInfo = { ...MANAGER, id: 'u-hr', displayName: 'Helen HR', roles: ['HR Administrator'] } as unknown as UserInfo

function renderPageAs(user: UserInfo) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={client}>
            <TeamLeavePage user={user} />
        </QueryClientProvider>
    )
}
```

and a new `describe` at the end of the file:

```ts
describe('TeamLeavePage approval stages', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        api.getLeaveStatusHistories.mockResolvedValue([])
        api.getLeaveTypes.mockResolvedValue([
            { id: 1, name: 'Annual Leave', requiresManagerApproval: true, requiresHrApproval: true, attachmentPolicy: 'None' },
        ] as never)
    })

    it("labels a manager's Approve as sending the request to HR when the type asks for HR", async () => {
        api.getAnnualLeaves.mockResolvedValue([BASE_LEAVE] as never)
        renderPageAs(MANAGER)

        const row = await screen.findByRole('row', { name: /Maria Ioannou/ })
        expect(within(row).getByRole('button', { name: 'Approve & send to HR' })).toBeInTheDocument()
    })

    it('shows a manager a request that is with HR without Approve or Reject', async () => {
        api.getAnnualLeaves.mockResolvedValue([{ ...BASE_LEAVE, status: 'AwaitingHrApproval' }] as never)
        renderPageAs(MANAGER)

        const row = await screen.findByRole('row', { name: /Maria Ioannou/ })
        expect(within(row).getByText('With HR')).toBeInTheDocument()
        expect(within(row).queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument()
        expect(within(row).queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
    })

    it('lets an HR Administrator approve a request that is with HR', async () => {
        api.getAnnualLeaves.mockResolvedValue([{ ...BASE_LEAVE, status: 'AwaitingHrApproval' }] as never)
        renderPageAs(HR_ADMIN)

        const row = await screen.findByRole('row', { name: /Maria Ioannou/ })
        expect(within(row).getByRole('button', { name: 'Approve' })).toBeEnabled()
    })
})
```

`HrDashboard.test.tsx` — inside `describe('The HR Administrator dashboard', …)` add:

```ts
    it('queues a request that is with HR, with Approve to hand', async () => {
        api.getAnnualLeaves.mockResolvedValue([
            leave({ id: 'l-hr', employeeId: 'u-1', employeeName: 'Maria Ioannou', status: 'AwaitingHrApproval', startDate: iso(5), endDate: iso(5) }),
        ])
        renderAs(HR)
        await screen.findByText('Approval queue')

        expect(screen.getByText('Maria Ioannou · Annual Leave')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
    })
```

- [ ] **Step 2: Run to verify they fail**

Run from `client/`: `node_modules/.bin/vitest run src/components/annual-leave/TeamLeavePage.test.tsx src/components/annual-leave/HrDashboard.test.tsx`
Expected: the four new tests FAIL.

- [ ] **Step 3: TeamLeavePage**

Imports: add `import { approveButtonLabel, approveOutcome, canDecide, isOpenStatus, statusChipLabel } from '../../lib/approval-stage'` and `isHrAdministrator` to the `roles` import.

After `const isManager = user.roles.includes('Manager')` add `const viewer = { isHrAdministrator: isHrAdministrator(user.roles) }`.

`STATUS_COLORS`: add `AwaitingHrApproval: { bg: softBg('info'), color: 'info.dark' },`. In `StatusBadge` render `{statusChipLabel(status as AnnualLeaveStatus)}` instead of `{status}` (import the type if not already).

Tab filter: replace

```ts
            const s = (statusTab.charAt(0).toUpperCase() + statusTab.slice(1)) as AnnualLeaveStatus
            leaves = leaves.filter((l) => l.status === s)
```

with

```ts
            const s = (statusTab.charAt(0).toUpperCase() + statusTab.slice(1)) as AnnualLeaveStatus
            // The Pending tab is every request still waiting on somebody, HR included.
            leaves = leaves.filter((l) => s === 'Pending' ? isOpenStatus(l.status) : l.status === s)
```

`pendingCount`: `allLeaves.filter((l) => isOpenStatus(l.status)).length`.

`overlappingForView`: `(l.status === 'Pending' || l.status === 'Approved')` → `(isOpenStatus(l.status) || l.status === 'Approved')`.

Row: replace `const isPending = leave.status === 'Pending'` with

```ts
                                    const isOpen = isOpenStatus(leave.status)
                                    const decidable = canDecide(leave, viewer)
                                    const approveLabel = approveButtonLabel(approveOutcome(leave, leaveType, viewer))
```

and change `{isPending ? (` to `{isOpen ? (`. Inside that branch, wrap the Approve button, the awaiting-document caption and the Reject button in `{decidable ? (<>…</>) : (<Typography variant="caption" sx={{ alignSelf: 'center', color: 'info.dark', whiteSpace: 'nowrap' }}>With HR</Typography>)}`, leaving the View button outside the wrap. Replace the Approve button's text `'Approve'` with `approveLabel`.

View dialog: change the Approve button's condition to `viewLeave && isOpenStatus(viewLeave.status) && canDecide(viewLeave, viewer)` and its text to `approveButtonLabel(approveOutcome(viewLeave, viewLeave.leaveTypeId != null ? leaveTypeById.get(viewLeave.leaveTypeId) : undefined, viewer))`; change the Reject button's condition to `viewLeave && viewLeave.status !== 'Cancelled' && viewLeave.status !== 'Rejected' && (viewLeave.status !== 'AwaitingHrApproval' || viewer.isHrAdministrator)`.

- [ ] **Step 4: AllLeaveAdminPage**

The page receives `{ user: _user }`; rename to `{ user }` and add `const viewer = { isHrAdministrator: isHrAdministrator(user.roles) }` (import from `'../../lib/roles'`), plus `import { approveButtonLabel, approveOutcome, canDecide, isOpenStatus, statusChipLabel } from '../../lib/approval-stage'`.

- Every `l.status === 'Pending'` in `filtered`, `counts.pending`, `isUrgent`, `pending`/`decided`, `balAfter`, and the overlap/conflict filters `(status === 'Pending' || status === 'Approved')` → use `isOpenStatus(l.status)` (and `isOpenStatus(x.status) || x.status === 'Approved'` for the overlap ones).
- `bulkApprove`: also `continue` when `!canDecide(target, viewer)`.
- `LeaveRow`: add props `viewer: ApprovalViewer` (import the type) and pass `viewer={viewer}` from both call sites. Inside: `const isPending = isOpenStatus(leave.status)`; `const decidable = canDecide(leave, viewer)`; in the actions, wrap the Approve/Reject pair in `decidable ? … : <Box component="span" sx={{ alignSelf: 'center', fontSize: 11, color: 'info.dark', bgcolor: softBg('info'), border: '1px solid', borderColor: 'info.main', borderRadius: '10px', px: '8px', py: '2px' }}>With HR</Box>`; Approve text → `approveButtonLabel(approveOutcome(leave, leaveType, viewer))`; the checkbox `disabled={!isPending}` → `disabled={!decidable}`.
- Status colour at ~line 844: add `: leave.status === 'AwaitingHrApproval' ? 'info.main'` before the `Approved` case; wherever the row prints `leave.status` as text, print `statusChipLabel(leave.status)`.
- `lastHistory` line: `{leave.status === 'Approved' ? '✓' : '✕'}` is only reached when `!isPending`, so it is unchanged.

- [ ] **Step 5: DashboardHome**

Imports: `import { canDecide, isOpenStatus, type ApprovalViewer } from '../../lib/approval-stage'`.

`QueueItem`: add `/** False when the row is with HR and this viewer is not HR — shown, but with no buttons. */ decidable: boolean`.

`buildConflictMap`: `(b.status === 'Pending' || b.status === 'Approved')` → `(isOpenStatus(b.status) || b.status === 'Approved')`.

`buildApprovalQueue`: add a sixth parameter `viewer: ApprovalViewer`; in the leave loop, after `const conflicts = …`, add `const decidable = canDecide(l, viewer); if (!decidable) tags.push({ label: 'With HR', tone: 'info' })`, and set `decidable` on the pushed item; in the timesheet loop set `decidable: true`.

Both `pendingLeaves` memos: `l.status === 'Pending'` → `isOpenStatus(l.status)`. Both `buildApprovalQueue(...)` calls: pass `{ isHrAdministrator: false }` in `ManagerDashboard` and `{ isHrAdministrator: true }` in `HrDashboard` as the last argument (and add nothing to the memo deps — the object is a literal per role).

`ApprovalQueueRow`: wrap the two buttons' `<Box sx={{ display: 'flex', gap: '6px', … }}>` contents in `{item.decidable ? (<>…both buttons…</>) : null}` so a non-decidable row shows only the "With HR" tag. Keep the outer flex box so the grid columns stay aligned.

- [ ] **Step 6: MyLeavePage**

Import `{ isOpenStatus, statusChipLabel }` from `'../../lib/approval-stage'`.

- `filteredLeaves`: `statusFilter === 'All' ? myLeaves : myLeaves.filter((l) => statusFilter === 'Pending' ? isOpenStatus(l.status) : l.status === statusFilter)`.
- `tabCounts`: replace the loop body with `const key = (isOpenStatus(l.status) ? 'Pending' : l.status) as StatusFilter; if (key in c) c[key]++`.
- `pendingLeaves = myLeaves.filter((l) => isOpenStatus(l.status))`; the `l.status !== 'Approved' && l.status !== 'Pending'` continue at ~line 225 → `!== 'Approved' && !isOpenStatus(l.status)`.
- `NextLeave` hero: `const isPending = isOpenStatus(leave.status)`; the Status meta reads `isPending ? (leave.status === 'AwaitingHrApproval' ? 'Awaiting HR approval' : 'Awaiting approval') : 'Confirmed'`.
- `LeaveCard` actions: Edit stays `status === 'Pending'`; Cancel → `isOpenStatus(status)`; View → `!isOpenStatus(status)`. `isUpcoming` → `(isOpenStatus(status) || status === 'Approved') && daysUntil >= 0`; the accent colour chain: add `: status === 'AwaitingHrApproval' ? 'info.main'`.
- `StatusBadge` config: add `AwaitingHrApproval: { bg: softBg('info'), color: 'info.dark', label: statusChipLabel('AwaitingHrApproval') },`.
- `FeedbackBox`: before `if (!feedback?.comment) return null` add

```tsx
    if (status === 'AwaitingHrApproval') {
        return (
            <Box sx={feedbackSx(softBg('info'), 'info.dark', 'info.main')}>
                <Box component="span">✓</Box>
                <Box>Approved by your manager — waiting for HR to review</Box>
            </Box>
        )
    }
```

- [ ] **Step 7: AnnualLeaveCard, AnnualLeaveForm, Topbar**

`AnnualLeaveCard.tsx`: import `{ canDecide, isOpenStatus, statusChipLabel }` and `isHrAdministrator`. `statusColor`: add `case 'AwaitingHrApproval': return 'info'` and widen the return type with `'info'`. `const viewer = { isHrAdministrator: isHrAdministrator(user.roles) }`; `canApproveReject = (isAdmin || isManager) && canDecide(leave, viewer)`; `isLockedStatus` adds `|| leave.status === 'AwaitingHrApproval'`; `lockedStatusMessage` gets a branch `leave.status === 'AwaitingHrApproval' ? 'This request has been approved by your manager and is awaiting HR. Cancel it and file again to change it.'`; `canCancel`'s last clause → `(isOwnLeave && isOpenStatus(leave.status))`; `statusAccentColor` adds an `info.main` branch; the chip `label={leave.status}` → `label={statusChipLabel(leave.status)}`.

`AnnualLeaveForm.tsx:160`: `selectedLeaveType?.requiresManagerApproval === false` → `autoApproves(selectedLeaveType)` (import from `'../../lib/approval-stage'`).

`Topbar.tsx:139`: `l.status === 'Pending'` → `isOpenStatus(l.status)` (import).

- [ ] **Step 8: Type-check, lint, run the affected tests**

Run from `client/`: `npx tsc -b && npm run lint`
Expected: clean.

Run: `node_modules/.bin/vitest run src/components/annual-leave` then `node_modules/.bin/vitest run src/components/layout src/components/admin src/lib`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add client/src
git commit -m "Show the HR approval stage on every leave surface

A manager sees a request that is with HR as 'With HR' with no buttons;
an HR Administrator gets Approve. Awaiting-HR rows count as open on My
Leave, Team Leave, All Leave, the dashboards and the Topbar badge, and
are locked for editing like an approved one.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Documentation and the final check

**Files:**
- Modify: `CLAUDE.md` (insert before the paragraph beginning `**The two limits on the leave type are enforced, in different units.**`, ~line 427)

- [ ] **Step 1: Write the CLAUDE.md section**

Insert:

```markdown
**Approval can take two stages: the manager's, then HR's.** The one "Requires
approval" switch is now two columns on the leave type, `RequiresManagerApproval`
(the renamed old column — migration `SplitLeaveApprovalIntoManagerAndHr` keeps
every value) and `RequiresHrApproval` (new, default off, so nothing changed until
an admin flips one). `Application/AnnualLeaves/Commands/ApprovalStageRule.cs` is
the rule, called from `CreateAnnualLeave`, `UpdateLeaveStatus` and the status path
of `EditAnnualLeave`; `client/src/lib/approval-stage.ts` mirrors it so a page never
offers an Approve the API refuses. Keep the two in step, the same way
`AttachmentPolicyRule` and `attachment-policy.ts` are kept in step.

| Manager | HR | Filed as | Who finishes it |
|---|---|---|---|
| off | off | `Approved` | nobody — filing is approval |
| on | off | `Pending` | a Manager in the department, or an HR Administrator covering it |
| off | on | `AwaitingHrApproval` | an HR Administrator |
| on | on | `Pending` | a Manager's Approve moves it to `AwaitingHrApproval`; an HR Administrator's finishes it |

Six things about it that are deliberate:

- **The client always asks for `Approved`; the server decides the stage.** A
  client-supplied `AwaitingHrApproval` is refused (`StageIsDerivedMessage`). So
  the approve buttons on Team Leave, All Leave and both dashboards are one button
  whose *label* changes ("Approve & send to HR", from `approveOutcome`), not two.
- **An HR Administrator stands in for the manager.** Their Approve from `Pending`
  finishes a request in one step even when the type asks for HR: they are the HR
  sign-off. A Manager cannot approve, reject or cancel a request that is with HR
  (`AwaitingHrMessage`); they had their say at stage one. `IsAdmin` on the two
  status commands already means "the caller is an HR Administrator", scoped by
  the same `ManagerAccessScopeResolver` test as a Manager, and that flag is what
  the rule reads.
- **Balance, per-child ledger, coverage announcement, `ApprovedAt`/`ApprovedById`
  move only into `Approved`.** `AwaitingHrApproval` charges nothing and tells the
  delegate nothing. The attachment policy runs on *both* steps out of `Pending`,
  so a manager cannot pass an undocumented request along.
- **`AwaitingHrApproval` is open like `Pending`** — for the overlap checks in both
  leave validators, the employee's Cancel (`DeleteAnnualLeave`), the
  pending-approvals reminder, the Topbar badge, the queues and the Pending tabs
  (`isOpenStatus`) — **but locked for editing like `Approved`.** A manager
  approved specific dates; an edit that kept the stage would put different dates
  in front of HR under the manager's name. Only an HR Administrator in scope
  (`actsAsAdmin`) may edit it; everyone else is told to cancel and file again.
- **Who is told.** `HrApprovalRecipients` (beside `ManagerNotificationRecipients`)
  is the HR Administrators whose `UserDepartment` rows cover the leave's
  department, or every active one for a department-less leave, and
  `HrApprovalNotification` mails them with the reason and the coverage line when
  a request reaches the HR stage — on filing for an HR-only type, on the manager's
  approval otherwise. The employee's status email for that step reads "approved
  by {manager} and is awaiting HR approval". A department with no HR
  Administrator assigned leaves an HR-stage request stuck, the same way a
  department with no manager leaves a `Pending` one.
- **Changing the switches sweeps what is in flight** (`UpdateLeaveType`): every
  switch off approves every open row, balance-checked; HR off approves the rows
  with HR, whose manager stage is done; Manager off while HR stays on moves
  `Pending` rows to HR. Switching anything *on* moves nothing. As with the old
  auto-approval sweep, nothing is emailed.

The enum value is appended (`AwaitingHrApproval = 4`) so stored values keep their
meaning, and the card's Enabled toggle sends both flags (see the trap at the end
of this section). No seeded type turns HR approval on.
```

Also update the `LeaveType` row of the domain table where it lists columns, adding at the end: "`RequiresManagerApproval` / `RequiresHrApproval` are the two approval stages — see [Approval can take two stages](#domain-model-summary) below the table."

- [ ] **Step 2: Run everything once more**

Run: `dotnet test Tests/WorkTrack.Tests` — Expected: all PASS.
Run from `client/`: `npx tsc -b && npm run lint`, then `node_modules/.bin/vitest run src/lib`, `node_modules/.bin/vitest run src/components/annual-leave`, `node_modules/.bin/vitest run src/components/admin`, `node_modules/.bin/vitest run src/components/layout` — Expected: all PASS.

- [ ] **Step 3: Apply the migration locally and smoke it (optional but recommended)**

If SQL Server is up: `dotnet ef database update --project Persistence --startup-project API`, then `dotnet run --project API` and `npm run dev`, sign in as the seeded System Administrator, open Leave Types → Edit and confirm the two switches; sign in as `hradmin@annualleave.com` (demo seed) and confirm the dashboard renders. Restart the API after backend changes — Vite hot-reloads, the API does not.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Document the two-stage leave approval

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
