using Domain;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.AnnualLeaves.Commands;

/// <summary>
/// Whether a leave request has to name a delegate. It does for an Employee and a
/// Manager; a System Administrator's own leave is exempt.
///
/// The rule is about whose leave it is, not who is typing: an admin filing on an
/// employee's behalf is held to it, matching <c>AttachmentPolicyRule</c> and the
/// rest. It reads the employee's <em>stored</em> role because the payload carries
/// none, and an employee id matching nobody is held to the non-System Administrator rule — the
/// validator reports the missing account separately.
///
/// Why a System Administrator is exempt rather than merely tolerated: a System Administrator has no department
/// (<c>EmployeeProfile.DepartmentId</c> is refused for the role), so the picker,
/// which offers department colleagues, would offer them nobody, and a required
/// field with nothing to put in it is a form that cannot be submitted.
///
/// Called from the two validators, where the other delegate checks already live;
/// <c>client/src/lib/coverage.ts</c> mirrors it so neither form offers a submit
/// the API is certain to refuse.
/// </summary>
public static class CoverageRule
{
    public const string RequiredMessage = "Please nominate a colleague to cover for you while you are away.";

    /// <summary>True unless the employee holds the System Administrator role.</summary>
    public static async Task<bool> IsRequiredForAsync(
        AppDbContext context, string? employeeId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(employeeId)) return true;

        var isAdmin = await context.Users
            .Where(u => u.Id == employeeId)
            .SelectMany(u => u.UserRoles)
            .AnyAsync(ur => ur.Role != null && ur.Role.Name == AppRoles.SystemAdministrator, cancellationToken);

        return !isAdmin;
    }

    /// <summary>
    /// The refusal for a request from <paramref name="employeeId"/> naming
    /// <paramref name="delegateId"/>, or null when there is nothing to refuse.
    /// Whitespace is not a delegate.
    /// </summary>
    public static async Task<string?> CheckAsync(
        AppDbContext context, string? employeeId, string? delegateId, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(delegateId)) return null;

        return await IsRequiredForAsync(context, employeeId, cancellationToken)
            ? RequiredMessage
            : null;
    }
}
