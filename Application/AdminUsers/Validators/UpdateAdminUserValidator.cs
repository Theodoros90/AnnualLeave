using Application.AdminUsers.Commands;
using Application.Core;
using Domain;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.AdminUsers.Validators;

/// <summary>
/// Shape rules mirroring AdminUpdateUserDto, plus the one rule that depends on
/// who is being edited: whether a gender is required or refused follows the
/// stored role. Whether the address is taken is the handler's call, since that
/// is a conflict rather than bad input.
/// </summary>
public class UpdateAdminUserValidator : AbstractValidator<UpdateAdminUser.Command>
{
    public UpdateAdminUserValidator(AppDbContext context)
    {
        RuleFor(x => x.Id)
            .NotEmpty()
            .WithMessage("User id is required.");

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

            // Required for an Employee and a Manager, refused for an Admin — the
            // department's rule, applied to the one Personal-details field the
            // dialog hides for an Admin. The payload carries no role, so this reads
            // the stored one, which is why the edit dialog sets roles *before* it
            // saves the user: a promotion arrives with a null gender and must meet
            // the Admin rule, a demotion arrives with one and must meet the other.
            // Reordering those two calls refuses every role change with a message
            // about a field the admin cannot see.
            //
            // An id that matches nobody is held to the non-Admin rule; the handler
            // then reports the account as not found.
            RuleFor(x => x.User.Gender)
                .CustomAsync(async (gender, validationContext, cancellationToken) =>
                {
                    var isAdmin = await context.Users
                        .Where(u => u.Id == validationContext.InstanceToValidate.Id)
                        .SelectMany(u => u.UserRoles)
                        .AnyAsync(ur => ur.Role != null && ur.Role.Name == AppRoles.Admin, cancellationToken);

                    if (isAdmin)
                    {
                        if (gender is not null)
                        {
                            validationContext.AddFailure(PersonFieldRules.GenderNotForAdminMessage);
                        }

                        return;
                    }

                    if (gender is null || !Enum.IsDefined(gender.Value))
                    {
                        validationContext.AddFailure(PersonFieldRules.GenderRequiredMessage);
                    }
                });
        });
    }
}
