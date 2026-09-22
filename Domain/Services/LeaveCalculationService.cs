namespace Domain.Services;

/// <summary>
/// Single source of truth for leave duration and balance arithmetic.
/// All members are pure: no DbContext, no clock, no I/O. Application
/// services are responsible for loading the inputs (holiday set, leave year
/// configuration, prior approved leaves) and calling into this service.
///
/// Keeping the rules in the Domain layer means a refactor of the data
/// access tier — or a future read-side projection — cannot accidentally
/// diverge from the canonical business-day calculation.
/// </summary>
public static class LeaveCalculationService
{
    /// <summary>
    /// Counts business days between <paramref name="start"/> and
    /// <paramref name="end"/> (both inclusive), skipping Saturdays, Sundays,
    /// and any date present in <paramref name="holidays"/>.
    /// </summary>
    public static int CalculateBusinessDays(
        DateTime start,
        DateTime end,
        IReadOnlySet<DateTime>? holidays = null)
    {
        start = start.Date;
        end = end.Date;
        if (end < start) return 0;

        var days = 0;
        for (var date = start; date <= end; date = date.AddDays(1))
        {
            if (IsBusinessDay(date, holidays)) days++;
        }
        return days;
    }

    /// <summary>
    /// Chargeable days for a leave request: the days actually deducted from a
    /// balance, as opposed to the calendar span or the raw business-day count.
    ///
    /// A half day costs half a day, flat — not half of however many days the range
    /// covers. <c>HalfDayRule</c> refuses a multi-date half day before it can be
    /// stored, so the flat charge is what that rule guarantees; it is also the
    /// honest answer for a row that arrived some other way (an older import, a
    /// crafted request). The expression this replaces, <c>businessDays * 0.5</c>,
    /// would have billed 2.5 days for a week-long request calling itself a half day.
    ///
    /// A half day on a non-business day charges nothing, matching a full-day
    /// request over the same dates — which counts 0 rather than being refused.
    /// </summary>
    public static decimal CalculateChargeableDays(
        DateTime start,
        DateTime end,
        LeaveDuration duration,
        IReadOnlySet<DateTime>? holidays = null)
    {
        var businessDays = CalculateBusinessDays(start, end, holidays);
        if (duration == LeaveDuration.Full) return businessDays;
        return businessDays > 0 ? HalfDayCharge : 0m;
    }

    /// <summary>
    /// Chargeable days from a leave request that fall inside a specific leave year.
    /// The decimal counterpart to <see cref="CalculateBusinessDaysInLeaveYear"/>,
    /// and what both balance calculators measure a request by.
    ///
    /// A half day is a single date, so it lands wholly inside one leave year or
    /// wholly outside it — there is no half of a half to apportion across a
    /// year-end boundary.
    /// </summary>
    public static decimal CalculateChargeableDaysInLeaveYear(
        DateTime leaveStart,
        DateTime leaveEnd,
        LeaveDuration duration,
        int leaveYearKey,
        int startMonth,
        IReadOnlySet<DateTime>? holidays = null)
    {
        var businessDays = CalculateBusinessDaysInLeaveYear(
            leaveStart, leaveEnd, leaveYearKey, startMonth, holidays);
        if (duration == LeaveDuration.Full) return businessDays;
        return businessDays > 0 ? HalfDayCharge : 0m;
    }

    /// <summary>What a half day costs. Half of one working day.</summary>
    public const decimal HalfDayCharge = 0.5m;

    /// <summary>
    /// Returns the start-year key of the leave year that contains <paramref name="date"/>.
    /// Example: if leave years run April→March, a date in February 2026 returns 2025.
    /// </summary>
    public static int GetLeaveYearKey(DateTime date, int startMonth)
        => date.Month >= startMonth ? date.Year : date.Year - 1;

    /// <summary>
    /// Inclusive start/end dates for the leave year identified by <paramref name="leaveYearKey"/>.
    /// </summary>
    public static (DateTime Start, DateTime End) GetLeaveYearBounds(int leaveYearKey, int startMonth)
    {
        var start = new DateTime(leaveYearKey, startMonth, 1);
        var end = start.AddYears(1).AddDays(-1);
        return (start, end);
    }

