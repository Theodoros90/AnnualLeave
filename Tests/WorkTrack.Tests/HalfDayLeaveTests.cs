using Application.AnnualLeaves.Commands;
using Application.AnnualLeaves.DTOs;
using Application.Core;
using AutoMapper;
using Domain;
using Domain.Services;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// Half days used to exist only as a pair of buttons. The apply page offered
/// "Half day (AM)" and "Half day (PM)", drew a summary panel promising that 0.5
/// days would be deducted, and then posted a request carrying no duration at all —
/// so the server stored a whole day and charged a whole day.
/// <see cref="LeaveType.HalfDayAllowed"/> was saved by the admin dialog, rendered
/// as a badge on the type's card, and read by nothing in the request path.
/// <see cref="LeaveCalculationService.CalculateChargeableDays"/> and
/// <see cref="LeaveDuration"/> were written for this and had no callers at all.
///
/// These tests pin the rule now that the duration is persisted and charged.
/// </summary>
public class HalfDayLeaveTests
{
    private const string UserId = "employee-1";
    private const string ProfileId = "profile-1";

    private const int HalfDayTypeId = 1;
    private const int FullDayOnlyTypeId = 2;

    /// <summary>A Wednesday.</summary>
    private static readonly DateTime Midweek = new(2026, 9, 9);

    // Domain arithmetic

    [Fact]
    public void A_full_day_request_charges_every_business_day()
    {
        var charged = LeaveCalculationService.CalculateChargeableDays(
            new DateTime(2026, 9, 7), new DateTime(2026, 9, 11), LeaveDuration.Full);

        Assert.Equal(5m, charged);
    }

    [Theory]
    [InlineData(LeaveDuration.HalfDayMorning)]
    [InlineData(LeaveDuration.HalfDayAfternoon)]
    public void A_half_day_request_charges_half_a_day(LeaveDuration duration)
    {
        var charged = LeaveCalculationService.CalculateChargeableDays(Midweek, Midweek, duration);

        Assert.Equal(0.5m, charged);
    }

    /// <summary>
    /// A half day is half a day, not half of however many days the range covers.
    /// The handler refuses a multi-date half day outright, so this is the arithmetic
    /// declining to invent a charge for a row that arrived some other way. The
    /// expression this replaces, businessDays * 0.5, would have billed 2.5 days for
    /// a request calling itself a half day.
    /// </summary>
    [Fact]
    public void A_half_day_never_charges_more_than_half_a_day()
    {
        var charged = LeaveCalculationService.CalculateChargeableDays(
            new DateTime(2026, 9, 7), new DateTime(2026, 9, 11), LeaveDuration.HalfDayMorning);

        Assert.Equal(0.5m, charged);
    }

    /// <summary>
    /// Consistent with a full-day request over the same dates, which charges 0
    /// rather than being refused. The calendar greys weekends out; nothing needs a
    /// second, stricter rule for half days.
    /// </summary>
    [Fact]
    public void A_half_day_on_a_weekend_charges_nothing()
    {
        var saturday = new DateTime(2026, 9, 12);

        var charged = LeaveCalculationService.CalculateChargeableDays(
            saturday, saturday, LeaveDuration.HalfDayAfternoon);

        Assert.Equal(0m, charged);
    }

    [Fact]
    public void TotalDays_reports_the_charge_the_request_carries()
    {
        var leave = new AnnualLeave
        {
            StartDate = Midweek,
            EndDate = Midweek,
            Duration = LeaveDuration.HalfDayAfternoon,
        };

        Assert.Equal(0.5m, leave.TotalDays);
    }

    /// <summary>
    /// <see cref="LeaveDuration.Full"/> is 0, so every row written before the
    /// column existed reads as a full day with no backfill.
    /// </summary>
    [Fact]
    public void A_request_that_names_no_duration_is_a_full_day()
    {
        Assert.Equal(LeaveDuration.Full, default(LeaveDuration));
        Assert.Equal(LeaveDuration.Full, new AnnualLeave().Duration);
    }

    // The rule

    [Fact]
    public void A_type_that_disallows_half_days_refuses_one()
    {
        var error = HalfDayRule.Check(
            new LeaveType { Name = "Unpaid Leave", HalfDayAllowed = false },
            LeaveDuration.HalfDayMorning,
            Midweek,
            Midweek);

        Assert.Equal("Unpaid Leave cannot be taken as a half day.", error);
    }

