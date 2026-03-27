using Application.Annualleaves.Commands;
using FluentValidation;

namespace Application.Annualleaves.Validators;

public class EditAnnualLeaveRequestValidator : AbstractValidator<EditAnnualLeave.Command>
{
    public EditAnnualLeaveRequestValidator()
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
        });
    }
}