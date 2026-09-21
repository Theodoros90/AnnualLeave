using Application.AdminUsers.Commands;
using Application.Core;
using Domain;
using FluentValidation;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.AdminUsers.Validators;

/// <summary>
/// The checks CreateUser ran inline, in the layer the rest of the app keeps them.
/// Same rules and the same messages, so the admin panel shows what it showed
/// before — only the status code differs, and only where it was wrong: these are
/// 400s, while "email is already registered" is a 409 the handler raises.
/// </summary>
public class CreateAdminUserValidator : AbstractValidator<CreateAdminUser.Command>
{
    public CreateAdminUserValidator(AppDbContext context, RoleManager<Role> roleManager)
    {
        RuleFor(x => x.User)
            .NotNull()
            .WithMessage("User payload is required.");

        When(x => x.User is not null, () =>
        {
            RuleFor(x => x.User.Email)
                .Cascade(CascadeMode.Stop)
                .NotEmpty()
                .WithMessage("Email is required.")
                .Must(email => !string.IsNullOrWhiteSpace(email))
                .WithMessage("Email is required.")
                .EmailAddress()
                .WithMessage("Email must be a valid email address.");

            RuleFor(x => x.User.DisplayName)
                .Cascade(CascadeMode.Stop)
                .NotEmpty()
                .WithMessage("Display name is required.")
                .Must(name => !string.IsNullOrWhiteSpace(name))
                .WithMessage("Display name is required.")
                .MaximumLength(100)
                .WithMessage("Display name must not exceed 100 characters.");

            RuleFor(x => x.User.PhoneNumber).MaximumLength(PersonFieldRules.PhoneNumberMaxLength).ValidPhoneNumber();
            RuleFor(x => x.User.DateOfBirth).ValidDateOfBirth();
            RuleFor(x => x.User.JobTitle).MaximumLength(150);

            // Gender follows the department's rule rather than the date of birth's:
            // required for an Employee and a Manager, refused for an Admin. It is
            // there to decide who is offered gender-restricted leave, and the
            // dialog hides it for an Admin the way it hides the Profile section.
            When(x => !IsAdmin(x.User.Roles), () =>
            {
                RuleFor(x => x.User.Gender)
                    .NotNull()
                    .WithMessage(PersonFieldRules.GenderRequiredMessage)
                    .IsInEnum()
                    .WithMessage(PersonFieldRules.GenderRequiredMessage);
            });

            When(x => IsAdmin(x.User.Roles), () =>
            {
                RuleFor(x => x.User.Gender)
                    .Null()
                    .WithMessage(PersonFieldRules.GenderNotForAdminMessage);
            });

            RuleFor(x => x.User.AnnualLeaveEntitlement)
                .InclusiveBetween(0, 365)
                .When(x => x.User.AnnualLeaveEntitlement.HasValue);

            // Who needs a department depends on the role being asked for, which is
            // why this is here rather than a [Range] on the DTO. An Admin sees every
            // department, so belonging to one grants them nothing — and the panel
            // hides the field for them, which is why it used to send "the first
            // active department" for a question it never asked.
            When(x => !IsAdmin(x.User.Roles), () =>
            {
                RuleFor(x => x.User.DepartmentId)
                    .Cascade(CascadeMode.Stop)
                    .NotNull()
                    .WithMessage("Department is required.")
                    .MustAsync(async (departmentId, cancellationToken) =>
                        await context.Departments.AnyAsync(d => d.Id == departmentId, cancellationToken))
                    .WithMessage("Selected department does not exist.");
            });

            // Refused rather than ignored: the panel cannot send one, so a payload
            // that carries a department for an Admin was built against the old
            // shape, and accepting it would quietly recreate the invented
            // assignment that put admins in a department's headcount and blocked
            // its deletion.
            When(x => IsAdmin(x.User.Roles), () =>
            {
                RuleFor(x => x.User.DepartmentId)
                    .Null()
                    .WithMessage("An Admin cannot belong to a department.");
            });

            // The start date rides with the department, for the same reason: both
            // live in the Profile section, which the panel hides for an Admin. So
            // an Employee or a Manager must bring one and an Admin must not — and
            // an Admin sending one was built against a shape this does not have.
            When(x => !IsAdmin(x.User.Roles), () =>
            {
                RuleFor(x => x.User.EmploymentStartDate)
                    .NotNull()
                    .WithMessage(PersonFieldRules.EmploymentStartDateRequiredMessage);
            });

            When(x => IsAdmin(x.User.Roles), () =>
            {
                RuleFor(x => x.User.EmploymentStartDate)
                    .Null()
                    .WithMessage(PersonFieldRules.EmploymentStartDateNotForAdminMessage);
            });

            // Both dates arrive in the same payload here, so the age check is a
            // plain cross-field rule — unlike the edit path, which has to read the
            // stored date of birth.
            RuleFor(x => x.User.EmploymentStartDate)
                .Must((command, startDate) =>
                    PersonFieldRules.IsOldEnoughToStart(startDate, command.User.DateOfBirth))
                .WithMessage(PersonFieldRules.EmploymentStartDateTooYoungMessage);

            RuleFor(x => x.User.ManagerId)
                .MustAsync(async (managerId, cancellationToken) =>
                    await context.EmployeeProfiles.AnyAsync(ep => ep.Id == managerId, cancellationToken))
                .WithMessage("Manager profile is invalid.")
                .When(x => !string.IsNullOrWhiteSpace(x.User.ManagerId));

            // Exactly one role per user. The DTO carries [MaxLength(1)] for requests
            // bound by MVC; this is what enforces it for the command itself, which
            // is what CreateUser used to call a "backstop".
            RuleFor(x => x.User.Roles)
                .Must(roles => CountDistinct(roles) <= 1)
                .WithMessage("A user can have only one role.");

            RuleFor(x => x.User.Roles)
                .MustAsync(async (roles, cancellationToken) =>
                {
                    var requested = Distinct(roles);
                    if (requested.Count == 0) return true;

                    var known = await roleManager.Roles
                        .Where(role => role.Name != null)
                        .Select(role => role.Name!)
                        .ToListAsync(cancellationToken);

                    var knownSet = new HashSet<string>(known, StringComparer.OrdinalIgnoreCase);
                    return requested.All(knownSet.Contains);
                })
                .WithMessage("One or more roles are invalid.");
        });
    }

    private static List<string> Distinct(IEnumerable<string>? roles) =>
        (roles ?? [])
            .Where(role => !string.IsNullOrWhiteSpace(role))
            .Select(role => role.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

    private static int CountDistinct(IEnumerable<string>? roles) => Distinct(roles).Count;

    /// <summary>
    /// Whether Admin is the role being asked for. An omitted role means Employee —
    /// the default <c>CreateAdminUser</c> applies — so a blank list is not an Admin.
    /// </summary>
    private static bool IsAdmin(IEnumerable<string>? roles) =>
        Distinct(roles).Contains(AppRoles.Admin, StringComparer.OrdinalIgnoreCase);
}
