using Application.AnnualLeaves.Commands;
using Domain;
using Domain.Services;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// <see cref="LeaveType.MinNoticeDays"/> and <see cref="LeaveType.MaxConsecutiveDays"/>
/// were display-only: the admin dialog saved them, the leave type's card rendered
/// "Minimum 7 days notice required" and "Max 15 consecutive days per request", and
/// nothing in the request path ever read either column. These tests pin them as
/// enforced rules.
///
/// The two are counted in deliberately different units, which is the thing most
/// worth holding still here:
///
/// <list type="bullet">
/// <item><description>
/// Notice is <em>calendar</em> days. "30 days notice" is how every HR policy states
/// it, and the card says "days notice" plainly.
/// </description></item>
/// <item><description>
/// The maximum is <em>business</em> days — the same figure
/// <see cref="AnnualLeave.TotalDays"/> holds, so "17 consecutive days" and "17 days
/// deducted" are the same 17. The seeded data agrees: Paternity Leave's 25 is
/// exactly its <c>PerChildWeeksPerYear</c> of 5 at five business days a week.
/// </description></item>
/// </list>
/// </summary>
public class LeaveLimitsRuleTests
{
    private static LeaveType Type(int minNotice = 0, int maxConsecutive = 0) => new()
    {
        Id = 1,
        Name = "Annual Leave",
        MinNoticeDays = minNotice,
        MaxConsecutiveDays = maxConsecutive,
    };

    // A Monday, so weekday arithmetic in these tests reads plainly.
    private static readonly DateTime Today = new(2026, 6, 1);

    [Fact]
    public void A_type_wanting_notice_refuses_a_request_starting_inside_it()
    {
        var error = NoticePeriodRule.Check(Type(minNotice: 2), Today.AddDays(1), Today);

        Assert.Equal(
            "Annual Leave needs 2 days notice. The earliest you can start is Wednesday, 3 June 2026.",
            error);
    }

    [Fact]
    public void A_request_starting_exactly_on_the_notice_boundary_is_allowed()
    {
        Assert.Null(NoticePeriodRule.Check(Type(minNotice: 2), Today.AddDays(2), Today));
    }

    /// <summary>Zero is the setting the card renders as "Same-day requests allowed".</summary>
    [Fact]
    public void A_type_wanting_no_notice_allows_a_request_starting_today()
    {
        Assert.Null(NoticePeriodRule.Check(Type(minNotice: 0), Today, Today));
    }

    /// <summary>
    /// Calendar days, not business days: two days notice given on a Friday reaches
    /// Sunday, so a Monday start is three days out and comfortably clear. Counting
    /// business days here would have pushed the earliest start to Tuesday.
    /// </summary>
    [Fact]
    public void Notice_is_counted_in_calendar_days_so_a_weekend_spends_it()
    {
        var friday = new DateTime(2026, 6, 5);
        Assert.Null(NoticePeriodRule.Check(Type(minNotice: 2), friday.AddDays(3), friday));
    }

    [Fact]
    public async Task A_request_longer_than_the_maximum_is_refused()
    {
        await using var db = TestDb.Create();

        // Four full working weeks: 20 business days against a cap of 17.
        var error = await MaxConsecutiveRule.CheckAsync(
            db, Type(maxConsecutive: 17), Today, Today.AddDays(25), CancellationToken.None);

        Assert.Equal(
            "Annual Leave allows at most 17 working days per request. This one covers 20.",
            error);
    }

    [Fact]
    public async Task A_request_exactly_at_the_maximum_is_allowed()
    {
        await using var db = TestDb.Create();

        // Three full working weeks plus two days: 17 business days.
        Assert.Null(await MaxConsecutiveRule.CheckAsync(
            db, Type(maxConsecutive: 17), Today, Today.AddDays(22), CancellationToken.None));
    }

    /// <summary>Zero is the setting the dialog labels "0 = no maximum".</summary>
    [Fact]
    public async Task A_type_with_no_maximum_allows_any_length()
    {
        await using var db = TestDb.Create();

        Assert.Null(await MaxConsecutiveRule.CheckAsync(
            db, Type(maxConsecutive: 0), Today, Today.AddYears(1), CancellationToken.None));
    }

    /// <summary>
    /// The maximum counts the same business days <see cref="AnnualLeave.TotalDays"/>
    /// does, so a public holiday inside the range does not spend the allowance —
    /// which is what keeps "17 consecutive days" and "17 days deducted" the same 17.
    /// </summary>
    [Fact]
    public async Task A_public_holiday_inside_the_range_does_not_count_towards_the_maximum()
    {
        await using var db = TestDb.Create();
        db.AppSettings.Add(new AppSettings { Id = 1, HolidayCountryCode = "CY" });
        db.PublicHolidays.Add(new PublicHoliday
        {
            Id = 1,
            CountryCode = "CY",
            Year = 2026,
            Date = new DateTime(2026, 6, 3),
            LocalName = "Test Holiday",
            EnglishName = "Test Holiday",
        });
        await db.SaveChangesAsync();

        // Mon-Fri is five weekdays, but the Wednesday is a holiday, so four count.
        Assert.Null(await MaxConsecutiveRule.CheckAsync(
            db, Type(maxConsecutive: 4), Today, Today.AddDays(4), CancellationToken.None));
    }

    /// <summary>
    /// A half day covers one date, so it counts as the single business day it sits
    /// on and can never trip a maximum of one or more.
    /// </summary>
    [Fact]
    public async Task A_half_day_never_trips_the_maximum()
    {
        await using var db = TestDb.Create();

        Assert.Null(await MaxConsecutiveRule.CheckAsync(
            db, Type(maxConsecutive: 1), Today, Today, CancellationToken.None));
    }
}
