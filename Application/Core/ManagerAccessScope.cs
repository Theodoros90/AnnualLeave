using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Core;

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
        var managedDepartmentIds = await context.UserDepartments
            .Where(ud => ud.UserId == userId)
            .Select(ud => ud.DepartmentId)
            .Distinct()
            .ToListAsync(cancellationToken);

        var managerProfiles = await context.EmployeeProfiles
            .Where(ep => ep.UserId == userId)
            .Select(ep => new { ep.Id, ep.DepartmentId })
            .ToListAsync(cancellationToken);

        foreach (var profile in managerProfiles)
        {
            if (!managedDepartmentIds.Contains(profile.DepartmentId))
                managedDepartmentIds.Add(profile.DepartmentId);
        }

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