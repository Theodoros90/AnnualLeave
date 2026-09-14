using Domain;
using Domain.Services;
using Persistence;

namespace Application.AnnualLeaves.Commands;

/// <summary>
/// How long a single leave request may run. Returns the refusal message, or
/// <c>null</c> when the request may go ahead — the same shape as
/// <see cref="NoticePeriodRule"/>, which runs beside it, but asynchronous like
/// <see cref="ParentalLeaveEligibility"/> because it needs the public holidays
/// covering the range and those live in the database.
///
/// The maximum is counted in <em>business</em> days, not in the calendar span:
/// the same figure <see cref="AnnualLeave.TotalDays"/> holds, so "17 consecutive
/// days" and "17 days deducted" are the same 17. The seeded data was written that
/// way even while nothing read it — Paternity Leave's 25 is exactly its
/// <c>PerChildWeeksPerYear</c> of 5 at
/// <c>PerChildLeaveCalculationService.BusinessDaysPerWeek</c>, and Maternity
/// Leave's 90 matches its own 90-day allowance.
///
/// A half day covers a single date (<see cref="HalfDayRule"/> refuses anything
/// wider), so it counts as the one business day it sits on and can never trip a
/// maximum of one or more. It needs no special case here.
/// </summary>
public static class MaxConsecutiveRule
{
    public static async Task<string?> CheckAsync(
        AppDbContext context,
        LeaveType leaveType,
        DateTime startDate,
        DateTime endDate,
        CancellationToken cancellationToken)
    {
        // Zero is the setting the admin dialog labels "0 = no maximum", so it must
        // not be read as "no days allowed" the way a zero allowance nearly is.
        if (leaveType.MaxConsecutiveDays <= 0)
            return null;

        var holidays = await LeaveYearQueries.GetHolidaySetAsync(
            context, startDate, endDate, cancellationToken);

        var businessDays = LeaveCalculationService.CalculateBusinessDays(
            startDate, endDate, holidays);

        if (businessDays <= leaveType.MaxConsecutiveDays)
            return null;

        return $"{leaveType.Name} allows at most {leaveType.MaxConsecutiveDays} working days "
            + $"per request. This one covers {businessDays}.";
    }
}
