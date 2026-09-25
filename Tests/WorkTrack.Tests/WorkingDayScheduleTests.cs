using Application.Attendance.Support;
using Domain;
using Domain.Services;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// One reading of "late" for every attendance surface: a check-in is late when
/// its local time, in the organisation's <c>TimeZoneId</c>, is a whole minute or
/// more past <c>WorkingHoursStart</c>. Before this rule each surface carried its
/// own hardcoded UTC hour — 10:00 on the company dashboard and team board, 09:00
/// on the personal history strip — so at UTC+3 nothing read as late before one
/// in the afternoon, whatever the settings said.
/// </summary>
public class WorkingDayScheduleTests
{
    private static readonly DateTime Today = new(2026, 9, 22, 0, 0, 0, DateTimeKind.Utc);

    private static AppSettings Settings(string timeZoneId, string start = "09:00", string end = "18:00") => new()
    {
        TimeZoneId = timeZoneId,
        WorkingHoursStart = start,
        WorkingHoursEnd = end,
    };

    [Fact]
    public void Late_is_measured_in_the_org_time_zone()
    {
        // Etc/GMT-2 is UTC+2 (POSIX sign), so 07:30 UTC is 09:30 local.
        var schedule = WorkingDaySchedule.From(Settings("Etc/GMT-2"));

        Assert.True(schedule.IsLate(Today.AddHours(7).AddMinutes(30)));
        Assert.Equal(30, schedule.MinutesLate(Today.AddHours(7).AddMinutes(30)));

        // 08:30 local is on time, and reads as 0 minutes late rather than negative.
        Assert.False(schedule.IsLate(Today.AddHours(6).AddMinutes(30)));
        Assert.Equal(0, schedule.MinutesLate(Today.AddHours(6).AddMinutes(30)));
    }

    [Fact]
    public void Under_a_minute_past_the_start_is_not_late()
    {
        var schedule = WorkingDaySchedule.From(Settings("UTC"));

        Assert.False(schedule.IsLate(Today.AddHours(9).AddSeconds(59)));
        Assert.True(schedule.IsLate(Today.AddHours(9).AddMinutes(1)));
    }

    [Fact]
    public void Start_time_comes_from_the_settings_not_a_constant()
    {
        var schedule = WorkingDaySchedule.From(Settings("UTC", start: "08:00"));

        Assert.True(schedule.IsLate(Today.AddHours(8).AddMinutes(5)));
        Assert.Equal(5, schedule.MinutesLate(Today.AddHours(8).AddMinutes(5)));
    }

    [Fact]
    public void Past_start_honours_a_grace_period_in_local_time()
    {
        var schedule = WorkingDaySchedule.From(Settings("Etc/GMT-2"));

        // 09:59 local: still inside the hour's grace.
        Assert.False(schedule.IsPastStart(Today.AddHours(7).AddMinutes(59), graceMinutes: 60));
        // 10:00 local: the grace has run out.
        Assert.True(schedule.IsPastStart(Today.AddHours(8), graceMinutes: 60));
        // Without grace the start itself is the line.
        Assert.True(schedule.IsPastStart(Today.AddHours(7)));
        Assert.False(schedule.IsPastStart(Today.AddHours(6).AddMinutes(59)));
    }

    [Fact]
    public void Local_minutes_from_midnight_follow_the_time_zone()
    {
        var schedule = WorkingDaySchedule.From(Settings("Etc/GMT-2"));

        Assert.Equal(9 * 60 + 30, schedule.LocalMinutesFromMidnight(Today.AddHours(7).AddMinutes(30)));
    }

    [Fact]
    public void Unknown_or_blank_time_zone_falls_back_to_UTC()
    {
        Assert.Equal(TimeZoneInfo.Utc, WorkingDaySchedule.From(Settings("Not/AZone")).TimeZone);
        Assert.Equal(TimeZoneInfo.Utc, WorkingDaySchedule.From(Settings("")).TimeZone);
        Assert.Equal(TimeZoneInfo.Utc, WorkingDaySchedule.From(null).TimeZone);
    }

