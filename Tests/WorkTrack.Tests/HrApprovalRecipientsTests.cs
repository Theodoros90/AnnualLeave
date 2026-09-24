using Application.Core;
using Domain;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// The HR Administrators who are told a request is waiting on them: those whose
/// assigned departments cover the leave's department, or every one of them for a
/// department-less leave (an administrator's own). Never the employee, never a
/// deactivated account, never somebody who merely holds another role.
/// </summary>
public class HrApprovalRecipientsTests
{
    private const int Eng = 1;
    private const int Fin = 2;

    private static Persistence.AppDbContext Seed()
    {
        var db = TestDb.Create();
        db.Roles.Add(new Role { Id = "r-hr", Name = AppRoles.HrAdministrator, NormalizedName = AppRoles.HrAdministrator.ToUpperInvariant() });
        db.Roles.Add(new Role { Id = "r-mgr", Name = AppRoles.Manager, NormalizedName = AppRoles.Manager.ToUpperInvariant() });
        db.Users.AddRange(
            new User { Id = "hr-eng", UserName = "hr-eng", Email = "hr-eng@t.local", DisplayName = "HR Eng" },
            new User { Id = "hr-fin", UserName = "hr-fin", Email = "hr-fin@t.local", DisplayName = "HR Fin" },
            new User { Id = "hr-off", UserName = "hr-off", Email = "hr-off@t.local", DisplayName = "HR Left", IsActive = false },
            new User { Id = "mgr", UserName = "mgr", Email = "mgr@t.local", DisplayName = "Manager" });
        db.UserRoles.AddRange(
            new UserRole { UserId = "hr-eng", RoleId = "r-hr" },
            new UserRole { UserId = "hr-fin", RoleId = "r-hr" },
            new UserRole { UserId = "hr-off", RoleId = "r-hr" },
            new UserRole { UserId = "mgr", RoleId = "r-mgr" });
        db.UserDepartments.AddRange(
            new UserDepartment { UserId = "hr-eng", DepartmentId = Eng },
            new UserDepartment { UserId = "hr-fin", DepartmentId = Fin },
            new UserDepartment { UserId = "hr-off", DepartmentId = Eng },
            new UserDepartment { UserId = "mgr", DepartmentId = Eng });
        db.SaveChanges();
        return db;
    }

    [Fact]
    public async Task Only_the_hr_administrators_covering_the_department_are_told()
    {
        using var db = Seed();

        var recipients = await HrApprovalRecipients.ResolveAsync(db, Eng, excludeUserId: "nobody", CancellationToken.None);

        Assert.Equal(["hr-eng@t.local"], recipients.Select(r => r.Email));
    }

    [Fact]
    public async Task A_department_less_leave_reaches_every_active_hr_administrator()
    {
        using var db = Seed();

        var recipients = await HrApprovalRecipients.ResolveAsync(db, null, excludeUserId: "nobody", CancellationToken.None);

        Assert.Equal(["hr-eng@t.local", "hr-fin@t.local"], recipients.Select(r => r.Email).OrderBy(e => e));
    }

    [Fact]
    public async Task The_excluded_user_is_never_a_recipient()
    {
        using var db = Seed();

        var recipients = await HrApprovalRecipients.ResolveAsync(db, Eng, excludeUserId: "hr-eng", CancellationToken.None);

        Assert.Empty(recipients);
    }
}
