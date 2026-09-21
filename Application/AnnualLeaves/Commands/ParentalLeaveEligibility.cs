using Application.Children.Support;
using Domain;
using Domain.Services;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.AnnualLeaves.Commands;

/// <summary>
/// Who may file a leave type that is not offered to everyone. Two rules, applied
/// in order, returning the refusal message or <c>null</c> when the request may go
/// ahead — the same shape as <see cref="PerChildLeaveBalanceCalculator"/>, which
/// runs beside it.
///
/// <list type="number">
/// <item><description>
/// <b>Gender.</b> A type whose <see cref="LeaveType.AvailableTo"/> names one gender
/// is refused for an employee whose recorded <see cref="Gender"/> is the other.
/// This reads the column, not the name, so it reaches a type an admin restricted
/// themselves as well as Maternity (women) and Paternity Leave (men), whose value
/// is fixed by <see cref="SystemLeaveTypes.FixedAvailability"/>.
/// </description></item>
/// <item><description>
/// <b>An eligible child.</b> Maternity and Paternity Leave additionally need a
/// child young enough to qualify. This half stays keyed on the two frozen names:
/// it is about the leave a birth grants, not about gender.
/// </description></item>
/// </list>
///
/// This is the one place <see cref="User.Gender"/> is consulted. It was recorded
/// HR data that gated nothing until this rule; the comment on the property says so
/// and is kept in step with it.
///
/// Two deliberate asymmetries, both of which the tests pin:
///
/// <list type="bullet">
/// <item><description>
/// An unspecified gender passes. <c>null</c> means "nobody has entered it" — the
/// state of every account created before the column existed — so reading it as a
/// mismatch would take parental leave away from the whole company until an
/// administrator filled the field in one person at a time. The check narrows only
/// on a gender somebody actually recorded. Note that a null can no longer be
/// <i>chosen</i>: the admin dialogs offer Male or Female only and both admin
/// validators refuse a save without one, so the nulls this tolerates are legacy
/// rows on their way out, not a standing "offer me everything" option.
/// </description></item>
/// <item><description>
/// The eligible-child rule is skipped for a type that keeps its own per-child
/// ledger. Paternity Leave already refuses a request naming no child, a child that
/// is not the employee's, or one who has aged out, each with a message naming the
/// child and the date — see <see cref="PerChildLeaveBalanceCalculator.CheckPerChildEntitlementAsync"/>.
/// Restating the rule in front of it would replace those messages with a vaguer one.
/// </description></item>
/// </list>
/// </summary>
public static class ParentalLeaveEligibility
{
    /// <summary>
    /// The gender this type is offered to, or <c>null</c> when it is offered to
    /// everyone. Read from the column: for the built-in types the validator keeps
    /// it at the value <see cref="SystemLeaveTypes.FixedAvailability"/> fixes, and
    /// for anything else it is whatever the admin chose.
    /// </summary>
    private static Gender? OfferedTo(LeaveType leaveType) => leaveType.AvailableTo switch
    {
        GenderAvailability.Male => Gender.Male,
        GenderAvailability.Female => Gender.Female,
        _ => null,
    };

    /// <summary>
    /// Whether the eligible-child half applies: only to the two parental types,
    /// keyed by name as everything else about them is.
    /// </summary>
    private static bool NeedsEligibleChild(LeaveType leaveType) =>
        SystemLeaveTypes.IsMaternity(leaveType.Name) || SystemLeaveTypes.IsPaternity(leaveType.Name);

    public static async Task<string?> CheckAsync(
        AppDbContext context,
        LeaveType leaveType,
        string employeeUserId,
        EmployeeProfile employeeProfile,
        CancellationToken cancellationToken)
    {
        var offeredTo = OfferedTo(leaveType);
        if (offeredTo is not null)
        {
            var gender = await context.Users
                .AsNoTracking()
                .Where(user => user.Id == employeeUserId)
                .Select(user => user.Gender)
                .FirstOrDefaultAsync(cancellationToken);

            if (gender.HasValue && gender.Value != offeredTo.Value)
                return $"{leaveType.Name} is not available to you.";
        }

        if (!NeedsEligibleChild(leaveType))
            return null;

        // Paternity Leave's per-child ledger enforces this far more precisely.
        if (leaveType.PerChildEntitlement)
            return null;

        var eligibleUntilAge = await ResolveEligibleUntilAgeAsync(context, leaveType, cancellationToken);

        // Nothing configured says what "eligible" means for this type, so there is
        // no rule to apply. Deliberately the opposite reading to
        // ChildProjection.ResolveEligibleUntilAgeAsync, where a 0 correctly means
        // "no per-child entitlement exists, so nobody has one": here the type grants
        // leave whatever the per-child numbers say, and refusing everyone against an
        // age nobody set would be refusing against a blank field.
        if (eligibleUntilAge <= 0)
            return null;

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var birthdays = await context.Children
            .AsNoTracking()
            .Where(child => child.EmployeeProfileId == employeeProfile.Id)
            .Select(child => child.DateOfBirth)
            .ToListAsync(cancellationToken);

        var hasEligibleChild = birthdays.Any(
            dateOfBirth => PerChildLeaveCalculationService.IsEligibleOn(dateOfBirth, today, eligibleUntilAge));

        if (!hasEligibleChild)
            return $"{leaveType.Name} is available only while you have a child under {eligibleUntilAge}.";

        return null;
    }

    /// <summary>
    /// The cut-off age this type is measured against: its own when it configures
    /// one, otherwise the per-child type's. Maternity Leave is seeded with all
    /// three per-child columns at 0 — it grants a flat allowance, not a per-child
    /// one — so without the fallback it would quote "under 0" at every employee.
    /// </summary>
    private static async Task<int> ResolveEligibleUntilAgeAsync(
        AppDbContext context, LeaveType leaveType, CancellationToken cancellationToken)
    {
        if (leaveType.ChildEligibleUntilAge > 0)
            return leaveType.ChildEligibleUntilAge;

        return await ChildProjection.ResolveEligibleUntilAgeAsync(context, cancellationToken);
    }
}
