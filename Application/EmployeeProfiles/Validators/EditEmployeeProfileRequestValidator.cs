using Application.EmployeeProfiles.Commands;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.EmployeeProfiles.Validators;

public class EditEmployeeProfileRequestValidator : AbstractValidator<EditEmployeeProfile.Command>
{
    public EditEmployeeProfileRequestValidator(AppDbContext context)
    {
        RuleFor(x => x.EmployeeProfile)
            .NotNull()
            .WithMessage("EmployeeProfile payload is required.");

        When(x => x.EmployeeProfile is not null, () =>
        {
            RuleFor(x => x.EmployeeProfile.Id)
                .NotEmpty()
                .WithMessage("Id is required.")
                .MustAsync(async (id, cancellationToken) =>
                    await context.EmployeeProfiles.AnyAsync(ep => ep.Id == id, cancellationToken))
                .WithMessage("Employee profile does not exist.");

            RuleFor(x => x.EmployeeProfile.DepartmentId)
                .GreaterThan(0)
                .WithMessage("DepartmentId is required.")
                .MustAsync(async (departmentId, cancellationToken) =>
                    await context.Departments.AnyAsync(d => d.Id == departmentId && d.IsActive, cancellationToken))
                .WithMessage("Department is invalid or inactive.");

            RuleFor(x => x.EmployeeProfile.ManagerId)
                .MustAsync(async (request, managerId, cancellationToken) =>
                {
                    if (string.IsNullOrWhiteSpace(managerId)) return true;
                    if (managerId == request.EmployeeProfile.Id) return false;

                    return await context.EmployeeProfiles.AnyAsync(ep => ep.Id == managerId, cancellationToken);
                })
                .WithMessage("Manager profile is invalid.");

            RuleFor(x => x.EmployeeProfile.AnnualLeaveEntitlement)
                .InclusiveBetween(0, 365)
                .WithMessage("AnnualLeaveEntitlement must be between 0 and 365.");

            RuleFor(x => x.EmployeeProfile.LeaveBalance)
                .InclusiveBetween(0, 365)
                .WithMessage("LeaveBalance must be between 0 and 365.");

            RuleFor(x => x.EmployeeProfile.JobTitle)
                .MaximumLength(150)
                .WithMessage("JobTitle must not exceed 150 characters.");
        });
    }
}