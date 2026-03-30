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

                var managedDepartmentIds = await context.UserDepartments
                    .Where(ud => ud.UserId == request.ChangedByUserId)
                    .Select(ud => ud.DepartmentId)
                    .Distinct()
                    .ToListAsync(cancellationToken);

                // Include manager profile department because registered users may not have UserDepartment rows.
                var profileDepartmentId = await context.EmployeeProfiles
                    .Where(ep => ep.UserId == request.ChangedByUserId)
                    .Select(ep => (int?)ep.DepartmentId)
                    .FirstOrDefaultAsync(cancellationToken);

                if (profileDepartmentId.HasValue && !managedDepartmentIds.Contains(profileDepartmentId.Value))
                    managedDepartmentIds.Add(profileDepartmentId.Value);

                var managerProfileIds = await context.EmployeeProfiles
                    .Where(ep => ep.UserId == request.ChangedByUserId)
                    .Select(ep => ep.Id)
                    .ToListAsync(cancellationToken);

                var directReportUserIds = managerProfileIds.Count == 0
                    ? new List<string>()
                    : await context.EmployeeProfiles
                        .Where(ep => ep.ManagerId != null && managerProfileIds.Contains(ep.ManagerId))
                        .Select(ep => ep.UserId)
                        .Distinct()
                        .ToListAsync(cancellationToken);

                var isInManagedDepartment = managedDepartmentIds.Contains(annualLeave.DepartmentId.Value)
                    || directReportUserIds.Contains(annualLeave.EmployeeId);

                if (!isInManagedDepartment)
                    throw new UnauthorizedAccessException("You can only change status for leaves in your managed departments.");
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
