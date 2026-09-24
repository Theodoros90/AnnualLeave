using System.Security.Claims;
using API.Hubs;
using Application.Reminders;
using Domain;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// What an HR Administrator is told follows what they may see: live refreshes for
/// their departments only (the per-department SignalR groups, not the admin
/// group), and digests filtered to their people.
/// </summary>
public class HrAdministratorNotificationScopeTests : IDisposable
{
    private readonly ServiceProvider _services;

    public HrAdministratorNotificationScopeTests()
    {
        var collection = new ServiceCollection();
        collection.AddLogging(b => b.SetMinimumLevel(LogLevel.Warning));
        collection.AddDbContext<AppDbContext>(o => o
            .UseInMemoryDatabase($"hr-notify-{Guid.NewGuid()}")
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        collection.AddIdentityCore<User>().AddRoles<Role>().AddEntityFrameworkStores<AppDbContext>();
        _services = collection.BuildServiceProvider();
    }

    public void Dispose() => _services.Dispose();
    private AppDbContext Db => _services.GetRequiredService<AppDbContext>();
    private UserManager<User> Users => _services.GetRequiredService<UserManager<User>>();
    private RoleManager<Role> Roles => _services.GetRequiredService<RoleManager<Role>>();

    private async Task<User> GivenUserAsync(string email, string role, int? profileDepartmentId, params int[] assigned)
    {
        if (!await Roles.RoleExistsAsync(role)) Assert.True((await Roles.CreateAsync(new Role { Name = role })).Succeeded);
        var user = new User { UserName = email, Email = email, DisplayName = email, EmailConfirmed = true, DateOfBirth = DateOnly.FromDateTime(DateTime.Now) };
        Assert.True((await Users.CreateAsync(user)).Succeeded);
        Assert.True((await Users.AddToRoleAsync(user, role)).Succeeded);
        Db.EmployeeProfiles.Add(new EmployeeProfile { Id = $"p-{user.Id}", UserId = user.Id, DepartmentId = profileDepartmentId });
        foreach (var d in assigned) Db.UserDepartments.Add(new UserDepartment { UserId = user.Id, DepartmentId = d });
        await Db.SaveChangesAsync();
        return user;
    }

    // ── SignalR ──────────────────────────────────────────────────────────────────

    private sealed class RecordingGroups : IGroupManager
    {
        public List<string> Joined { get; } = [];
        public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken ct = default) { Joined.Add(groupName); return Task.CompletedTask; }
        public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class FakeCallerContext(ClaimsPrincipal user) : HubCallerContext
    {
        public override string ConnectionId => "conn-1";
        public override string? UserIdentifier => user.FindFirstValue(ClaimTypes.NameIdentifier);
        public override ClaimsPrincipal? User => user;
        public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
        public override IFeatureCollection Features => new FeatureCollection();
        public override CancellationToken ConnectionAborted => CancellationToken.None;
        public override void Abort() { }
    }

    private async Task<List<string>> GroupsJoinedBy(User user)
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, user.Id), new Claim(ClaimTypes.Name, user.UserName!)], "test"));
        var groups = new RecordingGroups();
        var hub = new NotificationsHub(Users, Db) { Context = new FakeCallerContext(principal), Groups = groups };
        await hub.OnConnectedAsync();
        return groups.Joined;
    }

    [Fact]
    public async Task An_HR_Administrator_joins_their_department_groups_and_not_the_admin_group()
    {
        var hr = await GivenUserAsync("hr@t.local", AppRoles.HrAdministrator, null, 3, 5);

        var joined = await GroupsJoinedBy(hr);

        Assert.DoesNotContain(NotificationsHub.AdminGroup, joined);
        Assert.Equal(
            new[] { NotificationsHub.DepartmentManagerGroup(3), NotificationsHub.DepartmentManagerGroup(5), NotificationsHub.HrAdministratorGroup },
            joined.OrderBy(g => g));
    }

    [Fact]
    public async Task A_System_Administrator_still_joins_the_admin_group_alone()
    {
        var sys = await GivenUserAsync("sys@t.local", AppRoles.SystemAdministrator, null);

        Assert.Equal([NotificationsHub.AdminGroup], await GroupsJoinedBy(sys));
    }

    // ── Digests ──────────────────────────────────────────────────────────────────

    private static AppSettings Settings() => new()
    {
        EmailNotificationsEnabled = true, WorkingDays = "custom", WorkingDaysCustom = "sun,mon,tue,wed,thu,fri,sat",
        HolidayCountryCode = null, TimeZoneId = "UTC", WorkingHoursStart = "09:00", WorkingHoursEnd = "18:00",
        TimesheetSubmissionDeadlineDay = "mon", TimesheetSubmissionDeadlineTime = "00:00",
    };

    [Fact]
    public async Task The_birthday_digest_to_an_HR_Administrator_names_only_their_departments_people()
    {
        Db.Departments.AddRange(new Department { Id = 1, Name = "A", Code = "A" }, new Department { Id = 2, Name = "B", Code = "B" });
        await Db.SaveChangesAsync();
        var hr = await GivenUserAsync("hr@t.local", AppRoles.HrAdministrator, null, 1);
        await GivenUserAsync("sys@t.local", AppRoles.SystemAdministrator, null);
        await GivenUserAsync("anna@t.local", AppRoles.Employee, 1);
        await GivenUserAsync("ben@t.local", AppRoles.Employee, 2);
        var email = new FakeEmailService();

        await new ReminderDispatcher(Db, email, NullLogger<ReminderDispatcher>.Instance)
            .DispatchAsync(ReminderDispatcher.BirthdayReminder, Settings(), CancellationToken.None);

        var toHr = Assert.Single(email.Sent, m => m.Recipient == hr.Email);
        Assert.Contains("anna@t.local", toHr.HtmlBody);
        Assert.DoesNotContain("ben@t.local", toHr.HtmlBody);
        var toSys = Assert.Single(email.Sent, m => m.Recipient == "sys@t.local");
        Assert.Contains("ben@t.local", toSys.HtmlBody);
    }

    [Fact]
    public async Task The_daily_attendance_report_to_an_HR_Administrator_covers_only_their_departments()
    {
        Db.Departments.AddRange(new Department { Id = 1, Name = "A", Code = "A" }, new Department { Id = 2, Name = "B", Code = "B" });
        Db.LeaveTypes.Add(new LeaveType { Id = 1, Name = "Annual Leave", IsActive = true });
        await Db.SaveChangesAsync();
        var hr = await GivenUserAsync("hr@t.local", AppRoles.HrAdministrator, null, 1);
        await GivenUserAsync("sys@t.local", AppRoles.SystemAdministrator, null);
        await GivenUserAsync("anna@t.local", AppRoles.Employee, 1);
        await GivenUserAsync("ben@t.local", AppRoles.Employee, 2);
        var email = new FakeEmailService();

        await new ReminderDispatcher(Db, email, NullLogger<ReminderDispatcher>.Instance)
            .DispatchAsync(ReminderDispatcher.DailyAttendanceReport, Settings(), CancellationToken.None);

        var toHr = Assert.Single(email.Sent, m => m.Recipient == hr.Email);
        // Neither checked in yesterday; only Anna is HR's to be told about.
        Assert.Contains("anna@t.local", toHr.HtmlBody);
        Assert.DoesNotContain("ben@t.local", toHr.HtmlBody);
        // Attendance is HR's to run. The System Administrator is told about
        // system errors instead (SystemErrorNotifierTests).
        Assert.DoesNotContain(email.Sent, m => m.Recipient == "sys@t.local");
    }
}
