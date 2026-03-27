using Application.Annualleaves.Commands;
using FluentValidation;

namespace Application.Annualleaves.Validators;

public class CreateAnnualLeaveRequestValidator : AbstractValidator<CreateAnnualLeave.Command>
{
    public CreateAnnualLeaveRequestValidator()
    {
        RuleFor(x => x.AnnualLeave)
            .NotNull()
            .WithMessage("AnnualLeave payload is required.");

        When(x => x.AnnualLeave is not null, () =>
        {
            RuleFor(x => x.AnnualLeave)
                .SetValidator(new BaseAnnualLeaveValidator());

            RuleFor(x => x.AnnualLeave.EmployeeId)
                .NotEmpty()
                .WithMessage("EmployeeId is required.");
        });
    }
}