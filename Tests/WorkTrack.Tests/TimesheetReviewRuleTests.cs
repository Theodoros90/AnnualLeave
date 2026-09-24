using Application.Timesheets.Commands;
using Application.Timesheets.Queries;
using Application.Timesheets.Support;
using Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// Timesheets follow leave's manager stage: a submitted timesheet is the manager's
/// to review, and an HR Administrator reviews it only when no manager is available
/// to — the submitter is the only manager, the department has none, or every
/// manager is on leave today. The list says which is which (AwaitingManager), the
/// HR pages leave the manager's rows out, and the submission email goes to whoever
/// can review it.
/// </summary>
public class TimesheetReviewRuleTests
{
    private const int Dept = 1;
    private const string Employee = "u-emp";
    private const string EmployeeProfile = "p-emp";
    private const string Manager = "u-mgr";
    private const string ManagerProfile = "p-mgr";
    private const string Hr = "u-hr";

    private static readonly DateTime Today = new(2026, 9, 24, 9, 0, 0, DateTimeKind.Utc);

    private static async Task<AppDbContext> WorldAsync()
    {
        var db = TestDb.Create();
        db.Departments.Add(new Department { Id = Dept, Name = "Finance", Code = "FIN" });
        db.Roles.AddRange(
            new Role { Id = "r-hr", Name = AppRoles.HrAdministrator, NormalizedName = AppRoles.HrAdministrator.ToUpperInvariant() },
            new Role { Id = "r-mgr", Name = AppRoles.Manager, NormalizedName = AppRoles.Manager.ToUpperInvariant() });
        db.Users.AddRange(
            new User { Id = Employee, UserName = Employee, Email = "emp@t.local", DisplayName = "Employee 1B", IsActive = true },
            new User { Id = Manager, UserName = Manager, Email = "mgr@t.local", DisplayName = "Theodoros Iona", IsActive = true },
            new User { Id = Hr, UserName = Hr, Email = "hr@t.local", DisplayName = "Helen HR", IsActive = true });
        db.UserRoles.AddRange(
            new UserRole { UserId = Hr, RoleId = "r-hr" },
            new UserRole { UserId = Manager, RoleId = "r-mgr" });
        db.EmployeeProfiles.AddRange(
            new EmployeeProfile { Id = EmployeeProfile, UserId = Employee, DepartmentId = Dept },
            new EmployeeProfile { Id = ManagerProfile, UserId = Manager, DepartmentId = Dept },
            new EmployeeProfile { Id = "p-hr", UserId = Hr, DepartmentId = null });
        db.UserDepartments.Add(new UserDepartment { UserId = Hr, DepartmentId = Dept });
        db.LeaveTypes.Add(new LeaveType { Id = 1, Name = "Annual Leave", IsActive = true, AffectsBalance = true, DefaultAllowance = 20, RequiresManagerApproval = true });
        await db.SaveChangesAsync();
        return db;
    }

    private static Timesheet Sheet(string id, string profileId, TimesheetStatus status = TimesheetStatus.Submitted) => new()
    {
        Id = id, EmployeeProfileId = profileId, DepartmentId = Dept,
        PeriodStart = new DateTime(2026, 9, 14), PeriodEnd = new DateTime(2026, 9, 20),
        TotalHours = 40m, Status = status, SubmittedAt = Today.AddDays(-1),
    };

    private static async Task ManagerOnLeaveAsync(AppDbContext db)
    {
        db.AnnualLeaves.Add(new AnnualLeave
        {
            Id = "L-mgr", EmployeeId = Manager, EmployeeProfileId = ManagerProfile, DepartmentId = Dept, LeaveTypeId = 1,
            StartDate = Today.Date.AddDays(-1), EndDate = Today.Date.AddDays(2), Reason = "Away",
            Status = AnnualLeaveStatus.Approved, CreatedAt = Today,
        });
        await db.SaveChangesAsync();
    }

    private static Task<Application.Core.Result<MediatR.Unit>> DecideAsync(AppDbContext db, string sheetId, string byUserId, bool asHr) =>
        new UpdateTimesheetStatus.Handler(db, new FakeEmailService(), NullLogger<UpdateTimesheetStatus.Handler>.Instance).Handle(
            new UpdateTimesheetStatus.Command
            {
                Id = sheetId, NewStatus = TimesheetStatus.Approved, RequestingUserId = byUserId,
                IsAdmin = false, IsManager = true, IsHrAdministrator = asHr, NowUtc = Today,
            }, CancellationToken.None);

