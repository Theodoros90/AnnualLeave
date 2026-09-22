using Application.Attendance.Support;
using Application.Reminders;
using Domain;
using Microsoft.Extensions.Logging.Abstractions;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// The check-in and check-out reminders mailed every EmployeeProfile with an
/// email, so an Admin who holds one — both admin accounts in this deployment do —
/// was told every morning to check in, and could never satisfy the reminder:
/// the topbar hides the check-in widget for an Admin, and the attendance
/// dashboards already drop admins from the tracked workforce
/// (<see cref="AttendanceDay.ExcludeAdmins"/>). The reminders now draw the same
/// line. These tests seed a real Admin UserRole row, which is what the filter
/// reads.
/// </summary>
public class AttendanceRemindersExcludeAdminsTests
{
    private const string AdminEmail = "ada@example.com";
    private const string EmployeeEmail = "eve@example.com";
    private const string AdminProfileId = "admin-p";
    private const string EmployeeProfileId = "employee-p";

    /// <summary>
    /// Every day of the week is a working day and no holiday country is set, so
    /// the reminder runs whatever day the test happens to execute on.
    /// </summary>
    private static readonly AppSettings AlwaysWorking = new()
    {
        EmailNotificationsEnabled = true,
        WorkingDays = "custom",
        WorkingDaysCustom = "sun,mon,tue,wed,thu,fri,sat",
        HolidayCountryCode = null,
    };

    private static AppDbContext SeedWorld()
    {
        var db = TestDb.Create();

        db.Departments.Add(new Department { Id = 1, Name = "Engineering", Code = "ENG" });

        var adminRole = new Role
        {
            Id = "r-admin",
            Name = AppRoles.Admin,
            NormalizedName = AppRoles.Admin.ToUpperInvariant(),
        };
        db.Roles.Add(adminRole);

        SeedProfile(db, "admin-u", AdminProfileId, "Ada Admin", AdminEmail, departmentId: null);
        db.UserRoles.Add(new UserRole { UserId = "admin-u", RoleId = adminRole.Id });

        SeedProfile(db, "employee-u", EmployeeProfileId, "Eve Employee", EmployeeEmail, departmentId: 1);

        db.SaveChanges();
        return db;
    }

    private static void SeedProfile(AppDbContext db, string userId, string profileId, string displayName, string email, int? departmentId)
    {
        db.Users.Add(new User { Id = userId, UserName = userId, DisplayName = displayName, Email = email });
        db.EmployeeProfiles.Add(new EmployeeProfile
        {
            Id = profileId,
            UserId = userId,
            DepartmentId = departmentId,
        });
    }

    private static ReminderDispatcher DispatcherFor(AppDbContext db, FakeEmailService email) =>
        new(db, email, NullLogger<ReminderDispatcher>.Instance);

    [Fact]
    public async Task Check_in_reminder_skips_an_admin_with_a_profile()
    {
        using var db = SeedWorld();
        var email = new FakeEmailService();

        await DispatcherFor(db, email).DispatchAsync(ReminderDispatcher.CheckInReminder, AlwaysWorking, CancellationToken.None);

        var recipients = email.Sent.Select(m => m.Recipient).ToList();
        Assert.Contains(EmployeeEmail, recipients);
        Assert.DoesNotContain(AdminEmail, recipients);
    }

    [Fact]
    public async Task Check_out_reminder_skips_an_admin_still_checked_in()
    {
        using var db = SeedWorld();
        var now = DateTime.UtcNow;
        db.AttendanceEvents.Add(AttendanceDay.NewEvent(AdminProfileId, now, AttendanceEventType.CheckIn));
        db.AttendanceEvents.Add(AttendanceDay.NewEvent(EmployeeProfileId, now, AttendanceEventType.CheckIn));
        await db.SaveChangesAsync();

        var email = new FakeEmailService();

        await DispatcherFor(db, email).DispatchAsync(ReminderDispatcher.CheckOutReminder, AlwaysWorking, CancellationToken.None);

        var recipients = email.Sent.Select(m => m.Recipient).ToList();
        Assert.Contains(EmployeeEmail, recipients);
        Assert.DoesNotContain(AdminEmail, recipients);
    }
}
