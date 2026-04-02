using Application.LeaveTypes.Commands;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.LeaveTypes.Validators;

public class UpdateLeaveTypeRequestValidator : AbstractValidator<UpdateLeaveType.Command>
{
    public UpdateLeaveTypeRequestValidator(AppDbContext context)
    {
        RuleFor(x => x.Id)
            .GreaterThan(0)
            .WithMessage("Id must be greater than 0.")
            .MustAsync(async (id, cancellationToken) =>
                await context.LeaveTypes.AnyAsync(lt => lt.Id == id, cancellationToken))
            .WithMessage("Leave type not found.");

        RuleFor(x => x.LeaveType)
            .NotNull()
            .WithMessage("LeaveType payload is required.")
            .SetValidator(new UpsertLeaveTypeRequestValidator());

        RuleFor(x => x)
            .MustAsync(async (command, cancellationToken) =>
            {
                if (command.LeaveType is null || string.IsNullOrWhiteSpace(command.LeaveType.Name))
                {
                    return true;
                }

                var normalizedName = command.LeaveType.Name.Trim().ToLower();
                return !await context.LeaveTypes.AnyAsync(
                    lt => lt.Id != command.Id && lt.Name.ToLower() == normalizedName,
                    cancellationToken);
            })
            .WithMessage("A leave type with that name already exists.");
    }
}
