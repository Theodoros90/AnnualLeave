using Application.AnnualLeaves.Commands;
using Application.AnnualLeaves.DTOs;
using Application.Core;
using AutoMapper;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// <see cref="LeaveType.MinServiceMonths"/> reaching the request path.
/// <see cref="MinimumServiceRuleTests"/> pins the arithmetic; these pin that the
/// handlers actually consult it, on create and on edit, and that the two readings
/// that pass — no minimum, and no recorded start date — pass here too.
///
/// Unlike the notice period, the check runs on <em>every</em> edit. Service only
/// grows, so a request accepted once can never later fail it; the case an edit has
/// to catch is switching the type onto one wanting more service than the employee
/// has.
/// </summary>
public class MinimumServiceEnforcementTests
{
    private const string UserId = "employee-1";
    private const string ProfileId = "profile-1";
    private const string AdminId = "admin-1";
    private const int DepartmentId = 1;

    private const int TenuredTypeId = 1;
    private const int OpenTypeId = 2;

    private static DateTime MondayAfter(int daysFromToday)
    {
        var date = DateTime.UtcNow.Date.AddDays(daysFromToday);
        while (date.DayOfWeek != DayOfWeek.Monday) date = date.AddDays(1);
        return date;
    }

    private static async Task<AppDbContext> WorldAsync(DateOnly? employmentStartDate)
    {
        var db = TestDb.Create();

        db.AppSettings.Add(new AppSettings { Id = 1, LeaveYearStartMonth = 1 });

        db.Users.Add(new User
        {
            Id = UserId,
            UserName = "employee-1@example.com",
            Email = "employee-1@example.com",
            DisplayName = "Andreas Georgiou",
        });

        // This test's own EF in-memory provider doesn't enforce the FK, but a User
        // row belongs here regardless — TestDb ignores constraints; it should not
        // need a fixture that only works because of that.
        db.Users.Add(new User
        {
            Id = AdminId,
            UserName = "admin-1@example.com",
            Email = "admin-1@example.com",
            DisplayName = "HR Administrator",
        });

        db.Departments.Add(new Department { Id = DepartmentId, Name = "Ops", Code = "OPS" });

        db.EmployeeProfiles.Add(new EmployeeProfile
        {
            Id = ProfileId,
            UserId = UserId,
            DepartmentId = DepartmentId,
            AnnualLeaveEntitlement = 25,
            LeaveBalance = 25,
            EmploymentStartDate = employmentStartDate,
        });

        // IsAdmin on EditAnnualLeave is now the HR Administrator acting on somebody's
        // behalf, scoped to their assigned departments — this caller needs a
        // UserDepartment row over the employee's department to reach the leave under
        // test at all.
        db.UserDepartments.Add(new UserDepartment { UserId = AdminId, DepartmentId = DepartmentId });

        // Named for its rule rather than "Sabbatical": the rule has to follow the
        // admin setting, not a word in the name of the type.
        db.LeaveTypes.Add(new LeaveType
        {
            Id = TenuredTypeId,
            Name = "Tenured Leave",
            IsActive = true,
            RequiresApproval = true,
            AffectsBalance = false,
            DefaultAllowance = 25,
            MinServiceMonths = 12,
        });

        db.LeaveTypes.Add(new LeaveType
        {
            Id = OpenTypeId,
            Name = "Open Leave",
            IsActive = true,
            RequiresApproval = true,
            AffectsBalance = false,
            DefaultAllowance = 25,
            MinServiceMonths = 0,
        });

        await db.SaveChangesAsync();
        return db;
    }

    private static DateOnly MonthsAgo(int months) =>
        DateOnly.FromDateTime(DateTime.UtcNow.Date).AddMonths(-months);

    private static IMapper BuildMapper() =>
        new MapperConfiguration(cfg => cfg.AddProfile<MappingProfiles>(), NullLoggerFactory.Instance).CreateMapper();

