using Application.Attendance.Support;
using Application.Reminders;
using Domain;
using Microsoft.Extensions.Logging.Abstractions;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// The daily attendance report: every Admin is emailed each working morning
/// about the previous working day — who checked in late, who never checked in,
/// who never checked out, whose timesheet for the last week past its deadline is
/// still unsubmitted, and who was on leave. Admins and deactivated accounts are
/// reported on by nobody: they are not part of the tracked workforce.
/// </summary>
public class DailyAttendanceReportTests
{
    private const string AdminEmail = "ada@example.com";
    private const int DepartmentId = 1;

    /// <summary>
    /// Every day is a working day and no holiday country is set, so the report
    /// always runs and always covers yesterday. The deadline is Monday 00:00, so
    /// the current week's timesheet is already due whatever day the test runs
    /// on. UTC keeps the late arithmetic independent of the host.
    /// </summary>
    private static AppSettings Settings() => new()
    {
        EmailNotificationsEnabled = true,
        WorkingDays = "custom",
        WorkingDaysCustom = "sun,mon,tue,wed,thu,fri,sat",
        HolidayCountryCode = null,
        TimeZoneId = "UTC",
        WorkingHoursStart = "09:00",
        WorkingHoursEnd = "18:00",
        TimesheetSubmissionDeadlineDay = "mon",
        TimesheetSubmissionDeadlineTime = "00:00",
    };

    private static readonly DateTime Yesterday = AttendanceDay.UtcDayStart(DateTime.UtcNow).AddDays(-1);

