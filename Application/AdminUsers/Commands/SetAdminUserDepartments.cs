using Application.AdminUsers.DTOs;
using Application.AdminUsers.Support;
using Application.Core;
using Domain;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.AdminUsers.Commands;

/// <summary>
/// Replaces the departments an HR Administrator is assigned. Shape and existence
/// checks are <c>SetAdminUserDepartmentsValidator</c>'s; the one thing settled here
/// is the stored role, because the payload carries none and the rule depends on it.
/// </summary>
public class SetAdminUserDepartments
{
    public class Command : IRequest<Result<AdminUserDto>>
    {
        public required string Id { get; set; }
        public required AdminSetUserDepartmentsDto Departments { get; set; }
        public string RequestingUserId { get; set; } = string.Empty;
    }

    public class Handler(UserManager<User> userManager, AppDbContext context)
        : IRequestHandler<Command, Result<AdminUserDto>>
    {
        public async Task<Result<AdminUserDto>> Handle(Command request, CancellationToken cancellationToken)
        {
            var user = await userManager.FindByIdAsync(request.Id);
            if (user is null)
            {
                return Result<AdminUserDto>.Failure("User not found.");
            }

            var roles = await userManager.GetRolesAsync(user);
            if (!roles.Contains(AppRoles.HrAdministrator, StringComparer.OrdinalIgnoreCase))
            {
                // A business-rule refusal on the caller's own request, not a missing
                // resource — Invalid is what the API layer maps to 400 for this.
                return Result<AdminUserDto>.Invalid(HrDepartmentScopeRules.DepartmentsNotForRoleMessage);
            }

            var wanted = HrDepartmentScopeRules.Normalize(request.Departments.DepartmentIds);

            var existing = await context.UserDepartments
                .Where(ud => ud.UserId == user.Id)
                .ToListAsync(cancellationToken);

            context.UserDepartments.RemoveRange(existing.Where(ud => !wanted.Contains(ud.DepartmentId)));

            var held = existing.Select(ud => ud.DepartmentId).ToHashSet();
            foreach (var departmentId in wanted.Where(id => !held.Contains(id)))
            {
                context.UserDepartments.Add(new UserDepartment
                {
                    UserId = user.Id,
                    DepartmentId = departmentId,
                    AssignedAt = DateTime.UtcNow,
                    AssignedByUserId = string.IsNullOrWhiteSpace(request.RequestingUserId) ? null : request.RequestingUserId,
                });
            }

            await context.SaveChangesAsync(cancellationToken);

            return Result<AdminUserDto>.Success(AdminUserMapper.ToDto(user, roles, wanted));
        }
    }
}
