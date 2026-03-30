using Application.LeaveTypes.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.LeaveTypes.Queries;

public class GetLeaveTypeList
{
    public class Query : IRequest<List<LeaveTypeDto>>
    {
    }

    public class Handler(AppDbContext context) : IRequestHandler<Query, List<LeaveTypeDto>>
    {
        public async Task<List<LeaveTypeDto>> Handle(Query request, CancellationToken cancellationToken)
        {
            return await context.LeaveTypes
                .AsNoTracking()
                .OrderBy(lt => lt.Name)
                .Select(lt => new LeaveTypeDto
                {
                    Id = lt.Id,
                    Name = lt.Name,
                    RequiresApproval = lt.RequiresApproval,
                    IsActive = lt.IsActive
                })
                .ToListAsync(cancellationToken);
        }
    }
}
