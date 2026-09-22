using Domain.Services;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// The first year's allowance, pro-rated from the employment start date: remaining
/// months in the leave year over twelve, the joining month counted in full, rounded
/// up to the next half day. A start date before the leave year — or none on file —
/// is the full allowance, which is what makes every later year full on its own.
///
/// Pure arithmetic in <see cref="LeaveCalculationService"/>; whether it applies at
/// all is the leave type's <c>ProRateFirstYear</c> switch, read by the callers.
/// </summary>
public class ProRatedFirstYearTests
{
    private static decimal ProRate(int allowance, DateOnly? start, int leaveYearKey, int startMonth = 1) =>
        LeaveCalculationService.ProRateFirstYearEntitlement(allowance, start, leaveYearKey, startMonth);

    [Fact]
    public void No_start_date_on_file_is_the_full_allowance()
    {
        Assert.Equal(23m, ProRate(23, null, 2026));
    }

    [Fact]
    public void A_start_before_the_leave_year_is_the_full_allowance()
    {
        Assert.Equal(23m, ProRate(23, new DateOnly(2024, 9, 10), 2026));
    }

    [Fact]
    public void A_start_in_the_leave_years_first_month_is_the_full_allowance()
    {
        Assert.Equal(23m, ProRate(23, new DateOnly(2026, 1, 20), 2026));
    }

    [Fact]
    public void A_start_after_the_leave_year_ends_is_nothing()
    {
        Assert.Equal(0m, ProRate(23, new DateOnly(2027, 2, 1), 2026));
    }

    [Theory]
    [InlineData(10)]
    [InlineData(20)]
    [InlineData(30)]
    public void The_joining_month_counts_in_full_whatever_the_day(int day)
    {
        // September to December is four months: 23 × 4/12 = 7.67, up to the half → 8.
        Assert.Equal(8.0m, ProRate(23, new DateOnly(2026, 9, day), 2026));
    }

    [Fact]
    public void A_december_start_gets_one_twelfth()
    {
        // 23 / 12 = 1.92 → 2.0
        Assert.Equal(2.0m, ProRate(23, new DateOnly(2026, 12, 15), 2026));
    }

    [Fact]
    public void An_exact_twelfth_is_not_rounded_up()
    {
        // 24 × 6/12 = 12 exactly.
        Assert.Equal(12.0m, ProRate(24, new DateOnly(2026, 7, 1), 2026));
    }

    [Fact]
    public void Rounding_is_up_to_the_next_half_day_not_the_nearest()
    {
        // 20 × 5/12 = 8.33: nearest half would be 8.5 too, so use 22 × 5/12 = 9.17 → 9.5,
        // where the nearest half would have been 9.0.
        Assert.Equal(9.5m, ProRate(22, new DateOnly(2026, 8, 3), 2026));
    }

    [Fact]
    public void An_april_leave_year_counts_months_to_the_following_march()
    {
        // Leave year April 2026 – March 2027; a September start leaves Sep..Mar = 7 months.
        // 23 × 7/12 = 13.42 → 13.5
        Assert.Equal(13.5m, ProRate(23, new DateOnly(2026, 9, 10), 2026, startMonth: 4));
    }

    [Fact]
    public void A_start_in_the_calendar_year_after_the_key_still_falls_inside_an_april_leave_year()
    {
        // February 2027 is in leave year 2026 (April start): Feb, Mar = 2 months.
        // 23 × 2/12 = 3.83 → 4.0
        Assert.Equal(4.0m, ProRate(23, new DateOnly(2027, 2, 1), 2026, startMonth: 4));
    }
}
