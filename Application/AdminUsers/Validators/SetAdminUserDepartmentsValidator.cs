using Application.AdminUsers.Commands;
using Application.Core;
using FluentValidation;
using Persistence;

namespace Application.AdminUsers.Validators;

/// <summary>
/// Shape and existence only — which role may hold departments at all is
/// <c>SetAdminUserDepartments.Handler</c>'s job, since the payload carries no role
/// and only the stored one is authoritative.
/// </summary>
public class SetAdminUserDepartmentsValidator : AbstractValidator<SetAdminUserDepartments.Command>
{
    public SetAdminUserDepartmentsValidator(AppDbContext context)
    {
        RuleFor(x => x.Id).NotEmpty().WithMessage("User id is required.");
        RuleFor(x => x.Departments).NotNull().WithMessage("Departments payload is required.");

        When(x => x.Departments is not null, () =>
        {
            RuleFor(x => x.Departments.DepartmentIds)
                .Cascade(CascadeMode.Stop)
                .Must(ids => HrDepartmentScopeRules.Normalize(ids).Count > 0)
                .WithMessage(HrDepartmentScopeRules.DepartmentsRequiredMessage)
                // AllAssignable, not AllActive: the ids this user already holds pass
                // whatever the department's status, because the dialog re-sends the
                // whole set on every save. A create has nothing held yet and keeps
                // the stricter rule.
                .MustAsync(async (command, ids, _, ct) =>
                    await HrDepartmentScopeRules.AllAssignableAsync(
                        context, command.Id, HrDepartmentScopeRules.Normalize(ids), ct))
                .WithMessage(HrDepartmentScopeRules.UnknownDepartmentMessage);
        });
    }
}
