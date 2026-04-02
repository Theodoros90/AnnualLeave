using System;
using Application.Annualleaves.DTOs;
using Application.Core;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Annualleaves.Commands;

public class EditAnnualLeave
{
    public class Command : IRequest
    {
        public required EditAnnualLeaveRequest AnnualLeave { get; set; }
        public string ChangedByUserId { get; set; } = string.Empty;
        public bool IsAdmin { get; set; }
        public bool IsManager { get; set; }
    }
    public class Handler(AppDbContext context) : IRequestHandler<Command>
    {
        public async Task Handle(Command request, CancellationToken cancellationToken)
        {
            var annualLeave = await context.AnnualLeaves
            .FindAsync([request.AnnualLeave.Id], cancellationToken)
            ?? throw new Exception("Cannot find the annual leave");

            if (string.IsNullOrWhiteSpace(request.ChangedByUserId))
            {
                throw new UnauthorizedAccessException("User context is required.");
            }

            var isInManagedDepartment = false;
            var isDirectReport = false;
            if (request.IsManager)
            {
                var managerScope = await ManagerAccessScopeResolver.ResolveAsync(
                    context,
                    request.ChangedByUserId,
                    cancellationToken);

                isInManagedDepartment = annualLeave.DepartmentId.HasValue
                    && managerScope.ManagedDepartmentIds.Contains(annualLeave.DepartmentId.Value);
                isDirectReport = managerScope.DirectReportUserIds.Contains(annualLeave.EmployeeId);
            }

            var canEdit = request.IsAdmin || annualLeave.EmployeeId == request.ChangedByUserId;

            if (!canEdit && (isInManagedDepartment || isDirectReport))
            {
                canEdit = true;
            }

            if (!canEdit)
            {
                throw new UnauthorizedAccessException("You can only update your own leave requests or requests in your managed departments.");
            }

            if ((annualLeave.Status == AnnualLeaveStatus.Rejected || annualLeave.Status == AnnualLeaveStatus.Approved) && !request.IsAdmin)
            {
                throw new UnauthorizedAccessException("Approved and rejected leave requests cannot be edited.");
            }

            var previousStatus = annualLeave.Status;
            var previousDays = annualLeave.TotalDays;

            annualLeave.StartDate = request.AnnualLeave.StartDate;
            annualLeave.EndDate = request.AnnualLeave.EndDate;
            annualLeave.LeaveTypeId = request.AnnualLeave.LeaveTypeId;
            annualLeave.Reason = request.AnnualLeave.Reason;

            var newDays = annualLeave.TotalDays;
            var employeeProfile = await context.EmployeeProfiles
                .FirstOrDefaultAsync(ep => ep.Id == annualLeave.EmployeeProfileId, cancellationToken);

            if (previousStatus == AnnualLeaveStatus.Approved && employeeProfile is not null && previousDays != newDays)
            {
                var dayDiff = newDays - previousDays;
                if (dayDiff > 0)
                {
                    if (employeeProfile.LeaveBalance < dayDiff)
                        throw new InvalidOperationException("Insufficient leave balance.");

                    employeeProfile.LeaveBalance -= dayDiff;
                }
                else
                {
                    employeeProfile.LeaveBalance += Math.Abs(dayDiff);
                }
            }

            var canChangeStatus = request.IsAdmin || isInManagedDepartment || isDirectReport;
            if (request.AnnualLeave.Status.HasValue && !canChangeStatus)
            {
                throw new UnauthorizedAccessException("Only admins or managers of the request's department can change leave status.");
            }

            if (request.AnnualLeave.Status.HasValue && request.AnnualLeave.Status.Value != annualLeave.Status)
            {
                var changedByUserId = request.ChangedByUserId;
                var userExists = await context.Users
                    .AnyAsync(u => u.Id == changedByUserId, cancellationToken);
                if (!userExists)
                {
                    throw new Exception("Cannot resolve the user who changed status.");
                }

                var oldStatus = annualLeave.Status;
                var newStatus = request.AnnualLeave.Status.Value;
                annualLeave.Status = newStatus;

                if (employeeProfile is not null && oldStatus != AnnualLeaveStatus.Approved && newStatus == AnnualLeaveStatus.Approved)
                {
                    if (employeeProfile.LeaveBalance < newDays)
                        throw new InvalidOperationException("Insufficient leave balance.");

                    employeeProfile.LeaveBalance -= newDays;
                }
                else if (employeeProfile is not null && oldStatus == AnnualLeaveStatus.Approved && newStatus != AnnualLeaveStatus.Approved)
                {
                    employeeProfile.LeaveBalance += newDays;
                }

                if (newStatus == AnnualLeaveStatus.Approved)
                {
                    annualLeave.ApprovedAt = DateTime.UtcNow;
                    annualLeave.ApprovedById = changedByUserId;
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
                    ChangedByUserId = changedByUserId,
                    OldStatus = oldStatus,
                    NewStatus = newStatus,
                    Comment = request.AnnualLeave.StatusComment,
                    ChangedAt = DateTime.UtcNow
                });
            }

            await context.SaveChangesAsync(cancellationToken);
        }
    }
}
