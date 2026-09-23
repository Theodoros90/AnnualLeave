using Application.AdminUsers.DTOs;
using Application.AdminUsers.Support;
using Application.Core;
using Domain;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.AdminUsers.Queries;

public class GetAdminUserList
{
    public class Query : IRequest<List<AdminUserDto>>
    {
        public string RequestingUserId { get; set; } = string.Empty;

        /// <summary>
        /// True for an HR Administrator: only people whose profile department is in
        /// the caller's resolved scope, plus the caller. False (the default, and the
        /// System Administrator's) is everybody.
        /// </summary>
        public bool ScopeToCaller { get; set; }
    }

    public class Handler(UserManager<User> userManager, AppDbContext context) : IRequestHandler<Query, List<AdminUserDto>>
    {
        public async Task<List<AdminUserDto>> Handle(Query request, CancellationToken cancellationToken)
        {
            // Awaited now: the controller blocked a request thread on ToList() here.
            var users = await userManager.Users
                .OrderBy(u => u.Email)
                .ToListAsync(cancellationToken);

            if (request.ScopeToCaller)
            {
                var visible = await AdminUserScope.VisibleUserIdsAsync(context, request.RequestingUserId, cancellationToken);
                users = users.Where(u => visible.Contains(u.Id)).ToList();
            }

            var userIds = users.Select(u => u.Id).ToList();
            var departmentIdsByUser = (await context.UserDepartments
                    .Where(ud => userIds.Contains(ud.UserId))
                    .Select(ud => new { ud.UserId, ud.DepartmentId })
                    .ToListAsync(cancellationToken))
                .GroupBy(x => x.UserId)
                .ToDictionary(g => g.Key, g => g.Select(x => x.DepartmentId).ToList());

            var result = new List<AdminUserDto>(users.Count);
            foreach (var user in users)
            {
                // One roles query per user, as before. Worth collapsing into a join,
                // but that is a behaviour question for its own change, not something
                // to slip into a migration.
                var roles = await userManager.GetRolesAsync(user);
                departmentIdsByUser.TryGetValue(user.Id, out var departmentIds);
                result.Add(AdminUserMapper.ToDto(user, roles, departmentIds));
            }

            return result;
        }
    }
}
