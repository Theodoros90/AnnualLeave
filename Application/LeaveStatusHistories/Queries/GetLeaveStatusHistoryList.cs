using Application.LeaveStatusHistories.DTOs;
using Application.Core;
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
                .Include(h => h.AnnualLeave)
                    .ThenInclude(a => a!.Employee);

            if (request.IsAdmin)
            {
                // Admin sees all history.
            }
            else if (request.IsManager)
            {
                var managerScope = await ManagerAccessScopeResolver.ResolveAsync(
                    context,
                    request.RequestingUserId,
                    cancellationToken);

                query = query.Where(h =>
                    h.AnnualLeave != null &&
                    ((h.AnnualLeave.DepartmentId.HasValue &&
                      managerScope.ManagedDepartmentIds.Contains(h.AnnualLeave.DepartmentId.Value))
                     || managerScope.DirectReportUserIds.Contains(h.AnnualLeave.EmployeeId)));
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
                    EmployeeId = h.AnnualLeave != null ? h.AnnualLeave.EmployeeId : string.Empty,
                    EmployeeName = h.AnnualLeave != null && h.AnnualLeave.Employee != null
                        ? (!string.IsNullOrWhiteSpace(h.AnnualLeave.Employee.DisplayName)
                            ? h.AnnualLeave.Employee.DisplayName
                            : (h.AnnualLeave.Employee.Email ?? h.AnnualLeave.EmployeeId))
                        : string.Empty,
                    ChangedByUserId = h.ChangedByUserId,
                    ChangedByUserName = h.ChangedByUser != null
                        ? (!string.IsNullOrWhiteSpace(h.ChangedByUser.DisplayName)
                            ? h.ChangedByUser.DisplayName
                            : (h.ChangedByUser.Email ?? h.ChangedByUserId))
                        : h.ChangedByUserId,
                    OldStatus = h.OldStatus.HasValue ? h.OldStatus.Value.ToString() : null,
                    NewStatus = h.NewStatus.ToString(),
                    Comment = h.Comment,
                    ChangedAt = h.ChangedAt
                })
                .ToListAsync(cancellationToken);
        }
    }
}
