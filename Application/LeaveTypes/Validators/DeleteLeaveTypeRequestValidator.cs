using Application.LeaveTypes.Commands;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.LeaveTypes.Validators;

public class DeleteLeaveTypeRequestValidator : AbstractValidator<DeleteLeaveType.Command>
{
    public DeleteLeaveTypeRequestValidator(AppDbContext context)
    {
        RuleFor(x => x.Id)
            .GreaterThan(0)
            .WithMessage("Id must be greater than 0.")
            .MustAsync(async (id, cancellationToken) =>
                await context.LeaveTypes.AnyAsync(lt => lt.Id == id, cancellationToken))
            .WithMessage("Leave type not found.");

        RuleFor(x => x.Id)
            .MustAsync(async (id, cancellationToken) =>
                !await context.AnnualLeaves.AnyAsync(al => al.LeaveTypeId == id, cancellationToken))
            .WithMessage("Cannot delete leave type because it is used by leave requests.");
    }
}
