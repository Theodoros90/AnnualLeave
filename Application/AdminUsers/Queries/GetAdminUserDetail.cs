using Application.AdminUsers.DTOs;
using Application.AdminUsers.Support;
using Application.Core;
using Domain;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.AdminUsers.Queries;

public class GetAdminUserDetail
{
    public class Query : IRequest<Result<AdminUserDto>>
    {
        public required string Id { get; set; }
        public string RequestingUserId { get; set; } = string.Empty;
        /// <summary>See <c>GetAdminUserList.Query.ScopeToCaller</c>. An out-of-scope user reads as not found.</summary>
        public bool ScopeToCaller { get; set; }
    }

    public class Handler(UserManager<User> userManager, AppDbContext context) : IRequestHandler<Query, Result<AdminUserDto>>
    {
        public async Task<Result<AdminUserDto>> Handle(Query request, CancellationToken cancellationToken)
        {
            var user = await userManager.FindByIdAsync(request.Id);
            if (user is null)
            {
                // Keeps the message the controller returned, which the admin panel
                // surfaces verbatim through getApiErrorMessage.
                return Result<AdminUserDto>.Failure("User not found.");
            }

            if (request.ScopeToCaller)
            {
                var visible = await AdminUserScope.VisibleUserIdsAsync(context, request.RequestingUserId, cancellationToken);
                if (!visible.Contains(user.Id))
                {
                    return Result<AdminUserDto>.Failure("User not found.");
                }
            }

            var roles = await userManager.GetRolesAsync(user);
            var departmentIds = await context.UserDepartments
                .Where(ud => ud.UserId == user.Id)
                .Select(ud => ud.DepartmentId)
                .ToListAsync(cancellationToken);
            return Result<AdminUserDto>.Success(AdminUserMapper.ToDto(user, roles, departmentIds));
        }
    }
}
