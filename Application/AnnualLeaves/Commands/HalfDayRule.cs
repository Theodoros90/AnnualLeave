using Domain;
using Domain.Services;

namespace Application.AnnualLeaves.Commands;

/// <summary>
/// Whether a leave request may be taken as a half day. Returns the refusal message,
/// or <c>null</c> when the request may go ahead — the same shape as
/// <see cref="AttachmentPolicyRule"/>, which runs beside it, and synchronous for the
/// same reason: both call sites have already loaded the <see cref="LeaveType"/>, and
/// the answer needs nothing else from the database.
///
/// <see cref="LeaveType.HalfDayAllowed"/> was display-only until this rule. The admin
/// dialog saved it and the leave type's card rendered "Half-day requests allowed" as
/// a badge, while the apply page showed its "Half day (AM)" and "Half day (PM)"
/// buttons for every type regardless — and then posted no duration at all, so the
/// server stored and charged a whole day either way. Turning the switch off changed
/// nothing an employee could see; turning it on changed nothing either.
/// <c>client/src/lib/half-day.ts</c> mirrors this rule so the forms never offer a
/// submit the API is certain to refuse, the same way
/// <c>client/src/lib/attachment-policy.ts</c> mirrors the attachment policy.
///
/// Two refusals, and deliberately not a third:
///
/// <list type="bullet">
/// <item><description>
/// A type with the switch off refuses a half day outright. Unlike the attachment
/// policy, where only one of three settings refuses anything, this flag is a plain
/// yes or no and both readings bite.
/// </description></item>
/// <item><description>
/// A half day covers one date. Half of a week is not a half day, and
/// <see cref="LeaveCalculationService.CalculateChargeableDays"/> would charge such a
/// request 0.5 days for a five-day absence — so the range is refused rather than
/// silently under-charged.
/// </description></item>
/// <item><description>
/// A half day on a weekend or public holiday is <em>not</em> refused. A full-day
/// request over the same dates charges 0 rather than being refused, and inventing a
/// stricter rule for half days alone would be a surprise with nothing behind it. The
/// charge is 0 there too.
/// </description></item>
/// </list>
/// </summary>
public static class HalfDayRule
{
    public static string? Check(
        LeaveType leaveType,
        LeaveDuration duration,
        DateTime startDate,
        DateTime endDate)
    {
        if (duration == LeaveDuration.Full)
            return null;

        if (!leaveType.HalfDayAllowed)
            return $"{leaveType.Name} cannot be taken as a half day.";

        // The dates arrive from the client carrying a time component, so this is a
        // comparison of calendar days rather than of instants.
        if (startDate.Date != endDate.Date)
            return "A half day covers a single date. Pick one date, or switch to full days.";

        return null;
    }
}