    // ── Deciding ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Hr_is_refused_while_a_manager_is_available_to_review()
    {
        using var db = await WorldAsync();
        db.Timesheets.Add(Sheet("ts", EmployeeProfile));
        await db.SaveChangesAsync();

        var result = await DecideAsync(db, "ts", Hr, asHr: true);

        Assert.False(result.IsSuccess);
        Assert.Equal(TimesheetReviewRule.WithManagerMessage, result.Error);
        Assert.Equal(TimesheetStatus.Submitted, (await db.Timesheets.FindAsync("ts"))!.Status);
    }

    [Fact]
    public async Task The_manager_approves_it()
    {
        using var db = await WorldAsync();
        db.Timesheets.Add(Sheet("ts", EmployeeProfile));
        await db.SaveChangesAsync();

        var result = await DecideAsync(db, "ts", Manager, asHr: false);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(TimesheetStatus.Approved, (await db.Timesheets.FindAsync("ts"))!.Status);
    }

    [Fact]
    public async Task Hr_reviews_the_only_managers_own_timesheet()
    {
        using var db = await WorldAsync();
        db.Timesheets.Add(Sheet("ts-mgr", ManagerProfile));
        await db.SaveChangesAsync();

        var result = await DecideAsync(db, "ts-mgr", Hr, asHr: true);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(TimesheetStatus.Approved, (await db.Timesheets.FindAsync("ts-mgr"))!.Status);
    }

    [Fact]
    public async Task Hr_reviews_when_the_only_manager_is_on_leave_today()
    {
        using var db = await WorldAsync();
        db.Timesheets.Add(Sheet("ts", EmployeeProfile));
        await db.SaveChangesAsync();
        await ManagerOnLeaveAsync(db);

        var result = await DecideAsync(db, "ts", Hr, asHr: true);

        Assert.True(result.IsSuccess, result.Error);
    }

    [Fact]
    public async Task Hr_reviews_when_the_department_has_no_manager()
    {
        using var db = await WorldAsync();
        (await db.EmployeeProfiles.FirstAsync(p => p.Id == ManagerProfile)).DepartmentId = 99;
        db.Timesheets.Add(Sheet("ts", EmployeeProfile));
        await db.SaveChangesAsync();

        var result = await DecideAsync(db, "ts", Hr, asHr: true);

        Assert.True(result.IsSuccess, result.Error);
    }

    // ── The list ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task The_list_says_which_open_timesheets_are_with_the_manager()
    {
        using var db = await WorldAsync();
        db.Timesheets.AddRange(
            Sheet("ts", EmployeeProfile),
            Sheet("ts-mgr", ManagerProfile),
            Sheet("ts-done", EmployeeProfile, TimesheetStatus.Approved));
        await db.SaveChangesAsync();

        var page = await new GetTimesheetList.Handler(db).Handle(
            new GetTimesheetList.Query { RequestingUserId = Hr, IsAdmin = false, IsManager = true, IsHrAdministrator = true },
            CancellationToken.None);

        var byId = page.Items.ToDictionary(t => t.Id, t => t.AwaitingManager);
        Assert.True(byId["ts"]);       // the employee's — the manager's to review
        Assert.False(byId["ts-mgr"]);  // the manager's own — nobody else but HR
        Assert.False(byId["ts-done"]); // decided
    }

    // ── Who is told on submission ─────────────────────────────────────────────

    private static Task SubmitAsync(AppDbContext db, FakeEmailService email, string sheetId, string byUserId) =>
        new SubmitTimesheet.Handler(db, email, NullLogger<SubmitTimesheet.Handler>.Instance).Handle(
            new SubmitTimesheet.Command { Id = sheetId, RequestingUserId = byUserId }, CancellationToken.None);

    [Fact]
    public async Task An_employees_submission_tells_the_manager_and_not_hr()
    {
        using var db = await WorldAsync();
        db.Timesheets.Add(Sheet("ts", EmployeeProfile, TimesheetStatus.Draft));
        await db.SaveChangesAsync();
        var email = new FakeEmailService();

        await SubmitAsync(db, email, "ts", Employee);

        Assert.Contains(email.Sent, m => m.Recipient == "mgr@t.local");
        Assert.DoesNotContain(email.Sent, m => m.Recipient == "hr@t.local");
    }

    [Fact]
    public async Task The_only_managers_own_submission_tells_hr_and_says_why()
    {
        using var db = await WorldAsync();
        db.Timesheets.Add(Sheet("ts-mgr", ManagerProfile, TimesheetStatus.Draft));
        await db.SaveChangesAsync();
        var email = new FakeEmailService();

        await SubmitAsync(db, email, "ts-mgr", Manager);

        var toHr = Assert.Single(email.Sent, m => m.Recipient == "hr@t.local");
        Assert.Contains("no manager in the department", toHr.HtmlBody);
        Assert.DoesNotContain(email.Sent, m => m.Recipient == "mgr@t.local");
    }
}
