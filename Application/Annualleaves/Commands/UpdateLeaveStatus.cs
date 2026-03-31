using Application.Annualleaves.DTOs;
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

                // Manager must own the department
                if (!annualLeave.DepartmentId.HasValue)
                    throw new UnauthorizedAccessException("Leave has no department assigned.");

                var profileDepartmentId = await context.EmployeeProfiles
                    .Where(ep => ep.UserId == request.ChangedByUserId)
                    .Select(ep => (int?)ep.DepartmentId)
                    .FirstOrDefaultAsync(cancellationToken);

                var isInManagedDepartment = profileDepartmentId.HasValue
                    && annualLeave.DepartmentId.Value == profileDepartmentId.Value;

                if (!isInManagedDepartment)
                    throw new UnauthorizedAccessException("You can only change status for leaves in your department.");
            }

            var oldStatus = annualLeave.Status;
            var newStatus = request.Request.Status;

            if (oldStatus == newStatus) return;

            annualLeave.Status = newStatus;

            var employeeProfile = await context.EmployeeProfiles
                .FirstOrDefaultAsync(ep => ep.Id == annualLeave.EmployeeProfileId, cancellationToken);

            var leaveDays = annualLeave.TotalDays;

            if (employeeProfile is not null && oldStatus != AnnualLeaveStatus.Approved && newStatus == AnnualLeaveStatus.Approved)
            {
                if (employeeProfile.LeaveBalance < leaveDays)
                    throw new InvalidOperationException("Insufficient leave balance.");

                employeeProfile.LeaveBalance -= leaveDays;
            }
            else if (employeeProfile is not null && oldStatus == AnnualLeaveStatus.Approved && newStatus != AnnualLeaveStatus.Approved)
            {
                employeeProfile.LeaveBalance += leaveDays;
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
    }
}