    private static DateTime CurrentWeekStart()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var back = ((int)today.DayOfWeek + 6) % 7; // Monday = 0
        return today.AddDays(-back).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
    }

    private static Timesheet WeekTimesheet(string profileId, TimesheetStatus status) => new()
    {
        EmployeeProfileId = profileId,
        DepartmentId = DepartmentId,
        PeriodStart = CurrentWeekStart(),
        PeriodEnd = CurrentWeekStart().AddDays(6),
        Status = status,
    };

    private static AppDbContext SeedWorld()
    {
        var db = TestDb.Create();

        db.Departments.Add(new Department { Id = DepartmentId, Name = "Engineering", Code = "ENG" });
        db.LeaveTypes.Add(new LeaveType { Id = 1, Name = "Annual Leave", IsActive = true });

        var adminRole = new Role { Id = "r-admin", Name = AppRoles.Admin, NormalizedName = AppRoles.Admin.ToUpperInvariant() };
        db.Roles.Add(adminRole);

        SeedPerson(db, "admin", "Ada Admin", AdminEmail, departmentId: null);
        db.UserRoles.Add(new UserRole { UserId = "admin-u", RoleId = adminRole.Id });
        // An admin checking in late must not be reported: the widget is hidden for the role.
        db.AttendanceEvents.Add(AttendanceDay.NewEvent("admin-p", Yesterday.AddHours(11), AttendanceEventType.CheckIn));

        // Eve: 30 minutes late, checked out, no timesheet at all.
        SeedPerson(db, "eve", "Eve Employee", "eve@example.com", DepartmentId);
        db.AttendanceEvents.Add(AttendanceDay.NewEvent("eve-p", Yesterday.AddHours(9).AddMinutes(30), AttendanceEventType.CheckIn));
        db.AttendanceEvents.Add(AttendanceDay.NewEvent("eve-p", Yesterday.AddHours(17), AttendanceEventType.CheckOut));

        // Bob: on time, never checked out, timesheet still in draft.
        SeedPerson(db, "bob", "Bob Employee", "bob@example.com", DepartmentId);
        db.AttendanceEvents.Add(AttendanceDay.NewEvent("bob-p", Yesterday.AddHours(8), AttendanceEventType.CheckIn));
        db.Timesheets.Add(WeekTimesheet("bob-p", TimesheetStatus.Draft));

        // Cara: never checked in, timesheet submitted.
        SeedPerson(db, "cara", "Cara Employee", "cara@example.com", DepartmentId);
        db.Timesheets.Add(WeekTimesheet("cara-p", TimesheetStatus.Submitted));

        // Dan: on approved leave, so a missing check-in is not a miss.
        SeedPerson(db, "dan", "Dan Employee", "dan@example.com", DepartmentId);
        db.AnnualLeaves.Add(new AnnualLeave
        {
            EmployeeId = "dan-u",
            EmployeeProfileId = "dan-p",
            DepartmentId = DepartmentId,
            LeaveTypeId = 1,
            StartDate = Yesterday.AddDays(-1),
            EndDate = Yesterday.AddDays(1),
            Status = AnnualLeaveStatus.Approved,
            CreatedAt = DateTime.UtcNow,
        });
        db.Timesheets.Add(WeekTimesheet("dan-p", TimesheetStatus.Approved));

        // Fay: on time, 11.5 hours on site with a half-hour break, so 11 hours
        // worked against a 9-hour day: two hours of overtime.
        SeedPerson(db, "fay", "Fay Employee", "fay@example.com", DepartmentId);
        db.AttendanceEvents.Add(AttendanceDay.NewEvent("fay-p", Yesterday.AddHours(8), AttendanceEventType.CheckIn));
        db.AttendanceEvents.Add(AttendanceDay.NewEvent("fay-p", Yesterday.AddHours(12), AttendanceEventType.BreakStart));
        db.AttendanceEvents.Add(AttendanceDay.NewEvent("fay-p", Yesterday.AddHours(12).AddMinutes(30), AttendanceEventType.BreakEnd));
        db.AttendanceEvents.Add(AttendanceDay.NewEvent("fay-p", Yesterday.AddHours(19).AddMinutes(30), AttendanceEventType.CheckOut));
        db.Timesheets.Add(WeekTimesheet("fay-p", TimesheetStatus.Submitted));

        // Zed: a leaver, switched off. Never reported.
        SeedPerson(db, "zed", "Zed Leaver", "zed@example.com", DepartmentId, isActive: false);

        db.SaveChanges();
        return db;
    }

    private static void SeedPerson(AppDbContext db, string key, string displayName, string email, int? departmentId, bool isActive = true)
    {
        db.Users.Add(new User { Id = $"{key}-u", UserName = key, DisplayName = displayName, Email = email, IsActive = isActive });
        db.EmployeeProfiles.Add(new EmployeeProfile { Id = $"{key}-p", UserId = $"{key}-u", DepartmentId = departmentId });
    }

    private static ReminderDispatcher DispatcherFor(AppDbContext db, FakeEmailService email) =>
        new(db, email, NullLogger<ReminderDispatcher>.Instance);

    /// <summary>The HTML between one h3 heading and the next.</summary>
    private static string Section(string html, string heading)
    {
        var marker = $"<h3>{heading}</h3>";
        var start = html.IndexOf(marker, StringComparison.Ordinal);
        Assert.True(start >= 0, $"Section '{heading}' missing from report:\n{html}");
        start += marker.Length;
        var end = html.IndexOf("<h3>", start, StringComparison.Ordinal);
        return end < 0 ? html[start..] : html[start..end];
    }

    private static async Task<SentEmail> RunAsync(AppDbContext db, AppSettings settings)
    {
        var email = new FakeEmailService();
        await DispatcherFor(db, email).DispatchAsync(ReminderDispatcher.DailyAttendanceReport, settings, CancellationToken.None);
        return Assert.Single(email.Sent);
    }

    [Fact]
    public async Task Report_goes_to_the_admin_and_nobody_else()
    {
        using var db = SeedWorld();

        var mail = await RunAsync(db, Settings());

        Assert.Equal(AdminEmail, mail.Recipient);

        // The greeting names the admin; the report below it must not.
        var body = mail.HtmlBody[mail.HtmlBody.IndexOf("<h3>", StringComparison.Ordinal)..];
        Assert.DoesNotContain("Ada Admin", body);
        Assert.DoesNotContain("Zed Leaver", body);
    }

    [Fact]
    public async Task Each_section_names_the_right_people()
    {
        using var db = SeedWorld();

        var mail = await RunAsync(db, Settings());
        var html = mail.HtmlBody;

        var late = Section(html, "Late check-ins");
        Assert.Contains("Eve Employee", late);
        Assert.Contains("30 min late", late);
        Assert.DoesNotContain("Bob Employee", late);

        var notIn = Section(html, "Did not check in");
        Assert.Contains("Cara Employee", notIn);
        Assert.DoesNotContain("Dan Employee", notIn);
        Assert.DoesNotContain("Eve Employee", notIn);

        var notOut = Section(html, "Did not check out");
        Assert.Contains("Bob Employee", notOut);
        Assert.DoesNotContain("Eve Employee", notOut);

        var timesheets = Section(html, "Timesheet not submitted");
        Assert.Contains("Eve Employee", timesheets);
        Assert.Contains("Bob Employee", timesheets);
        Assert.DoesNotContain("Cara Employee", timesheets);
        Assert.DoesNotContain("Dan Employee", timesheets);

        var onLeave = Section(html, "On leave");
        Assert.Contains("Dan Employee", onLeave);
        Assert.Contains("Annual Leave", onLeave);

        // Overtime is worked time (breaks excluded) beyond the configured working
        // day. Bob never checked out, so his day has no length to judge.
        var overtime = Section(html, "Overtime");
        Assert.Contains("Fay Employee", overtime);
        Assert.Contains("2h 00m over", overtime);
        Assert.DoesNotContain("Eve Employee", overtime);
        Assert.DoesNotContain("Bob Employee", overtime);
    }

    [Fact]
    public async Task Late_is_measured_in_the_org_time_zone()
    {
        using var db = SeedWorld();
        // At UTC+2, Eve's 09:30 UTC check-in is 11:30 local: 150 minutes late,
        // and Bob's 08:00 UTC check-in is 10:00 local, so he is late too.
        var settings = Settings();
        settings.TimeZoneId = "Etc/GMT-2";

        var late = Section((await RunAsync(db, settings)).HtmlBody, "Late check-ins");

        Assert.Contains("150 min late", late);
        Assert.Contains("Bob Employee", late);
    }

    [Fact]
    public async Task Nothing_is_sent_on_a_non_working_day()
    {
        using var db = SeedWorld();
        var settings = Settings();
        var today = (int)DateTime.UtcNow.DayOfWeek;
        settings.WorkingDaysCustom = string.Join(",",
            new[] { "sun", "mon", "tue", "wed", "thu", "fri", "sat" }.Where((_, i) => i != today));

        var email = new FakeEmailService();
        await DispatcherFor(db, email).DispatchAsync(ReminderDispatcher.DailyAttendanceReport, settings, CancellationToken.None);

        Assert.Empty(email.Sent);
    }
}
