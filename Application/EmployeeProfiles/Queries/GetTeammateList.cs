using Application.EmployeeProfiles.DTOs;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.EmployeeProfiles.Queries;

/// <summary>
/// Colleagues the requesting user shares a department with, minus themselves.
/// Returns names and job titles only, so any authenticated user can call it —
/// it backs the "nominate someone to cover my leave" picker.
///
/// An Admin filing leave on somebody's behalf needs <em>that</em> person's
/// colleagues, not their own (an Admin has no department, so their own list is
/// empty), which is what <see cref="Query.ForUserId"/> is for. The controller
/// only passes it through for an Admin.
/// </summary>
public class GetTeammateList
{
    public class Query : IRequest<List<TeammateDto>>
    {
        public string RequestingUserId { get; set; } = string.Empty;

        /// <summary>
        /// Whose colleagues to list, when not the caller's own. Null means the
        /// caller. Honoured only when the controller has established the caller
        /// is an Admin.
        /// </summary>
        public string? ForUserId { get; set; }
    }

    public class Handler(AppDbContext context) : IRequestHandler<Query, List<TeammateDto>>
    {
        public async Task<List<TeammateDto>> Handle(Query request, CancellationToken cancellationToken)
        {
            var subjectUserId = string.IsNullOrWhiteSpace(request.ForUserId)
                ? request.RequestingUserId
                : request.ForUserId;

            if (string.IsNullOrWhiteSpace(subjectUserId)) return [];

            var myDepartmentId = await context.EmployeeProfiles
                .AsNoTracking()
                .Where(ep => ep.UserId == subjectUserId)
                .Select(ep => (int?)ep.DepartmentId)
                .FirstOrDefaultAsync(cancellationToken);

            if (myDepartmentId is null) return [];

            return await context.EmployeeProfiles
                .AsNoTracking()
                .Include(ep => ep.User)
                .Where(ep =>
                    ep.DepartmentId == myDepartmentId
                    && ep.UserId != subjectUserId
                    && (ep.User == null || !ep.User.UserRoles.Any(ur => ur.Role != null && ur.Role.Name == AppRoles.Admin)))
                .Select(ep => new TeammateDto
                {
                    UserId = ep.UserId,
                    DisplayName = ep.User != null
                        ? (ep.User.DisplayName ?? ep.User.UserName ?? ep.UserId)
                        : ep.UserId,
                    JobTitle = ep.JobTitle,
                    DepartmentId = ep.DepartmentId,
                })
                .OrderBy(t => t.DisplayName)
                .ToListAsync(cancellationToken);
        }
    }
}