    [Fact]
    public void A_type_that_disallows_half_days_still_accepts_full_days()
    {
        var error = HalfDayRule.Check(
            new LeaveType { Name = "Unpaid Leave", HalfDayAllowed = false },
            LeaveDuration.Full,
            Midweek,
            Midweek.AddDays(2));

        Assert.Null(error);
    }

    [Fact]
    public void A_half_day_spanning_more_than_one_date_is_refused()
    {
        var error = HalfDayRule.Check(
            new LeaveType { Name = "Annual Leave", HalfDayAllowed = true },
            LeaveDuration.HalfDayAfternoon,
            Midweek,
            Midweek.AddDays(1));

        Assert.Equal("A half day covers a single date. Pick one date, or switch to full days.", error);
    }

    /// <summary>
    /// The dates carry a time component when they arrive from the client, so the
    /// single-date check compares calendar days rather than instants.
    /// </summary>
    [Fact]
    public void One_date_with_a_time_on_it_is_still_one_date()
    {
        var error = HalfDayRule.Check(
            new LeaveType { Name = "Annual Leave", HalfDayAllowed = true },
            LeaveDuration.HalfDayMorning,
            Midweek.AddHours(9),
            Midweek.AddHours(17));

        Assert.Null(error);
    }

    // Enforcement and charging, end to end

    [Fact]
    public async Task Creating_a_half_day_stores_the_duration()
    {
        await using var db = await WorldAsync();

        var result = await Create(db, HalfDayTypeId, LeaveDuration.HalfDayAfternoon, Midweek, Midweek);

        Assert.True(result.IsSuccess);
        var leave = Assert.Single(await db.AnnualLeaves.AsNoTracking().ToListAsync());
        Assert.Equal(LeaveDuration.HalfDayAfternoon, leave.Duration);
        Assert.Equal(0.5m, leave.TotalDays);
    }

    /// <summary>
    /// The point of the whole feature: the summary panel on the apply page has
    /// always promised "Days deducted 0.5", and until the duration was persisted the
    /// server quietly took a whole day off the balance instead.
    /// </summary>
    [Fact]
    public async Task An_approved_half_day_costs_the_balance_half_a_day()
    {
        await using var db = await WorldAsync();

        var result = await Create(db, HalfDayTypeId, LeaveDuration.HalfDayMorning, Midweek, Midweek);

        Assert.True(result.IsSuccess);
        db.ChangeTracker.Clear();
        var profile = await db.EmployeeProfiles.AsNoTracking().SingleAsync();
        Assert.Equal(22.5m, profile.LeaveBalance);
    }

    [Fact]
    public async Task An_approved_full_day_still_costs_a_whole_day()
    {
        await using var db = await WorldAsync();

        var result = await Create(db, HalfDayTypeId, LeaveDuration.Full, Midweek, Midweek);

        Assert.True(result.IsSuccess);
        db.ChangeTracker.Clear();
        var profile = await db.EmployeeProfiles.AsNoTracking().SingleAsync();
        Assert.Equal(22m, profile.LeaveBalance);
    }

    [Fact]
    public async Task A_type_that_disallows_half_days_refuses_the_request_on_create()
    {
        await using var db = await WorldAsync();

        var result = await Create(db, FullDayOnlyTypeId, LeaveDuration.HalfDayMorning, Midweek, Midweek);

        Assert.False(result.IsSuccess);
        Assert.Equal("Unpaid Leave cannot be taken as a half day.", result.Error);
        Assert.Empty(await db.AnnualLeaves.AsNoTracking().ToListAsync());
    }

    /// <summary>
    /// The rule is about the leave type, not about who is typing — the same
    /// reasoning <see cref="AttachmentPolicyRule"/> follows.
    /// </summary>
    [Fact]
    public async Task A_type_that_disallows_half_days_refuses_the_request_on_edit()
    {
        await using var db = await WorldAsync();
        await SeedLeaveAsync(db, FullDayOnlyTypeId);

        var result = await Edit(db, FullDayOnlyTypeId, LeaveDuration.HalfDayAfternoon, isAdmin: true);

        Assert.False(result.IsSuccess);
        Assert.Equal("Unpaid Leave cannot be taken as a half day.", result.Error);
    }