    [Fact]
    public void Time_zone_ids_are_validated_by_the_same_resolver()
    {
        Assert.True(WorkingDaySchedule.IsKnownTimeZone("UTC"));
        Assert.True(WorkingDaySchedule.IsKnownTimeZone("Asia/Nicosia"));
        Assert.True(WorkingDaySchedule.IsKnownTimeZone(null));
        Assert.False(WorkingDaySchedule.IsKnownTimeZone("UTC-5 (Eastern)"));
    }

    [Fact]
    public void Unparseable_hours_fall_back_to_nine_to_six()
    {
        var schedule = WorkingDaySchedule.From(Settings("UTC", start: "soon", end: "later"));

        Assert.Equal(new TimeOnly(9, 0), schedule.Start);
        Assert.Equal(new TimeOnly(18, 0), schedule.End);
        Assert.Equal(9 * 60, schedule.ScheduledMinutes);
    }

    [Fact]
    public void An_end_before_the_start_is_a_typo_not_a_policy()
    {
        var schedule = WorkingDaySchedule.From(Settings("UTC", start: "18:00", end: "09:00"));

        Assert.Equal(9 * 60, schedule.ScheduledMinutes);
    }

    /* ── The break ──────────────────────────────────────────────────────────── */

    private static AppSettings WithBreak(string mode, string start = "13:00", string end = "14:00", int minutes = 0)
    {
        var settings = Settings("UTC", start: "08:00", end: "17:00");
        settings.BreakMode = mode;
        settings.BreakStart = start;
        settings.BreakEnd = end;
        settings.BreakMinutes = minutes;
        return settings;
    }

    [Fact]
    public void A_fixed_break_comes_off_the_scheduled_day()
    {
        var schedule = WorkingDaySchedule.From(WithBreak("fixed", "13:00", "14:00"));

        Assert.Equal(60, schedule.BreakMinutes);
        Assert.Equal(8 * 60, schedule.ScheduledMinutes);
    }

    [Fact]
    public void A_flexible_break_comes_off_the_scheduled_day()
    {
        var schedule = WorkingDaySchedule.From(WithBreak("flexible", minutes: 45));

        Assert.Equal(45, schedule.BreakMinutes);
        Assert.Equal(9 * 60 - 45, schedule.ScheduledMinutes);
    }

    /// <summary>
    /// The mode decides which figures are read. A window or a duration left over
    /// from an earlier setting must not come off the day once the break is off.
    /// </summary>
    [Fact]
    public void No_break_leaves_the_day_whole_whatever_the_other_columns_hold()
    {
        Assert.Equal(9 * 60, WorkingDaySchedule.From(WithBreak("none", "13:00", "14:00", minutes: 45)).ScheduledMinutes);
        Assert.Equal(0, WorkingDaySchedule.From(WithBreak("none", "13:00", "14:00", minutes: 45)).BreakMinutes);
        Assert.Equal(9 * 60, WorkingDaySchedule.From(Settings("UTC", start: "08:00", end: "17:00")).ScheduledMinutes);
    }

    [Fact]
    public void A_fixed_break_that_does_not_fit_the_working_day_counts_nothing()
    {
        // Inverted, and starting before the day: each is a typo, not a policy.
        Assert.Equal(0, WorkingDaySchedule.From(WithBreak("fixed", "14:00", "13:00")).BreakMinutes);
        Assert.Equal(0, WorkingDaySchedule.From(WithBreak("fixed", "07:00", "08:30")).BreakMinutes);
        Assert.Equal(0, WorkingDaySchedule.From(WithBreak("fixed", "16:30", "17:30")).BreakMinutes);
        Assert.Equal(0, WorkingDaySchedule.From(WithBreak("fixed", "lunch", "later")).BreakMinutes);
    }

