using Application.Annualleaves.DTOs;
using FluentValidation;

namespace Application.Annualleaves.Validators;

public class BaseAnnualLeaveValidator : AbstractValidator<BaseAnnualLeaveDto>
{
    public BaseAnnualLeaveValidator()
    {
        RuleFor(x => x.StartDate)
            .NotEqual(default(DateTime))
            .WithMessage("StartDate is required.")
            .LessThanOrEqualTo(x => x.EndDate)
            .WithMessage("StartDate must be on or before EndDate.");

        RuleFor(x => x.EndDate)
            .NotEqual(default(DateTime))
            .WithMessage("EndDate is required.")
            .GreaterThanOrEqualTo(x => x.StartDate)
            .WithMessage("EndDate must be on or after StartDate.");

        RuleFor(x => x.Reason)
            .MaximumLength(500)
            .WithMessage("Reason must not exceed 500 characters.");
    }
}