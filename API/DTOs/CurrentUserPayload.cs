using Domain;

namespace API.DTOs;

/// <summary>
/// What <c>GET /api/account/user-info</c> tells the signed-in client about itself,
/// mirrored by the client's <c>UserInfo</c> type.
///
/// This was an anonymous object in the controller, which no test could name — and
/// the payload has since grown a field the UI makes decisions with:
/// <see cref="Gender"/> decides whether Maternity and Paternity Leave are offered
/// at all. A field silently missing from an anonymous object fails open (the
/// client reads undefined as "not specified" and offers both), so it is worth
/// being able to assert on. Property names are unchanged from the anonymous
/// object, so the wire shape is exactly what the client already reads.
/// </summary>
public class CurrentUserPayload
{
    public string Id { get; init; } = string.Empty;
    public string? UserName { get; init; }
    public string? Email { get; init; }
    public string DisplayName { get; init; } = string.Empty;
    public string ImageUrl { get; init; } = string.Empty;
    public string? PhoneNumber { get; init; }
    public DateOnly? DateOfBirth { get; init; }

    /// <summary>
    /// Serialised as "Male" / "Female" / null by the application's
    /// <c>JsonStringEnumConverter</c>. Null means "not specified", which the leave
    /// picker treats as "offer both parental types" — see
    /// <c>Application.AnnualLeaves.Commands.ParentalLeaveEligibility</c>, which
    /// makes the same choice on the server.
    /// </summary>
    public Gender? Gender { get; init; }

    /// <summary>Null for a System Administrator, who has no employee profile.</summary>
    public int? DepartmentId { get; init; }

    public string? DepartmentName { get; init; }

    /// <summary>
    /// Every department this person's reach covers: the one on their profile plus
    /// those assigned through <c>UserDepartment</c> — an HR Administrator's whole
    /// scope, a Manager's own plus extras, an Employee's one, a System
    /// Administrator's none. Plural because <see cref="DepartmentId"/> cannot say
    /// "these three". Ascending, distinct.
    /// </summary>
    public IList<int> DepartmentIds { get; init; } = [];

    /// <summary>
    /// Tri-state: null "never asked", false "declared none", true "has some".
    /// Null also when there is no employee profile to ask about.
    /// </summary>
    public bool? HasChildren { get; init; }

    /// <summary>
    /// When the employee started, so the leave forms can hide a type wanting more
    /// service than they have (<c>MinimumServiceRule</c>, mirrored in
    /// <c>lib/leave-limits.ts</c>). Null for a System Administrator, who has no employee profile,
    /// and for an Employee row predating the column and not saved since — the
    /// client reads either as "not recorded" and offers every type, as the server
    /// does.
    /// </summary>
    public DateOnly? EmploymentStartDate { get; init; }

    public IList<string> Roles { get; init; } = [];

    public static CurrentUserPayload From(
        User user, EmployeeProfile? employeeProfile, IList<string> roles, IEnumerable<int>? assignedDepartmentIds = null) => new()
    {
        Id = user.Id,
        UserName = user.UserName,
        Email = user.Email,
        DisplayName = user.DisplayName,
        ImageUrl = user.ImageUrl,
        PhoneNumber = user.PhoneNumber,
        DateOfBirth = user.DateOfBirth,
        Gender = user.Gender,
        DepartmentId = employeeProfile?.DepartmentId,
        DepartmentName = employeeProfile?.Department?.Name,
        DepartmentIds = (assignedDepartmentIds ?? [])
            .Concat(employeeProfile?.DepartmentId is int own ? [own] : [])
            .Distinct().OrderBy(id => id).ToList(),
        HasChildren = employeeProfile?.HasChildren,
        EmploymentStartDate = employeeProfile?.EmploymentStartDate,
        Roles = roles,
    };
}
