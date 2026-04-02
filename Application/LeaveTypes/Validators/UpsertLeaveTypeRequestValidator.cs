using Application.LeaveTypes.DTOs;
using FluentValidation;

namespace Application.LeaveTypes.Validators;

public class UpsertLeaveTypeRequestValidator : AbstractValidator<UpsertLeaveTypeRequest>
{
    public UpsertLeaveTypeRequestValidator()
    {
        RuleFor(x => x.Name)
            .Cascade(CascadeMode.Stop)
            .NotEmpty()
            .WithMessage("Leave type name is required.")
            .Must(name => !string.IsNullOrWhiteSpace(name))
            .WithMessage("Leave type name is required.")
            .Must(name => name == name.Trim())
            .WithMessage("Leave type name must not start or end with whitespace.")
            .MaximumLength(100)
            .WithMessage("Leave type name must not exceed 100 characters.");
    }
}
