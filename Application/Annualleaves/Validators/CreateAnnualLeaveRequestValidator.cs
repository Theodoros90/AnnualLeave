using Application.Annualleaves.Commands;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Annualleaves.Validators;

public class CreateAnnualLeaveRequestValidator : AbstractValidator<CreateAnnualLeave.Command>
{
    public CreateAnnualLeaveRequestValidator(AppDbContext context)
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
                .WithMessage("EmployeeId is required.")
                .MustAsync(async (employeeId, cancellationToken) =>
                    await context.Users.AnyAsync(u => u.Id == employeeId, cancellationToken))
                .WithMessage("Employee does not exist.");

            RuleFor(x => x.AnnualLeave.EmployeeId)
                .MustAsync(async (employeeId, cancellationToken) =>
                    await context.EmployeeProfiles.AnyAsync(ep => ep.UserId == employeeId, cancellationToken))
                .WithMessage("Employee profile does not exist.");

            RuleFor(x => x.AnnualLeave.LeaveTypeId)
                .MustAsync(async (leaveTypeId, cancellationToken) =>
                    await context.LeaveTypes.AnyAsync(lt => lt.Id == leaveTypeId && lt.IsActive, cancellationToken))
                .WithMessage("Selected leave type is invalid or inactive.");
        });
    }
}