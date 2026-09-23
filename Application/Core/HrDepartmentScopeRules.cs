using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Core;

/// <summary>
/// The departments an HR Administrator is assigned — their whole reach over Leave &amp;
/// Time. Follows <c>DepartmentId</c>'s role rule: required (at least one) for an HR
/// Administrator, refused for everyone else. Shared by <c>CreateAdminUserValidator</c>
/// and <c>SetAdminUserDepartmentsValidator</c> so the two cannot drift.
/// </summary>
public static class HrDepartmentScopeRules
{
    public const string DepartmentsRequiredMessage = "Select at least one department for the HR Administrator.";
    public const string DepartmentsNotForRoleMessage = "Only an HR Administrator is assigned departments.";
    public const string UnknownDepartmentMessage = "One or more selected departments do not exist or are inactive.";

    /// <summary>Distinct, positive, ascending. What every writer stores and every validator checks.</summary>
    public static List<int> Normalize(IEnumerable<int>? departmentIds) =>
        (departmentIds ?? [])
            .Where(id => id > 0)
            .Distinct()
            .OrderBy(id => id)
            .ToList();

    /// <summary>
    /// Whether every id is one this user may be left holding: an existing active
    /// department, or one they already hold whatever its status. A department
    /// deactivated after it was assigned stays assigned — the dialog keeps it
    /// selectable and the edit mutation re-sends the whole set on every save, so
    /// demanding <c>IsActive</c> for it would refuse an unrelated edit, after the
    /// role call in the same save had already committed. Newly adding a deactivated
    /// department is still refused; <see cref="AllActiveAsync"/> is what a create
    /// uses, where nothing is held yet.
    /// </summary>
    public static async Task<bool> AllAssignableAsync(
        AppDbContext context, string userId, IReadOnlyCollection<int> departmentIds, CancellationToken cancellationToken)
    {
        if (departmentIds.Count == 0) return true;
        var ids = departmentIds.ToList();

        var held = await context.UserDepartments
            .Where(ud => ud.UserId == userId && ids.Contains(ud.DepartmentId))
            .Select(ud => ud.DepartmentId)
            .ToListAsync(cancellationToken);

        var active = await context.Departments
            .Where(d => ids.Contains(d.Id) && d.IsActive)
            .Select(d => d.Id)
            .ToListAsync(cancellationToken);

        var assignable = held.Concat(active).ToHashSet();
        return ids.All(assignable.Contains);
    }

    /// <summary>Whether every id names an existing, active department. An empty set is vacuously true — emptiness is the required-rule's business.</summary>
    public static async Task<bool> AllActiveAsync(
        AppDbContext context, IReadOnlyCollection<int> departmentIds, CancellationToken cancellationToken)
    {
        if (departmentIds.Count == 0) return true;
        var ids = departmentIds.ToList();
        var found = await context.Departments
            .CountAsync(d => ids.Contains(d.Id) && d.IsActive, cancellationToken);
        return found == ids.Count;
    }
}
