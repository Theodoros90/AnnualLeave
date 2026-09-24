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
/// <see cref="LeaveType.MinNoticeDays"/> and <see cref="LeaveType.MaxConsecutiveDays"/>
/// reaching the request path. <see cref="LeaveLimitsRuleTests"/> pins the arithmetic;
/// these pin that the handlers actually consult it, and the one place the two limits
/// deliberately behave differently on an edit.
///
/// Notice is the limit with a clock in it, and that is what makes editing awkward: a
/// request filed properly in advance drifts towards its own start date every day it
/// sits there. So the notice check runs on create, and on an edit only when the start
/// date <em>moves</em> — otherwise fixing a typo in the reason the morning before a
/// trip would be refused for a request nobody was trying to bring forward. The
/// maximum has no clock and can only be broken deliberately, so it is checked on
/// every edit.
/// </summary>
public class LeaveLimitsEnforcementTests
{
    private const string UserId = "employee-1";
    private const string ProfileId = "profile-1";
    private const string AdminId = "admin-1";
    private const int DepartmentId = 1;

    private const int NoticeTypeId = 1;
    private const int ShortTypeId = 2;

    /// <summary>
    /// Dates are anchored to the real clock because the notice rule is, and to a
    /// Monday so the weekday arithmetic below reads plainly.
    /// </summary>
    private static DateTime MondayAfter(int daysFromToday)
    {
        var date = DateTime.UtcNow.Date.AddDays(daysFromToday);
        while (date.DayOfWeek != DayOfWeek.Monday) date = date.AddDays(1);
        return date;
    }

