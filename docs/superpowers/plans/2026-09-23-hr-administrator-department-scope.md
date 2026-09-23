# HR Administrator Department Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A System Administrator assigns one or more departments to an HR Administrator, and that HR Administrator sees and acts on only those departments everywhere HR reaches.

**Architecture:** The department set is stored as `UserDepartment` rows (an existing join table). `ManagerAccessScopeResolver` unions those rows into `ManagedDepartmentIds`, so every handler that already scopes a Manager scopes an HR Administrator the same way. Controllers stop treating the HR Administrator as unscoped: the "sees everything" flag becomes System Administrator only, and the "scoped" flag becomes Manager-or-HR. Four company-wide queries gain an opt-in caller scope. The client adds a departments multi-select to both user dialogs and a fourth call to the edit mutation.

**Tech Stack:** ASP.NET Core 10, EF Core, MediatR, FluentValidation, xUnit (EF in-memory `TestDb`, SQLite `TransactionalTestDb`), React 19 + MUI 7 + TanStack Query, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-23-hr-administrator-department-scope-design.md`

## Global Constraints

- No schema migration: `UserDepartment`, its `DbSet` and its `Restrict` foreign keys already exist (`Persistence/AppDbContext.cs:229-235`).
- An HR Administrator must have **at least one** department; every other role must have **none** through these endpoints. Messages live in one place (`Application/Core/HrDepartmentScopeRules.cs`, Task 4).
- An HR Administrator still has no department, gender, employment start date or coverage of their own. Nothing in this plan touches those rules.
- Collections compared inside EF lambdas must be typed `List<T>` or `IReadOnlyList<T>`, never `T[]` (C# 14 `ReadOnlySpan` overload trap; see `AppRoles.Administrators`).
- Backend tests: run with `dotnet test Tests/WorkTrack.Tests --artifacts-path C:\Users\user\AppData\Local\Temp\claude\c--Practice-Own-2026-WorkTrack\60c552ef-fb32-4ae0-8166-b5101d71ad5d\scratchpad\artifacts --filter "FullyQualifiedName~<TestClass>"` from the solution root. If the testhost crashes with a W^X error, prefix with `DOTNET_EnableWriteXorExecute=0`.
- Client tests: run with `client/node_modules/.bin/vitest run <path>` from `client/`, never bare `npx vitest`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Mirror wording: role description copy and validation messages are given verbatim in the tasks; do not paraphrase them.

---

## File Structure

**Backend, new**
- `Application/Core/HrDepartmentScopeRules.cs` — the messages and normaliser for the department set (one rule, shared by create, assign and role change).
- `Application/AdminUsers/DTOs/AdminSetUserDepartmentsDto.cs` — `{ departmentIds }` payload.
- `Application/AdminUsers/Commands/SetAdminUserDepartments.cs` — full-replace command.
- `Application/AdminUsers/Validators/SetAdminUserDepartmentsValidator.cs`.
- `Tests/WorkTrack.Tests/HrDepartmentScopeRoleTests.cs` — the two new `ClaimsPrincipal` helpers.
- `Tests/WorkTrack.Tests/HrDepartmentAssignmentTests.cs` — create/assign validators and command, role-change lifecycle.
- `Tests/WorkTrack.Tests/HrAdministratorScopeTests.cs` — an HR Administrator in and out of scope across leave, timesheets, attendance, people, files.
- `Tests/WorkTrack.Tests/HrAdministratorNotificationScopeTests.cs` — hub groups and digests.

**Backend, modified**
- `Domain/AppRoles.cs` — `IsSystemAdministrator`, `IsDepartmentScoped`, doc.
- `Application/Core/ManagerAccessScope.cs` — union `UserDepartment` rows.
- `Application/AdminUsers/Commands/SetAdminUserRoles.cs`, `CreateAdminUser.cs`, `Validators/CreateAdminUserValidator.cs`, `DTOs/AdminCreateUserDto.cs`, `DTOs/AdminUserDto.cs`, `Support/AdminUserMapper.cs`, `Queries/GetAdminUserList.cs`, `Queries/GetAdminUserDetail.cs`.
- `API/Controllers/AdminUsersController.cs` — new `PUT {id}/departments`, caller scope on the reads.
- `Persistence/DbInitializer.cs` — cleanup keeps HR rows; demo HR gets every department.
- `Application/Departments/Commands/DeleteDepartment.cs` — blocker wording.
- Leave: `API/Controllers/AnnualLeavesController.cs`, `Application/AnnualLeaves/Commands/UpdateLeaveStatus.cs`, `EditAnnualLeave.cs`, `DeleteAnnualLeave.cs`, `CreateAnnualLeave.cs`.
- Timesheets: `API/Controllers/TimesheetsController.cs`, `TimesheetEntriesController.cs`, `TimesheetStatusHistoriesController.cs`, `Application/Timesheets/Commands/SubmitTimesheet.cs`.
- Attendance: `API/Controllers/AttendanceController.cs`, `Application/Attendance/Queries/GetTeamAttendanceHistory.cs`, `GetCompanyAttendance.cs`, `GetUserPresence.cs`.
- People: `API/Controllers/EmployeeProfilesController.cs`, `ChildrenController.cs`, `FilesController.cs`, `ProjectsController.cs`, `LeaveStatusHistoriesController.cs`, `Application/EmployeeProfiles/Queries/GetTeammateList.cs`.
- `API/Hubs/NotificationsHub.cs`, `Application/Reminders/ReminderDispatcher.cs`.
- `API/DTOs/CurrentUserPayload.cs`, `API/Controllers/AccountController.cs`.
- Tests touched: `NonManagerUserDepartmentTests.cs`, `ManagerScopeAuthorizationTests.cs`, `SystemAdministrationSurfaceTests.cs`, `CurrentUserPayloadTests.cs`, `AdminUserJsonContractTests.cs`.

**Client**
- `client/src/lib/types/admin-user.ts`, `client/src/lib/types/user.ts`, `client/src/lib/api/admin-users.ts`, `client/src/lib/validation/person.ts`, `client/src/lib/roles.ts` (doc only).
- `client/src/components/admin/AdminUsersPanel.tsx` (+ `.test.tsx`), `client/src/lib/validation/person.test.ts`.

**Docs:** `CLAUDE.md`.

---

### Task 1: Two new role helpers on `AppRoles`

**Files:**
- Modify: `Domain/AppRoles.cs`
- Test: `Tests/WorkTrack.Tests/HrDepartmentScopeRoleTests.cs` (create)

**Interfaces:**
- Produces: `AppRoles.IsSystemAdministrator(this ClaimsPrincipal user) : bool` — the unscoped reach, System Administrator alone. `AppRoles.IsDepartmentScoped(this ClaimsPrincipal user) : bool` — Manager or HR Administrator, the two roles whose reach is a set of departments. `AppRoles.DepartmentScopedRoles : IReadOnlyList<string>` = `[Manager, HrAdministrator]`. Every later controller task uses the first two.

- [ ] **Step 1: Write the failing test**

```csharp
// Tests/WorkTrack.Tests/HrDepartmentScopeRoleTests.cs
using System.Security.Claims;
using Domain;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// An HR Administrator's reach is no longer every department but the ones assigned
/// to them, so a controller now asks two questions that used to be one:
/// <c>IsSystemAdministrator</c> (unscoped) and <c>IsDepartmentScoped</c> (a Manager or
/// an HR Administrator, whose reach is a department set). <c>IsAdministrator</c>
/// keeps its meaning — may open the company-wide pages, carries the administrator
/// rules — and is not what a data filter should read any more.
/// </summary>
public class HrDepartmentScopeRoleTests
{
    private static ClaimsPrincipal With(string role) =>
        new(new ClaimsIdentity([new Claim(ClaimTypes.Role, role)], "test"));

    [Theory]
    [InlineData(AppRoles.SystemAdministrator, true)]
    [InlineData(AppRoles.HrAdministrator, false)]
    [InlineData(AppRoles.Manager, false)]
    [InlineData(AppRoles.Employee, false)]
    public void Only_the_System_Administrator_is_unscoped(string role, bool expected)
    {
        Assert.Equal(expected, With(role).IsSystemAdministrator());
    }

    [Theory]
    [InlineData(AppRoles.SystemAdministrator, false)]
    [InlineData(AppRoles.HrAdministrator, true)]
    [InlineData(AppRoles.Manager, true)]
    [InlineData(AppRoles.Employee, false)]
    public void A_Manager_and_an_HR_Administrator_are_department_scoped(string role, bool expected)
    {
        Assert.Equal(expected, With(role).IsDepartmentScoped());
    }

