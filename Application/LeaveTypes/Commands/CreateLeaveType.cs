using Application.Core;
using Application.LeaveTypes.DTOs;
using MediatR;
using Persistence;

namespace Application.LeaveTypes.Commands;

public class CreateLeaveType
{
    public class Command : IRequest<Result<LeaveTypeDto>>
    {
        public required UpsertLeaveTypeRequest LeaveType { get; set; }
    }

    public class Handler(AppDbContext context) : IRequestHandler<Command, Result<LeaveTypeDto>>
    {
        public async Task<Result<LeaveTypeDto>> Handle(Command request, CancellationToken cancellationToken)
        {
            var normalizedName = request.LeaveType.Name.Trim();

            if (string.IsNullOrWhiteSpace(normalizedName))
                return Result<LeaveTypeDto>.Failure("Leave type name is required.");

            if (context.LeaveTypes.Any(lt => lt.Name.ToLower() == normalizedName.ToLower()))
                return Result<LeaveTypeDto>.Failure("A leave type with that name already exists.");

            var leaveType = new Domain.LeaveType
            {
                Name = normalizedName,
                RequiresApproval = request.LeaveType.RequiresApproval,
                IsActive = request.LeaveType.IsActive
            };

            context.LeaveTypes.Add(leaveType);
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
