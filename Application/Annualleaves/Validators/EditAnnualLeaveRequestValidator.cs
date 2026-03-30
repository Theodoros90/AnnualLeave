using Application.Annualleaves.Commands;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Application.Annualleaves.Validators;

public class EditAnnualLeaveRequestValidator : AbstractValidator<EditAnnualLeave.Command>
{
    public EditAnnualLeaveRequestValidator(Persistence.AppDbContext context)
    {
        RuleFor(x => x.AnnualLeave)
            .NotNull()
            .WithMessage("AnnualLeave payload is required.");

        When(x => x.AnnualLeave is not null, () =>
        {
            RuleFor(x => x.AnnualLeave)
                .SetValidator(new BaseAnnualLeaveValidator());

            RuleFor(x => x.AnnualLeave.Id)
                .NotEmpty()
                .WithMessage("Id is required.");

            RuleFor(x => x.AnnualLeave.LeaveTypeId)
                .MustAsync(async (leaveTypeId, cancellationToken) =>
                    await context.LeaveTypes.AnyAsync(lt => lt.Id == leaveTypeId && lt.IsActive, cancellationToken))
                .WithMessage("Selected leave type is invalid or inactive.");
        });
    }
}