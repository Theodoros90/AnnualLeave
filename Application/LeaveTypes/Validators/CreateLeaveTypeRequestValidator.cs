using Application.LeaveTypes.Commands;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.LeaveTypes.Validators;

public class CreateLeaveTypeRequestValidator : AbstractValidator<CreateLeaveType.Command>
{
    public CreateLeaveTypeRequestValidator(AppDbContext context)
    {
        RuleFor(x => x.LeaveType)
            .NotNull()
            .WithMessage("LeaveType payload is required.")
            .SetValidator(new UpsertLeaveTypeRequestValidator());

        RuleFor(x => x.LeaveType.Name)
            .MustAsync(async (name, cancellationToken) =>
            {
                var normalizedName = name.Trim().ToLower();
                return !await context.LeaveTypes.AnyAsync(lt => lt.Name.ToLower() == normalizedName, cancellationToken);
            })
            .WithMessage("A leave type with that name already exists.")
            .When(x => x.LeaveType is not null && !string.IsNullOrWhiteSpace(x.LeaveType.Name));
    }
}
