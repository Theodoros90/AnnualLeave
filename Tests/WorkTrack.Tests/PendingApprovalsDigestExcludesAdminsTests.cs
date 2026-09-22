using Application.Reminders;
using Domain;
using Microsoft.Extensions.Logging.Abstractions;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// The pending-approvals digest mailed every Admin an organisation-wide summary
/// of leave and timesheets awaiting review, on top of the department summary it
/// mails each Manager. The people who action a submission are the managers, so
/// the Admin's copy was noise arriving every morning about queues that are not
/// theirs. The digest now goes to managers only. Admins are seeded with a real
/// UserRole row, which is what the recipient lookup reads.
/// </summary>
public class PendingApprovalsDigestExcludesAdminsTests
{
    private const string AdminEmail = "ada@example.com";
    private const string ManagerEmail = "mia@example.com";
    private const int DepartmentId = 1;

    private static readonly AppSettings Enabled = new() { EmailNotificationsEnabled = true };

    /// <summary>
    /// One Admin, one Manager of Engineering, one Engineering employee with a
    /// pending leave request and a submitted timesheet.
    /// </summary>
    private static AppDbContext SeedWorld()
    {
        var db = TestDb.Create();

        db.Departments.Add(new Department { Id = DepartmentId, Name = "Engineering", Code = "ENG" });

        var adminRole = new Role { Id = "r-admin", Name = AppRoles.Admin, NormalizedName = AppRoles.Admin.ToUpperInvariant() };
        var managerRole = new Role { Id = "r-manager", Name = AppRoles.Manager, NormalizedName = AppRoles.Manager.ToUpperInvariant() };
        db.Roles.AddRange(adminRole, managerRole);

        SeedProfile(db, "admin-u", "admin-p", "Ada Admin", AdminEmail, departmentId: null);
        db.UserRoles.Add(new UserRole { UserId = "admin-u", RoleId = adminRole.Id });

        SeedProfile(db, "manager-u", "manager-p", "Mia Manager", ManagerEmail, DepartmentId);
        db.UserRoles.Add(new UserRole { UserId = "manager-u", RoleId = managerRole.Id });

        SeedProfile(db, "employee-u", "employee-p", "Eve Employee", "eve@example.com", DepartmentId);

        db.AnnualLeaves.Add(new AnnualLeave
        {
            EmployeeId = "employee-u",
            EmployeeProfileId = "employee-p",
            DepartmentId = DepartmentId,
            StartDate = DateTime.UtcNow.AddDays(7),
            EndDate = DateTime.UtcNow.AddDays(8),
            Status = AnnualLeaveStatus.Pending,
            CreatedAt = DateTime.UtcNow,
        });
        db.Timesheets.Add(new Timesheet
        {
            EmployeeProfileId = "employee-p",
            DepartmentId = DepartmentId,
            PeriodStart = DateTime.UtcNow.AddDays(-7),
            PeriodEnd = DateTime.UtcNow.AddDays(-1),
            Status = TimesheetStatus.Submitted,
        });

        db.SaveChanges();
        return db;
    }

    private static void SeedProfile(AppDbContext db, string userId, string profileId, string displayName, string email, int? departmentId)
    {
        db.Users.Add(new User { Id = userId, UserName = userId, DisplayName = displayName, Email = email });
        db.EmployeeProfiles.Add(new EmployeeProfile { Id = profileId, UserId = userId, DepartmentId = departmentId });
    }

    private static ReminderDispatcher DispatcherFor(AppDbContext db, FakeEmailService email) =>
        new(db, email, NullLogger<ReminderDispatcher>.Instance);

    [Fact]
    public async Task Digest_is_not_sent_to_an_admin()
    {
        using var db = SeedWorld();
        var email = new FakeEmailService();

        await DispatcherFor(db, email).DispatchAsync(ReminderDispatcher.PendingApprovals, Enabled, CancellationToken.None);

        Assert.DoesNotContain(AdminEmail, email.Sent.Select(m => m.Recipient));
    }

    [Fact]
    public async Task Digest_still_reaches_the_department_manager()
    {
        using var db = SeedWorld();
        var email = new FakeEmailService();

        await DispatcherFor(db, email).DispatchAsync(ReminderDispatcher.PendingApprovals, Enabled, CancellationToken.None);

        var toManager = Assert.Single(email.Sent, m => m.Recipient == ManagerEmail);
        Assert.Contains("your department", toManager.HtmlBody);
        Assert.Contains("<strong>1</strong> leave request(s)", toManager.HtmlBody);
        Assert.Contains("<strong>1</strong> timesheet(s)", toManager.HtmlBody);
    }
}
