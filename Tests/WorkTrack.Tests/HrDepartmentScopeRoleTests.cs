using System.Security.Claims;
using Domain;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// An HR Administrator's reach is no longer every department but the ones assigned
/// to them, so a controller now asks two questions that used to be one:
/// <c>IsSystemAdministrator</c> (unscoped) and <c>IsDepartmentScoped</c> (a Manager or
/// an HR Administrator, whose reach is a department set). <c>IsAdministrator</c>
/// keeps its meaning — may open the company-wide pages, carries the administrator
/// rules — and is not what a data filter should read any more.
/// </summary>
public class HrDepartmentScopeRoleTests
{
    private static ClaimsPrincipal With(string role) =>
        new(new ClaimsIdentity([new Claim(ClaimTypes.Role, role)], "test"));

    [Theory]
    [InlineData(AppRoles.SystemAdministrator, true)]
    [InlineData(AppRoles.HrAdministrator, false)]
    [InlineData(AppRoles.Manager, false)]
    [InlineData(AppRoles.Employee, false)]
    public void Only_the_System_Administrator_is_unscoped(string role, bool expected)
    {
        Assert.Equal(expected, With(role).IsSystemAdministrator());
    }

    [Theory]
    [InlineData(AppRoles.SystemAdministrator, false)]
    [InlineData(AppRoles.HrAdministrator, true)]
    [InlineData(AppRoles.Manager, true)]
    [InlineData(AppRoles.Employee, false)]
    public void A_Manager_and_an_HR_Administrator_are_department_scoped(string role, bool expected)
    {
        Assert.Equal(expected, With(role).IsDepartmentScoped());
    }

    [Fact]
    public void The_scoped_roles_list_names_exactly_the_two()
    {
        Assert.Equal(new[] { AppRoles.Manager, AppRoles.HrAdministrator }, AppRoles.DepartmentScopedRoles);
    }
}