    /// <summary>
    /// The set of leave-year keys touched by a leave that spans
    /// <paramref name="leaveStart"/>..<paramref name="leaveEnd"/>. Usually one,
    /// two if the request crosses the leave-year boundary.
    /// </summary>
    public static IEnumerable<int> GetCoveredLeaveYears(
        DateTime leaveStart,
        DateTime leaveEnd,
        int startMonth)
    {
        var startKey = GetLeaveYearKey(leaveStart, startMonth);
        var endKey = GetLeaveYearKey(leaveEnd, startMonth);
        for (var key = startKey; key <= endKey; key++)
            yield return key;
    }

    /// <summary>
    /// Business days from a leave request that fall inside a specific leave year.
    /// Clips the request's range to the leave-year window, then runs the standard
    /// business-day count over the intersection.
    /// </summary>
    public static int CalculateBusinessDaysInLeaveYear(
        DateTime leaveStart,
        DateTime leaveEnd,
        int leaveYearKey,
        int startMonth,
        IReadOnlySet<DateTime>? holidays = null)
    {
        var (lyStart, lyEnd) = GetLeaveYearBounds(leaveYearKey, startMonth);
        var clippedStart = leaveStart.Date > lyStart ? leaveStart.Date : lyStart;
        var clippedEnd = leaveEnd.Date < lyEnd ? leaveEnd.Date : lyEnd;
        return CalculateBusinessDays(clippedStart, clippedEnd, holidays);
    }

    /// <summary>
    /// Remaining balance, floored at zero. Used when an employee's entitlement
    /// is less than days already taken (e.g. mid-year hire adjustments).
    ///
    /// Decimal because a half day costs 0.5: an entitlement is always whole days,
    /// but what is left of one need not be.
    /// </summary>
    public static decimal CalculateRemainingBalance(decimal entitlement, decimal usedDays)
        => Math.Max(0m, entitlement - usedDays);

    /// <summary>
    /// The first year's allowance for somebody who joined part-way through it:
    /// remaining months of the leave year over twelve, the joining month counted in
    /// full, rounded <em>up</em> to the next half day so a mid-year joiner is never
    /// short-changed by the arithmetic. 23 days for a September start in a
    /// January leave year is 23 × 4/12 = 7.67, which rounds to 8.
    ///
    /// A start date before the leave year — or none on file, which means nobody
    /// entered it — is the full allowance. That is what makes every year after the
    /// first full without a job or a re-stamp: the stored entitlement is never
    /// pro-rated, only the figure this returns for one leave year is. A start after
    /// the leave year has ended is 0: there is nothing to take from a year they had
    /// not joined.
    ///
    /// Whether this applies at all is <c>LeaveType.ProRateFirstYear</c>; callers
    /// read that switch and pass the raw entitlement through when it is off.
    /// </summary>
    public static decimal ProRateFirstYearEntitlement(
        int entitlement,
        DateOnly? employmentStart,
        int leaveYearKey,
        int startMonth)
    {
        if (employmentStart is null)
            return entitlement;

        var (lyStart, lyEnd) = GetLeaveYearBounds(leaveYearKey, startMonth);
        var start = employmentStart.Value.ToDateTime(TimeOnly.MinValue);
        if (start <= lyStart)
            return entitlement;
        if (start > lyEnd)
            return 0m;

        // Months from the joining month to the leave year's last month, inclusive.
        var monthsIn = (start.Year - lyStart.Year) * 12 + (start.Month - lyStart.Month);
        var remainingMonths = 12 - monthsIn;

        var exact = entitlement * remainingMonths / 12m;
        return Math.Ceiling(exact * 2) / 2;
    }

    private static bool IsBusinessDay(DateTime date, IReadOnlySet<DateTime>? holidays)
    {
        if (date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) return false;
        if (holidays is not null && holidays.Contains(date.Date)) return false;
        return true;
    }
}

/// <summary>
/// How much of a working day a leave request covers.
///
/// <see cref="Full"/> is 0 deliberately: it is the enum's default and the column's
/// default, so every request written before the column existed reads as a full day
/// without a backfill.
///
/// Morning and afternoon cost the same. They are told apart so a team can see
/// <em>which</em> half a colleague is away for — the apply form has offered the
/// choice since long before anything stored the answer.
/// </summary>
public enum LeaveDuration
{
    Full = 0,
    HalfDayMorning = 1,
    HalfDayAfternoon = 2,
}
