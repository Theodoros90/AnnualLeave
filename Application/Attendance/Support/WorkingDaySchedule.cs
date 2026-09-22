using Domain;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Attendance.Support;

/// <summary>
/// The organisation's working day as the attendance rules read it:
/// <see cref="AppSettings.WorkingHoursStart"/>..<see cref="AppSettings.WorkingHoursEnd"/>,
/// told in <see cref="AppSettings.TimeZoneId"/>.
///
/// This is the one reading of "late" for every attendance surface — the company
/// dashboard's issues and activity feed, the team board's note, the personal
/// history strip's grade, the team check-in chart's axis and the daily attendance
/// report. Each of the first four used to carry its own hardcoded UTC hour (10:00
/// on the dashboard and board, 09:00 on the strip) while only the report read the
/// settings, so on a UTC+3 deployment nothing on screen was late before one in
/// the afternoon and the "not checked in" issue stayed silent all morning.
///
/// Attendance events are stored in UTC. Every judgement here converts the instant
/// into the org's zone first and compares the local wall-clock time with the
/// configured start; without the conversion "09:00" means 09:00 UTC, two or three
/// hours into a Cypriot morning.
/// </summary>
public sealed class WorkingDaySchedule
{
    public static readonly TimeOnly DefaultStart = new(9, 0);
    public static readonly TimeOnly DefaultEnd = new(18, 0);

    public TimeZoneInfo TimeZone { get; }
    public TimeOnly Start { get; }
    public TimeOnly End { get; }

    /// <summary>
    /// Length of the scheduled working day in minutes. An end before the start is
    /// a typo, not a policy, and reads as the default nine hours.
    /// </summary>
    public int ScheduledMinutes { get; }

    private WorkingDaySchedule(TimeZoneInfo timeZone, TimeOnly start, TimeOnly end)
    {
        TimeZone = timeZone;
        Start = start;
        End = end;

        // TimeOnly subtraction wraps past midnight (08:00 - 09:00 is 23 hours),
        // so the differences here go through TimeSpan to keep their sign.
        var scheduled = (int)(end.ToTimeSpan() - start.ToTimeSpan()).TotalMinutes;
        ScheduledMinutes = scheduled > 0 ? scheduled : (int)(DefaultEnd.ToTimeSpan() - DefaultStart.ToTimeSpan()).TotalMinutes;
    }

    /// <summary>
    /// Builds the schedule from the settings row; a missing row, an unparseable
    /// time or an unknown time zone each fall back to the entity defaults
    /// (09:00–18:00 UTC) rather than refusing to answer.
    /// </summary>
    public static WorkingDaySchedule From(AppSettings? settings)
    {
        var start = TimeOnly.TryParse(settings?.WorkingHoursStart, out var s) ? s : DefaultStart;
        var end = TimeOnly.TryParse(settings?.WorkingHoursEnd, out var e) ? e : DefaultEnd;
        return new WorkingDaySchedule(ResolveTimeZone(settings?.TimeZoneId), start, end);
    }

    /// <summary>The schedule from the single settings row, untracked.</summary>
    public static async Task<WorkingDaySchedule> LoadAsync(AppDbContext context, CancellationToken cancellationToken) =>
        From(await context.AppSettings.AsNoTracking().FirstOrDefaultAsync(cancellationToken));

    /// <summary>
    /// A blank id is UTC, the entity default. An id the host does not know is UTC
    /// too — the setting was saved from a fixed list, so this is a host missing
    /// ICU data rather than a typo, and a report is better than none.
    /// </summary>
    public static TimeZoneInfo ResolveTimeZone(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return TimeZoneInfo.Utc;
        return TimeZoneInfo.TryFindSystemTimeZoneById(id.Trim(), out var zone) ? zone : TimeZoneInfo.Utc;
    }

    /// <summary>
    /// Whether <paramref name="id"/> names a time zone this host can convert with.
    /// Blank passes because the settings command stores it as "UTC".
    /// </summary>
    public static bool IsKnownTimeZone(string? id) =>
        string.IsNullOrWhiteSpace(id) || TimeZoneInfo.TryFindSystemTimeZoneById(id.Trim(), out _);

    public DateTime ToLocal(DateTime utc) =>
        TimeZoneInfo.ConvertTimeFromUtc(AttendanceDay.AsUtc(utc), TimeZone);

    public TimeOnly LocalTimeOf(DateTime utc) => TimeOnly.FromDateTime(ToLocal(utc));

    /// <summary>Local wall-clock minutes since midnight, for a chart's numeric axis.</summary>
    public int LocalMinutesFromMidnight(DateTime utc)
    {
        var local = LocalTimeOf(utc);
        return local.Hour * 60 + local.Minute;
    }

    /// <summary>
    /// Whole minutes the check-in landed past the start, floored at zero. Seconds
    /// are dropped, so a check-in inside the first minute is not late.
    /// </summary>
    public int MinutesLate(DateTime checkInUtc)
    {
        var minutes = (int)Math.Floor((LocalTimeOf(checkInUtc).ToTimeSpan() - Start.ToTimeSpan()).TotalMinutes);
        return Math.Max(0, minutes);
    }

    public bool IsLate(DateTime checkInUtc) => MinutesLate(checkInUtc) >= 1;

    /// <summary>
    /// Whether the local clock has reached the start plus <paramref name="graceMinutes"/>.
    /// The "not checked in" surfaces wait this long before treating an empty
    /// morning as an absence rather than as someone still on their way.
    /// </summary>
    public bool IsPastStart(DateTime nowUtc, int graceMinutes = 0) =>
        LocalTimeOf(nowUtc) >= Start.AddMinutes(graceMinutes);

    /// <summary>The start plus a grace, as "HH:mm", for the wording beside a flag.</summary>
    public string StartPlus(int graceMinutes) => Start.AddMinutes(graceMinutes).ToString("HH:mm");
}
