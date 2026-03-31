using System;
using System.Threading.Tasks;
using Application.Annualleaves.DTOs;
using AutoMapper;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Annualleaves.Queries;

public class GetAnnualleaveList
{
    public class Query : IRequest<List<AnnualLeaveDto>>
    {
        public string RequestingUserId { get; set; } = string.Empty;
        public bool IsAdmin { get; set; }
        public bool IsManager { get; set; }
        public bool IsEmployee { get; set; }
    }

    public class Handler(AppDbContext context, IMapper mapper) : IRequestHandler<Query, List<AnnualLeaveDto>>
    {
        public async Task<List<AnnualLeaveDto>> Handle(Query request, CancellationToken cancellationToken)
        {
            IQueryable<AnnualLeave> annualLeavesQuery = context.AnnualLeaves
                .Include(al => al.Employee)
                .Include(al => al.Department)
                .AsNoTracking();

            if (request.IsAdmin)
            {
                // Admin sees everything.
            }
            else if (request.IsManager)
            {
                var profileDepartmentId = await context.EmployeeProfiles
                    .Where(ep => ep.UserId == request.RequestingUserId)
                    .Select(ep => (int?)ep.DepartmentId)
                    .FirstOrDefaultAsync(cancellationToken);

                annualLeavesQuery = profileDepartmentId.HasValue
                    ? annualLeavesQuery.Where(al => al.DepartmentId == profileDepartmentId.Value)
                    : annualLeavesQuery.Where(_ => false);
            }
            else if (request.IsEmployee)
            {
                annualLeavesQuery = annualLeavesQuery.Where(al => al.EmployeeId == request.RequestingUserId);
            }
            else
            {
                annualLeavesQuery = annualLeavesQuery.Where(_ => false);
            }

            var annualLeaves = await annualLeavesQuery.ToListAsync(cancellationToken);
            return mapper.Map<List<AnnualLeaveDto>>(annualLeaves);
        }
    }
}
