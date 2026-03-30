using Application.EmployeeProfiles.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.EmployeeProfiles.Queries;

public class GetEmployeeProfileList
{
    public class Query : IRequest<List<EmployeeProfileDto>>
    {
        public string RequestingUserId { get; set; } = string.Empty;
        public bool IsAdmin { get; set; }
        public bool IsManager { get; set; }
    }

    public class Handler(AppDbContext context) : IRequestHandler<Query, List<EmployeeProfileDto>>
    {
        public async Task<List<EmployeeProfileDto>> Handle(Query request, CancellationToken cancellationToken)
        {
            IQueryable<Domain.EmployeeProfile> query = context.EmployeeProfiles.AsNoTracking();

            if (request.IsAdmin)
            {
                // Admin sees all profiles.
            }
            else if (request.IsManager)
            {
                var managedDepartmentIds = await context.UserDepartments
                    .Where(ud => ud.UserId == request.RequestingUserId)
                    .Select(ud => ud.DepartmentId)
                    .Distinct()
                    .ToListAsync(cancellationToken);

                var profileDepartmentId = await context.EmployeeProfiles
                    .Where(ep => ep.UserId == request.RequestingUserId)
                    .Select(ep => (int?)ep.DepartmentId)
                    .FirstOrDefaultAsync(cancellationToken);

                if (profileDepartmentId.HasValue && !managedDepartmentIds.Contains(profileDepartmentId.Value))
                    managedDepartmentIds.Add(profileDepartmentId.Value);

                var managerProfileIds = await context.EmployeeProfiles
                    .Where(ep => ep.UserId == request.RequestingUserId)
                    .Select(ep => ep.Id)
                    .ToListAsync(cancellationToken);

                query = query.Where(ep =>
                    managedDepartmentIds.Contains(ep.DepartmentId)
                    || (ep.ManagerId != null && managerProfileIds.Contains(ep.ManagerId))
                    || ep.UserId == request.RequestingUserId);
            }
            else
            {
                // Employee sees only their own profile.
                query = query.Where(ep => ep.UserId == request.RequestingUserId);
            }

            return await query
                .OrderBy(ep => ep.UserId)
                .Select(ep => new EmployeeProfileDto
                {
                    Id = ep.Id,
                    UserId = ep.UserId,
                    DepartmentId = ep.DepartmentId,
                    ManagerId = ep.ManagerId,
                    AnnualLeaveEntitlement = ep.AnnualLeaveEntitlement,
                    LeaveBalance = ep.LeaveBalance,
                    JobTitle = ep.JobTitle,
                    CreatedAt = ep.CreatedAt
                })
                .ToListAsync(cancellationToken);
        }
    }
}
