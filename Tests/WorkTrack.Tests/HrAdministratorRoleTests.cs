using System.Security.Claims;
using Application.AnnualLeaves.Commands;
using Application.Attendance.Support;
using Domain;
using Microsoft.EntityFrameworkCore;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// HR Administrator is a copy of System Administrator: the same permissions, the
/// same scopes and the same role-scoped rules. Every gate reads both through
/// <c>AppRoles.Administrators</c> / <c>AppRoles.IsAdministrator</c>, so these pin the
/// helpers themselves and then a sample of the rules that used to name System
/// Administrator alone — a check that names one role silently locks the other out.
/// The department rule is covered in <c>AdminHasNoDepartmentTests</c>.
/// </summary>
public class HrAdministratorRoleTests
{
    // ── The helpers ─────────────────────────────────────────────────────────────

    [Fact]
    public void The_role_is_seeded_alongside_the_others()
    {
        Assert.Contains(AppRoles.HrAdministrator, AppRoles.All);
        Assert.Equal("HR Administrator", AppRoles.HrAdministrator);
    }

    [Theory]
    [InlineData(AppRoles.SystemAdministrator, true)]
    [InlineData(AppRoles.HrAdministrator, true)]
    [InlineData("hr administrator", true)]
    [InlineData("  HR Administrator ", true)]
    [InlineData(AppRoles.Manager, false)]
    [InlineData(AppRoles.Employee, false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void IsAdministrator_recognises_both_roles_case_insensitively(string? role, bool expected)
    {
        Assert.Equal(expected, AppRoles.IsAdministrator(role));
    }

    /// <summary>
    /// <c>[Authorize(Roles = ...)]</c> splits on commas; the const has to spell out
    /// exactly the roles the array holds, or an attribute and an EF predicate would
    /// disagree about who is an administrator.
    /// </summary>
    [Fact]
    public void AdministratorRoles_is_the_array_joined_for_Authorize()
    {
        var fromConst = AppRoles.AdministratorRoles.Split(',');

        Assert.Equal(AppRoles.Administrators, fromConst);
        Assert.Equal(new[] { AppRoles.SystemAdministrator, AppRoles.HrAdministrator }, AppRoles.Administrators);
    }

    [Theory]
    [InlineData(AppRoles.SystemAdministrator, true)]
    [InlineData(AppRoles.HrAdministrator, true)]
    [InlineData(AppRoles.Manager, false)]
    [InlineData(AppRoles.Employee, false)]
    public void A_principal_in_either_role_is_an_administrator(string role, bool expected)
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.Role, role)], "test"));

        Assert.Equal(expected, principal.IsAdministrator());
    }

    // ── A sample of the rules ───────────────────────────────────────────────────

    private const string HrUserId = "u-hr";
    private const string EmployeeUserId = "u-emp";

    private static async Task<AppDbContext> SeedAsync()
    {
        var db = TestDb.Create();
        db.Departments.Add(new Department { Id = 1, Name = "Engineering", Code = "ENG" });

        var hrRole = new Role { Id = "r-hr", Name = AppRoles.HrAdministrator, NormalizedName = "HR ADMINISTRATOR" };
        var employeeRole = new Role { Id = "r-employee", Name = AppRoles.Employee, NormalizedName = "EMPLOYEE" };
        db.Roles.AddRange(hrRole, employeeRole);

        db.Users.Add(new User { Id = HrUserId, UserName = "hr@test.local", Email = "hr@test.local", DisplayName = "Helen HR" });
        db.EmployeeProfiles.Add(new EmployeeProfile { Id = "p-hr", UserId = HrUserId, DepartmentId = null, AnnualLeaveEntitlement = 25, LeaveBalance = 25 });
        db.UserRoles.Add(new UserRole { UserId = HrUserId, RoleId = hrRole.Id });

        db.Users.Add(new User { Id = EmployeeUserId, UserName = "emp@test.local", Email = "emp@test.local", DisplayName = "Maria Ioannou" });
        db.EmployeeProfiles.Add(new EmployeeProfile { Id = "p-emp", UserId = EmployeeUserId, DepartmentId = 1, AnnualLeaveEntitlement = 25, LeaveBalance = 25 });
        db.UserRoles.Add(new UserRole { UserId = EmployeeUserId, RoleId = employeeRole.Id });

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        return db;
    }

    [Fact]
    public async Task An_HR_Administrator_filing_their_own_leave_needs_no_coverage()
    {
        var db = await SeedAsync();

        Assert.False(await CoverageRule.IsRequiredForAsync(db, HrUserId, CancellationToken.None));
        Assert.True(await CoverageRule.IsRequiredForAsync(db, EmployeeUserId, CancellationToken.None));
    }

    [Fact]
    public async Task Attendance_excludes_an_HR_Administrator_like_a_System_Administrator()
    {
        var db = await SeedAsync();

        var counted = await AttendanceDay.ExcludeAdmins(db.EmployeeProfiles)
            .Select(p => p.UserId)
            .ToListAsync();

        Assert.Equal([EmployeeUserId], counted);
    }
}