    [Fact]
    public void A_flexible_break_as_long_as_the_day_counts_nothing()
    {
        Assert.Equal(0, WorkingDaySchedule.From(WithBreak("flexible", minutes: 9 * 60)).BreakMinutes);
        Assert.Equal(0, WorkingDaySchedule.From(WithBreak("flexible", minutes: -5)).BreakMinutes);
        Assert.Equal(9 * 60, WorkingDaySchedule.From(WithBreak("flexible", minutes: 9 * 60)).ScheduledMinutes);
    }
}

/// <summary>
/// The break taken against the break allowed, for the surfaces that tell a
/// manager or HR whether somebody took more or less than the day allows for.
/// One rule, read off the same <c>BreakMinutes</c> the overtime figure comes off,
/// so the board, the dashboard, the employee's own page and the daily report
/// never disagree about what "over" means.
/// </summary>
public class WorkingDayScheduleBreakVarianceTests
{
    private static readonly DateTime Today = new(2026, 9, 22, 0, 0, 0, DateTimeKind.Utc);

    private static WorkingDaySchedule Schedule(int allowanceMinutes) => WorkingDaySchedule.From(new AppSettings
    {
        TimeZoneId = "UTC",
        WorkingHoursStart = "08:00",
        WorkingHoursEnd = "17:00",
        BreakMode = allowanceMinutes > 0 ? "flexible" : "none",
        BreakMinutes = allowanceMinutes,
    });

    private static AttendanceDayState State(
        AttendanceDayStatus status,
        int breakMinutes,
        DateTime? onBreakSince = null,
        DateTime? checkOutAt = null) =>
        new(status, Today.AddHours(8), checkOutAt, onBreakSince, breakMinutes, 0, false);

    [Fact]
    public void No_break_configured_says_nothing_whatever_was_taken()
    {
        var schedule = Schedule(0);

        Assert.Null(schedule.BreakVariance(State(AttendanceDayStatus.Done, 90, checkOutAt: Today.AddHours(17)), Today.AddHours(18)));
        Assert.Null(schedule.BreakVariance(State(AttendanceDayStatus.In, 90), Today.AddHours(12)));
    }

    [Fact]
    public void Over_the_allowance_is_reported_while_the_day_is_still_open()
    {
        var schedule = Schedule(60);

        Assert.Equal(20, schedule.BreakVariance(State(AttendanceDayStatus.In, 80), Today.AddHours(15)));
    }

    [Fact]
    public void Under_the_allowance_is_reported_only_once_the_day_is_done()
    {
        var schedule = Schedule(60);

        // Ten minutes by mid-morning is not a shortfall yet; the lunch may still come.
        Assert.Null(schedule.BreakVariance(State(AttendanceDayStatus.In, 10), Today.AddHours(11)));
        // Checked out having taken ten: fifty minutes under.
        Assert.Equal(-50, schedule.BreakVariance(State(AttendanceDayStatus.Done, 10, checkOutAt: Today.AddHours(17)), Today.AddHours(18)));
        // Exactly the allowance on a finished day is an answer, not silence.
        Assert.Equal(0, schedule.BreakVariance(State(AttendanceDayStatus.Done, 60, checkOutAt: Today.AddHours(17)), Today.AddHours(18)));
    }

    [Fact]
    public void A_break_still_running_counts_towards_the_total()
    {
        var schedule = Schedule(60);
        // Fifty minutes of closed breaks plus a break open for the last twenty.
        var state = State(AttendanceDayStatus.Break, 50, onBreakSince: Today.AddHours(13));

        Assert.Equal(70, schedule.BreakMinutesTaken(state, Today.AddHours(13).AddMinutes(20)));
        Assert.Equal(10, schedule.BreakVariance(state, Today.AddHours(13).AddMinutes(20)));
        // Not over yet while the open break is still inside the allowance.
        Assert.Null(schedule.BreakVariance(state, Today.AddHours(13).AddMinutes(5)));
    }
}
