using Application.AdminUsers.DTOs;
using Application.AdminUsers.Support;
using Application.Core;
using Domain;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.AdminUsers.Commands;

public class SetAdminUserRoles
{
    public class Command : IRequest<Result<AdminUserDto>>
    {
        public required string Id { get; set; }
        public required AdminSetUserRolesDto Roles { get; set; }
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

            // Which names are real roles, how many are allowed, and that at least one
            // was asked for are all SetAdminUserRolesValidator's job.
            var selectedRoles = (request.Roles.Roles ?? [])
                .Where(role => !string.IsNullOrWhiteSpace(role))
                .Select(role => role.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var currentRoles = await userManager.GetRolesAsync(user);

            var rolesToRemove = currentRoles.Except(selectedRoles, StringComparer.OrdinalIgnoreCase).ToArray();
            if (rolesToRemove.Length > 0)
            {
                var removeResult = await userManager.RemoveFromRolesAsync(user, rolesToRemove);
                if (!removeResult.Succeeded)
                {
                    return IdentityFailure("Failed to remove existing roles.", removeResult);
                }
            }

            var rolesToAdd = selectedRoles.Except(currentRoles, StringComparer.OrdinalIgnoreCase).ToArray();
            if (rolesToAdd.Length > 0)
            {
                var addResult = await userManager.AddToRolesAsync(user, rolesToAdd);
                if (!addResult.Succeeded)
                {
                    return IdentityFailure("Failed to add new roles.", addResult);
                }
            }

            var roles = await userManager.GetRolesAsync(user);

            // A UserDepartment row is a department this person covers beyond their
            // own profile: an extra one for a Manager, the whole scope for an HR
            // Administrator. Nothing reads it for anyone else, while DeleteDepartment
            // still counts it as a blocker and no endpoint but this feature's clears
            // it. So the rows go with the role that gave them meaning — a promotion to
            // System Administrator clears the set, the way it clears the department,
            // gender and start date.
            if (!roles.Any(role => AppRoles.DepartmentScopedRoles.Contains(role, StringComparer.OrdinalIgnoreCase)))
            {
                var assignments = await context.UserDepartments
                    .Where(ud => ud.UserId == user.Id)
                    .ToListAsync(cancellationToken);

                if (assignments.Count > 0)
                {
                    context.UserDepartments.RemoveRange(assignments);
                    await context.SaveChangesAsync(cancellationToken);
                }
            }

            return Result<AdminUserDto>.Success(AdminUserMapper.ToDto(user, roles));
        }

        private static Result<AdminUserDto> IdentityFailure(string message, IdentityResult result) =>
            Result<AdminUserDto>.ValidationFailure(
                new Dictionary<string, string[]>
                {
                    ["Identity"] = result.Errors.Select(e => e.Description).ToArray(),
                },
                message);
    }
}
