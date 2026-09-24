using Domain;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Core;

/// <summary>
/// The HR Administrators to tell that a leave request is waiting on them: the
/// ones whose assigned departments (UserDepartment rows) cover the leave's
/// department, or every active HR Administrator when the leave has none — a
/// department-less leave is an administrator's own, and any HR Administrator may
/// decide it (UpdateLeaveStatus's isUnscopedAdminLeave). Mirrors the reach an HR
/// Administrator has over the request, so nobody is emailed about a decision they
/// cannot open.
///
/// Deactivated accounts are skipped: a leaver decides nothing. The excluded user
/// is whoever this is about — the employee, or the HR Administrator who just
/// approved stage one themselves.
/// </summary>
public static class HrApprovalRecipients
{
    public static async Task<List<ManagerContact>> ResolveAsync(
        AppDbContext context,
        int? departmentId,
        string excludeUserId,
        CancellationToken cancellationToken)
    {
        var hrRoleId = await context.Roles
            .Where(r => r.Name == AppRoles.HrAdministrator)
            .Select(r => r.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (hrRoleId is null)
            return [];

        var query =
            from ur in context.UserRoles
            where ur.RoleId == hrRoleId
            join u in context.Users on ur.UserId equals u.Id
            where u.IsActive && u.Email != null && u.Email != ""
            select u;

        if (departmentId.HasValue)
        {
            var covering = context.UserDepartments
                .Where(ud => ud.DepartmentId == departmentId.Value)
                .Select(ud => ud.UserId);
            query = query.Where(u => covering.Contains(u.Id));
        }

        var users = await query
            .Select(u => new { u.Id, u.Email, u.DisplayName })
            .Distinct()
            .ToListAsync(cancellationToken);

        return users
            .Where(u => u.Id != excludeUserId)
            .Select(u => new ManagerContact(u.Id, u.Email!, u.DisplayName))
            .ToList();
    }
}
