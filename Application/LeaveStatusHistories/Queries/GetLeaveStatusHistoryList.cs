using Application.LeaveStatusHistories.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.LeaveStatusHistories.Queries;

public class GetLeaveStatusHistoryList
{
    public class Query : IRequest<List<LeaveStatusHistoryDto>>
    {
        public string RequestingUserId { get; set; } = string.Empty;
        public bool IsAdmin { get; set; }
        public bool IsManager { get; set; }
    }

    public class Handler(AppDbContext context) : IRequestHandler<Query, List<LeaveStatusHistoryDto>>
    {
        public async Task<List<LeaveStatusHistoryDto>> Handle(Query request, CancellationToken cancellationToken)
        {
            IQueryable<Domain.LeaveStatusHistory> query = context.LeaveStatusHistories
                .AsNoTracking()
                .Include(h => h.AnnualLeave);

            if (request.IsAdmin)
            {
                // Admin sees all history.
            }
            else if (request.IsManager)
            {
                var managedDepartmentIds = await context.UserDepartments
                    .Where(ud => ud.UserId == request.RequestingUserId)
                    .Select(ud => ud.DepartmentId)
                    .Distinct()
                    .ToListAsync(cancellationToken);

                query = query.Where(h =>
                    h.AnnualLeave != null &&
                    h.AnnualLeave.DepartmentId.HasValue &&
                    managedDepartmentIds.Contains(h.AnnualLeave.DepartmentId.Value));
            }
            else
            {
                // Employee sees only history for their own leaves.
                query = query.Where(h =>
                    h.AnnualLeave != null &&
                    h.AnnualLeave.EmployeeId == request.RequestingUserId);
            }

            return await query
                .OrderByDescending(h => h.ChangedAt)
                .Select(h => new LeaveStatusHistoryDto
                {
                    Id = h.Id,
                    AnnualLeaveId = h.AnnualLeaveId,
                    ChangedByUserId = h.ChangedByUserId,
                    OldStatus = h.OldStatus.HasValue ? h.OldStatus.Value.ToString() : null,
                    NewStatus = h.NewStatus.ToString(),
                    Comment = h.Comment,
                    ChangedAt = h.ChangedAt
                })
                .ToListAsync(cancellationToken);
        }
    }
}
