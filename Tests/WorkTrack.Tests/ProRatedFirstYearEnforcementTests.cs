using Application.AnnualLeaves.Commands;
using Domain;
using Domain.Services;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// <c>LeaveType.ProRateFirstYear</c> is enforced, not advertised: when it is on,
/// the pooled balance check measures a request against the first year's pro-rated
/// allowance rather than the stored entitlement, and the stored
/// <c>LeaveBalance</c> is synced from the same figure. The stored entitlement
/// itself is never touched — the year after the hire is full on its own.
/// </summary>
public class ProRatedFirstYearEnforcementTests
{
    private const int AnnualLeaveTypeId = 1;

    // 10 September 2026, in a January leave year: four months of twelve, so a
    // 23-day allowance pro-rates to 8 (23 × 4/12 = 7.67, up to the half).
    private static readonly DateOnly SeptemberStart = new(2026, 9, 10);

    private static void SeedAnnualLeave(AppDbContext db, bool proRate)
    {
        db.LeaveTypes.Add(new LeaveType
        {
            Id = AnnualLeaveTypeId, Name = "Annual Leave", IsActive = true,
            AffectsBalance = true, DefaultAllowance = 23, ProRateFirstYear = proRate,
        });
    }

    private static EmployeeProfile Profile(DateOnly? start) => new()
    {
        Id = "p-u1", UserId = "u1", AnnualLeaveEntitlement = 23, LeaveBalance = 23, EmploymentStartDate = start,
    };

    private static AnnualLeave Request(string start, string end) => new()
    {
        Id = Guid.NewGuid().ToString(), EmployeeId = "u1", EmployeeProfileId = "p-u1",
        LeaveTypeId = AnnualLeaveTypeId,
        StartDate = DateTime.Parse(start), EndDate = DateTime.Parse(end),
    };

    private static Task<string?> Check(AppDbContext db, EmployeeProfile profile, AnnualLeave request) =>
        AnnualLeaveBalanceCalculator.CheckSufficientBalanceAsync(db, profile, request, excludeLeaveId: request.Id, CancellationToken.None);

    [Fact]
    public async Task A_september_starter_is_refused_the_ninth_day_of_a_23_day_allowance()
    {
        using var db = TestDb.Create();
        SeedAnnualLeave(db, proRate: true);
        await db.SaveChangesAsync();

        // Mon 5 Oct – Thu 15 Oct 2026: nine business days against eight pro-rated.
        var error = await Check(db, Profile(SeptemberStart), Request("2026-10-05", "2026-10-15"));

        Assert.NotNull(error);
        Assert.Contains("Insufficient leave balance", error);
        Assert.Contains("Remaining balance: 8", error);
    }

    [Fact]
    public async Task A_september_starter_may_take_all_eight_pro_rated_days()
    {
        using var db = TestDb.Create();
        SeedAnnualLeave(db, proRate: true);
        await db.SaveChangesAsync();

        // Mon 5 Oct – Wed 14 Oct 2026: eight business days.
        var error = await Check(db, Profile(SeptemberStart), Request("2026-10-05", "2026-10-14"));

        Assert.Null(error);
    }

    [Fact]
    public async Task With_the_switch_off_the_full_allowance_applies()
    {
        using var db = TestDb.Create();
        SeedAnnualLeave(db, proRate: false);
        await db.SaveChangesAsync();

        var error = await Check(db, Profile(SeptemberStart), Request("2026-10-05", "2026-10-15"));

        Assert.Null(error);
    }

    [Fact]
    public async Task The_year_after_the_hire_is_measured_against_the_full_allowance()
    {
        using var db = TestDb.Create();
        SeedAnnualLeave(db, proRate: true);
        await db.SaveChangesAsync();

        // Mon 1 Feb – Fri 26 Feb 2027: twenty business days, fine against 23.
        var error = await Check(db, Profile(SeptemberStart), Request("2027-02-01", "2027-02-26"));

        Assert.Null(error);
    }

    [Fact]
    public async Task No_start_date_on_file_is_measured_against_the_full_allowance()
    {
        using var db = TestDb.Create();
        SeedAnnualLeave(db, proRate: true);
        await db.SaveChangesAsync();

        var error = await Check(db, Profile(null), Request("2026-10-05", "2026-10-15"));

        Assert.Null(error);
    }

    [Fact]
    public async Task The_stored_balance_is_synced_from_the_pro_rated_figure()
    {
        using var db = TestDb.Create();
        SeedAnnualLeave(db, proRate: true);
        // Joined on the first of this month, so the pro-rated figure depends on when
        // the suite runs; the domain function is what says what it should be.
        var today = DateTime.UtcNow;
        var start = new DateOnly(today.Year, today.Month, 1);
        var profile = Profile(start);
        db.EmployeeProfiles.Add(profile);
        await db.SaveChangesAsync();

        await AnnualLeaveBalanceCalculator.SyncCurrentYearBalanceAsync(db, profile, CancellationToken.None);

        var expected = LeaveCalculationService.ProRateFirstYearEntitlement(23, start, today.Year, startMonth: 1);
        Assert.Equal(expected, profile.LeaveBalance);
        Assert.Equal(23, profile.AnnualLeaveEntitlement);
    }

    [Fact]
    public async Task The_stored_balance_is_the_full_allowance_with_the_switch_off()
    {
        using var db = TestDb.Create();
        SeedAnnualLeave(db, proRate: false);
        var today = DateTime.UtcNow;
        var profile = Profile(new DateOnly(today.Year, today.Month, 1));
        db.EmployeeProfiles.Add(profile);
        await db.SaveChangesAsync();

        await AnnualLeaveBalanceCalculator.SyncCurrentYearBalanceAsync(db, profile, CancellationToken.None);

        Assert.Equal(23m, profile.LeaveBalance);
    }
}
