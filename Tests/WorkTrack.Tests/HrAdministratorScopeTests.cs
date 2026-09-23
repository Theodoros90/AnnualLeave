using Application.AnnualLeaves.Commands;
using Application.AnnualLeaves.DTOs;
using Application.AnnualLeaves.Queries;
using Application.Core;
using AutoMapper;
using Domain;
using Microsoft.Extensions.Logging.Abstractions;
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
    private const string Hr2 = "hr2";
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
            new User { Id = "ub", UserName = "ub", Email = "ub@t.local", DisplayName = "Ben B" },
            new User { Id = Hr2, UserName = "hr2", Email = "hr2@t.local", DisplayName = "HR Two" });
        db.EmployeeProfiles.AddRange(
            new EmployeeProfile { Id = "hr-p", UserId = Hr, DepartmentId = null },
            new EmployeeProfile { Id = "pa", UserId = "ua", DepartmentId = A, AnnualLeaveEntitlement = 20, LeaveBalance = 20 },
            new EmployeeProfile { Id = "pb", UserId = "ub", DepartmentId = B, AnnualLeaveEntitlement = 20, LeaveBalance = 20 },
            // A department-less profile, like every administrator's — this is the
            // "administrator files their own leave" case the null-DepartmentId
            // reach exists for.
            new EmployeeProfile { Id = "hr2-p", UserId = Hr2, DepartmentId = null, AnnualLeaveEntitlement = 20, LeaveBalance = 20 });
        db.UserDepartments.Add(new UserDepartment { UserId = Hr, DepartmentId = A });
        db.LeaveTypes.Add(new LeaveType { Id = 1, Name = "Annual Leave", IsActive = true, AffectsBalance = true, DefaultAllowance = 20, RequiresApproval = true });
        db.AnnualLeaves.AddRange(
            new AnnualLeave { Id = "la", EmployeeId = "ua", EmployeeProfileId = "pa", DepartmentId = A, LeaveTypeId = 1, StartDate = new DateTime(2026, 10, 5), EndDate = new DateTime(2026, 10, 6), Status = AnnualLeaveStatus.Pending, CreatedAt = DateTime.UtcNow },
            new AnnualLeave { Id = "lb", EmployeeId = "ub", EmployeeProfileId = "pb", DepartmentId = B, LeaveTypeId = 1, StartDate = new DateTime(2026, 10, 5), EndDate = new DateTime(2026, 10, 6), Status = AnnualLeaveStatus.Pending, CreatedAt = DateTime.UtcNow },
            // Nobody's assigned departments cover this one — an administrator's own
            // request, DepartmentId null like their profile. Only an HR
            // Administrator's reach (not a plain Manager's, not Hr's assignment to A)
            // should ever include it.
            new AnnualLeave { Id = "lh", EmployeeId = Hr2, EmployeeProfileId = "hr2-p", DepartmentId = null, LeaveTypeId = 1, StartDate = new DateTime(2026, 10, 5), EndDate = new DateTime(2026, 10, 6), Status = AnnualLeaveStatus.Pending, CreatedAt = DateTime.UtcNow });
        db.SaveChanges();
        return db;
    }

    private static IMapper Mapper() =>
        new MapperConfiguration(cfg => cfg.AddProfile<MappingProfiles>(), NullLoggerFactory.Instance).CreateMapper();

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

    /// <summary>
    /// The HR Administrator's reach also picks up department-less leave — the
    /// administrators' own — which no assigned department could ever cover. A
    /// plain Manager (IsHrAdministrator false) gets none of that: "lh" would sit
    /// unseen and undecidable for them, which is the point of the widened reach
    /// being HR-only.
    /// </summary>
    [Fact]
    public async Task The_leave_list_also_shows_department_less_leave_to_an_hr_administrator()
    {
        using var db = SeedWorld();

        var asHr = await new GetAnnualLeaveList.Handler(db, Mapper()).Handle(new GetAnnualLeaveList.Query
        {
            RequestingUserId = Hr, IsAdmin = false, IsManager = true, IsEmployee = false, IsHrAdministrator = true,
        }, CancellationToken.None);

        Assert.Equal(["la", "lh"], asHr.Items.Select(l => l.Id).OrderBy(id => id));

        var asPlainManager = await new GetAnnualLeaveList.Handler(db, Mapper()).Handle(new GetAnnualLeaveList.Query
        {
            RequestingUserId = Hr, IsAdmin = false, IsManager = true, IsEmployee = false, IsHrAdministrator = false,
        }, CancellationToken.None);

        Assert.Equal(["la"], asPlainManager.Items.Select(l => l.Id));
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

    /// <summary>
    /// A department-less leave is only ever an administrator's own, and an HR
    /// Administrator is who decided such requests before this task — so they reach
    /// it despite being assigned only department A, nowhere near this request.
    /// </summary>
    [Fact]
    public async Task An_hr_administrator_reaches_a_department_less_leave_despite_their_assigned_departments()
    {
        using var db = SeedWorld();
        var handler = new UpdateLeaveStatus.Handler(db, new FakeEmailService());

        var result = await handler.Handle(new UpdateLeaveStatus.Command
        {
            LeaveId = "lh", ChangedByUserId = Hr, IsAdmin = true, IsManager = false,
            Request = new UpdateLeaveStatusRequest { Status = AnnualLeaveStatus.Approved },
        }, CancellationToken.None);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.Approved, (await db.AnnualLeaves.FindAsync("lh"))!.Status);
    }

    /// <summary>
    /// A System Administrator neither files nor decides leave — deliberately
    /// neither an HR Administrator nor a Manager for this command — so even a
    /// department-less request does not open up for them.
    /// </summary>
    [Fact]
    public async Task A_system_administrator_is_still_refused_even_for_a_department_less_leave()
    {
        using var db = SeedWorld();
        var handler = new UpdateLeaveStatus.Handler(db, new FakeEmailService());

        var result = await handler.Handle(new UpdateLeaveStatus.Command
        {
            LeaveId = "lh", ChangedByUserId = "sysadmin", IsAdmin = false, IsManager = false,
            Request = new UpdateLeaveStatusRequest { Status = AnnualLeaveStatus.Approved },
        }, CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(AnnualLeaveStatus.Pending, (await db.AnnualLeaves.FindAsync("lh"))!.Status);
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

    /// <summary>
    /// The HR Administrator also reaches a department-less timesheet — an
    /// administrator's own — which no assigned department could ever cover. Here
    /// it is Hr2's own timesheet (their profile "hr2-p" has no department, like
    /// every administrator's), which Hr is assigned nowhere near. A plain Manager
    /// (isHrAdministrator: false) gets none of that — "th" would sit unseen and
    /// unapprovable for them, which is the point of the widened reach being
    /// HR-only, exactly as the department-less leave test above pins.
    /// </summary>
    private static void AddDepartmentLessTimesheet(AppDbContext db) =>
        db.Timesheets.Add(new Timesheet
        {
            Id = "th", EmployeeProfileId = "hr2-p", DepartmentId = null,
            PeriodStart = new DateTime(2026, 9, 7), PeriodEnd = new DateTime(2026, 9, 13),
            TotalHours = 40m, Status = TimesheetStatus.Submitted,
        });

    [Fact]
    public async Task The_hr_administrator_also_reaches_a_department_less_timesheet()
    {
        using var db = SeedWorld();
        AddDepartmentLessTimesheet(db);
        await db.SaveChangesAsync();

        var visibleToHr = await Application.Timesheets.Support.TimesheetScope.ApplyAsync(
            db, db.Timesheets, Hr, isAdmin: false, isManager: true, isHrAdministrator: true);
        Assert.Contains("th", visibleToHr.Select(t => t.Id).ToList());

        var visibleToPlainManager = await Application.Timesheets.Support.TimesheetScope.ApplyAsync(
            db, db.Timesheets, Hr, isAdmin: false, isManager: true, isHrAdministrator: false);
        Assert.DoesNotContain("th", visibleToPlainManager.Select(t => t.Id).ToList());

        var handler = new Application.Timesheets.Commands.UpdateTimesheetStatus.Handler(
            db, new FakeEmailService(), Microsoft.Extensions.Logging.Abstractions.NullLogger<Application.Timesheets.Commands.UpdateTimesheetStatus.Handler>.Instance);

        var approved = await handler.Handle(new Application.Timesheets.Commands.UpdateTimesheetStatus.Command
        {
            Id = "th", NewStatus = TimesheetStatus.Approved, RequestingUserId = Hr, IsAdmin = false, IsManager = true, IsHrAdministrator = true,
        }, CancellationToken.None);
        Assert.True(approved.IsSuccess, approved.Error);
    }

    [Fact]
    public async Task A_plain_manager_may_not_approve_a_department_less_timesheet()
    {
        using var db = SeedWorld();
        AddDepartmentLessTimesheet(db);
        await db.SaveChangesAsync();

        var handler = new Application.Timesheets.Commands.UpdateTimesheetStatus.Handler(
            db, new FakeEmailService(), Microsoft.Extensions.Logging.Abstractions.NullLogger<Application.Timesheets.Commands.UpdateTimesheetStatus.Handler>.Instance);

        var refused = await handler.Handle(new Application.Timesheets.Commands.UpdateTimesheetStatus.Command
        {
            Id = "th", NewStatus = TimesheetStatus.Approved, RequestingUserId = Hr, IsAdmin = false, IsManager = true, IsHrAdministrator = false,
        }, CancellationToken.None);

        Assert.False(refused.IsSuccess);
        Assert.Equal(TimesheetStatus.Submitted, (await db.Timesheets.FindAsync("th"))!.Status);
    }
}
