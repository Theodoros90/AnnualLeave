using Application.Core;
using Application.LeaveTypes.DTOs;
using MediatR;
using Persistence;

namespace Application.LeaveTypes.Commands;

public class UpdateLeaveType
{
    public class Command : IRequest<Result<LeaveTypeDto>>
    {
        public int Id { get; set; }
        public required UpsertLeaveTypeRequest LeaveType { get; set; }
    }

    public class Handler(AppDbContext context) : IRequestHandler<Command, Result<LeaveTypeDto>>
    {
        public async Task<Result<LeaveTypeDto>> Handle(Command request, CancellationToken cancellationToken)
        {
            var leaveType = await context.LeaveTypes.FindAsync([request.Id], cancellationToken);
            if (leaveType is null)
                return Result<LeaveTypeDto>.Failure("Leave type not found.");

            var normalizedName = request.LeaveType.Name.Trim();

            if (string.IsNullOrWhiteSpace(normalizedName))
                return Result<LeaveTypeDto>.Failure("Leave type name is required.");

            if (context.LeaveTypes.Any(lt => lt.Id != request.Id && lt.Name.ToLower() == normalizedName.ToLower()))
                return Result<LeaveTypeDto>.Failure("A leave type with that name already exists.");

            leaveType.Name = normalizedName;
            leaveType.RequiresApproval = request.LeaveType.RequiresApproval;
            leaveType.IsActive = request.LeaveType.IsActive;

            await context.SaveChangesAsync(cancellationToken);

            return Result<LeaveTypeDto>.Success(new LeaveTypeDto
            {
                Id = leaveType.Id,
                Name = leaveType.Name,
                RequiresApproval = leaveType.RequiresApproval,
                IsActive = leaveType.IsActive
            });
        }
    }
}
