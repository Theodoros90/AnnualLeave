using System;
using Application.Annualleaves.DTOs;
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
    }
    public class Handler(AppDbContext context) : IRequestHandler<Command>
    {
        public async Task Handle(Command request, CancellationToken cancellationToken)
        {
            var annualLeave = await context.AnnualLeaves
            .FindAsync([request.AnnualLeave.Id], cancellationToken)
            ?? throw new Exception("Cannot find the annual leave");

            annualLeave.StartDate = request.AnnualLeave.StartDate;
            annualLeave.EndDate = request.AnnualLeave.EndDate;
            annualLeave.Reason = request.AnnualLeave.Reason;

            if (request.AnnualLeave.Status.HasValue && request.AnnualLeave.Status.Value != annualLeave.Status)
            {
                var changedByUserId = request.ChangedByUserId;
                if (string.IsNullOrWhiteSpace(changedByUserId))
                {
                    throw new Exception("User context is required to change status.");
                }

                var userExists = await context.Users
                    .AnyAsync(u => u.Id == changedByUserId, cancellationToken);
                if (!userExists)
                {
                    throw new Exception("Cannot resolve the user who changed status.");
                }

                var oldStatus = annualLeave.Status;
                var newStatus = request.AnnualLeave.Status.Value;
                annualLeave.Status = newStatus;

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
