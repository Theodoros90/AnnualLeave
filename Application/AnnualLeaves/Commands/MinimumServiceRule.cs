using System.Globalization;
using Domain;

namespace Application.AnnualLeaves.Commands;

/// <summary>
/// How long an employee has to have worked here before a leave type is offered to
/// them. Returns the refusal message, or <c>null</c> when the request may go ahead
/// — the same shape as <see cref="NoticePeriodRule"/>, which runs beside it, and
/// synchronous for the same reason: both call sites have already loaded the
/// <see cref="LeaveType"/> and the <see cref="EmployeeProfile"/>, and the answer
/// needs nothing else.
///
/// Measured against the day of filing, not the leave's start date: the type is
/// hidden from the employee until they have served the months, then appears. An
/// employee at seven weeks cannot book a two-month type for the autumn — that is
/// the rule as chosen, matching how the card reads ("Available after 2 months of
/// service"), not an oversight. Service only ever grows, so unlike the notice
/// period this is safe to re-check on every edit: a request accepted once can
/// never later fail it.
///
/// A <c>null</c> start date passes. It means nobody entered it — an Admin never
/// has one (the validators refuse it for the role), and an Employee row predating
/// the column has none until it is next saved — and refusing on a blank would take
/// the type away from everyone until an admin filled the field in one person at a
/// time. Same reading as a null <see cref="User.Gender"/> in
/// <see cref="ParentalLeaveEligibility"/>.
/// </summary>
public static class MinimumServiceRule
{
    public static string? Check(LeaveType leaveType, DateOnly? employmentStartDate, DateOnly today)
    {
        if (leaveType.MinServiceMonths <= 0)
            return null;

        if (employmentStartDate is null)
            return null;

        var eligibleFrom = employmentStartDate.Value.AddMonths(leaveType.MinServiceMonths);
        if (today >= eligibleFrom)
            return null;

        var months = leaveType.MinServiceMonths;
        var unit = months == 1 ? "month" : "months";
        var day = eligibleFrom.ToString("dddd, d MMMM yyyy", CultureInfo.InvariantCulture);
        return $"{leaveType.Name} is available after {months} {unit} of service. "
            + $"You can request it from {day}.";
    }
}
