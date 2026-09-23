using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Core;

/// <summary>
/// What a department-scoped caller — a Manager or an HR Administrator — may reach:
/// the departments on their own profile and assigned to them, the profiles they
/// manage, and their direct reports. The name predates the HR Administrator; the
/// shape did not need to change for them.
/// </summary>
public sealed class ManagerAccessScope
{
    public List<int> ManagedDepartmentIds { get; init; } = [];
    public List<string> ManagerProfileIds { get; init; } = [];
    public List<string> DirectReportUserIds { get; init; } = [];
}

public static class ManagerAccessScopeResolver
{
    public static async Task<ManagerAccessScope> ResolveAsync(
        AppDbContext context,
        string userId,
        CancellationToken cancellationToken)
    {
        // The caller's own profile department, plus every department assigned to
        // them through UserDepartment. For a Manager the rows are extra departments
        // they cover; for an HR Administrator — whose profile has no department —
        // they are the whole scope. One list either way, so no consumer has to know
        // which role it is scoping.
        var managerProfiles = await context.EmployeeProfiles
            .Where(ep => ep.UserId == userId)
            .Select(ep => new { ep.Id, ep.DepartmentId })
            .ToListAsync(cancellationToken);

        var assignedDepartmentIds = await context.UserDepartments
            .Where(ud => ud.UserId == userId)
            .Select(ud => ud.DepartmentId)
            .ToListAsync(cancellationToken);

        // A department-less profile (an administrator's) contributes nothing on its
        // own. Dropping the nulls keeps ManagedDepartmentIds a list of real
        // departments, so every consumer can compare against it without a cast.
        var managedDepartmentIds = managerProfiles
            .Where(profile => profile.DepartmentId.HasValue)
            .Select(profile => profile.DepartmentId!.Value)
            .Concat(assignedDepartmentIds)
            .Distinct()
            .ToList();

        var managerProfileIds = managerProfiles
            .Select(profile => profile.Id)
            .ToList();

        var directReportUserIds = managerProfileIds.Count == 0
            ? []
            : await context.EmployeeProfiles
                .Where(ep => ep.ManagerId != null && managerProfileIds.Contains(ep.ManagerId))
                .Select(ep => ep.UserId)
                .Distinct()
                .ToListAsync(cancellationToken);

        return new ManagerAccessScope
        {
            ManagedDepartmentIds = managedDepartmentIds,
            ManagerProfileIds = managerProfileIds,
            DirectReportUserIds = directReportUserIds
        };
    }
}