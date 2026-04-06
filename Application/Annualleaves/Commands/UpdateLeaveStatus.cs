using Application.Annualleaves.DTOs;
using Application.Core;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Annualleaves.Commands;

public class UpdateLeaveStatus
{
    public class Command : IRequest
    {
        public required string LeaveId { get; set; }
        public required UpdateLeaveStatusRequest Request { get; set; }
        public string ChangedByUserId { get; set; } = string.Empty;
        public bool IsAdmin { get; set; }
        public bool IsManager { get; set; }
    }

    public class Handler(AppDbContext context) : IRequestHandler<Command>
    {
        public async Task Handle(Command request, CancellationToken cancellationToken)
        {
            var annualLeave = await context.AnnualLeaves
                .FindAsync([request.LeaveId], cancellationToken)
                ?? throw new Exception("Cannot find the annual leave");

            if (string.IsNullOrWhiteSpace(request.ChangedByUserId))
                throw new UnauthorizedAccessException("User context is required.");

            if (!request.IsAdmin)
            {
                if (!request.IsManager)
                    throw new UnauthorizedAccessException("Only admins or managers can change leave status.");

                var managerScope = await ManagerAccessScopeResolver.ResolveAsync(
                    context,
                    request.ChangedByUserId,
                    cancellationToken);

                var isInManagedDepartment = annualLeave.DepartmentId.HasValue
                    && managerScope.ManagedDepartmentIds.Contains(annualLeave.DepartmentId.Value);
                var isDirectReport = managerScope.DirectReportUserIds.Contains(annualLeave.EmployeeId);

                if (!isInManagedDepartment && !isDirectReport)
                    throw new UnauthorizedAccessException("You can only change status for leaves in your managed scope.");
            }

            var oldStatus = annualLeave.Status;
            var newStatus = request.Request.Status;

            if (oldStatus == newStatus) return;

            annualLeave.Status = newStatus;

            var employeeProfile = await context.EmployeeProfiles
                .FirstOrDefaultAsync(ep => ep.Id == annualLeave.EmployeeProfileId, cancellationToken);

            var leaveDays = annualLeave.TotalDays;
            var deductedDays = await GetDeductedDaysAsync(annualLeave.LeaveTypeId, leaveDays, cancellationToken);

            if (employeeProfile is not null && oldStatus != AnnualLeaveStatus.Approved && newStatus == AnnualLeaveStatus.Approved && deductedDays > 0)
            {
                if (employeeProfile.LeaveBalance < deductedDays)
                    throw new InvalidOperationException("Insufficient leave balance.");

                employeeProfile.LeaveBalance -= deductedDays;
            }
            else if (employeeProfile is not null && oldStatus == AnnualLeaveStatus.Approved && newStatus != AnnualLeaveStatus.Approved && deductedDays > 0)
            {
                employeeProfile.LeaveBalance += deductedDays;
            }

            if (newStatus == AnnualLeaveStatus.Approved)
            {
                annualLeave.ApprovedAt = DateTime.UtcNow;
                annualLeave.ApprovedById = request.ChangedByUserId;
            }
            else if (oldStatus == AnnualLeaveStatus.Approved)
            {
                annualLeave.ApprovedAt = null;
                annualLeave.ApprovedById = null;
            }

            context.LeaveStatusHistories.Add(new LeaveStatusHistory
            {
                Id = Guid.NewGuid().ToString(),
                AnnualLeaveId = annualLeave.Id,
                ChangedByUserId = request.ChangedByUserId,
                OldStatus = oldStatus,
                NewStatus = newStatus,
                Comment = request.Request.StatusComment,
                ChangedAt = DateTime.UtcNow
            });

            await context.SaveChangesAsync(cancellationToken);
        }

        private async Task<int> GetDeductedDaysAsync(int? leaveTypeId, int totalDays, CancellationToken cancellationToken)
        {
            if (!leaveTypeId.HasValue || totalDays <= 0)
            {
                return 0;
            }

            var isAnnualLeave = await context.LeaveTypes
                .AsNoTracking()
                .AnyAsync(
                    leaveType => leaveType.Id == leaveTypeId.Value
                        && leaveType.Name == "Annual Leave",
                    cancellationToken);

            return isAnnualLeave ? totalDays : 0;
        }
    }
}
