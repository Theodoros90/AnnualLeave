using Application.Core;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.AdminUsers.Support;

/// <summary>
/// Which accounts a department-scoped caller may see on the Users list: everyone
/// whose profile sits in one of the caller's departments, and the caller. Read by
/// the list and the detail query so the two agree.
/// </summary>
public static class AdminUserScope
{
    public static async Task<HashSet<string>> VisibleUserIdsAsync(
        AppDbContext context, string requestingUserId, CancellationToken cancellationToken)
    {
        var scope = await ManagerAccessScopeResolver.ResolveAsync(context, requestingUserId, cancellationToken);
        var visible = scope.ManagedDepartmentIds.Count == 0
            ? new HashSet<string>()
            : (await context.EmployeeProfiles
                .Where(ep => ep.DepartmentId != null && scope.ManagedDepartmentIds.Contains(ep.DepartmentId.Value))
                .Select(ep => ep.UserId)
                .ToListAsync(cancellationToken)).ToHashSet();
        if (!string.IsNullOrWhiteSpace(requestingUserId)) visible.Add(requestingUserId);
        return visible;
    }
}