    private static async Task<AppDbContext> WorldAsync()
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
        });

        // IsAdmin on EditAnnualLeave is now the HR Administrator acting on somebody's
        // behalf, scoped to their assigned departments — this caller needs a
        // UserDepartment row over the employee's department to reach the leave under
        // test at all.
        db.UserDepartments.Add(new UserDepartment { UserId = AdminId, DepartmentId = DepartmentId });

        // Named for its limit rather than "Maternity Leave": the rule has to follow
        // the admin setting, not a word in the name of the type.
        db.LeaveTypes.Add(new LeaveType
        {
            Id = NoticeTypeId,
            Name = "Planned Leave",
            IsActive = true,
            RequiresManagerApproval = true,
            AffectsBalance = false,
            DefaultAllowance = 25,
            MinNoticeDays = 10,
        });

        db.LeaveTypes.Add(new LeaveType
        {
            Id = ShortTypeId,
            Name = "Brief Leave",
            IsActive = true,
            RequiresManagerApproval = true,
            AffectsBalance = false,
            DefaultAllowance = 25,
            MaxConsecutiveDays = 5,
        });

        await db.SaveChangesAsync();
        return db;
    }

    private static IMapper BuildMapper() =>
        new MapperConfiguration(cfg => cfg.AddProfile<MappingProfiles>(), NullLoggerFactory.Instance).CreateMapper();

    private static Task<Result<string>> Create(
        AppDbContext db, int leaveTypeId, DateTime start, DateTime end) =>
        new CreateAnnualLeave.Handler(db, BuildMapper(), new FakeEmailService())
            .Handle(new CreateAnnualLeave.Command
            {
                AnnualLeave = new CreateAnnualLeaveRequest
                {
                    EmployeeId = UserId,
                    LeaveTypeId = leaveTypeId,
                    StartDate = start,
                    EndDate = end,
                    Reason = "Out of office",
                },
            }, CancellationToken.None);

    private static async Task SeedLeaveAsync(AppDbContext db, int leaveTypeId, DateTime start, DateTime end)
    {
        db.AnnualLeaves.Add(new AnnualLeave
        {
            Id = "L1",
            EmployeeId = UserId,
            EmployeeProfileId = ProfileId,
            DepartmentId = DepartmentId,
            LeaveTypeId = leaveTypeId,
            StartDate = start,
            EndDate = end,
            Reason = "Out of office",
            Status = AnnualLeaveStatus.Pending,
        });
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
    }

    private static Task<Result<Unit>> Edit(
        AppDbContext db,
        int leaveTypeId,
        DateTime start,
        DateTime end,
        string reason = "Out of office",
        bool isAdmin = false) =>
        new EditAnnualLeave.Handler(db, new FakeEmailService())
            .Handle(new EditAnnualLeave.Command
            {
                ChangedByUserId = isAdmin ? AdminId : UserId,
                IsAdmin = isAdmin,
                AnnualLeave = new EditAnnualLeaveRequest
                {
                    Id = "L1",
                    LeaveTypeId = leaveTypeId,
                    StartDate = start,
                    EndDate = end,
                    Reason = reason,
                },
            }, CancellationToken.None);

    [Fact]
    public async Task A_request_filed_inside_the_notice_period_is_refused()
    {
        await using var db = await WorldAsync();
        var start = DateTime.UtcNow.Date.AddDays(3);

        var result = await Create(db, NoticeTypeId, start, start.AddDays(1));

        Assert.False(result.IsSuccess);
        Assert.Contains("Planned Leave needs 10 days notice.", result.Error);
        Assert.Empty(await db.AnnualLeaves.ToListAsync());
    }

    [Fact]
    public async Task A_request_filed_outside_the_notice_period_is_accepted()
    {
        await using var db = await WorldAsync();
        var start = MondayAfter(20);

        var result = await Create(db, NoticeTypeId, start, start.AddDays(1));

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task A_request_longer_than_the_maximum_is_refused()
    {
        await using var db = await WorldAsync();
        var start = MondayAfter(20);

        // Monday to the Friday of the following week: 10 business days against 5.
        var result = await Create(db, ShortTypeId, start, start.AddDays(11));

        Assert.False(result.IsSuccess);
        Assert.Equal(
            "Brief Leave allows at most 5 working days per request. This one covers 10.",
            result.Error);
        Assert.Empty(await db.AnnualLeaves.ToListAsync());
    }

    /// <summary>
    /// The reason this is not simply "check notice on every edit". The request was
    /// filed properly in advance; the clock has since eaten the notice period.
    /// Refusing an edit that leaves the dates alone would strand it.
    /// </summary>
    [Fact]
    public async Task Editing_a_request_without_moving_it_is_allowed_even_inside_the_notice_period()
    {
        await using var db = await WorldAsync();
        var start = DateTime.UtcNow.Date.AddDays(1);
        await SeedLeaveAsync(db, NoticeTypeId, start, start.AddDays(1));

        var result = await Edit(db, NoticeTypeId, start, start.AddDays(1), reason: "Corrected reason");

        Assert.True(result.IsSuccess);
        var leave = await db.AnnualLeaves.SingleAsync();
        Assert.Equal("Corrected reason", leave.Reason);
    }

    [Fact]
    public async Task Moving_a_request_into_the_notice_period_is_refused()
    {
        await using var db = await WorldAsync();
        var start = MondayAfter(20);
        await SeedLeaveAsync(db, NoticeTypeId, start, start.AddDays(1));

        var result = await Edit(
            db, NoticeTypeId, DateTime.UtcNow.Date.AddDays(2), DateTime.UtcNow.Date.AddDays(3));

        Assert.False(result.IsSuccess);
        Assert.Contains("Planned Leave needs 10 days notice.", result.Error);
    }

    /// <summary>The maximum has no clock, so an edit is checked whatever it moves.</summary>
    [Fact]
    public async Task Lengthening_a_request_past_the_maximum_is_refused()
    {
        await using var db = await WorldAsync();
        var start = MondayAfter(20);
        await SeedLeaveAsync(db, ShortTypeId, start, start.AddDays(1));

        var result = await Edit(db, ShortTypeId, start, start.AddDays(11));

        Assert.False(result.IsSuccess);
        Assert.Equal(
            "Brief Leave allows at most 5 working days per request. This one covers 10.",
            result.Error);
    }

    /// <summary>
    /// No exemption, matching <see cref="AttachmentPolicyRule"/>: the limits are
    /// about the leave type, not about who is typing.
    /// </summary>
    [Fact]
    public async Task An_admin_moving_a_request_is_held_to_the_notice_period_too()
    {
        await using var db = await WorldAsync();
        var start = MondayAfter(20);
        await SeedLeaveAsync(db, NoticeTypeId, start, start.AddDays(1));

        var result = await Edit(
            db,
            NoticeTypeId,
            DateTime.UtcNow.Date.AddDays(2),
            DateTime.UtcNow.Date.AddDays(3),
            isAdmin: true);

        Assert.False(result.IsSuccess);
        Assert.Contains("Planned Leave needs 10 days notice.", result.Error);
    }
}
