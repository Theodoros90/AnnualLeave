using Application.Timesheets.Commands;
using FluentValidation;

namespace Application.Timesheets.Validators;

/// <summary>
/// Auto-registered by the MediatR <c>ValidationBehavior</c> pipeline. The reason is
/// required, like a rejection's: the employee reads it.
/// </summary>
public class ReopenTimesheetValidator : AbstractValidator<ReopenTimesheet.Command>
{
    public ReopenTimesheetValidator()
    {
        RuleFor(x => x.Id).NotEmpty().WithMessage("Timesheet Id is required.");
        RuleFor(x => x.RequestingUserId).NotEmpty().WithMessage("RequestingUserId is required.");
        RuleFor(x => x.Comment)
            .Must(c => !string.IsNullOrWhiteSpace(c))
            .WithMessage(ReopenTimesheet.ReasonRequiredMessage);
    }
}
