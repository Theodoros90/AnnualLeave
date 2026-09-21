namespace Domain;

/// <summary>
/// The leave types the application seeds and depends on by name. They may be
/// reconfigured freely — allowance, notice, attachment policy and the rest are all
/// ordinary settings — but they cannot be renamed or deleted.
///
/// Keyed by name rather than by a stored flag on the row. That is only sound
/// because the name is fixed: <c>UpdateLeaveType</c> refuses to rename one of
/// these, and both create and update already enforce case-insensitive name
/// uniqueness, so exactly one row can ever answer to each of these names. A stored
/// flag would have had to be backfilled by name anyway, and could then drift from
/// the name actually displayed.
///
/// Renaming is refused because other code finds these by name — the client's leave
/// allowance helpers and the Maternity/Paternity eligibility copy among them — and
/// a rename would break that silently rather than loudly. Deleting is refused
/// because seeding does not restore a type an admin removed, so the application
/// would come up missing a leave type nothing offers to recreate.
/// </summary>
public static class SystemLeaveTypes
{
    public const string AnnualLeave = "Annual Leave";
    public const string MaternityLeave = "Maternity Leave";
    public const string PaternityLeave = "Paternity Leave";

    public static readonly string[] All = [AnnualLeave, MaternityLeave, PaternityLeave];

    /// <summary>
    /// Whether <paramref name="name"/> names a protected type. Trimmed and
    /// case-insensitive, matching how the name uniqueness rules compare, so
    /// " annual leave " cannot slip past as a different type.
    /// </summary>
    public static bool IsSystem(string? name) =>
        !string.IsNullOrWhiteSpace(name)
        && All.Contains(name.Trim(), StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// The two types whose entitlement is per child rather than one pool per
    /// employee. Nothing else may carry a per-child entitlement: the ledger is
    /// keyed by <c>AnnualLeave.ChildId</c>, and a request against a per-child type
    /// has to name a child, which only makes sense for the leave a birth grants.
    ///
    /// It is not a setting on these two either — it is what they are. The edit
    /// dialog shows the three numbers for them with no toggle, so
    /// <c>PerChildEntitlement</c> follows the name.
    /// </summary>
    public static readonly string[] PerChildEntitlementTypes = [MaternityLeave, PaternityLeave];

    /// <summary>
    /// Whether a type of this name keeps a per-child ledger. Trimmed and
    /// case-insensitive, like <see cref="IsSystem"/>.
    /// </summary>
    public static bool SupportsPerChildEntitlement(string? name) =>
        !string.IsNullOrWhiteSpace(name)
        && PerChildEntitlementTypes.Contains(name.Trim(), StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Whether a type of this name is Maternity Leave. Separate from
    /// <see cref="SupportsPerChildEntitlement"/>, which the two parental types
    /// answer to together: eligibility tells them apart, because each is offered
    /// to one gender. See <c>Application.AnnualLeaves.Commands.ParentalLeaveEligibility</c>.
    /// </summary>
    public static bool IsMaternity(string? name) => NameIs(name, MaternityLeave);

    /// <summary>Whether a type of this name is Paternity Leave.</summary>
    public static bool IsPaternity(string? name) => NameIs(name, PaternityLeave);

    /// <summary>
    /// Who a built-in type is offered to, or <c>null</c> for a type whose
    /// <see cref="LeaveType.AvailableTo"/> an admin may set. Annual Leave is for
    /// everyone — it is the pool every employee's balance is a budget for — while
    /// Maternity Leave is for women and Paternity Leave for men, which is what the
    /// two types are rather than a setting on them. The edit dialog shows these
    /// three read-only and <c>UpsertLeaveTypeRequestValidator</c> refuses any other
    /// value, so a caller going around the UI is told rather than ignored.
    /// </summary>
    public static GenderAvailability? FixedAvailability(string? name)
    {
        if (NameIs(name, AnnualLeave)) return GenderAvailability.Both;
        if (IsMaternity(name)) return GenderAvailability.Female;
        if (IsPaternity(name)) return GenderAvailability.Male;
        return null;
    }

    /// <summary>Trimmed and case-insensitive, matching how the rest of this class compares.</summary>
    private static bool NameIs(string? name, string systemName) =>
        !string.IsNullOrWhiteSpace(name)
        && string.Equals(name.Trim(), systemName, StringComparison.OrdinalIgnoreCase);
}
