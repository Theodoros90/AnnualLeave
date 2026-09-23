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