    private static Task<Result<string>> Create(AppDbContext db, int leaveTypeId)
    {
        var start = MondayAfter(20);
        return new CreateAnnualLeave.Handler(db, BuildMapper(), new FakeEmailService())
            .Handle(new CreateAnnualLeave.Command
            {
                AnnualLeave = new CreateAnnualLeaveRequest
                {
                    EmployeeId = UserId,
                    LeaveTypeId = leaveTypeId,
                    StartDate = start,
                    EndDate = start.AddDays(1),
                    Reason = "Out of office",
                },
            }, CancellationToken.None);
    }

    private static async Task SeedLeaveAsync(AppDbContext db, int leaveTypeId)
    {
        var start = MondayAfter(20);
        db.AnnualLeaves.Add(new AnnualLeave
        {
            Id = "L1",
            EmployeeId = UserId,
            EmployeeProfileId = ProfileId,
            DepartmentId = DepartmentId,
            LeaveTypeId = leaveTypeId,
            StartDate = start,
            EndDate = start.AddDays(1),
            Reason = "Out of office",
            Status = AnnualLeaveStatus.Pending,
        });
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
    }

    private static Task<Result<Unit>> Edit(AppDbContext db, int leaveTypeId, bool isAdmin = false)
    {
        var start = MondayAfter(20);
        return new EditAnnualLeave.Handler(db, new FakeEmailService())
            .Handle(new EditAnnualLeave.Command
            {
                ChangedByUserId = isAdmin ? AdminId : UserId,
                IsAdmin = isAdmin,
                AnnualLeave = new EditAnnualLeaveRequest
                {
                    Id = "L1",
                    LeaveTypeId = leaveTypeId,
                    StartDate = start,
                    EndDate = start.AddDays(1),
                    Reason = "Out of office",
                },
            }, CancellationToken.None);
    }

    [Fact]
    public async Task A_new_hire_is_refused_a_type_wanting_more_service_than_they_have()
    {
        await using var db = await WorldAsync(MonthsAgo(2));

        var result = await Create(db, TenuredTypeId);

        Assert.False(result.IsSuccess);
        Assert.Contains("Tenured Leave is available after 12 months of service.", result.Error);
        Assert.Empty(await db.AnnualLeaves.ToListAsync());
    }

    [Fact]
    public async Task An_employee_with_the_service_is_accepted()
    {
        await using var db = await WorldAsync(MonthsAgo(18));

        var result = await Create(db, TenuredTypeId);

        Assert.True(result.IsSuccess);
    }

    /// <summary>Zero is the setting the dialog labels "0 = no minimum".</summary>
    [Fact]
    public async Task A_type_wanting_no_service_accepts_somebody_who_started_this_month()
    {
        await using var db = await WorldAsync(MonthsAgo(0));

        var result = await Create(db, OpenTypeId);

        Assert.True(result.IsSuccess);
    }

    /// <summary>
    /// Nobody entered it — a System Administrator, or an Employee row predating the column. Same
    /// reading as a null gender: it is not "started today".
    /// </summary>
    [Fact]
    public async Task An_employee_with_no_recorded_start_date_is_accepted()
    {
        await using var db = await WorldAsync(null);

        var result = await Create(db, TenuredTypeId);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task Moving_a_request_onto_a_type_wanting_more_service_is_refused()
    {
        await using var db = await WorldAsync(MonthsAgo(2));
        await SeedLeaveAsync(db, OpenTypeId);

        var result = await Edit(db, TenuredTypeId);

        Assert.False(result.IsSuccess);
        Assert.Contains("Tenured Leave is available after 12 months of service.", result.Error);
    }

    /// <summary>
    /// No exemption, matching <see cref="AttachmentPolicyRule"/> and the notice
    /// period: the rule is about the leave type and the employee, not about who is
    /// typing.
    /// </summary>
    [Fact]
    public async Task An_admin_filing_on_a_new_hires_behalf_is_refused_too()
    {
        await using var db = await WorldAsync(MonthsAgo(2));
        await SeedLeaveAsync(db, OpenTypeId);

        var result = await Edit(db, TenuredTypeId, isAdmin: true);

        Assert.False(result.IsSuccess);
        Assert.Contains("Tenured Leave is available after 12 months of service.", result.Error);
    }
}
