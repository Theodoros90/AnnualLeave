using Application.Attendance.Support;
using Domain;
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
}
