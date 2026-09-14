using System.Globalization;
using Domain;

namespace Application.AnnualLeaves.Commands;

/// <summary>
/// How far ahead a leave request has to be filed. Returns the refusal message, or
/// <c>null</c> when the request may go ahead — the same shape as
/// <see cref="AttachmentPolicyRule"/> and <see cref="HalfDayRule"/>, which run
/// beside it, and synchronous for the same reason: both call sites have already
/// loaded the <see cref="LeaveType"/>, and the answer needs nothing else.
/// </summary>
public static class NoticePeriodRule
{
    public static string? Check(LeaveType leaveType, DateTime startDate, DateTime today)
    {
        if (leaveType.MinNoticeDays <= 0)
            return null;

        var earliest = today.Date.AddDays(leaveType.MinNoticeDays);
        if (startDate.Date >= earliest)
            return null;

        var day = earliest.ToString("dddd, d MMMM yyyy", CultureInfo.InvariantCulture);
        return $"{leaveType.Name} needs {leaveType.MinNoticeDays} days notice. "
            + $"The earliest you can start is {day}.";
    }
}
