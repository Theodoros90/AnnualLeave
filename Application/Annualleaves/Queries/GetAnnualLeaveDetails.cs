using System;
using Application.Core;
using Application.Annualleaves.DTOs;
using AutoMapper;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Annualleaves.Queries;

public class GetAnnualLeaveDetails
{
    public class Query : IRequest<Result<AnnualLeaveDto>>
    {
        public required string Id { get; set; }
        public string RequestingUserId { get; set; } = string.Empty;
        public bool IsAdmin { get; set; }
        public bool IsManager { get; set; }
        public bool IsEmployee { get; set; }
    }
    public class Handler(AppDbContext context, IMapper mapper) : IRequestHandler<Query, Result<AnnualLeaveDto>>
    {
        public async Task<Result<AnnualLeaveDto>> Handle(Query request, CancellationToken cancellationToken)
        {
            IQueryable<Domain.AnnualLeave> annualLeaveQuery = context.AnnualLeaves
                .AsNoTracking()
                .Where(al => al.Id == request.Id);

            if (request.IsAdmin)
            {
                // Admin sees everything.
            }
            else if (request.IsManager)
            {
                var managedDepartmentIds = await context.UserDepartments
                    .Where(ud => ud.UserId == request.RequestingUserId)
                    .Select(ud => ud.DepartmentId)
                    .Distinct()
                    .ToListAsync(cancellationToken);

                // Also include the manager's own EmployeeProfile department,
                // since registered users get a profile but not a UserDepartment record.
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

                var directReportUserIds = managerProfileIds.Count == 0
                    ? new List<string>()
                    : await context.EmployeeProfiles
                        .Where(ep => ep.ManagerId != null && managerProfileIds.Contains(ep.ManagerId))
                        .Select(ep => ep.UserId)
                        .Distinct()
                        .ToListAsync(cancellationToken);

                annualLeaveQuery = annualLeaveQuery
                    .Where(al =>
                        (al.DepartmentId.HasValue && managedDepartmentIds.Contains(al.DepartmentId.Value))
                        || directReportUserIds.Contains(al.EmployeeId));
            }
            else if (request.IsEmployee)
            {
                annualLeaveQuery = annualLeaveQuery.Where(al => al.EmployeeId == request.RequestingUserId);
            }
            else
            {
                annualLeaveQuery = annualLeaveQuery.Where(_ => false);
            }

            var annualLeave = await annualLeaveQuery.FirstOrDefaultAsync(cancellationToken);
            if (annualLeave == null) return Result<AnnualLeaveDto>.Failure("Annual leave not found");

            var annualLeaveDto = mapper.Map<AnnualLeaveDto>(annualLeave);
            return Result<AnnualLeaveDto>.Success(annualLeaveDto);
        }
    }
}