    [Fact]
    public void The_scoped_roles_list_names_exactly_the_two()
    {
        Assert.Equal(new[] { AppRoles.Manager, AppRoles.HrAdministrator }, AppRoles.DepartmentScopedRoles);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test Tests/WorkTrack.Tests --artifacts-path <scratchpad>/artifacts --filter "FullyQualifiedName~HrDepartmentScopeRoleTests"`
Expected: build error `'ClaimsPrincipal' does not contain a definition for 'IsSystemAdministrator'`.

- [ ] **Step 3: Add the helpers**

In `Domain/AppRoles.cs`, replace the `<summary>` on `HrAdministrator` (lines 11-29) so its first paragraph reads:

```csharp
    /// <summary>
    /// The administrator's <b>reach</b> without the administrator's <b>hand on the
    /// configuration</b> — and, since department scope arrived, a reach bounded by the
    /// departments a System Administrator assigns them (<c>UserDepartment</c> rows).
    /// Within those departments an HR Administrator runs Leave Management, Attendance
    /// and Timesheets and files leave on somebody's behalf; they carry the same
    /// role-scoped rules as a System Administrator (no department, gender or employment
    /// start date of their own, no coverage on their own leave, excluded from
    /// attendance). What they cannot touch is system administration: Users, Departments,
    /// Projects and their catalogues, Leave Types, Organization, Notification Settings
    /// and Data Maintenance.
    ///
    /// So there are three questions, and a gate has to ask the right one:
    /// <list type="bullet">
    ///   <item><b>May open the company-wide pages</b> — <see cref="Administrators"/> /
    ///   <see cref="AdministratorRoles"/> / <see cref="IsAdministrator(string?)"/>. Both roles.
    ///   Authorization only; never a data filter.</item>
    ///   <item><b>Unscoped data</b> — <see cref="IsSystemAdministrator"/>. That role alone.
    ///   <b>Scoped data</b> — <see cref="IsDepartmentScoped"/>, a Manager or an HR
    ///   Administrator, resolved through <c>ManagerAccessScopeResolver</c>.</item>
    ///   <item><b>System administration</b> — <see cref="SystemAdministrator"/> by name,
    ///   on the configuration controllers' write actions and the <c>EmployeeProfileUpdate</c>
    ///   policy. That role alone.</item>
    /// </list>
    /// </summary>
```

Replace the `<summary>` on `Administrators` (lines 34-40) first sentence with: `/// The two administrator roles — who may open the company-wide pages and who carries the administrator rules. Not a data-scope: an HR Administrator's data is bounded by their assigned departments. Query with`. Keep the rest of that comment (the `Contains`/`ReadOnlySpan` warning) unchanged.

Then add after `IsAdministrator(this ClaimsPrincipal user)` (end of class):

```csharp
    /// <summary>
    /// The roles whose reach is a set of departments rather than the whole company:
    /// a Manager (their own department) and an HR Administrator (the departments
    /// assigned to them). Both resolve through <c>ManagerAccessScopeResolver</c>.
    /// Typed as a list for the same EF reason as <see cref="Administrators"/>.
    /// </summary>
    public static readonly IReadOnlyList<string> DepartmentScopedRoles = new[] { Manager, HrAdministrator };

    /// <summary>
    /// Whether the signed-in principal sees every department unfiltered. System
    /// Administrator alone — this is what a query's <c>IsAdmin</c> flag now means.
    /// </summary>
    public static bool IsSystemAdministrator(this ClaimsPrincipal user) => user.IsInRole(SystemAdministrator);

    /// <summary>
    /// Whether the signed-in principal's reach is a department set — a Manager or an
    /// HR Administrator. This is what a query's <c>IsManager</c> flag now means.
    /// </summary>
    public static bool IsDepartmentScoped(this ClaimsPrincipal user) => DepartmentScopedRoles.Any(user.IsInRole);
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command. Expected: 9 passing.

- [ ] **Step 5: Commit**

```bash
git add Domain/AppRoles.cs Tests/WorkTrack.Tests/HrDepartmentScopeRoleTests.cs
git commit -m "Add IsSystemAdministrator and IsDepartmentScoped, the two questions a scoped gate asks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The resolver unions `UserDepartment` rows

**Files:**
- Modify: `Application/Core/ManagerAccessScope.cs`
- Test: `Tests/WorkTrack.Tests/ManagerScopeAuthorizationTests.cs`

**Interfaces:**
- Produces: unchanged signature `ManagerAccessScopeResolver.ResolveAsync(AppDbContext, string userId, CancellationToken) : Task<ManagerAccessScope>`. `ManagedDepartmentIds` now also contains every `UserDepartment.DepartmentId` for `userId`.

- [ ] **Step 1: Write the failing test**

Add to `ManagerScopeAuthorizationTests`, after `Resolver_scopes_to_own_department_and_direct_reports_only`:

```csharp
    /// <summary>
    /// An HR Administrator has a department-less profile and their scope lives
    /// entirely in UserDepartment rows; a Manager may hold extra rows too. Both are
    /// part of ManagedDepartmentIds, so every consumer of the resolver scopes them
    /// without knowing which role it is looking at.
    /// </summary>
    [Fact]
    public async Task Resolver_adds_assigned_departments_from_UserDepartment_rows()
    {
        using var db = TestDb.Create();
        db.EmployeeProfiles.Add(new EmployeeProfile { Id = "hr-p", UserId = "hr", DepartmentId = null });
        db.UserDepartments.Add(new UserDepartment { UserId = "hr", DepartmentId = 3 });
        db.UserDepartments.Add(new UserDepartment { UserId = "hr", DepartmentId = 5 });
        // Somebody else's row must not leak in.
        db.UserDepartments.Add(new UserDepartment { UserId = "other", DepartmentId = 9 });
        await db.SaveChangesAsync();

        var scope = await ManagerAccessScopeResolver.ResolveAsync(db, "hr", CancellationToken.None);

        Assert.Equal(new[] { 3, 5 }, scope.ManagedDepartmentIds.OrderBy(id => id));
        Assert.Empty(scope.DirectReportUserIds);
    }

    [Fact]
    public async Task Resolver_does_not_duplicate_a_department_held_both_ways()
    {
        using var db = TestDb.Create();
        SeedManager(db);
        db.UserDepartments.Add(new UserDepartment { UserId = ManagerUserId, DepartmentId = 1 });
        await db.SaveChangesAsync();

        var scope = await ManagerAccessScopeResolver.ResolveAsync(db, ManagerUserId, CancellationToken.None);

        Assert.Equal(new[] { 1 }, scope.ManagedDepartmentIds);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test ... --filter "FullyQualifiedName~ManagerScopeAuthorizationTests.Resolver_adds_assigned"`
Expected: FAIL, `ManagedDepartmentIds` empty.

- [ ] **Step 3: Implement**

In `Application/Core/ManagerAccessScope.cs`, replace the block from `// Only include the department(s)...` through the `managedDepartmentIds` assignment with:

```csharp
        // The caller's own profile department, plus every department assigned to
        // them through UserDepartment. For a Manager the rows are extra departments
        // they cover; for an HR Administrator — whose profile has no department —
        // they are the whole scope. One list either way, so no consumer has to know
        // which role it is scoping.
        var managerProfiles = await context.EmployeeProfiles
            .Where(ep => ep.UserId == userId)
            .Select(ep => new { ep.Id, ep.DepartmentId })
            .ToListAsync(cancellationToken);

        var assignedDepartmentIds = await context.UserDepartments
            .Where(ud => ud.UserId == userId)
            .Select(ud => ud.DepartmentId)
            .ToListAsync(cancellationToken);

        // A department-less profile (an administrator's) contributes nothing on its
        // own. Dropping the nulls keeps ManagedDepartmentIds a list of real
        // departments, so every consumer can compare against it without a cast.
        var managedDepartmentIds = managerProfiles
            .Where(profile => profile.DepartmentId.HasValue)
            .Select(profile => profile.DepartmentId!.Value)
            .Concat(assignedDepartmentIds)
            .Distinct()
            .ToList();
```

Also change the class-level doc: add above `public sealed class ManagerAccessScope`:

```csharp
/// <summary>
/// What a department-scoped caller — a Manager or an HR Administrator — may reach:
/// the departments on their own profile and assigned to them, the profiles they
/// manage, and their direct reports. The name predates the HR Administrator; the
/// shape did not need to change for them.
/// </summary>
```

- [ ] **Step 4: Run all of `ManagerScopeAuthorizationTests`**

Expected: all pass, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add Application/Core/ManagerAccessScope.cs Tests/WorkTrack.Tests/ManagerScopeAuthorizationTests.cs
git commit -m "Resolve a caller's assigned UserDepartment rows into their managed departments

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `UserDepartment` rows survive for an HR Administrator

**Files:**
- Modify: `Application/AdminUsers/Commands/SetAdminUserRoles.cs:63-80`
- Modify: `Persistence/DbInitializer.cs` (`SeedUserDepartments`, `RemoveNonManagerUserDepartments`, the call at line 88 and the comment at 101-106)
- Modify: `Application/Departments/Commands/DeleteDepartment.cs:45-46` and the blocker line
- Modify: `Domain/UserDepartment.cs` (doc)
- Test: `Tests/WorkTrack.Tests/NonManagerUserDepartmentTests.cs`

**Interfaces:**
- Produces: `DbInitializer.RemoveUnscopedUserDepartments` (renamed). Rows are kept for any user holding a role in `AppRoles.DepartmentScopedRoles`.

- [ ] **Step 1: Write the failing tests**

In `NonManagerUserDepartmentTests`, add after `Seeding_keeps_a_managers_department_assignment`:

```csharp
    /// <summary>
    /// An HR Administrator's rows are their entire scope, so the startup cleanup has
    /// to keep them exactly as it keeps a manager's.
    /// </summary>
    [Fact]
    public async Task Seeding_keeps_an_HR_Administrators_department_assignment()
    {
        var hr = await GivenUserAsync("hr.real@worktrack.local", AppRoles.HrAdministrator);
        var finance = await GivenDepartmentAsync("Finance", "FIN");
        await GivenAssignmentAsync(hr.Id, finance);

        await SeedAsync(SeedPolicy.For("Production", demoData: false, allowInProduction: false));

        var assignment = Assert.Single(await Db.UserDepartments.ToListAsync());
        Assert.Equal(hr.Id, assignment.UserId);
    }

    /// <summary>The demo HR account is scoped to every seeded department, so the seeded database saves and sees everything the old one did.</summary>
    [Fact]
    public async Task A_demo_seed_assigns_the_HR_Administrator_every_department()
    {
        await SeedAsync(SeedPolicy.Unrestricted(demoData: true));

        var hr = await Users.FindByEmailAsync(DbInitializer.HrAdministratorDemoEmail);
        Assert.NotNull(hr);
        var assigned = await Db.UserDepartments.Where(ud => ud.UserId == hr!.Id).Select(ud => ud.DepartmentId).ToListAsync();
        var all = await Db.Departments.Select(d => d.Id).ToListAsync();
        Assert.Equal(all.OrderBy(id => id), assigned.OrderBy(id => id));
    }

    [Fact]
    public async Task Moving_a_manager_to_HR_Administrator_keeps_their_department_assignments()
    {
        var manager = await GivenUserAsync(ManagerEmail, AppRoles.Manager);
        Assert.True((await Roles.CreateAsync(new Role { Name = AppRoles.HrAdministrator })).Succeeded);
        var hr = await GivenDepartmentAsync("Human Resources", "HR");
        await GivenAssignmentAsync(manager.Id, hr);

        var result = await SetRole(manager.Id, AppRoles.HrAdministrator);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Single(await Db.UserDepartments.ToListAsync());
    }

    [Fact]
    public async Task Promoting_an_HR_Administrator_to_System_Administrator_clears_their_department_assignments()
    {
        var hr = await GivenUserAsync("hr.real@worktrack.local", AppRoles.HrAdministrator);
        Assert.True((await Roles.CreateAsync(new Role { Name = AppRoles.SystemAdministrator })).Succeeded);
        var finance = await GivenDepartmentAsync("Finance", "FIN");
        await GivenAssignmentAsync(hr.Id, finance);

        var result = await SetRole(hr.Id, AppRoles.SystemAdministrator);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Empty(await Db.UserDepartments.ToListAsync());
    }
```

Also change the existing `A_demo_seed_writes_assignments_only_for_managers` assertion to accept either scoped role:

```csharp
            Assert.True(
                await Users.IsInRoleAsync(user!, AppRoles.Manager) || await Users.IsInRoleAsync(user!, AppRoles.HrAdministrator),
                $"{user!.Email} holds a department assignment without a department-scoped role.");
```

and rename it `A_demo_seed_writes_assignments_only_for_department_scoped_roles`.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `dotnet test ... --filter "FullyQualifiedName~NonManagerUserDepartmentTests"`
Expected: the four new tests FAIL (rows deleted / HR has no rows); existing ones pass.

- [ ] **Step 3: `SetAdminUserRoles` keeps rows for a scoped role**

Replace the comment and condition at `SetAdminUserRoles.cs:63-69` with:

```csharp
            // A UserDepartment row is a department this person covers beyond their
            // own profile: an extra one for a Manager, the whole scope for an HR
            // Administrator. Nothing reads it for anyone else, while DeleteDepartment
            // still counts it as a blocker and no endpoint but this feature's clears
            // it. So the rows go with the role that gave them meaning — a promotion to
            // System Administrator clears the set, the way it clears the department,
            // gender and start date.
            if (!roles.Any(role => AppRoles.DepartmentScopedRoles.Contains(role, StringComparer.OrdinalIgnoreCase)))
```

- [ ] **Step 4: Seeder — keep scoped rows, give the demo HR every department**

In `Persistence/DbInitializer.cs`:

(a) Rename `RemoveNonManagerUserDepartments` to `RemoveUnscopedUserDepartments` (definition and the call at line 88). Replace its body with:

```csharp
    private static async Task RemoveUnscopedUserDepartments(AppDbContext context)
    {
        // SeedRoles has already run, so this is only empty on a database whose roles
        // failed to seed — in which case nobody is scoped and every row is stale.
        var scopedRoleIds = await context.Roles
            .Where(r => AppRoles.DepartmentScopedRoles.Contains(r.Name!))
            .Select(r => r.Id)
            .ToListAsync();

        var stale = scopedRoleIds.Count == 0
            ? await context.UserDepartments.ToListAsync()
            : await context.UserDepartments
                .Where(ud => !context.UserRoles
                    .Any(ur => ur.UserId == ud.UserId && scopedRoleIds.Contains(ur.RoleId)))
                .ToListAsync();

        if (stale.Count == 0) return;

        context.UserDepartments.RemoveRange(stale);
        await context.SaveChangesAsync();
    }
```

Update its `<summary>`: first sentence becomes `Deletes <see cref="UserDepartment"/> rows whose user holds neither the Manager nor the HR Administrator role.` and the last paragraph's "demoted through SetAdminUserRoles before that command learned to clear their rows" stays.

(b) In `SeedUserDepartments`, after `Assign("manager1@annualleave.com", engineering.Id);` add:

```csharp
        // The demo HR Administrator is scoped to every seeded department: at least
        // one is required to save the account, and "all of them" is what the demo
        // showed before scope existed.
        var hrAdmin = context.Users.FirstOrDefault(u => u.Email == HrAdministratorDemoEmail);
        if (hrAdmin is not null)
        {
            foreach (var department in context.Departments.ToList())
            {
                Assign(HrAdministratorDemoEmail, department.Id);
            }
        }
```

Rewrite its `<summary>` first paragraph to: `A <see cref="UserDepartment"/> row means one thing: a department this person covers beyond their own profile — an extra one for a <b>Manager</b>, the whole scope for an <b>HR Administrator</b> (whose profile has none). <c>ManagerAccessScopeResolver</c> reads it for both; nothing reads it for a System Administrator or an Employee.` Keep the history paragraph about the admin's ENG row. Change the sentence `Only managers get rows now` to `Only department-scoped roles get rows now`.

(c) In the comment at lines 101-106, change `since a department assignment is meaningful only for a manager` to `since a department assignment is meaningful only for a Manager or an HR Administrator`.

- [ ] **Step 5: `DeleteDepartment` blocker wording**

At `DeleteDepartment.cs:45-46` rename `managerCount` to `assignedCount` and change the blocker line to `if (assignedCount > 0) blockers.Add(Count(assignedCount, "person assigned to it"));`. Check `Count(...)` pluralises by appending "s" — if it does, use `"assigned person"` instead so the plural reads "assigned persons"? No: read the `Count` helper in that file and pick the noun whose plural it produces correctly; if it appends "s", use `"assignment"` (→ "assignments"). Update `Tests/WorkTrack.Tests/DeleteDepartmentBlockerTests.cs` if it asserts on the "assigned manager" text (grep for it) to the new noun.

- [ ] **Step 6: `Domain/UserDepartment.cs` doc**

Add above the class:

```csharp
/// <summary>
/// A department this user covers beyond the one on their profile. For a Manager an
/// extra department; for an HR Administrator — whose profile has no department —
/// the whole of their scope. Read by <c>ManagerAccessScopeResolver</c> for both.
/// Rows are written by <c>CreateAdminUser</c> and <c>SetAdminUserDepartments</c>,
/// and cleared when the user leaves those two roles (<c>SetAdminUserRoles</c>).
/// </summary>
```

- [ ] **Step 7: Run `NonManagerUserDepartmentTests`, `DeleteDepartmentBlockerTests`, `SeedPolicyTests`, `AdminHasNoDepartmentTests`**

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add Application/AdminUsers/Commands/SetAdminUserRoles.cs Persistence/DbInitializer.cs Application/Departments/Commands/DeleteDepartment.cs Domain/UserDepartment.cs Tests/WorkTrack.Tests/NonManagerUserDepartmentTests.cs Tests/WorkTrack.Tests/DeleteDepartmentBlockerTests.cs
git commit -m "Keep UserDepartment rows for an HR Administrator, and seed the demo one with every department

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The department-set rule, the assign endpoint, and `DepartmentIds` on the user DTO

**Files:**
- Create: `Application/Core/HrDepartmentScopeRules.cs`
- Create: `Application/AdminUsers/DTOs/AdminSetUserDepartmentsDto.cs`
- Create: `Application/AdminUsers/Commands/SetAdminUserDepartments.cs`
- Create: `Application/AdminUsers/Validators/SetAdminUserDepartmentsValidator.cs`
- Modify: `Application/AdminUsers/DTOs/AdminUserDto.cs`, `Application/AdminUsers/Support/AdminUserMapper.cs`
- Modify: `API/Controllers/AdminUsersController.cs`
- Test: `Tests/WorkTrack.Tests/HrDepartmentAssignmentTests.cs` (create), `Tests/WorkTrack.Tests/SystemAdministrationSurfaceTests.cs`

**Interfaces:**
- Produces:
  - `HrDepartmentScopeRules.DepartmentsRequiredMessage`, `DepartmentsNotForRoleMessage`, `UnknownDepartmentMessage : string`; `HrDepartmentScopeRules.Normalize(IEnumerable<int>? ids) : List<int>`; `HrDepartmentScopeRules.AllActiveAsync(AppDbContext, IReadOnlyCollection<int>, CancellationToken) : Task<bool>`.
  - `AdminSetUserDepartmentsDto { List<int> DepartmentIds }`.
  - `SetAdminUserDepartments.Command { string Id; AdminSetUserDepartmentsDto Departments; string RequestingUserId }` → `Result<AdminUserDto>`.
  - `AdminUserDto.DepartmentIds : List<int>` (empty for everyone but an HR Administrator or a Manager with rows).
  - `AdminUserMapper.ToDto(User, IEnumerable<string> roles, IEnumerable<int>? departmentIds = null)`.
  - `PUT /api/adminusers/{id}/departments`, System Administrator only.

- [ ] **Step 1: Write the failing tests**

```csharp
// Tests/WorkTrack.Tests/HrDepartmentAssignmentTests.cs
using Application.AdminUsers.Commands;
using Application.AdminUsers.DTOs;
using Application.AdminUsers.Validators;
using Application.Core;
using Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// An HR Administrator is assigned the departments they run, as UserDepartment rows.
/// The rule follows DepartmentId's shape: required (at least one) for an HR
/// Administrator, refused for every other role — a System Administrator sees
/// everything, an Employee and a Manager already have a department, and a Manager's
/// extra rows are not this feature's to edit.
/// </summary>
public class HrDepartmentAssignmentTests : IDisposable
{
    private readonly ServiceProvider _services;

    public HrDepartmentAssignmentTests()
    {
        var collection = new ServiceCollection();
        collection.AddLogging(b => b.SetMinimumLevel(LogLevel.Warning));
        collection.AddDbContext<AppDbContext>(options => options
            .UseInMemoryDatabase($"hr-departments-{Guid.NewGuid()}")
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        collection.AddIdentityCore<User>(options => options.User.RequireUniqueEmail = true)
            .AddRoles<Role>()
            .AddEntityFrameworkStores<AppDbContext>();
        _services = collection.BuildServiceProvider();
    }

    public void Dispose() => _services.Dispose();

    private AppDbContext Db => _services.GetRequiredService<AppDbContext>();
    private UserManager<User> Users => _services.GetRequiredService<UserManager<User>>();
    private RoleManager<Role> Roles => _services.GetRequiredService<RoleManager<Role>>();

    private const int Engineering = 1;
    private const int Finance = 2;
    private const int Archived = 3;

    private async Task SeedAsync()
    {
        Db.Departments.AddRange(
            new Department { Id = Engineering, Name = "Engineering", Code = "ENG", IsActive = true },
            new Department { Id = Finance, Name = "Finance", Code = "FIN", IsActive = true },
            new Department { Id = Archived, Name = "Old", Code = "OLD", IsActive = false });
        await Db.SaveChangesAsync();
        foreach (var role in AppRoles.All) await Roles.CreateAsync(new Role { Name = role });
        Db.ChangeTracker.Clear();
    }

    private async Task<User> GivenUserAsync(string email, string role)
    {
        var user = new User { UserName = email, Email = email, DisplayName = email, EmailConfirmed = true };
        Assert.True((await Users.CreateAsync(user)).Succeeded);
        Assert.True((await Users.AddToRoleAsync(user, role)).Succeeded);
        return user;
    }

    private Task<FluentValidation.Results.ValidationResult> ValidateAssign(string userId, params int[] ids) =>
        new SetAdminUserDepartmentsValidator(Db).ValidateAsync(new SetAdminUserDepartments.Command
        {
            Id = userId,
            Departments = new AdminSetUserDepartmentsDto { DepartmentIds = ids.ToList() },
            RequestingUserId = "sysadmin",
        });

    private Task<Result<AdminUserDto>> Assign(string userId, params int[] ids) =>
        new SetAdminUserDepartments.Handler(Users, Db).Handle(new SetAdminUserDepartments.Command
        {
            Id = userId,
            Departments = new AdminSetUserDepartmentsDto { DepartmentIds = ids.ToList() },
            RequestingUserId = "sysadmin",
        }, CancellationToken.None);

    [Fact]
    public async Task Assigning_no_department_is_refused()
    {
        await SeedAsync();
        var hr = await GivenUserAsync("hr@test.local", AppRoles.HrAdministrator);

        var result = await ValidateAssign(hr.Id);

        Assert.Contains(result.Errors, e => e.ErrorMessage == HrDepartmentScopeRules.DepartmentsRequiredMessage);
    }

    [Fact]
    public async Task Assigning_an_unknown_or_inactive_department_is_refused()
    {
        await SeedAsync();
        var hr = await GivenUserAsync("hr@test.local", AppRoles.HrAdministrator);

        Assert.Contains((await ValidateAssign(hr.Id, Engineering, 999)).Errors,
            e => e.ErrorMessage == HrDepartmentScopeRules.UnknownDepartmentMessage);
        Assert.Contains((await ValidateAssign(hr.Id, Archived)).Errors,
            e => e.ErrorMessage == HrDepartmentScopeRules.UnknownDepartmentMessage);
    }

    [Fact]
    public async Task Assigning_replaces_the_set_and_records_who_did_it()
    {
        await SeedAsync();
        var hr = await GivenUserAsync("hr@test.local", AppRoles.HrAdministrator);
        Db.UserDepartments.Add(new UserDepartment { UserId = hr.Id, DepartmentId = Finance });
        await Db.SaveChangesAsync();

        var result = await Assign(hr.Id, Engineering, Engineering);

        Assert.True(result.IsSuccess, result.Error);
        var rows = await Db.UserDepartments.Where(ud => ud.UserId == hr.Id).ToListAsync();
        var row = Assert.Single(rows);
        Assert.Equal(Engineering, row.DepartmentId);
        Assert.Equal("sysadmin", row.AssignedByUserId);
        Assert.Equal([Engineering], result.Value!.DepartmentIds);
    }

    [Theory]
    [InlineData(AppRoles.SystemAdministrator)]
    [InlineData(AppRoles.Manager)]
    [InlineData(AppRoles.Employee)]
    public async Task Assigning_departments_to_any_other_role_is_refused(string role)
    {
        await SeedAsync();
        var user = await GivenUserAsync("someone@test.local", role);

        var result = await Assign(user.Id, Engineering);

        Assert.False(result.IsSuccess);
        Assert.Equal(ResultErrorKind.Invalid, result.ErrorKind);
        Assert.Contains(HrDepartmentScopeRules.DepartmentsNotForRoleMessage, result.Error);
        Assert.Empty(await Db.UserDepartments.ToListAsync());
    }

    [Fact]
    public async Task Normalize_drops_duplicates_and_non_positive_ids()
    {
        Assert.Equal(new[] { 2, 5 }, HrDepartmentScopeRules.Normalize([5, 2, 5, 0, -1]));
        Assert.Empty(HrDepartmentScopeRules.Normalize(null));
    }
}
```

Add to `SystemAdministrationSurfaceTests.Configuration_writes_are_System_Administrator_only` the line:

```csharp
    [InlineData(typeof(AdminUsersController), nameof(AdminUsersController.SetUserDepartments))]
```

`ResultErrorKind.Invalid` is the kind `Result<T>.ValidationFailure` produces (`Application/Core/Result.cs`).

- [ ] **Step 2: Run to verify the tests fail**

Run: `dotnet test ... --filter "FullyQualifiedName~HrDepartmentAssignmentTests"`
Expected: build errors for the missing types.

- [ ] **Step 3: The rule**

```csharp
// Application/Core/HrDepartmentScopeRules.cs
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Core;

/// <summary>
/// The departments an HR Administrator is assigned — their whole reach over Leave &amp;
/// Time. Follows <c>DepartmentId</c>'s role rule: required (at least one) for an HR
/// Administrator, refused for everyone else. Shared by <c>CreateAdminUserValidator</c>
/// and <c>SetAdminUserDepartmentsValidator</c> so the two cannot drift.
/// </summary>
public static class HrDepartmentScopeRules
{
    public const string DepartmentsRequiredMessage = "Select at least one department for the HR Administrator.";
    public const string DepartmentsNotForRoleMessage = "Only an HR Administrator is assigned departments.";
    public const string UnknownDepartmentMessage = "One or more selected departments do not exist or are inactive.";

    /// <summary>Distinct, positive, ascending. What every writer stores and every validator checks.</summary>
    public static List<int> Normalize(IEnumerable<int>? departmentIds) =>
        (departmentIds ?? [])
            .Where(id => id > 0)
            .Distinct()
            .OrderBy(id => id)
            .ToList();

    /// <summary>Whether every id names an existing, active department. An empty set is vacuously true — emptiness is the required-rule's business.</summary>
    public static async Task<bool> AllActiveAsync(
        AppDbContext context, IReadOnlyCollection<int> departmentIds, CancellationToken cancellationToken)
    {
        if (departmentIds.Count == 0) return true;
        var ids = departmentIds.ToList();
        var found = await context.Departments
            .CountAsync(d => ids.Contains(d.Id) && d.IsActive, cancellationToken);
        return found == ids.Count;
    }
}
```

- [ ] **Step 4: DTO, command, validator**

```csharp
// Application/AdminUsers/DTOs/AdminSetUserDepartmentsDto.cs
namespace Application.AdminUsers.DTOs;

/// <summary>
/// The full set of departments an HR Administrator runs — a replace, not a patch:
/// what is sent is what is stored. At least one is required; the validator says so.
/// </summary>
public class AdminSetUserDepartmentsDto
{
    public List<int> DepartmentIds { get; set; } = new();
}
```

```csharp
// Application/AdminUsers/Commands/SetAdminUserDepartments.cs
using Application.AdminUsers.DTOs;
using Application.AdminUsers.Support;
using Application.Core;
using Domain;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.AdminUsers.Commands;

/// <summary>
/// Replaces the departments an HR Administrator is assigned. Shape and existence
/// checks are <c>SetAdminUserDepartmentsValidator</c>'s; the one thing settled here
/// is the stored role, because the payload carries none and the rule depends on it.
/// </summary>
public class SetAdminUserDepartments
{
    public class Command : IRequest<Result<AdminUserDto>>
    {
        public required string Id { get; set; }
        public required AdminSetUserDepartmentsDto Departments { get; set; }
        public string RequestingUserId { get; set; } = string.Empty;
    }

    public class Handler(UserManager<User> userManager, AppDbContext context)
        : IRequestHandler<Command, Result<AdminUserDto>>
    {
        public async Task<Result<AdminUserDto>> Handle(Command request, CancellationToken cancellationToken)
        {
            var user = await userManager.FindByIdAsync(request.Id);
            if (user is null)
            {
                return Result<AdminUserDto>.Failure("User not found.");
            }

            var roles = await userManager.GetRolesAsync(user);
            if (!roles.Contains(AppRoles.HrAdministrator, StringComparer.OrdinalIgnoreCase))
            {
                return Result<AdminUserDto>.ValidationFailure(
                    new Dictionary<string, string[]>
                    {
                        ["DepartmentIds"] = [HrDepartmentScopeRules.DepartmentsNotForRoleMessage],
                    },
                    HrDepartmentScopeRules.DepartmentsNotForRoleMessage);
            }

            var wanted = HrDepartmentScopeRules.Normalize(request.Departments.DepartmentIds);

            var existing = await context.UserDepartments
                .Where(ud => ud.UserId == user.Id)
                .ToListAsync(cancellationToken);

            context.UserDepartments.RemoveRange(existing.Where(ud => !wanted.Contains(ud.DepartmentId)));

            var held = existing.Select(ud => ud.DepartmentId).ToHashSet();
            foreach (var departmentId in wanted.Where(id => !held.Contains(id)))
            {
                context.UserDepartments.Add(new UserDepartment
                {
                    UserId = user.Id,
                    DepartmentId = departmentId,
                    AssignedAt = DateTime.UtcNow,
                    AssignedByUserId = string.IsNullOrWhiteSpace(request.RequestingUserId) ? null : request.RequestingUserId,
                });
            }

            await context.SaveChangesAsync(cancellationToken);

            return Result<AdminUserDto>.Success(AdminUserMapper.ToDto(user, roles, wanted));
        }
    }
}
```

```csharp
// Application/AdminUsers/Validators/SetAdminUserDepartmentsValidator.cs
using Application.AdminUsers.Commands;
using Application.Core;
using FluentValidation;
using Persistence;

namespace Application.AdminUsers.Validators;

public class SetAdminUserDepartmentsValidator : AbstractValidator<SetAdminUserDepartments.Command>
{
    public SetAdminUserDepartmentsValidator(AppDbContext context)
    {
        RuleFor(x => x.Id).NotEmpty().WithMessage("User id is required.");
        RuleFor(x => x.Departments).NotNull().WithMessage("Departments payload is required.");

        When(x => x.Departments is not null, () =>
        {
            RuleFor(x => x.Departments.DepartmentIds)
                .Cascade(CascadeMode.Stop)
                .Must(ids => HrDepartmentScopeRules.Normalize(ids).Count > 0)
                .WithMessage(HrDepartmentScopeRules.DepartmentsRequiredMessage)
                .MustAsync(async (ids, ct) =>
                    await HrDepartmentScopeRules.AllActiveAsync(context, HrDepartmentScopeRules.Normalize(ids), ct))
                .WithMessage(HrDepartmentScopeRules.UnknownDepartmentMessage);
        });
    }
}
```

Validators are auto-registered by assembly scan (check `Application/DependencyInjection.cs` or `API/Program.cs` for `AddValidatorsFromAssembly`; if validators are registered one by one, add this one where `SetAdminUserRolesValidator` is).

- [ ] **Step 5: `AdminUserDto.DepartmentIds` and the mapper**

In `AdminUserDto`, after `Roles`:

```csharp
    /// <summary>
    /// The departments assigned to this person through <c>UserDepartment</c>: an HR
    /// Administrator's whole scope, a Manager's extra departments, empty for everyone
    /// else. Ids only — the Users panel already holds the department list.
    /// </summary>
    public List<int> DepartmentIds { get; set; } = new();
```

In `AdminUserMapper`:

```csharp
    public static AdminUserDto ToDto(User user, IEnumerable<string> roles, IEnumerable<int>? departmentIds = null) => new()
    {
        // ...existing assignments unchanged...
        Roles = roles.OrderBy(r => r).ToList(),
        DepartmentIds = (departmentIds ?? []).Distinct().OrderBy(id => id).ToList(),
    };
```

- [ ] **Step 6: The endpoint**

In `AdminUsersController`, after `SetUserRoles`:

```csharp
    [Authorize(Roles = AppRoles.SystemAdministrator)]
    [HttpPut("{id}/departments")]
    [ProducesResponseType(typeof(AdminUserDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AdminUserDto>> SetUserDepartments(string id, AdminSetUserDepartmentsDto request)
    {
        return HandleResult(await Mediator.Send(
            new SetAdminUserDepartments.Command
            {
                Id = id,
                Departments = request,
                RequestingUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty,
            },
            HttpContext.RequestAborted));
    }
```

- [ ] **Step 7: Run `HrDepartmentAssignmentTests`, `SystemAdministrationSurfaceTests`, `AdminUserJsonContractTests`, `CreateAdminUserCommandTests`**

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add Application/Core/HrDepartmentScopeRules.cs Application/AdminUsers API/Controllers/AdminUsersController.cs Tests/WorkTrack.Tests/HrDepartmentAssignmentTests.cs Tests/WorkTrack.Tests/SystemAdministrationSurfaceTests.cs
git commit -m "Add PUT adminusers/{id}/departments to assign an HR Administrator their departments

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Departments on create, and on the user list

**Files:**
- Modify: `Application/AdminUsers/DTOs/AdminCreateUserDto.cs`, `Validators/CreateAdminUserValidator.cs`, `Commands/CreateAdminUser.cs`
- Modify: `Application/AdminUsers/Queries/GetAdminUserList.cs`, `GetAdminUserDetail.cs`
- Modify: `API/Controllers/AdminUsersController.cs` (GetUsers/GetUser)
- Test: `Tests/WorkTrack.Tests/HrDepartmentAssignmentTests.cs`

**Interfaces:**
- Produces: `AdminCreateUserDto.DepartmentIds : List<int>?`. `GetAdminUserList.Query { string RequestingUserId; bool ScopeToCaller }` and `GetAdminUserDetail.Query { string Id; string RequestingUserId; bool ScopeToCaller }` — `ScopeToCaller = true` limits the result to users whose profile department is in the caller's resolved scope, plus the caller. Both handlers now take `(UserManager<User>, AppDbContext)`.

- [ ] **Step 1: Write the failing tests**

Append to `HrDepartmentAssignmentTests`:

```csharp
    private static AdminCreateUserDto CreatePayload(string role, List<int>? departmentIds) => new()
    {
        Email = $"{Guid.NewGuid():N}@test.local",
        DisplayName = "New Person",
        Roles = [role],
        DepartmentIds = departmentIds,
        DepartmentId = AppRoles.IsAdministrator(role) ? null : Engineering,
        DateOfBirth = DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-30),
        EmploymentStartDate = AppRoles.IsAdministrator(role) ? null : DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-1),
        Gender = AppRoles.IsAdministrator(role) ? null : Gender.Female,
    };

    private Task<FluentValidation.Results.ValidationResult> ValidateCreate(AdminCreateUserDto payload) =>
        new CreateAdminUserValidator(Db, Roles).ValidateAsync(new CreateAdminUser.Command { User = payload });

    [Fact]
    public async Task Creating_an_HR_Administrator_without_departments_is_refused()
    {
        await SeedAsync();

        var none = await ValidateCreate(CreatePayload(AppRoles.HrAdministrator, null));
        var empty = await ValidateCreate(CreatePayload(AppRoles.HrAdministrator, []));

        Assert.Contains(none.Errors, e => e.ErrorMessage == HrDepartmentScopeRules.DepartmentsRequiredMessage);
        Assert.Contains(empty.Errors, e => e.ErrorMessage == HrDepartmentScopeRules.DepartmentsRequiredMessage);
    }

    [Theory]
    [InlineData(AppRoles.SystemAdministrator)]
    [InlineData(AppRoles.Manager)]
    [InlineData(AppRoles.Employee)]
    public async Task Creating_any_other_role_with_departments_is_refused(string role)
    {
        await SeedAsync();

        var result = await ValidateCreate(CreatePayload(role, [Engineering]));

        Assert.Contains(result.Errors, e => e.ErrorMessage == HrDepartmentScopeRules.DepartmentsNotForRoleMessage);
    }

    [Fact]
    public async Task Creating_an_HR_Administrator_writes_their_department_rows()
    {
        await SeedAsync();
        var payload = CreatePayload(AppRoles.HrAdministrator, [Finance, Engineering]);
        Assert.True((await ValidateCreate(payload)).IsValid);

        var result = await new CreateAdminUser.Handler(Db, Users, new NoInviteMail(), Microsoft.Extensions.Logging.Abstractions.NullLogger<CreateAdminUser.Handler>.Instance)
            .Handle(new CreateAdminUser.Command { User = payload }, CancellationToken.None);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal([Engineering, Finance], result.Value!.DepartmentIds);
        var rows = await Db.UserDepartments.Where(ud => ud.UserId == result.Value.Id).Select(ud => ud.DepartmentId).OrderBy(id => id).ToListAsync();
        Assert.Equal([Engineering, Finance], rows);
    }

    private sealed class NoInviteMail : Domain.Interfaces.IAccountEmailSender
    {
        public string BuildClientUrl(string route, IDictionary<string, string?>? query = null) => $"https://test.local{route}";
        public Task<bool> SendWelcomeInviteAsync(User user, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendPasswordResetAsync(User user, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendEmailChangeConfirmationAsync(User user, string newEmail, string apiBaseUrlFallback, CancellationToken cancellationToken = default) => Task.FromResult(true);
    }

    [Fact]
    public async Task The_user_list_carries_each_persons_department_ids_and_scopes_to_an_HR_caller()
    {
        await SeedAsync();
        var hr = await GivenUserAsync("hr@test.local", AppRoles.HrAdministrator);
        var eng = await GivenUserAsync("eng@test.local", AppRoles.Employee);
        var fin = await GivenUserAsync("fin@test.local", AppRoles.Employee);
        Db.EmployeeProfiles.AddRange(
            new EmployeeProfile { Id = "hr-p", UserId = hr.Id, DepartmentId = null },
            new EmployeeProfile { Id = "eng-p", UserId = eng.Id, DepartmentId = Engineering },
            new EmployeeProfile { Id = "fin-p", UserId = fin.Id, DepartmentId = Finance });
        Db.UserDepartments.Add(new UserDepartment { UserId = hr.Id, DepartmentId = Engineering });
        await Db.SaveChangesAsync();

        var all = await new GetAdminUserList.Handler(Users, Db).Handle(new GetAdminUserList.Query(), CancellationToken.None);
        Assert.Equal([Engineering], all.Single(u => u.Id == hr.Id).DepartmentIds);
        Assert.Equal(3, all.Count);

        var scoped = await new GetAdminUserList.Handler(Users, Db).Handle(
            new GetAdminUserList.Query { RequestingUserId = hr.Id, ScopeToCaller = true }, CancellationToken.None);
        Assert.Equal(new[] { eng.Id, hr.Id }.OrderBy(x => x), scoped.Select(u => u.Id).OrderBy(x => x));

        var outOfScope = await new GetAdminUserDetail.Handler(Users, Db).Handle(
            new GetAdminUserDetail.Query { Id = fin.Id, RequestingUserId = hr.Id, ScopeToCaller = true }, CancellationToken.None);
        Assert.False(outOfScope.IsSuccess);
    }
```

- [ ] **Step 2: Run to verify they fail**

Expected: build errors (`DepartmentIds` on the create DTO, handler constructors, query properties).

- [ ] **Step 3: Create DTO and validator**

In `AdminCreateUserDto`, after `DepartmentId`:

```csharp
    /// <summary>
    /// The departments an HR Administrator runs — at least one is required for that
    /// role and any are refused for every other, the mirror image of
    /// <see cref="DepartmentId"/>. Settled by <c>CreateAdminUserValidator</c> through
    /// <c>HrDepartmentScopeRules</c>.
    /// </summary>
    public List<int>? DepartmentIds { get; set; }
```

In `CreateAdminUserValidator`, after the `EmploymentStartDate` rules and before `ManagerId`, add:

```csharp
            // The mirror image of DepartmentId: an HR Administrator has no department
            // of their own but must be assigned at least one to run; everyone else
            // is refused the field, so an admin cannot widen a Manager or scope an
            // Employee through it by accident.
            When(x => IsHr(x.User.Roles), () =>
            {
                RuleFor(x => x.User.DepartmentIds)
                    .Cascade(CascadeMode.Stop)
                    .Must(ids => HrDepartmentScopeRules.Normalize(ids).Count > 0)
                    .WithMessage(HrDepartmentScopeRules.DepartmentsRequiredMessage)
                    .MustAsync(async (ids, ct) =>
                        await HrDepartmentScopeRules.AllActiveAsync(context, HrDepartmentScopeRules.Normalize(ids), ct))
                    .WithMessage(HrDepartmentScopeRules.UnknownDepartmentMessage);
            });

            When(x => !IsHr(x.User.Roles), () =>
            {
                RuleFor(x => x.User.DepartmentIds)
                    .Must(ids => HrDepartmentScopeRules.Normalize(ids).Count == 0)
                    .WithMessage(HrDepartmentScopeRules.DepartmentsNotForRoleMessage);
            });
```

and the helper beside `IsAdmin`:

```csharp
    private static bool IsHr(IEnumerable<string>? roles) =>
        Distinct(roles).Any(role => string.Equals(role, AppRoles.HrAdministrator, StringComparison.OrdinalIgnoreCase));
```

- [ ] **Step 4: Create handler writes the rows**

In `CreateAdminUser.Handler.Handle`, after the roles are attached successfully (after the `if (!addRolesResult.Succeeded) {...}` block) and before the welcome email:

```csharp
            // An HR Administrator's reach is the departments assigned here. Validated
            // non-empty and active by CreateAdminUserValidator; stored normalised.
            var departmentIds = HrDepartmentScopeRules.Normalize(request.User.DepartmentIds);
            if (departmentIds.Count > 0)
            {
                context.UserDepartments.AddRange(departmentIds.Select(departmentId => new UserDepartment
                {
                    UserId = user.Id,
                    DepartmentId = departmentId,
                    AssignedAt = DateTime.UtcNow,
                }));
                await context.SaveChangesAsync(cancellationToken);
            }
```

and change the final mapping to `var created = AdminUserMapper.ToDto(user, selectedRoles, departmentIds);`.

- [ ] **Step 5: List and detail queries**

Replace `GetAdminUserList.cs` body:

```csharp
public class GetAdminUserList
{
    public class Query : IRequest<List<AdminUserDto>>
    {
        public string RequestingUserId { get; set; } = string.Empty;

        /// <summary>
        /// True for an HR Administrator: only people whose profile department is in
        /// the caller's resolved scope, plus the caller. False (the default, and the
        /// System Administrator's) is everybody.
        /// </summary>
        public bool ScopeToCaller { get; set; }
    }

    public class Handler(UserManager<User> userManager, AppDbContext context) : IRequestHandler<Query, List<AdminUserDto>>
    {
        public async Task<List<AdminUserDto>> Handle(Query request, CancellationToken cancellationToken)
        {
            var users = await userManager.Users
                .OrderBy(u => u.Email)
                .ToListAsync(cancellationToken);

            if (request.ScopeToCaller)
            {
                var visible = await AdminUserScope.VisibleUserIdsAsync(context, request.RequestingUserId, cancellationToken);
                users = users.Where(u => visible.Contains(u.Id)).ToList();
            }

            var userIds = users.Select(u => u.Id).ToList();
            var departmentIdsByUser = (await context.UserDepartments
                    .Where(ud => userIds.Contains(ud.UserId))
                    .Select(ud => new { ud.UserId, ud.DepartmentId })
                    .ToListAsync(cancellationToken))
                .GroupBy(x => x.UserId)
                .ToDictionary(g => g.Key, g => g.Select(x => x.DepartmentId).ToList());

            var result = new List<AdminUserDto>(users.Count);
            foreach (var user in users)
            {
                var roles = await userManager.GetRolesAsync(user);
                departmentIdsByUser.TryGetValue(user.Id, out var departmentIds);
                result.Add(AdminUserMapper.ToDto(user, roles, departmentIds));
            }

            return result;
        }
    }
}
```

Add a small helper file `Application/AdminUsers/Support/AdminUserScope.cs`:

```csharp
using Application.Core;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.AdminUsers.Support;

/// <summary>
/// Which accounts a department-scoped caller may see on the Users list: everyone
/// whose profile sits in one of the caller's departments, and the caller. Read by
/// the list and the detail query so the two agree.
/// </summary>
public static class AdminUserScope
{
    public static async Task<HashSet<string>> VisibleUserIdsAsync(
        AppDbContext context, string requestingUserId, CancellationToken cancellationToken)
    {
        var scope = await ManagerAccessScopeResolver.ResolveAsync(context, requestingUserId, cancellationToken);
        var visible = scope.ManagedDepartmentIds.Count == 0
            ? new HashSet<string>()
            : (await context.EmployeeProfiles
                .Where(ep => ep.DepartmentId != null && scope.ManagedDepartmentIds.Contains(ep.DepartmentId.Value))
                .Select(ep => ep.UserId)
                .ToListAsync(cancellationToken)).ToHashSet();
        if (!string.IsNullOrWhiteSpace(requestingUserId)) visible.Add(requestingUserId);
        return visible;
    }
}
```

Replace `GetAdminUserDetail.cs` body:

```csharp
public class GetAdminUserDetail
{
    public class Query : IRequest<Result<AdminUserDto>>
    {
        public required string Id { get; set; }
        public string RequestingUserId { get; set; } = string.Empty;
        /// <summary>See <c>GetAdminUserList.Query.ScopeToCaller</c>. An out-of-scope user reads as not found.</summary>
        public bool ScopeToCaller { get; set; }
    }

    public class Handler(UserManager<User> userManager, AppDbContext context) : IRequestHandler<Query, Result<AdminUserDto>>
    {
        public async Task<Result<AdminUserDto>> Handle(Query request, CancellationToken cancellationToken)
        {
            var user = await userManager.FindByIdAsync(request.Id);
            if (user is null)
            {
                return Result<AdminUserDto>.Failure("User not found.");
            }

            if (request.ScopeToCaller)
            {
                var visible = await AdminUserScope.VisibleUserIdsAsync(context, request.RequestingUserId, cancellationToken);
                if (!visible.Contains(user.Id))
                {
                    return Result<AdminUserDto>.Failure("User not found.");
                }
            }

            var roles = await userManager.GetRolesAsync(user);
            var departmentIds = await context.UserDepartments
                .Where(ud => ud.UserId == user.Id)
                .Select(ud => ud.DepartmentId)
                .ToListAsync(cancellationToken);
            return Result<AdminUserDto>.Success(AdminUserMapper.ToDto(user, roles, departmentIds));
        }
    }
}
```

Add `using Application.Core; using Persistence;` where needed.

- [ ] **Step 6: Controller reads**

In `AdminUsersController`:

```csharp
    [HttpGet]
    [ProducesResponseType(typeof(List<AdminUserDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<AdminUserDto>>> GetUsers()
    {
        return Ok(await Mediator.Send(new GetAdminUserList.Query
        {
            RequestingUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty,
            // The HR Administrator reads this list to file leave on somebody's
            // behalf, so it is scoped to their departments; the System
            // Administrator's Users panel is the whole company.
            ScopeToCaller = !User.IsSystemAdministrator(),
        }, HttpContext.RequestAborted));
    }

    [HttpGet("{id}")]
    // ...attributes unchanged...
    public async Task<ActionResult<AdminUserDto>> GetUser(string id)
    {
        return HandleResult(await Mediator.Send(
            new GetAdminUserDetail.Query
            {
                Id = id,
                RequestingUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty,
                ScopeToCaller = !User.IsSystemAdministrator(),
            },
            HttpContext.RequestAborted));
    }
```

Grep the tests for `new GetAdminUserList.Handler(` and `new GetAdminUserDetail.Handler(` and pass a `Db`/context as the second argument where they construct these.

- [ ] **Step 7: Run `HrDepartmentAssignmentTests`, `CreateAdminUserCommandTests`, `AdminHasNoDepartmentTests`, `UserGenderTests`, `EmploymentStartDateTests`, `SingleRolePerUserTests`**

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add Application/AdminUsers API/Controllers/AdminUsersController.cs Tests/WorkTrack.Tests
git commit -m "Take an HR Administrator's departments on create, and scope the Users list to them

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Leave — HR goes through the department scope

**Files:**
- Modify: `API/Controllers/AnnualLeavesController.cs:78-81, 94-97, 109-112, 123-129`
- Modify: `Application/AnnualLeaves/Commands/UpdateLeaveStatus.cs:38-51`, `EditAnnualLeave.cs:36-70,177`, `DeleteAnnualLeave.cs:33-47`, `CreateAnnualLeave.cs` (Command + top of Handle)
- Test: `Tests/WorkTrack.Tests/HrAdministratorScopeTests.cs` (create)

**Interfaces:**
- Consumes: `User.IsSystemAdministrator()`, `User.IsDepartmentScoped()` (Task 1); resolver union (Task 2).
- Produces: `CreateAnnualLeave.Command.RequestingUserId : string` (empty skips the on-behalf check, which only the controller sets). On `UpdateLeaveStatus`, `EditAnnualLeave` and `DeleteAnnualLeave`, `IsAdmin` now means "an HR Administrator acting on somebody's behalf, inside their assigned departments".

- [ ] **Step 1: Write the failing tests**

```csharp
// Tests/WorkTrack.Tests/HrAdministratorScopeTests.cs
using Application.AnnualLeaves.Commands;
using Application.AnnualLeaves.DTOs;
using Application.AnnualLeaves.Queries;
using Application.Core;
using AutoMapper;
using Domain;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// An HR Administrator assigned department A sees and decides A's leave and is
/// refused B's, exactly as a Manager of A would be. Their profile has no
/// department; the scope is UserDepartment rows alone.
/// </summary>
public class HrAdministratorScopeTests
{
    private const string Hr = "hr";
    private const int A = 1;
    private const int B = 2;

    private static AppDbContext SeedWorld()
    {
        var db = TestDb.Create();
        db.Departments.AddRange(
            new Department { Id = A, Name = "A", Code = "A" },
            new Department { Id = B, Name = "B", Code = "B" });
        db.Users.AddRange(
            new User { Id = Hr, UserName = "hr", Email = "hr@t.local", DisplayName = "HR" },
            new User { Id = "ua", UserName = "ua", Email = "ua@t.local", DisplayName = "Anna A" },
            new User { Id = "ub", UserName = "ub", Email = "ub@t.local", DisplayName = "Ben B" });
        db.EmployeeProfiles.AddRange(
            new EmployeeProfile { Id = "hr-p", UserId = Hr, DepartmentId = null },
            new EmployeeProfile { Id = "pa", UserId = "ua", DepartmentId = A, AnnualLeaveEntitlement = 20, LeaveBalance = 20 },
            new EmployeeProfile { Id = "pb", UserId = "ub", DepartmentId = B, AnnualLeaveEntitlement = 20, LeaveBalance = 20 });
        db.UserDepartments.Add(new UserDepartment { UserId = Hr, DepartmentId = A });
        db.LeaveTypes.Add(new LeaveType { Id = 1, Name = "Annual Leave", IsActive = true, AffectsBalance = true, DefaultAllowance = 20, RequiresApproval = true });
        db.AnnualLeaves.AddRange(
            new AnnualLeave { Id = "la", EmployeeId = "ua", EmployeeProfileId = "pa", DepartmentId = A, LeaveTypeId = 1, StartDate = new DateTime(2026, 10, 5), EndDate = new DateTime(2026, 10, 6), TotalDays = 2, Status = AnnualLeaveStatus.Pending, CreatedAt = DateTime.UtcNow },
            new AnnualLeave { Id = "lb", EmployeeId = "ub", EmployeeProfileId = "pb", DepartmentId = B, LeaveTypeId = 1, StartDate = new DateTime(2026, 10, 5), EndDate = new DateTime(2026, 10, 6), TotalDays = 2, Status = AnnualLeaveStatus.Pending, CreatedAt = DateTime.UtcNow });
        db.SaveChanges();
        return db;
    }

    private static IMapper Mapper() =>
        new MapperConfiguration(cfg => cfg.AddProfile<MappingProfiles>()).CreateMapper();

    [Fact]
    public async Task The_leave_list_shows_only_the_assigned_departments()
    {
        using var db = SeedWorld();

        var page = await new GetAnnualLeaveList.Handler(db, Mapper()).Handle(new GetAnnualLeaveList.Query
        {
            RequestingUserId = Hr, IsAdmin = false, IsManager = true, IsEmployee = false,
        }, CancellationToken.None);

        Assert.Equal(["la"], page.Items.Select(l => l.Id));
    }

    [Fact]
    public async Task Approving_inside_the_scope_succeeds_and_outside_is_refused()
    {
        using var db = SeedWorld();
        var handler = new UpdateLeaveStatus.Handler(db, new FakeEmailService());

        var inside = await handler.Handle(new UpdateLeaveStatus.Command
        {
            LeaveId = "la", ChangedByUserId = Hr, IsAdmin = true, IsManager = false,
            Request = new UpdateLeaveStatusRequest { Status = AnnualLeaveStatus.Approved },
        }, CancellationToken.None);
        var outside = await handler.Handle(new UpdateLeaveStatus.Command
        {
            LeaveId = "lb", ChangedByUserId = Hr, IsAdmin = true, IsManager = false,
            Request = new UpdateLeaveStatusRequest { Status = AnnualLeaveStatus.Approved },
        }, CancellationToken.None);

        Assert.True(inside.IsSuccess, inside.Error);
        Assert.False(outside.IsSuccess);
        Assert.Equal(AnnualLeaveStatus.Pending, (await db.AnnualLeaves.FindAsync("lb"))!.Status);
    }

    [Fact]
    public async Task Cancelling_somebody_elses_leave_outside_the_scope_is_refused()
    {
        using var db = SeedWorld();
        var handler = new DeleteAnnualLeave.Handler(db);

        var outside = await handler.Handle(new DeleteAnnualLeave.Command { Id = "lb", RequestingUserId = Hr, IsAdmin = true }, CancellationToken.None);
        var inside = await handler.Handle(new DeleteAnnualLeave.Command { Id = "la", RequestingUserId = Hr, IsAdmin = true }, CancellationToken.None);

        Assert.False(outside.IsSuccess);
        Assert.True(inside.IsSuccess, inside.Error);
    }

    [Fact]
    public async Task Filing_on_behalf_of_somebody_outside_the_scope_is_refused()
    {
        using var db = SeedWorld();
        var handler = new CreateAnnualLeave.Handler(db, Mapper(), new FakeEmailService());

        var outside = await handler.Handle(new CreateAnnualLeave.Command
        {
            RequestingUserId = Hr,
            AnnualLeave = new CreateAnnualLeaveRequest
            {
                EmployeeId = "ub", LeaveTypeId = 1,
                StartDate = new DateTime(2026, 11, 2), EndDate = new DateTime(2026, 11, 3), Reason = "x",
            },
        }, CancellationToken.None);

        Assert.False(outside.IsSuccess);
        Assert.Contains("assigned departments", outside.Error);
    }
}
```

Check the exact property names on `UpdateLeaveStatus.Command` (`LeaveId`, `ChangedByUserId`, `Request`) and `CreateAnnualLeaveRequest` against the source and correct the test to match; check `MappingProfiles` namespace (`Application.Core`). If `LeaveType` has no `RequiresApproval` property, drop that initialiser.

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test ... --filter "FullyQualifiedName~HrAdministratorScopeTests"`
Expected: the list test passes already (the flags do the work), approve-outside and cancel-outside FAIL (succeed today), file-on-behalf FAILS to compile (`RequestingUserId`).

- [ ] **Step 3: `UpdateLeaveStatus` — scope check for HR too**

Replace lines 38-51 (`if (!request.IsAdmin) { ... }`) with:

```csharp
            if (!request.IsAdmin && !request.IsManager)
                return Result<Unit>.Failure("Only admins or managers can change leave status.");

            // IsAdmin here is the HR Administrator acting on somebody's behalf, and
            // their reach is their assigned departments — the same resolver, the same
            // test, as a Manager's. Nobody decides leave unscoped.
            var managerScope = await ManagerAccessScopeResolver.ResolveAsync(
                context,
                request.ChangedByUserId,
                cancellationToken);

            var isInManagedDepartment = annualLeave.DepartmentId.HasValue
                && managerScope.ManagedDepartmentIds.Contains(annualLeave.DepartmentId.Value);
            var isDirectReport = managerScope.DirectReportUserIds.Contains(annualLeave.EmployeeId);

            if (!isInManagedDepartment && !isDirectReport)
                return Result<Unit>.Failure("You can only change status for leaves in your managed scope.");
```

- [ ] **Step 4: `EditAnnualLeave` — admin privileges only inside scope**

Replace lines 36-58 with:

```csharp
            var isInManagedDepartment = false;
            var isDirectReport = false;
            if (request.IsManager || request.IsAdmin)
            {
                var managerScope = await ManagerAccessScopeResolver.ResolveAsync(
                    context,
                    request.ChangedByUserId,
                    cancellationToken);

                isInManagedDepartment = annualLeave.DepartmentId.HasValue
                    && managerScope.ManagedDepartmentIds.Contains(annualLeave.DepartmentId.Value);
                isDirectReport = managerScope.DirectReportUserIds.Contains(annualLeave.EmployeeId);
            }

            var inScope = isInManagedDepartment || isDirectReport;

            // An HR Administrator's privileges from the edit dialog — reopening an
            // approved or rejected request, changing its status — apply only inside
            // their assigned departments. Outside them they are nobody.
            var actsAsAdmin = request.IsAdmin && inScope;

            var canEdit = actsAsAdmin || annualLeave.EmployeeId == request.ChangedByUserId || inScope;

            if (!canEdit)
            {
                return Result<Unit>.Failure("You can only update your own leave requests or requests in your managed departments.");
            }

            if ((annualLeave.Status == AnnualLeaveStatus.Rejected || annualLeave.Status == AnnualLeaveStatus.Approved) && !actsAsAdmin)
            {
                return Result<Unit>.Conflict("Approved and rejected leave requests cannot be edited.");
            }
```

and at line 177: `var canChangeStatus = actsAsAdmin || inScope;`.

- [ ] **Step 5: `DeleteAnnualLeave` — HR cancels inside scope**

Replace the `if (request.IsAdmin) { canDelete = true; }` branch with:

```csharp
            if (request.IsAdmin)
            {
                // The HR Administrator, cancelling on somebody's behalf — inside their
                // assigned departments, or their own request.
                var scope = await ManagerAccessScopeResolver.ResolveAsync(context, request.RequestingUserId, cancellationToken);
                canDelete = annualLeave.EmployeeId == request.RequestingUserId
                    || (annualLeave.DepartmentId.HasValue && scope.ManagedDepartmentIds.Contains(annualLeave.DepartmentId.Value))
                    || scope.DirectReportUserIds.Contains(annualLeave.EmployeeId);
            }
```

Add `using Application.Core;` if missing.

- [ ] **Step 6: `CreateAnnualLeave` — on-behalf target must be in scope**

Add to `Command`: `public string RequestingUserId { get; set; } = string.Empty;` with the doc `/// <summary>Who is filing. When it differs from the request's EmployeeId, the filer is acting on somebody's behalf and that person has to be inside the filer's assigned departments. Empty skips the check; only the controller sets it.</summary>`.

After `if (employeeProfile is null) return ...;` add:

```csharp
            if (!string.IsNullOrWhiteSpace(request.RequestingUserId)
                && request.RequestingUserId != request.AnnualLeave.EmployeeId)
            {
                var scope = await ManagerAccessScopeResolver.ResolveAsync(context, request.RequestingUserId, cancellationToken);
                var inScope = (employeeProfile.DepartmentId.HasValue && scope.ManagedDepartmentIds.Contains(employeeProfile.DepartmentId.Value))
                    || scope.DirectReportUserIds.Contains(employeeProfile.UserId);
                if (!inScope)
                    return Result<string>.Failure("You can only file leave for people in your assigned departments.");
            }
```

- [ ] **Step 7: Controller flags**

In `AnnualLeavesController`, for the three read queries (lines 79-80, 95-96, 110-111) change to:

```csharp
            IsAdmin = User.IsSystemAdministrator(),
            IsManager = User.IsDepartmentScoped(),
```

In `CreateAnnualLeave` (line ~131) pass the filer: `new CreateAnnualLeave.Command { AnnualLeave = request, RequestingUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty }`. Lines 240-241, 260-261, 287-288 (`IsAdmin = User.IsHrAdministrator()`) stay as they are; add above each a one-line comment `// IsAdmin: the HR Administrator acting on behalf, checked against their assigned departments in the handler.` Also update the comment at line 116-117 to say the HR Administrator may supply a target `EmployeeId` **inside their assigned departments**.

- [ ] **Step 8: Run `HrAdministratorScopeTests`, `ManagerScopeAuthorizationTests`, `LeaveDelegateTests`, `CoverageNotificationTests`, `AttachmentPolicyRuleTests`, and any test file matching `*AnnualLeave*`**

Expected: all pass. If an existing test constructed `UpdateLeaveStatus.Command { IsAdmin = true }` for a System Administrator and expected success, it is asserting the old unscoped contract: give that test's caller a `UserDepartment` row or profile department covering the leave, and note in its doc comment that admins are now scoped.

- [ ] **Step 9: Commit**

```bash
git add API/Controllers/AnnualLeavesController.cs Application/AnnualLeaves Tests/WorkTrack.Tests
git commit -m "Scope the HR Administrator's leave reads and decisions to their assigned departments

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Timesheets, histories, entries

**Files:**
- Modify: `API/Controllers/TimesheetsController.cs` (lines 92-99, 117-118, 167-169, 183-184, 205-206, 227-228, 253-254, 299-300, 335-336), `TimesheetEntriesController.cs:53-54`, `TimesheetStatusHistoriesController.cs:22-23`
- Modify: `Application/Timesheets/Commands/SubmitTimesheet.cs`
- Test: `Tests/WorkTrack.Tests/HrAdministratorScopeTests.cs`

**Interfaces:**
- Consumes: Task 1 helpers. `TimesheetScope.ApplyAsync`, `TimesheetAccess.AuthorizeWriteAsync`, `UpdateTimesheetStatus` unchanged: `isAdmin` = unscoped, `isManager` = scoped.
- Produces: `SubmitTimesheet.Command.IsManager : bool` — a scoped caller may submit a timesheet inside their scope.

- [ ] **Step 1: Write the failing tests**

Append to `HrAdministratorScopeTests`:

```csharp
    private static Timesheet Timesheet(string id, int departmentId, string profileId) => new()
    {
        Id = id, EmployeeProfileId = profileId, DepartmentId = departmentId,
        PeriodStart = new DateTime(2026, 9, 7), PeriodEnd = new DateTime(2026, 9, 13),
        TotalHours = 40m, Status = TimesheetStatus.Submitted,
    };

    [Fact]
    public async Task Timesheets_are_read_and_approved_inside_the_scope_only()
    {
        using var db = SeedWorld();
        db.Timesheets.AddRange(Timesheet("ta", A, "pa"), Timesheet("tb", B, "pb"));
        await db.SaveChangesAsync();

        var visible = await Application.Timesheets.Support.TimesheetScope.ApplyAsync(
            db, db.Timesheets, Hr, isAdmin: false, isManager: true);
        Assert.Equal(["ta"], visible.Select(t => t.Id).ToList());

        var handler = new Application.Timesheets.Commands.UpdateTimesheetStatus.Handler(
            db, new FakeEmailService(), Microsoft.Extensions.Logging.Abstractions.NullLogger<Application.Timesheets.Commands.UpdateTimesheetStatus.Handler>.Instance);
        var outside = await handler.Handle(new Application.Timesheets.Commands.UpdateTimesheetStatus.Command
        {
            Id = "tb", NewStatus = TimesheetStatus.Approved, RequestingUserId = Hr, IsAdmin = false, IsManager = true,
        }, CancellationToken.None);
        Assert.False(outside.IsSuccess);
    }

    [Fact]
    public async Task A_scoped_caller_may_submit_a_timesheet_inside_their_scope()
    {
        using var db = SeedWorld();
        var ta = Timesheet("ta", A, "pa"); ta.Status = TimesheetStatus.Draft;
        var tb = Timesheet("tb", B, "pb"); tb.Status = TimesheetStatus.Draft;
        db.Timesheets.AddRange(ta, tb);
        await db.SaveChangesAsync();
        var handler = new Application.Timesheets.Commands.SubmitTimesheet.Handler(
            db, new FakeEmailService(), Microsoft.Extensions.Logging.Abstractions.NullLogger<Application.Timesheets.Commands.SubmitTimesheet.Handler>.Instance);

        var inside = await handler.Handle(new Application.Timesheets.Commands.SubmitTimesheet.Command { Id = "ta", RequestingUserId = Hr, IsAdmin = false, IsManager = true }, CancellationToken.None);
        var outside = await handler.Handle(new Application.Timesheets.Commands.SubmitTimesheet.Command { Id = "tb", RequestingUserId = Hr, IsAdmin = false, IsManager = true }, CancellationToken.None);

        Assert.True(inside.IsSuccess, inside.Error);
        Assert.False(outside.IsSuccess);
    }
```

- [ ] **Step 2: Run to verify they fail**

Expected: the first passes already; the second fails to compile (`IsManager` on `SubmitTimesheet.Command`).

- [ ] **Step 3: `SubmitTimesheet` accepts a scoped caller**

Add `public bool IsManager { get; set; }` to `Command`. Replace the `if (!request.IsAdmin) { ... }` ownership block so that after the own-profile check fails it tries the scope:

```csharp
            if (!request.IsAdmin)
            {
                var requesterProfile = await context.EmployeeProfiles
                    .AsNoTracking()
                    .FirstOrDefaultAsync(ep => ep.UserId == request.RequestingUserId, cancellationToken);

                var isOwn = requesterProfile is not null && timesheet.EmployeeProfileId == requesterProfile.Id;
                var inScope = false;
                if (!isOwn && request.IsManager)
                {
                    // A Manager, or an HR Administrator, submitting on behalf of somebody
                    // in their departments — the same scope every other timesheet write uses.
                    var scope = await ManagerAccessScopeResolver.ResolveAsync(context, request.RequestingUserId, cancellationToken);
                    inScope = (timesheet.DepartmentId != null && scope.ManagedDepartmentIds.Contains(timesheet.DepartmentId.Value))
                        || (timesheet.Employee != null && scope.DirectReportUserIds.Contains(timesheet.Employee.UserId));
                }

                if (!isOwn && !inScope)
                {
                    return Result<Unit>.ValidationFailure(
                        new Dictionary<string, string[]>
                        {
                            ["Authorization"] = ["You are not authorized to submit this timesheet."]
                        },
                        "You are not authorized to submit this timesheet.");
                }
            }
```

Keep whatever follows the original block unchanged. Add `using Application.Core;`.

- [ ] **Step 4: Controller flags**

`TimesheetsController`:
- Lines 92-93: `var isAdmin = User.IsSystemAdministrator(); var isManager = User.IsDepartmentScoped();`
- Lines 117-118, 253-254, 299-300, 335-336: `IsAdmin = User.IsSystemAdministrator(), IsManager = User.IsDepartmentScoped(),`
- Line 168-169 (Delete): `IsAdmin = false, IsManager = User.IsDepartmentScoped(),` with the comment `// Nobody deletes a timesheet unscoped: the HR Administrator and a Manager inside their departments, everyone else their own. (DeleteTimesheetTests pins that a System Administrator may not.)`
- Line 184 (Submit): `IsAdmin = User.IsSystemAdministrator(), IsManager = User.IsDepartmentScoped(),`
- Lines 205-206 and 227-228 (Approve/Reject): `IsAdmin = false, IsManager = User.IsDepartmentScoped(),` with the comment `// LeaveAndTimeDecisionRoles already keeps the System Administrator out; the HR Administrator and a Manager both decide inside their departments.`

`TimesheetEntriesController:53-54`: `User.IsSystemAdministrator(), User.IsDepartmentScoped(),`.
`TimesheetStatusHistoriesController:22-23`: `IsAdmin = User.IsSystemAdministrator(), IsManager = User.IsDepartmentScoped(),`.

- [ ] **Step 5: Run `HrAdministratorScopeTests`, `DeleteTimesheetTests`, `TimesheetReadScopeTests`, `TimesheetStatusHistoryScopeTests`, `TimesheetEntryOwnershipTests`, `ManagerScopeAuthorizationTests`**

Expected: all pass. `DeleteTimesheetTests:283-284` (HR may delete, System may not): if it builds the command with `IsAdmin = true` for HR, change it to `IsAdmin = false, IsManager = true` and give the HR user a `UserDepartment` row for the timesheet's department, mirroring the controller.

- [ ] **Step 6: Commit**

```bash
git add API/Controllers/TimesheetsController.cs API/Controllers/TimesheetEntriesController.cs API/Controllers/TimesheetStatusHistoriesController.cs Application/Timesheets Tests/WorkTrack.Tests
git commit -m "Scope the HR Administrator's timesheet reads, decisions and writes to their departments

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Attendance — team board, history, company, presence

**Files:**
- Modify: `API/Controllers/AttendanceController.cs:31, 114-125`
- Modify: `Application/Attendance/Queries/GetTeamAttendanceHistory.cs:44-55`, `GetCompanyAttendance.cs` (Query + profiles load), `GetUserPresence.cs` (Query + profiles load)
- Test: `Tests/WorkTrack.Tests/HrAdministratorScopeTests.cs`

**Interfaces:**
- Produces: `GetCompanyAttendance.Query { string RequestingUserId; bool ScopeToCaller; DateTime? NowUtc }` and `GetUserPresence.Query { string RequestingUserId; bool ScopeToCaller }`. `ScopeToCaller = false` (default) is the whole company; `true` limits profiles to the caller's resolved departments.

- [ ] **Step 1: Write the failing tests**

Append to `HrAdministratorScopeTests`:

```csharp
    [Fact]
    public async Task Company_attendance_and_presence_cover_only_the_assigned_departments()
    {
        using var db = SeedWorld();
        db.AppSettings.Add(new AppSettings { TimeZoneId = "UTC", WorkingHoursStart = "09:00", WorkingHoursEnd = "18:00" });
        await db.SaveChangesAsync();

        var company = await new Application.Attendance.Queries.GetCompanyAttendance.Handler(db).Handle(
            new Application.Attendance.Queries.GetCompanyAttendance.Query { RequestingUserId = Hr, ScopeToCaller = true, NowUtc = DateTime.UtcNow }, CancellationToken.None);
        Assert.True(company.IsSuccess, company.Error);
        Assert.Equal(1, company.Value!.TotalEmployees);

        var presence = await new Application.Attendance.Queries.GetUserPresence.Handler(db).Handle(
            new Application.Attendance.Queries.GetUserPresence.Query { RequestingUserId = Hr, ScopeToCaller = true }, CancellationToken.None);
        Assert.Equal(["ua"], presence.Value!.Select(p => p.UserId).ToList());
    }

    [Fact]
    public async Task The_team_attendance_history_follows_the_department_scope()
    {
        using var db = SeedWorld();
        db.AppSettings.Add(new AppSettings { TimeZoneId = "UTC", WorkingHoursStart = "09:00", WorkingHoursEnd = "18:00" });
        await db.SaveChangesAsync();

        var history = await new Application.Attendance.Queries.GetTeamAttendanceHistory.Handler(db).Handle(
            new Application.Attendance.Queries.GetTeamAttendanceHistory.Query { RequestingUserId = Hr, IsAdmin = false, Days = 7 }, CancellationToken.None);

        Assert.True(history.IsSuccess, history.Error);
        Assert.Equal(["Anna A"], history.Value!.Members.Select(m => m.DisplayName).ToList());
    }
```

Open `Application/Attendance/DTOs/CompanyAttendanceDto.cs` and `TeamHistoryDto` to confirm the headline-count and members property names (`TotalEmployees`, `Members`, `DisplayName` may differ); use the real names.

- [ ] **Step 2: Run to verify they fail**

Expected: compile errors on the new Query properties; the history test returns nobody (HR has no direct reports).

- [ ] **Step 3: `GetTeamAttendanceHistory` takes the resolver**

Replace lines 44-55 (`if (!request.IsAdmin) {...}`) with:

```csharp
            if (!request.IsAdmin)
            {
                var me = await AttendanceDay.ResolveProfileAsync(context, request.RequestingUserId, cancellationToken);
                if (me is null) return AttendanceDay.NoProfile<TeamHistoryDto>();

                // The same reach as the team board beside it: the caller's departments
                // and direct reports. It used to read direct reports alone, so a
                // manager's chart and their board disagreed about who was on the team.
                var scope = await ManagerAccessScopeResolver.ResolveAsync(context, request.RequestingUserId, cancellationToken);
                profilesQuery = profilesQuery.Where(p =>
                    p.UserId != request.RequestingUserId
                    && ((p.DepartmentId != null && scope.ManagedDepartmentIds.Contains(p.DepartmentId.Value))
                        || (p.ManagerId != null && scope.ManagerProfileIds.Contains(p.ManagerId))));
            }
```

Also wrap the initial query in `AttendanceDay.ExcludeAdmins(...)` if the board does and the history does not (compare with `GetTeamAttendance`; keep them identical). Add `using Application.Core;`.

- [ ] **Step 4: `GetCompanyAttendance` and `GetUserPresence` gain the opt-in scope**

`GetCompanyAttendance.Query`: add

```csharp
        public string RequestingUserId { get; init; } = string.Empty;

        /// <summary>
        /// True for an HR Administrator: only the departments assigned to them. False
        /// — the default, the System Administrator's, and every existing test's — is
        /// the whole company.
        /// </summary>
        public bool ScopeToCaller { get; init; }
```

and replace the `profiles` load with:

```csharp
            var profilesQuery = AttendanceDay.ExcludeAdmins(
                context.EmployeeProfiles
                    .Include(p => p.User)
                    .Include(p => p.Department));

            if (request.ScopeToCaller)
            {
                var scope = await ManagerAccessScopeResolver.ResolveAsync(context, request.RequestingUserId, cancellationToken);
                profilesQuery = profilesQuery.Where(p =>
                    p.DepartmentId != null && scope.ManagedDepartmentIds.Contains(p.DepartmentId.Value));
            }

            var profiles = await profilesQuery.ToListAsync(cancellationToken);
```

`GetUserPresence.Query`: the same two properties, and:

```csharp
            IQueryable<EmployeeProfile> profilesQuery = context.EmployeeProfiles;
            if (request.ScopeToCaller)
            {
                var scope = await ManagerAccessScopeResolver.ResolveAsync(context, request.RequestingUserId, cancellationToken);
                profilesQuery = profilesQuery.Where(p =>
                    p.DepartmentId != null && scope.ManagedDepartmentIds.Contains(p.DepartmentId.Value));
            }

            var profiles = await profilesQuery
                .Select(p => new { p.Id, p.UserId })
                .ToListAsync(cancellationToken);
```

Add `using Application.Core; using Domain;` as needed.

- [ ] **Step 5: Controller**

`AttendanceController:31`: `private bool IsAdmin => User.IsSystemAdministrator();` with the comment `// Unscoped reach. The HR Administrator goes through the resolver like a Manager.`

Presence and company actions:

```csharp
    public async Task<ActionResult> GetPresence(CancellationToken cancellationToken) =>
        HandleResult(await Mediator.Send(new GetUserPresence.Query
        {
            RequestingUserId = ResolveUserId(),
            ScopeToCaller = !IsAdmin,
        }, cancellationToken));

    public async Task<ActionResult> GetCompany(CancellationToken cancellationToken) =>
        HandleResult(await Mediator.Send(new GetCompanyAttendance.Query
        {
            RequestingUserId = ResolveUserId(),
            ScopeToCaller = !IsAdmin,
        }, cancellationToken));
```

- [ ] **Step 6: Run `HrAdministratorScopeTests`, `CompanyAttendanceAggregationTests`, `AttendanceExcludesAdminsTests`, `AttendanceRouteSurfaceTests`, and every test file matching `*Attendance*`**

Expected: all pass (existing tests leave `ScopeToCaller` false).

- [ ] **Step 7: Commit**

```bash
git add API/Controllers/AttendanceController.cs Application/Attendance Tests/WorkTrack.Tests
git commit -m "Scope company attendance, presence and the team history to an HR Administrator's departments

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: People, children, files, projects, leave histories

**Files:**
- Modify: `API/Controllers/EmployeeProfilesController.cs:22-24, 40-44`, `ChildrenController.cs:24-25`, `FilesController.cs:28-29`, `ProjectsController.cs:23-24`, `LeaveStatusHistoriesController.cs:22-23`
- Modify: `Application/EmployeeProfiles/Queries/GetTeammateList.cs`
- Test: `Tests/WorkTrack.Tests/HrAdministratorScopeTests.cs`

**Interfaces:**
- Produces: `GetTeammateList.Query.ForUserId` is honoured only when the target's profile department is inside the caller's resolved scope; otherwise the list is empty.

- [ ] **Step 1: Write the failing tests**

Append to `HrAdministratorScopeTests`:

```csharp
    [Fact]
    public async Task Teammates_on_behalf_are_listed_only_for_someone_inside_the_scope()
    {
        using var db = SeedWorld();
        db.Users.Add(new User { Id = "ua2", UserName = "ua2", Email = "ua2@t.local", DisplayName = "Alex A" });
        db.EmployeeProfiles.Add(new EmployeeProfile { Id = "pa2", UserId = "ua2", DepartmentId = A });
        await db.SaveChangesAsync();
        var handler = new Application.EmployeeProfiles.Queries.GetTeammateList.Handler(db);

        var inside = await handler.Handle(new Application.EmployeeProfiles.Queries.GetTeammateList.Query { RequestingUserId = Hr, ForUserId = "ua" }, CancellationToken.None);
        var outside = await handler.Handle(new Application.EmployeeProfiles.Queries.GetTeammateList.Query { RequestingUserId = Hr, ForUserId = "ub" }, CancellationToken.None);

        Assert.Equal(["Alex A"], inside.Select(t => t.DisplayName).ToList());
        Assert.Empty(outside);
    }

    [Fact]
    public async Task Profiles_children_and_evidence_follow_the_scope()
    {
        using var db = SeedWorld();

        var profiles = await new Application.EmployeeProfiles.Queries.GetEmployeeProfileList.Handler(db).Handle(
            new Application.EmployeeProfiles.Queries.GetEmployeeProfileList.Query { RequestingUserId = Hr, IsAdmin = false, IsManager = true }, CancellationToken.None);
        Assert.Equal(new[] { "hr", "ua" }, profiles.Select(p => p.UserId).OrderBy(x => x));

        var childOutside = await Application.Children.Support.ChildAccessResolver.ResolveAsync(
            db, Hr, "ub", isAdmin: false, isManager: true, forWrite: false, CancellationToken.None);
        Assert.False(childOutside.IsSuccess);
    }
```

- [ ] **Step 2: Run to verify they fail**

Expected: teammates-outside returns Ben's colleagues today (FAIL); the profiles/children test passes already.

- [ ] **Step 3: `GetTeammateList` checks the on-behalf target**

Replace the top of `Handle` (through `if (myDepartmentId is null) return [];`) with:

```csharp
            var subjectUserId = string.IsNullOrWhiteSpace(request.ForUserId)
                ? request.RequestingUserId
                : request.ForUserId;

            if (string.IsNullOrWhiteSpace(subjectUserId)) return [];

            var myDepartmentId = await context.EmployeeProfiles
                .AsNoTracking()
                .Where(ep => ep.UserId == subjectUserId)
                .Select(ep => (int?)ep.DepartmentId)
                .FirstOrDefaultAsync(cancellationToken);

            if (myDepartmentId is null) return [];

            // Filing on behalf: the person has to be inside the filer's departments,
            // or the picker would hand an HR Administrator colleagues they may not see.
            if (subjectUserId != request.RequestingUserId)
            {
                var scope = await ManagerAccessScopeResolver.ResolveAsync(context, request.RequestingUserId, cancellationToken);
                if (!scope.ManagedDepartmentIds.Contains(myDepartmentId.Value)) return [];
            }
```

Update the class doc: replace "A System Administrator filing leave on somebody's behalf" with "An HR Administrator filing leave on somebody's behalf" and "The controller only passes it through for a System Administrator" with "The controller only passes it through for an HR Administrator, and the handler honours it only for someone inside the caller's assigned departments". Add `using Application.Core;`.

- [ ] **Step 4: Controller flags**

- `EmployeeProfilesController:23-24`: `IsAdmin = User.IsSystemAdministrator(), IsManager = User.IsDepartmentScoped(),`. Line 43 stays `ForUserId = User.IsHrAdministrator() ? forUserId : null,`.
- `ChildrenController:24-25`: `private bool IsAdmin => User.IsSystemAdministrator(); private bool IsManager => User.IsDepartmentScoped();`. Note in a comment that an HR Administrator therefore reads children inside their departments and cannot write them, like a Manager (the spec's "HR read/write within scope" is narrowed to read here because `ChildAccessResolver` has no scoped-write branch and adding one is a separate decision).
- `FilesController:28-29`: `IsAdmin = User.IsSystemAdministrator(), IsManager = User.IsDepartmentScoped(),`.
- `ProjectsController:23-24`: same two lines. (`ProjectScope.DepartmentIdsForAsync` reads `UserDepartments` when `isManager`, so an HR Administrator's projects follow.)
- `LeaveStatusHistoriesController:22-23`: same two lines.

- [ ] **Step 5: Run `HrAdministratorScopeTests`, `TeammateListTests`, `GetStoredFileTests`, `ChildCrudTests`, `ProjectDepartmentScopeTests`**

Expected: all pass. `TeammateListTests` may build `ForUserId` cases with a System Administrator caller; give that caller a `UserDepartment` row for the target's department, or switch the caller to an HR Administrator with one.

- [ ] **Step 6: Commit**

```bash
git add API/Controllers Application/EmployeeProfiles Tests/WorkTrack.Tests
git commit -m "Route the HR Administrator through the department scope for profiles, teammates, children, files and projects

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Notifications — SignalR groups and the two digests

**Files:**
- Modify: `API/Hubs/NotificationsHub.cs:48-67`
- Modify: `Application/Reminders/ReminderDispatcher.cs` (`BirthdayRemindersAsync`, `DailyAttendanceReportAsync`, `BuildDailyAttendanceReportAsync`, helpers)
- Test: `Tests/WorkTrack.Tests/HrAdministratorNotificationScopeTests.cs` (create)

**Interfaces:**
- Produces: `NotificationsHub.AdminGroup` holds System Administrators only; Managers and HR Administrators join `DepartmentManagerGroup(id)` for each resolved department. `ReminderDispatcher.BuildDailyAttendanceReportAsync(AppSettings, DateOnly, IReadOnlyCollection<int>? departmentIds, CancellationToken)` — `null` is the whole company.

- [ ] **Step 1: Write the failing tests**

```csharp
// Tests/WorkTrack.Tests/HrAdministratorNotificationScopeTests.cs
using System.Security.Claims;
using API.Hubs;
using Application.Reminders;
using Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// What an HR Administrator is told follows what they may see: live refreshes for
/// their departments only (the per-department SignalR groups, not the admin
/// group), and digests filtered to their people.
/// </summary>
public class HrAdministratorNotificationScopeTests : IDisposable
{
    private readonly ServiceProvider _services;

    public HrAdministratorNotificationScopeTests()
    {
        var collection = new ServiceCollection();
        collection.AddLogging(b => b.SetMinimumLevel(LogLevel.Warning));
        collection.AddDbContext<AppDbContext>(o => o
            .UseInMemoryDatabase($"hr-notify-{Guid.NewGuid()}")
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        collection.AddIdentityCore<User>().AddRoles<Role>().AddEntityFrameworkStores<AppDbContext>();
        _services = collection.BuildServiceProvider();
    }

    public void Dispose() => _services.Dispose();
    private AppDbContext Db => _services.GetRequiredService<AppDbContext>();
    private UserManager<User> Users => _services.GetRequiredService<UserManager<User>>();
    private RoleManager<Role> Roles => _services.GetRequiredService<RoleManager<Role>>();

    private async Task<User> GivenUserAsync(string email, string role, int? profileDepartmentId, params int[] assigned)
    {
        if (!await Roles.RoleExistsAsync(role)) Assert.True((await Roles.CreateAsync(new Role { Name = role })).Succeeded);
        var user = new User { UserName = email, Email = email, DisplayName = email, EmailConfirmed = true, DateOfBirth = DateOnly.FromDateTime(DateTime.Now) };
        Assert.True((await Users.CreateAsync(user)).Succeeded);
        Assert.True((await Users.AddToRoleAsync(user, role)).Succeeded);
        Db.EmployeeProfiles.Add(new EmployeeProfile { Id = $"p-{user.Id}", UserId = user.Id, DepartmentId = profileDepartmentId });
        foreach (var d in assigned) Db.UserDepartments.Add(new UserDepartment { UserId = user.Id, DepartmentId = d });
        await Db.SaveChangesAsync();
        return user;
    }

    // ── SignalR ──────────────────────────────────────────────────────────────────

    private sealed class RecordingGroups : IGroupManager
    {
        public List<string> Joined { get; } = [];
        public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken ct = default) { Joined.Add(groupName); return Task.CompletedTask; }
        public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class FakeCallerContext(ClaimsPrincipal user) : HubCallerContext
    {
        public override string ConnectionId => "conn-1";
        public override string? UserIdentifier => user.FindFirstValue(ClaimTypes.NameIdentifier);
        public override ClaimsPrincipal? User => user;
        public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
        public override IFeatureCollection Features => new Microsoft.AspNetCore.Http.Features.FeatureCollection();
        public override CancellationToken ConnectionAborted => CancellationToken.None;
        public override void Abort() { }
    }

    private async Task<List<string>> GroupsJoinedBy(User user)
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, user.Id), new Claim(ClaimTypes.Name, user.UserName!)], "test"));
        var groups = new RecordingGroups();
        var hub = new NotificationsHub(Users, Db) { Context = new FakeCallerContext(principal), Groups = groups };
        await hub.OnConnectedAsync();
        return groups.Joined;
    }

    [Fact]
    public async Task An_HR_Administrator_joins_their_department_groups_and_not_the_admin_group()
    {
        var hr = await GivenUserAsync("hr@t.local", AppRoles.HrAdministrator, null, 3, 5);

        var joined = await GroupsJoinedBy(hr);

        Assert.DoesNotContain(NotificationsHub.AdminGroup, joined);
        Assert.Equal(new[] { NotificationsHub.DepartmentManagerGroup(3), NotificationsHub.DepartmentManagerGroup(5) }, joined.OrderBy(g => g));
    }

    [Fact]
    public async Task A_System_Administrator_still_joins_the_admin_group_alone()
    {
        var sys = await GivenUserAsync("sys@t.local", AppRoles.SystemAdministrator, null);

        Assert.Equal([NotificationsHub.AdminGroup], await GroupsJoinedBy(sys));
    }

    // ── Digests ──────────────────────────────────────────────────────────────────

    private static AppSettings Settings() => new()
    {
        EmailNotificationsEnabled = true, WorkingDays = "custom", WorkingDaysCustom = "sun,mon,tue,wed,thu,fri,sat",
        HolidayCountryCode = null, TimeZoneId = "UTC", WorkingHoursStart = "09:00", WorkingHoursEnd = "18:00",
        TimesheetSubmissionDeadlineDay = "mon", TimesheetSubmissionDeadlineTime = "00:00",
    };

    [Fact]
    public async Task The_birthday_digest_to_an_HR_Administrator_names_only_their_departments_people()
    {
        Db.Departments.AddRange(new Department { Id = 1, Name = "A", Code = "A" }, new Department { Id = 2, Name = "B", Code = "B" });
        await Db.SaveChangesAsync();
        var hr = await GivenUserAsync("hr@t.local", AppRoles.HrAdministrator, null, 1);
        await GivenUserAsync("sys@t.local", AppRoles.SystemAdministrator, null);
        await GivenUserAsync("anna@t.local", AppRoles.Employee, 1);
        await GivenUserAsync("ben@t.local", AppRoles.Employee, 2);
        var email = new FakeEmailService();

        await new ReminderDispatcher(Db, email, NullLogger<ReminderDispatcher>.Instance)
            .DispatchAsync(ReminderDispatcher.BirthdayReminder, Settings(), CancellationToken.None);

        var toHr = Assert.Single(email.Sent, m => m.Recipient == hr.Email);
        Assert.Contains("anna@t.local", toHr.HtmlBody);
        Assert.DoesNotContain("ben@t.local", toHr.HtmlBody);
        var toSys = Assert.Single(email.Sent, m => m.Recipient == "sys@t.local");
        Assert.Contains("ben@t.local", toSys.HtmlBody);
    }

    [Fact]
    public async Task The_daily_attendance_report_to_an_HR_Administrator_covers_only_their_departments()
    {
        Db.Departments.AddRange(new Department { Id = 1, Name = "A", Code = "A" }, new Department { Id = 2, Name = "B", Code = "B" });
        Db.LeaveTypes.Add(new LeaveType { Id = 1, Name = "Annual Leave", IsActive = true });
        await Db.SaveChangesAsync();
        var hr = await GivenUserAsync("hr@t.local", AppRoles.HrAdministrator, null, 1);
        await GivenUserAsync("anna@t.local", AppRoles.Employee, 1);
        await GivenUserAsync("ben@t.local", AppRoles.Employee, 2);
        var email = new FakeEmailService();

        await new ReminderDispatcher(Db, email, NullLogger<ReminderDispatcher>.Instance)
            .DispatchAsync(ReminderDispatcher.DailyAttendanceReport, Settings(), CancellationToken.None);

        var toHr = Assert.Single(email.Sent, m => m.Recipient == hr.Email);
        // Neither checked in yesterday; only Anna is HR's to be told about.
        Assert.Contains("anna@t.local", toHr.HtmlBody);
        Assert.DoesNotContain("ben@t.local", toHr.HtmlBody);
    }
}
```

`HubCallerContext.Features` needs `using Microsoft.AspNetCore.Http.Features;`. The `API` project must be referenced by the test project (it already is: `SystemAdministrationSurfaceTests` uses `API.Controllers`).

- [ ] **Step 2: Run to verify they fail**

Expected: HR joins `AdminGroup` (FAIL); digests to HR contain Ben (FAIL).

- [ ] **Step 3: Hub**

Replace lines 48-67 of `NotificationsHub.OnConnectedAsync` with:

```csharp
        // The admin group is the unscoped audience: System Administrators only.
        if (roles.Contains(AppRoles.SystemAdministrator))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, AdminGroup);
        }

        // A Manager and an HR Administrator hear about their departments — the same
        // set every query scopes them to, from the same resolver.
        if (roles.Any(role => AppRoles.DepartmentScopedRoles.Contains(role)))
        {
            var scope = await ManagerAccessScopeResolver.ResolveAsync(_context, user.Id, Context.ConnectionAborted);
            foreach (var deptId in scope.ManagedDepartmentIds)
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, DepartmentManagerGroup(deptId));
            }
        }
```

Add `using Application.Core;`. Change the `AdminGroup` comment to `// The unscoped audience: System Administrators. An HR Administrator is in the per-department groups below instead.`

- [ ] **Step 4: Digests**

In `ReminderDispatcher`:

(a) Add a helper beside `GetManagersWithDepartmentAsync`:

```csharp
    private record ScopedContact(string UserId, string Email, string? DisplayName, List<int> DepartmentIds);

    /// <summary>Every HR Administrator with an email, and the departments assigned to them. One with none is not mailed a digest: there is nobody in it to tell them about.</summary>
    private async Task<List<ScopedContact>> GetHrAdministratorsAsync(CancellationToken ct)
    {
        var hr = await GetUsersInRolesAsync([AppRoles.HrAdministrator], ct);
        if (hr.Count == 0) return [];
        var ids = hr.Select(h => h.UserId).ToList();
        var rows = await context.UserDepartments
            .Where(ud => ids.Contains(ud.UserId))
            .Select(ud => new { ud.UserId, ud.DepartmentId })
            .ToListAsync(ct);
        return hr
            .Select(h => new ScopedContact(h.UserId, h.Email, h.DisplayName,
                rows.Where(r => r.UserId == h.UserId).Select(r => r.DepartmentId).Distinct().ToList()))
            .Where(h => h.DepartmentIds.Count > 0)
            .ToList();
    }
```

(b) `BirthdayRemindersAsync`: change `var admins = await GetUsersInRolesAsync(AppRoles.Administrators, ct);` to `var admins = await GetUsersInRolesAsync([AppRoles.SystemAdministrator], ct); var hrAdmins = await GetHrAdministratorsAsync(ct);`. After the `foreach (var admin in admins)` loop, add:

```csharp
            foreach (var hr in hrAdmins)
            {
                var scoped = upcoming.Where(u => u.DepartmentId != null && hr.DepartmentIds.Contains(u.DepartmentId.Value)).ToList();
                if (scoped.Count == 0) continue;
                var html = $"<p>Hello {WebUtility.HtmlEncode(hr.DisplayName ?? hr.Email)},</p><p>Upcoming birthdays in your departments:</p><ul>{string.Join("", scoped.Select(u => LineHtml(u.Name, u.Date, u.TurningAge)))}</ul>";
                var text = $"Hello {hr.DisplayName ?? hr.Email},\n\nUpcoming birthdays in your departments:\n{string.Join("\n", scoped.Select(u => LineText(u.Name, u.Date, u.TurningAge)))}";
                if (await SendEmailAsync(hr.Email, "Jenus People: upcoming birthdays 🎂", html, text, ct)) sent++;
            }
```

and change the managers loop's skip to `if (admins.Any(a => a.UserId == mgr.UserId) || hrAdmins.Any(h => h.UserId == mgr.UserId)) continue;`. Update the section comment to `// Notifies System Administrators (whole org), HR Administrators (their departments) and managers (their department)`.

(c) `DailyAttendanceReportAsync`: replace from `var admins = ...` through the send loop with:

```csharp
        var admins = await GetUsersInRolesAsync([AppRoles.SystemAdministrator], ct);
        var hrAdmins = await GetHrAdministratorsAsync(ct);
        if (admins.Count == 0 && hrAdmins.Count == 0)
        {
            logger.LogInformation("daily-attendance-report: no administrator with an email address; nothing sent.");
            return;
        }

        var sent = 0;
        if (settings.EmailNotificationsEnabled)
        {
            DailyReport? company = admins.Count > 0 ? await BuildDailyAttendanceReportAsync(settings, reportDay.Value, null, ct) : null;
            var subject = $"Jenus People: attendance report for {reportDay.Value:ddd dd MMM yyyy}";
            foreach (var admin in admins)
            {
                var html = RenderDailyReportHtml(admin.DisplayName ?? admin.Email, company!);
                var text = RenderDailyReportText(admin.DisplayName ?? admin.Email, company!);
                if (await SendEmailAsync(admin.Email, subject, html, text, ct)) sent++;
            }

            // One report per HR Administrator, over their departments alone.
            foreach (var hr in hrAdmins)
            {
                var scoped = await BuildDailyAttendanceReportAsync(settings, reportDay.Value, hr.DepartmentIds, ct);
                var html = RenderDailyReportHtml(hr.DisplayName ?? hr.Email, scoped);
                var text = RenderDailyReportText(hr.DisplayName ?? hr.Email, scoped);
                if (await SendEmailAsync(hr.Email, subject, html, text, ct)) sent++;
            }
        }
        else
        {
            logger.LogInformation("daily-attendance-report: email notifications disabled; skipping emails.");
        }

        logger.LogInformation("daily-attendance-report: dispatched for {Day}. Emails sent: {Sent}.", reportDay.Value, sent);
```

(d) `BuildDailyAttendanceReportAsync(AppSettings settings, DateOnly day, IReadOnlyCollection<int>? departmentIds, CancellationToken ct)`: build the `people` query in two steps so EF never sees a nullable captured collection:

```csharp
        var peopleQuery = AttendanceDay.ExcludeAdmins(context.EmployeeProfiles)
            .Where(p => p.User != null && p.User.IsActive);
        if (departmentIds is not null)
        {
            var ids = departmentIds.ToList();
            peopleQuery = peopleQuery.Where(p => p.DepartmentId != null && ids.Contains(p.DepartmentId.Value));
        }
        var people = await peopleQuery
            .OrderBy(p => p.User!.DisplayName)
            .Select(p => new { /* unchanged projection */ })
            .ToListAsync(ct);
```

Update the header comment at the top of the class: `daily-attendance-report — System Administrators told (company-wide) and HR Administrators (their departments)`.

- [ ] **Step 5: Run `HrAdministratorNotificationScopeTests`, `DailyAttendanceReportTests`, `PendingApprovalsDigestExcludesAdminsTests`, `AttendanceRemindersExcludeAdminsTests`, any `*Reminder*`/`*Birthday*` tests**

Expected: all pass. `DailyAttendanceReportTests` seeds a System Administrator, so its expectations hold.

- [ ] **Step 6: Commit**

```bash
git add API/Hubs/NotificationsHub.cs Application/Reminders/ReminderDispatcher.cs Tests/WorkTrack.Tests/HrAdministratorNotificationScopeTests.cs
git commit -m "Tell an HR Administrator about their departments only: SignalR groups and the two digests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: `departmentIds` on the current-user payload

**Files:**
- Modify: `API/DTOs/CurrentUserPayload.cs`, `API/Controllers/AccountController.cs:186-201`
- Test: `Tests/WorkTrack.Tests/CurrentUserPayloadTests.cs`

**Interfaces:**
- Produces: `CurrentUserPayload.DepartmentIds : IList<int>` — the resolved scope (profile department plus assigned rows). `CurrentUserPayload.From(User, EmployeeProfile?, IList<string> roles, IEnumerable<int>? assignedDepartmentIds = null)`.

- [ ] **Step 1: Write the failing test**

Add to `CurrentUserPayloadTests`:

```csharp
    [Fact]
    public void The_department_ids_union_the_profile_department_and_the_assigned_rows()
    {
        var profile = new EmployeeProfile { Id = "p", UserId = "user-1", DepartmentId = 4 };
        var payload = CurrentUserPayload.From(AUser(Gender.Male), profile, ["Manager"], [4, 7]);
        Assert.Equal(new[] { 4, 7 }, payload.DepartmentIds);

        var hr = CurrentUserPayload.From(AUser(null), new EmployeeProfile { Id = "h", UserId = "user-1", DepartmentId = null }, ["HR Administrator"], [2, 3]);
        Assert.Equal(new[] { 2, 3 }, hr.DepartmentIds);

        var json = JsonSerializer.SerializeToElement(hr, Options);
        Assert.Equal(2, json.GetProperty("departmentIds").GetArrayLength());
    }
```

- [ ] **Step 2: Run to verify it fails**

Expected: compile error, no `DepartmentIds` / four-argument `From`.

- [ ] **Step 3: Implement**

In `CurrentUserPayload`, after `DepartmentName`:

```csharp
    /// <summary>
    /// Every department this person's reach covers: the one on their profile plus
    /// those assigned through <c>UserDepartment</c> — an HR Administrator's whole
    /// scope, a Manager's own plus extras, an Employee's one, a System
    /// Administrator's none. Plural because <see cref="DepartmentId"/> cannot say
    /// "these three". Ascending, distinct.
    /// </summary>
    public IList<int> DepartmentIds { get; init; } = [];
```

and change `From`:

```csharp
    public static CurrentUserPayload From(
        User user, EmployeeProfile? employeeProfile, IList<string> roles, IEnumerable<int>? assignedDepartmentIds = null) => new()
    {
        // ...unchanged...
        DepartmentIds = (assignedDepartmentIds ?? [])
            .Concat(employeeProfile?.DepartmentId is int own ? [own] : [])
            .Distinct().OrderBy(id => id).ToList(),
        Roles = roles,
    };
```

In `AccountController.GetUserInfo`, before the `return`:

```csharp
        var assignedDepartmentIds = await context.UserDepartments
            .Where(ud => ud.UserId == user.Id)
            .Select(ud => ud.DepartmentId)
            .ToListAsync();

        return Ok(CurrentUserPayload.From(user, employeeProfile, roles, assignedDepartmentIds));
```

- [ ] **Step 4: Run `CurrentUserPayloadTests`**

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add API/DTOs/CurrentUserPayload.cs API/Controllers/AccountController.cs Tests/WorkTrack.Tests/CurrentUserPayloadTests.cs
git commit -m "Carry the signed-in user's department ids on user-info

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Client types, API call and validation helper

**Files:**
- Modify: `client/src/lib/types/admin-user.ts`, `client/src/lib/types/user.ts`, `client/src/lib/api/admin-users.ts`, `client/src/lib/validation/person.ts`, `client/src/lib/roles.ts` (doc)
- Test: `client/src/lib/validation/person.test.ts`

**Interfaces:**
- Produces: `AdminUser.departmentIds?: number[]`; `AdminCreateUserRequest.departmentIds: number[] | null`; `AdminSetUserDepartmentsRequest { departmentIds: number[] }`; `setAdminUserDepartments(id, request): Promise<AdminUser>`; `UserInfo.departmentIds?: number[]`; `HR_DEPARTMENTS_REQUIRED_MESSAGE = 'Select at least one department.'`; `hrDepartmentsError(role: UserRole, departmentIds: readonly number[]): string | undefined`.

- [ ] **Step 1: Write the failing test**

Append to `client/src/lib/validation/person.test.ts` (check its imports and add `hrDepartmentsError, HR_DEPARTMENTS_REQUIRED_MESSAGE` to the import from `./person`):

```ts
describe('hrDepartmentsError', () => {
    it('requires at least one department for an HR Administrator', () => {
        expect(hrDepartmentsError('HR Administrator', [])).toBe(HR_DEPARTMENTS_REQUIRED_MESSAGE)
        expect(hrDepartmentsError('HR Administrator', [3])).toBeUndefined()
    })

    it('asks nothing of any other role', () => {
        expect(hrDepartmentsError('Employee', [])).toBeUndefined()
        expect(hrDepartmentsError('Manager', [])).toBeUndefined()
        expect(hrDepartmentsError('System Administrator', [])).toBeUndefined()
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && node_modules/.bin/vitest run src/lib/validation/person.test.ts`
Expected: FAIL, `hrDepartmentsError` is not exported.

- [ ] **Step 3: Implement**

`person.ts`, at the end (add `import type { UserRole } from '../types/user'` alongside the existing `Gender` import):

```ts
export const HR_DEPARTMENTS_REQUIRED_MESSAGE = 'Select at least one department.'

/**
 * Mirrors `HrDepartmentScopeRules` and the two validators that apply it. An HR
 * Administrator's reach is the departments assigned to them, so one is required;
 * the API also refuses the field for every other role, but the dialogs never send
 * it for them, so there is nothing for this to say about those.
 */
export function hrDepartmentsError(role: UserRole, departmentIds: readonly number[]): string | undefined {
    return role === 'HR Administrator' && departmentIds.length === 0 ? HR_DEPARTMENTS_REQUIRED_MESSAGE : undefined
}
```

`admin-user.ts`: in `AdminUser` after `roles`:

```ts
    /**
     * The departments assigned through UserDepartment: an HR Administrator's whole
     * scope, a Manager's extra departments, empty otherwise. Optional only for an
     * API predating the field.
     */
    departmentIds?: number[]
```

in `AdminCreateUserRequest` after `departmentId`:

```ts
    /**
     * The departments an HR Administrator runs — at least one for that role, and
     * null for every other, which the API refuses the field for. See
     * `hrDepartmentsError` in `lib/validation/person.ts`.
     */
    departmentIds: number[] | null
```

and a new interface after `AdminSetUserRolesRequest`:

```ts
/** A replace, not a patch: the full set an HR Administrator is assigned. */
export interface AdminSetUserDepartmentsRequest {
    departmentIds: number[]
}
```

`user.ts`, in `UserInfo` after `departmentName`:

```ts
    /**
     * Every department this person's reach covers — profile department plus
     * assigned ones; an HR Administrator's whole scope. Optional for an API
     * predating the field. No page reads it yet.
     */
    departmentIds?: number[]
```

`admin-users.ts`, after `setAdminUserRoles` (add `AdminSetUserDepartmentsRequest` to the type import):

```ts
export async function setAdminUserDepartments(id: string, request: AdminSetUserDepartmentsRequest) {
    const response = await apiClient.put<AdminUser>(`/adminusers/${id}/departments`, request)
    return response.data
}
```

`roles.ts` doc: change the **Reach** bullet to `- **Reach** — who may open the company-wide pages: \`isAdministrator\`. System Administrator and HR Administrator both do — but only the System Administrator sees every department; an HR Administrator sees the departments assigned to them, and the server scopes their data. The role-scoped rules (no department, gender or start date of their own, no coverage on their own leave) read this one.` and the `isAdministrator` JSDoc to `/** Whether any of \`roles\` is an administrator role (may open the company-wide pages). Unknown roles read as not. */`.

- [ ] **Step 4: Run the validation tests and typecheck**

Run: `node_modules/.bin/vitest run src/lib/validation/person.test.ts` then `npx tsc -b` from `client/`.
Expected: tests pass; `tsc` reports errors only in `AdminUsersPanel.tsx` where `AdminCreateUserRequest` is built without `departmentIds` (fixed in Task 13). If `tsc` errors elsewhere, fix those call sites by passing `departmentIds: null`.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib
git commit -m "Add the HR Administrator's departments to the client types, API module and validation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: The dialogs, the mutation order and the row chips

**Files:**
- Modify: `client/src/components/admin/AdminUsersPanel.tsx`
- Test: `client/src/components/admin/AdminUsersPanel.test.tsx`

**Interfaces:**
- Consumes: Task 12 exports.
- Produces: a `HrDepartmentsField` component inside `AdminUsersPanel.tsx`; both dialogs' `onSubmit` payloads gain `departmentIds: number[] | null`.

- [ ] **Step 1: Write the failing tests**

In `AdminUsersPanel.test.tsx`:

(a) Add `setAdminUserDepartments: vi.fn(),` to the `vi.mock('../../lib/api', ...)` factory, after `setAdminUserRoles`.

(b) Add a second department constant after `DEPARTMENT`: `const FINANCE = { id: 8, name: 'Finance', code: 'FIN', isActive: true }` and change the `beforeEach` to `api.getDepartments.mockResolvedValue([DEPARTMENT, FINANCE] as never)`. Update `selectDepartment` to find the option by name as it does (unchanged; the option text still matches).

(c) In the test `drops the profile fields and Gender for an HR Administrator too`, change `expect(within(dialog).queryByLabelText(/department/i)).not.toBeInTheDocument()` to `expect(within(dialog).queryByLabelText(/^department$/i)).not.toBeInTheDocument()` (the plural "Departments" picker is now expected).

(d) Add a new describe block:

```tsx
/*
 * An HR Administrator runs the departments assigned to them, not the company.
 * Picking the role shows a multi-select under the radios; at least one department
 * is required, mirroring HrDepartmentScopeRules on the server.
 */
describe('AdminUsersPanel — HR Administrator departments', () => {
    async function pickDepartment(dialog: HTMLElement, name: string) {
        const picker = within(dialog).getByLabelText(/^departments$/i)
        fireEvent.mouseDown(picker)
        fireEvent.click(await screen.findByRole('option', { name: new RegExp(name) }))
    }

    it('shows the picker for an HR Administrator only', async () => {
        const dialog = await openCreateDialog()

        expect(within(dialog).queryByLabelText(/^departments$/i)).not.toBeInTheDocument()
        fireEvent.click(within(dialog).getByRole('radio', { name: 'HR Administrator' }))
        expect(within(dialog).getByLabelText(/^departments$/i)).toBeInTheDocument()
        expect(within(dialog).getByText(/for the departments assigned below/i)).toBeInTheDocument()
        fireEvent.click(within(dialog).getByRole('radio', { name: 'System Administrator' }))
        expect(within(dialog).queryByLabelText(/^departments$/i)).not.toBeInTheDocument()
    })

    it('holds Create until at least one department is picked, then sends the ids', async () => {
        const dialog = await openCreateDialog()
        api.createAdminUser.mockResolvedValue({
            id: 'u1', userName: 'hr@example.test', email: 'hr@example.test', displayName: 'HR Person',
            imageUrl: '', emailConfirmed: true, isActive: true, roles: ['HR Administrator'], departmentIds: [7, 8], inviteEmailSent: true,
        })

        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'hr@example.test' } })
        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'HR Person' } })
        setDateOfBirth(dialog)
        fireEvent.click(within(dialog).getByRole('radio', { name: 'HR Administrator' }))

        expect(within(dialog).getByText('Select at least one department.')).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeDisabled()

        await pickDepartment(dialog, 'Engineering')
        await pickDepartment(dialog, 'Finance')

        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeEnabled()
        fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

        await waitFor(() => expect(createAdminUser).toHaveBeenCalledTimes(1))
        const sent = api.createAdminUser.mock.calls[0][0]
        expect(sent.roles).toEqual(['HR Administrator'])
        expect(sent.departmentIds).toEqual([7, 8])
        expect(sent.departmentId).toBeNull()
    })

    const HR_USER = {
        id: 'u-hr', userName: 'hr@example.test', email: 'hr@example.test', displayName: 'Hana HR',
        imageUrl: '', emailConfirmed: true, isActive: true, roles: ['HR Administrator'], dateOfBirth: '1990-03-04', departmentIds: [7],
    }
    const HR_PROFILE = {
        id: 'p-hr', userId: 'u-hr', displayName: 'Hana HR', departmentId: null, managerId: null,
        annualLeaveEntitlement: 20, leaveBalance: 20, jobTitle: null, employmentStartDate: null, createdAt: '2026-01-01',
    }

    async function openEditForHr() {
        api.getAdminUsers.mockResolvedValue([HR_USER] as never)
        api.getEmployeeProfiles.mockResolvedValue([HR_PROFILE] as never)
        renderPanel()
        const nameEl = await screen.findByText('Hana HR')
        const row = nameEl.parentElement!.parentElement!.parentElement!.parentElement!
        fireEvent.click(within(row).getByTitle('Edit'))
        return screen.getByRole('dialog')
    }

    it('shows the assigned departments on the row and pre-fills them in Edit User', async () => {
        const dialog = await openEditForHr()

        // The row: the department cell reads the assigned names, not a dash.
        expect(screen.getAllByText('Engineering').length).toBeGreaterThan(0)
        // The dialog: the chip is already there.
        expect(within(dialog).getByText('Engineering (ENG)')).toBeInTheDocument()
    })

    it('saves roles, then departments, then the user', async () => {
        api.setAdminUserRoles.mockResolvedValue(HR_USER as never)
        api.setAdminUserDepartments.mockResolvedValue(HR_USER as never)
        api.updateAdminUser.mockResolvedValue(HR_USER as never)
        const dialog = await openEditForHr()

        await pickDepartment(dialog, 'Finance')
        fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

        await waitFor(() => expect(api.setAdminUserDepartments).toHaveBeenCalledTimes(1))
        expect(api.setAdminUserDepartments).toHaveBeenCalledWith('u-hr', { departmentIds: [7, 8] })
        const order = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0]
        expect(order(api.setAdminUserRoles)).toBeLessThan(order(api.setAdminUserDepartments))
        expect(order(api.setAdminUserDepartments)).toBeLessThan(order(api.updateAdminUser))
        expect(api.updateEmployeeProfile).not.toHaveBeenCalled()
    })
})
```

Check whether `getByTitle('Edit')` matches how other edit tests open the dialog in this file (it does at line 1683); if the row-walking depth differs for an admin row, copy the depth used by the "employment start date" block's `openEditDialog`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && node_modules/.bin/vitest run src/components/admin/AdminUsersPanel.test.tsx`
Expected: the new block fails (no picker; `departmentIds` undefined); the rest passes.

- [ ] **Step 3: Imports, role text, the field component**

In `AdminUsersPanel.tsx`:

(a) Imports: add `import Autocomplete from '@mui/material/Autocomplete'` and `import Chip from '@mui/material/Chip'` beside the other MUI imports; add `setAdminUserDepartments,` to the `../../lib/api` import; add `hrDepartmentsError,` to the `../../lib/validation/person` import.

(b) `ROLE_DESCRIPTIONS['HR Administrator']` becomes exactly:

```ts
    'HR Administrator': 'Leave, attendance and timesheets for the departments assigned below, but no access to Users, Departments, Configuration or System. Has no department or manager of their own.',
```

(c) After `ROLE_DESCRIPTIONS`, add the field:

```tsx
/**
 * Which departments an HR Administrator runs. Shown under the role radios only
 * while that role is selected, and required there: their reach is exactly this
 * set, so an empty one is an HR Administrator who can see nothing. Active
 * departments are offered; one already assigned but since deactivated stays
 * selectable, so Edit User does not open invalid on a record nobody touched.
 */
function HrDepartmentsField(props: {
    idPrefix: string
    departments: Department[]
    value: number[]
    onChange: (ids: number[]) => void
    error?: string
    showError: boolean
}) {
    const options = props.departments.filter((d) => d.isActive || props.value.includes(d.id))
    const selected = options.filter((d) => props.value.includes(d.id))

    return (
        <Autocomplete<Department, true, false, false>
            multiple
            id={`${props.idPrefix}-hr-departments`}
            options={options}
            value={selected}
            getOptionLabel={(d) => `${d.name} (${d.code})`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, next) => props.onChange(next.map((d) => d.id))}
            renderValue={(chosen, getItemProps) =>
                chosen.map((d, index) => <Chip {...getItemProps({ index })} key={d.id} label={`${d.name} (${d.code})`} size="small" />)
            }
            renderInput={(params) => (
                <TextField
                    {...params}
                    label="Departments"
                    required
                    error={props.showError && !!props.error}
                    helperText={props.showError && props.error
                        ? props.error
                        : 'This HR Administrator will see leave, attendance and timesheets for these departments only.'}
                />
            )}
            sx={{ mt: 1.5 }}
        />
    )
}
```

MUI is 7.3.9 here, whose `Autocomplete` takes `renderValue` (the `renderTags` prop was removed in 7).

- [ ] **Step 4: `EditUserDialog`**

- Add `departmentIds: number[] | null` to the `onSubmit` payload type (after `roles`), with the JSDoc `/** The HR Administrator's departments; null for every other role, which the API refuses the field for. */`.
- Add state `const [hrDepartmentIds, setHrDepartmentIds] = useState<number[]>([])` after `gender`.
- In the hydrate effect, after `setGender(...)`: `setHrDepartmentIds(props.data!.user.departmentIds ?? [])`.
- After `const genderMissing = ...`, add:

```tsx
    /* The departments ride with the role: shown and required for an HR
       Administrator, sent as null for everyone else. A demotion from HR drops them
       (the server clears the rows with the role); a promotion to HR has to pick
       some before it can be saved. */
    const isHr = role === 'HR Administrator'
    const hrDepartmentsMissing = hrDepartmentsError(role, hrDepartmentIds)
    const effectiveDepartmentIds = isHr ? hrDepartmentIds : null
```

- In the "Role & access" section, after the `<Typography variant="caption">` closing tag, inside the `<Box>`:

```tsx
                            {isHr && (
                                <HrDepartmentsField
                                    idPrefix="edit-user"
                                    departments={props.departments}
                                    value={hrDepartmentIds}
                                    onChange={(ids) => { setDirty(true); setHrDepartmentIds(ids) }}
                                    error={hrDepartmentsMissing}
                                    showError={dirty || (!!user && hydratedFor === user.id)}
                                />
                            )}
```

- Save button: add `|| !!hrDepartmentsMissing` to the `disabled` expression, and `departmentIds: effectiveDepartmentIds,` to the `onSubmit` object after `roles: [role],`.

- [ ] **Step 5: `CreateUserDialog`**

- Add `departmentIds: number[] | null` to the `onSubmit` payload type after `roles`.
- Add state `const [hrDepartmentIds, setHrDepartmentIds] = useState<number[]>([])`; reset it in `close()` (`setHrDepartmentIds([])`).
- After `const genderMissing = ...`:

```tsx
    /* See EditUserDialog's copy. Announced once the admin has started, like the
       other blanks on a fresh form. */
    const isHr = role === 'HR Administrator'
    const hrDepartmentsMissing = hrDepartmentsError(role, hrDepartmentIds)
    const effectiveDepartmentIds = isHr ? hrDepartmentIds : null
```

- In "Role & access" after the caption:

```tsx
                            {isHr && (
                                <HrDepartmentsField
                                    idPrefix="create-user"
                                    departments={props.departments}
                                    value={hrDepartmentIds}
                                    onChange={(ids) => { setDirty(true); setHrDepartmentIds(ids) }}
                                    error={hrDepartmentsMissing}
                                    showError={dirty}
                                />
                            )}
```

- Create button: add `|| !!hrDepartmentsMissing` to `disabled`; add `departmentIds: effectiveDepartmentIds,` after `roles: [role],` in the payload.

- [ ] **Step 6: The mutations**

`createMutation`'s `mutationFn` destructures `{ children, ...request }`; `request` now carries `departmentIds`, and `AdminCreateUserRequest` requires it, so nothing else changes there.

`editMutation`: add `departmentIds: number[] | null` to the payload type after `roles`, and change the body to:

```tsx
            // The order of these four is load-bearing. Roles go first: the user
            // validator reads the *stored* role to decide whether a gender is
            // required or refused, and the departments endpoint refuses anyone who
            // is not, as stored, an HR Administrator — so both have to land after
            // the role they were built for. (A role change *out* of HR clears the
            // stored departments itself, which is why there is no call for that
            // case.) The user then goes before the profile: the profile validator
            // checks the start date against the *stored* date of birth.
            await setAdminUserRoles(payload.userId, { roles: payload.roles })
            if (payload.departmentIds) {
                await setAdminUserDepartments(payload.userId, { departmentIds: payload.departmentIds })
            }
            await updateAdminUser(payload.userId, { email: payload.email, displayName: payload.displayName, phoneNumber: payload.phoneNumber, dateOfBirth: payload.dateOfBirth, gender: payload.gender })
            if (payload.profile) { /* unchanged */ }
```

- [ ] **Step 7: The row's department cell**

At the "Department — not applicable to admins" cell (~line 1214), replace the ternary with:

```tsx
                    {!isAdministratorRole(role) && derived.departmentName ? (
                        <Box component="span" sx={{ /* unchanged chip sx */ }}>{derived.departmentName}</Box>
                    ) : role === 'HR Administrator' && (u.departmentIds?.length ?? 0) > 0 ? (
                        /* An HR Administrator's cell reads the departments assigned to
                           them — their reach — where a System Administrator's stays blank. */
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {u.departmentIds!.map((id) => (
                                <Box key={id} component="span" sx={{
                                    display: 'inline-block', bgcolor: softBg('info'), color: 'info.dark',
                                    borderRadius: '4px', px: '8px', py: '2px', fontSize: 11, fontWeight: 500,
                                }}>{deptById.get(id)?.name ?? `#${id}`}</Box>
                            ))}
                        </Box>
                    ) : <Box sx={{ fontSize: 11, color: 'text.disabled' }}>—</Box>}
```

`deptById` is defined in the panel; if this cell is rendered by a child component that does not receive it, pass `deptById` down as a prop (or pass `departmentNames: string[]` precomputed in `derivedAll`). Update the cell comment to `{/* Department — an Employee's or Manager's own; an HR Administrator's assigned set; blank for a System Administrator */}`.

- [ ] **Step 8: Run the panel tests, lint and typecheck**

Run from `client/`: `node_modules/.bin/vitest run src/components/admin/AdminUsersPanel.test.tsx`, then `npm run lint`, then `npx tsc -b`.
Expected: all pass, no lint errors, no type errors.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/admin/AdminUsersPanel.tsx client/src/components/admin/AdminUsersPanel.test.tsx
git commit -m "Let a System Administrator assign an HR Administrator their departments from the user dialogs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Documentation and a full test run

**Files:**
- Modify: `CLAUDE.md` (the "two administrators are disjoint" block and the `UserDepartment`-related trap list)
- Modify: `Tests/WorkTrack.Tests/NonManagerUserDepartmentTests.cs` (class doc), `Persistence/DbInitializer.cs` (any remaining "only a manager" wording)

- [ ] **Step 1: Rewrite the **Reach** bullet in `CLAUDE.md`**

Replace the bullet beginning `- **Reach** — who sees every department. Both roles.` with:

```markdown
- **Reach** — who may open the company-wide pages. Both roles, but they do not see
  the same data: the **System Administrator sees every department**, and the **HR
  Administrator sees the departments assigned to them** as `UserDepartment` rows
  (Users → Edit User → Role & access → Departments; `PUT /api/adminusers/{id}/departments`,
  System Administrator only). `AppRoles.Administrators` / `AdministratorRoles` /
  `IsAdministrator` are the *authorization* gate for those pages and the role-scoped
  rules (an HR Administrator still has no department, gender or employment start
  date of their own, files their own leave without coverage and is excluded from
  attendance); the client mirrors them in `client/src/lib/roles.ts`. They are
  **never a data filter**. A query asks `User.IsSystemAdministrator()` for the
  unscoped reach and `User.IsDepartmentScoped()` (Manager or HR Administrator) for
  the scoped one, and the scoped one goes through `ManagerAccessScopeResolver`,
  whose `ManagedDepartmentIds` is the caller's profile department plus their
  `UserDepartment` rows. Four queries with no scope before — company attendance,
  presence, the Users list and detail — take `ScopeToCaller`, which the controllers
  set to `!IsSystemAdministrator()`. An HR Administrator joins the per-department
  SignalR groups rather than `NotificationsHub.AdminGroup`, and the birthday digest
  and daily attendance report they receive cover their departments alone.
  **The department set follows `DepartmentId`'s rule inverted: at least one is
  required for an HR Administrator, and any are refused for every other role**
  (`HrDepartmentScopeRules`, mirrored by `hrDepartmentsError` in
  `client/src/lib/validation/person.ts`). `SetAdminUserRoles` keeps the rows for a
  Manager or an HR Administrator and clears them for anyone else, so a promotion to
  System Administrator clears the set the way it clears the department; the seeder's
  `RemoveUnscopedUserDepartments` does the same on startup. `AdminUsersPanel`'s edit
  mutation therefore runs **roles → departments → user → profile**. An HR Administrator
  with no rows (a legacy account) sees nothing until assigned, deliberately — an empty
  picker must never mean "everything".
```

- [ ] **Step 2: Update the `Leave and time decisions` bullet**

Change `The HR Administrator company-wide and a Manager within their department` to `The HR Administrator within their assigned departments and a Manager within their department`. In the same bullet, after `A System Administrator is deliberately neither`, keep the rest.

- [ ] **Step 3: Update the trap about `UserDepartment`**

Where CLAUDE.md or code comments say a `UserDepartment` row "means one thing: an extra department a manager covers" (`NonManagerUserDepartmentTests` class doc, `DbInitializer.SeedUserDepartments` summary if any wording remains), change to "a department this Manager or HR Administrator covers beyond their own profile". Rename nothing else.

- [ ] **Step 4: Full backend and client test runs**

Run from the solution root: `dotnet build` then `dotnet test Tests/WorkTrack.Tests --artifacts-path <scratchpad>/artifacts`.
Run from `client/`, per directory to avoid the OOM-but-exit-0 trap: `node_modules/.bin/vitest run src/lib`, `node_modules/.bin/vitest run src/components/admin`, `node_modules/.bin/vitest run src/components/annual-leave`, `node_modules/.bin/vitest run src/components/layout`, `node_modules/.bin/vitest run src/components/attendance`, then `npm run lint`.
Expected: everything green. Fix anything red before committing; do not skip failures.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md Tests/WorkTrack.Tests/NonManagerUserDepartmentTests.cs Persistence/DbInitializer.cs
git commit -m "Document the HR Administrator's department scope

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec §1** → Tasks 3, 4, 5. **§2** → Tasks 1, 2, 5 (Users list), 6, 7, 8, 9. **§3** → Task 10. **§4** → Tasks 12, 13; the user-info field → Task 11. **§5** → Task 14; no migration, as specified.
- **Deliberate narrowing, called out in Task 9:** the spec said an HR Administrator gets child read/write inside scope; `ChildAccessResolver` has no scoped-write branch, so this plan gives HR the Manager's read-only access and leaves scoped writes to a follow-up. Raise it with the user at hand-off.
- **Type consistency:** `ScopeToCaller` + `RequestingUserId` is the name pair on all four newly-scoped queries (`GetAdminUserList`, `GetAdminUserDetail`, `GetCompanyAttendance`, `GetUserPresence`). `IsAdmin`/`IsManager` keep their names everywhere else; what changed is which helper the controllers feed them.
- Tests reference DTO property names (`UpdateLeaveStatusRequest.Status`, `CompanyAttendanceDto.TotalEmployees`, `TeamHistoryDto.Members`) that the implementer must confirm against the source; the steps say so where it applies.