    [Fact]
    public async Task Editing_a_full_day_down_to_a_half_day_gives_back_half_the_balance()
    {
        await using var db = await WorldAsync();

        var created = await Create(db, HalfDayTypeId, LeaveDuration.Full, Midweek, Midweek);
        Assert.True(created.IsSuccess);
        db.ChangeTracker.Clear();

        var leaveId = (await db.AnnualLeaves.AsNoTracking().SingleAsync()).Id;
        var result = await Edit(db, HalfDayTypeId, LeaveDuration.HalfDayMorning, isAdmin: true, leaveId: leaveId);

        Assert.True(result.IsSuccess);
        db.ChangeTracker.Clear();
        var profile = await db.EmployeeProfiles.AsNoTracking().SingleAsync();
        Assert.Equal(22.5m, profile.LeaveBalance);
    }

    // World

    /// <summary>
    /// SQLite rather than the EF in-memory provider: a fractional balance has to
    /// survive a round trip through a real column, which the in-memory store can say
    /// nothing about.
    /// </summary>
    private static async Task<AppDbContext> WorldAsync()
    {
        var db = await TransactionalTestDb.CreateAsync();

        db.AppSettings.Add(new AppSettings { Id = 1, LeaveYearStartMonth = 1 });

        db.Users.Add(new User
        {
            Id = UserId,
            UserName = "employee-1@example.com",
            Email = "employee-1@example.com",
            DisplayName = "Andreas Georgiou",
        });

        db.EmployeeProfiles.Add(new EmployeeProfile
        {
            Id = ProfileId,
            UserId = UserId,
            AnnualLeaveEntitlement = 23,
            LeaveBalance = 23,
        });

        // Auto-approving, so creating a request settles the balance in one step.
        db.LeaveTypes.Add(new LeaveType
        {
            Id = HalfDayTypeId,
            Name = "Annual Leave",
            IsActive = true,
            RequiresApproval = false,
            AffectsBalance = true,
            HalfDayAllowed = true,
            DefaultAllowance = 23,
        });

        db.LeaveTypes.Add(new LeaveType
        {
            Id = FullDayOnlyTypeId,
            Name = "Unpaid Leave",
            IsActive = true,
            RequiresApproval = false,
            AffectsBalance = false,
            HalfDayAllowed = false,
            DefaultAllowance = 0,
        });

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        return db;
    }

    private static IMapper BuildMapper() =>
        new MapperConfiguration(cfg => cfg.AddProfile<MappingProfiles>(), NullLoggerFactory.Instance).CreateMapper();

    private static Task<Result<string>> Create(
        AppDbContext db, int leaveTypeId, LeaveDuration duration, DateTime start, DateTime end) =>
        new CreateAnnualLeave.Handler(db, BuildMapper(), new FakeEmailService())
            .Handle(new CreateAnnualLeave.Command
            {
                AnnualLeave = new CreateAnnualLeaveRequest
                {
                    EmployeeId = UserId,
                    LeaveTypeId = leaveTypeId,
                    Duration = duration,
                    StartDate = start,
                    EndDate = end,
                    Reason = "Out of office",
                },
            }, CancellationToken.None);

    private static async Task SeedLeaveAsync(AppDbContext db, int leaveTypeId)
    {
        db.AnnualLeaves.Add(new AnnualLeave
        {
            Id = "L1",
            EmployeeId = UserId,
            EmployeeProfileId = ProfileId,
            LeaveTypeId = leaveTypeId,
            StartDate = Midweek,
            EndDate = Midweek,
            Reason = "Out of office",
            Status = AnnualLeaveStatus.Pending,
        });
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
    }

    private static Task<Result<Unit>> Edit(
        AppDbContext db, int leaveTypeId, LeaveDuration duration, bool isAdmin, string leaveId = "L1") =>
        new EditAnnualLeave.Handler(db, new FakeEmailService())
            .Handle(new EditAnnualLeave.Command
            {
                ChangedByUserId = isAdmin ? "admin-1" : UserId,
                IsAdmin = isAdmin,
                AnnualLeave = new EditAnnualLeaveRequest
                {
                    Id = leaveId,
                    LeaveTypeId = leaveTypeId,
                    Duration = duration,
                    StartDate = Midweek,
                    EndDate = Midweek,
                    Reason = "Rebooked",
                },
            }, CancellationToken.None);
}
