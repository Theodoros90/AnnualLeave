using Application.Core;
using Application.EmployeeProfiles.Commands;
using Domain;
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

            // Whether a department is required depends on the role of the user whose
            // profile this is, so it takes a lookup rather than a standalone rule.
            // An Admin sees every department and belongs to none; everyone else is
            // placed in one, which is where their manager, their leave routing and
            // their project visibility all come from.
            //
            // This is also the path a role change takes: the edit dialog sets roles
            // first and saves the profile second, so the role read here is already
            // the new one — a promotion to Admin arrives with a null department and
            // a demotion out of it arrives with a real one.
            RuleFor(x => x.EmployeeProfile)
                .CustomAsync(async (request, validationContext, cancellationToken) =>
                {
                    // The employment start date is settled here too, rather than in
                    // rules of its own: it is role-dependent in exactly the same way
                    // and would otherwise repeat this lookup. Its age check needs the
                    // stored date of birth, which the payload does not carry — the
                    // dialog saves the user before the profile, so the date read here
                    // is the one just written.
                    var owner = await context.EmployeeProfiles
                        .AsNoTracking()
                        .Where(ep => ep.Id == request.Id)
                        .Select(ep => new
                        {
                            IsAdmin = ep.User != null
                                && ep.User.UserRoles.Any(ur => ur.Role != null && ur.Role.Name == AppRoles.Admin),
                            DateOfBirth = ep.User == null ? null : ep.User.DateOfBirth,
                        })
                        .FirstOrDefaultAsync(cancellationToken);

                    if (owner is null) return;

                    if (owner.IsAdmin)
                    {
                        if (request.DepartmentId is not null)
                        {
                            validationContext.AddFailure(
                                "EmployeeProfile.DepartmentId",
                                "An Admin cannot belong to a department.");
                        }

                        if (request.EmploymentStartDate is not null)
                        {
                            validationContext.AddFailure(
                                "EmployeeProfile.EmploymentStartDate",
                                PersonFieldRules.EmploymentStartDateNotForAdminMessage);
                        }

                        return;
                    }

                    if (request.EmploymentStartDate is null)
                    {
                        validationContext.AddFailure(
                            "EmployeeProfile.EmploymentStartDate",
                            PersonFieldRules.EmploymentStartDateRequiredMessage);
                    }
                    else if (!PersonFieldRules.IsOldEnoughToStart(request.EmploymentStartDate, owner.DateOfBirth))
                    {
                        validationContext.AddFailure(
                            "EmployeeProfile.EmploymentStartDate",
                            PersonFieldRules.EmploymentStartDateTooYoungMessage);
                    }

                    if (request.DepartmentId is not { } departmentId)
                    {
                        validationContext.AddFailure(
                            "EmployeeProfile.DepartmentId",
                            "DepartmentId is required.");
                        return;
                    }

                    var exists = await context.Departments
                        .AnyAsync(d => d.Id == departmentId && d.IsActive, cancellationToken);

                    if (!exists)
                    {
                        validationContext.AddFailure(
                            "EmployeeProfile.DepartmentId",
                            "Department is invalid or inactive.");
                    }
                });

            RuleFor(x => x.EmployeeProfile.ManagerId)
                .MustAsync(async (request, managerId, cancellationToken) =>
                {
                    if (string.IsNullOrWhiteSpace(managerId)) return true;
                    if (managerId == request.EmployeeProfile.Id) return false;

                    return await context.EmployeeProfiles.AnyAsync(ep => ep.Id == managerId, cancellationToken);
                })
                .WithMessage("Manager profile is invalid.");

            RuleFor(x => x.EmployeeProfile.JobTitle)
                .Must(jobTitle => string.IsNullOrEmpty(jobTitle) || !string.IsNullOrWhiteSpace(jobTitle))
                .WithMessage("JobTitle cannot be whitespace only.")
                .MaximumLength(150)
                .WithMessage("JobTitle must not exceed 150 characters.");
        });
    }
}