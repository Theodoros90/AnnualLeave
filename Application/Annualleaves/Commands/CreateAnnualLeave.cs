using System;
using Application.Annualleaves.DTOs;
using AutoMapper;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;


namespace Application.Annualleaves.Commands;

public class CreateAnnualLeave
{
    public class Command : IRequest<string>
    {
        public required CreateAnnualLeaveRequest AnnualLeave { get; set; }
    }

    public class Handler(AppDbContext context, IMapper mapper) : IRequestHandler<Command, string>
    {
        public async Task<string> Handle(Command request, CancellationToken cancellationToken)
        {
            var annualLeave = mapper.Map<AnnualLeave>(request.AnnualLeave);

            var employeeProfile = await context.EmployeeProfiles
                .FirstOrDefaultAsync(ep => ep.UserId == request.AnnualLeave.EmployeeId, cancellationToken);

            if (employeeProfile is null)
                throw new InvalidOperationException("Employee profile not found for the selected user.");

            annualLeave.EmployeeProfileId = employeeProfile.Id;
            annualLeave.DepartmentId = employeeProfile.DepartmentId;

            var leaveType = await context.LeaveTypes
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    type => type.Id == annualLeave.LeaveTypeId && type.IsActive,
                    cancellationToken);

            if (leaveType is null)
                throw new InvalidOperationException("Selected leave type is not available.");

            if (leaveType.RequiresApproval)
            {
                annualLeave.Status = AnnualLeaveStatus.Pending;
            }
            else
            {
                annualLeave.Status = AnnualLeaveStatus.Approved;
                annualLeave.ApprovedAt = DateTime.UtcNow;

                await AnnualLeaveBalanceCalculator.EnsureSufficientBalanceAsync(
                    context,
                    employeeProfile,
                    annualLeave,
                    excludeLeaveId: annualLeave.Id,
                    cancellationToken);

                context.LeaveStatusHistories.Add(new LeaveStatusHistory
                {
                    Id = Guid.NewGuid().ToString(),
                    AnnualLeaveId = annualLeave.Id,
                    ChangedByUserId = annualLeave.EmployeeId,
                    OldStatus = AnnualLeaveStatus.Pending,
                    NewStatus = AnnualLeaveStatus.Approved,
                    Comment = "Automatically approved based on leave type settings.",
                    ChangedAt = DateTime.UtcNow,
                });
            }

            context.AnnualLeaves.Add(annualLeave);

            await context.SaveChangesAsync(cancellationToken);

            if (!leaveType.RequiresApproval)
            {
                await AnnualLeaveBalanceCalculator.SyncCurrentYearBalanceAsync(context, employeeProfile, cancellationToken);
                await context.SaveChangesAsync(cancellationToken);
            }

            return annualLeave.Id;
        }
    }
}
