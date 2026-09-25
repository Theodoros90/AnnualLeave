using Domain;
using Domain.Services;
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
    /// Length of the scheduled working day in minutes, <b>net of the break</b>. An
    /// end before the start is a typo, not a policy, and reads as the default nine
    /// hours. This is the day the overtime figures are judged against, so with
    /// 08:00–17:00 and an hour's lunch, someone who worked eight and a half hours
    /// is half an hour over rather than half an hour short.
    /// </summary>
    public int ScheduledMinutes { get; }

    /// <summary>
    /// How long a break the day allows for: the fixed window's length, the flexible
    /// duration, or 0 for no break. A figure that does not fit the working day — an
    /// inverted or out-of-hours window, a duration as long as the day — counts as 0,
    /// like the other typos here, rather than producing a negative day.
    /// </summary>
    public int BreakMinutes { get; }

    /// <summary>The fixed break's window, or null when the break is flexible or off.</summary>
    public TimeOnly? BreakStart { get; }
    public TimeOnly? BreakEnd { get; }

    private WorkingDaySchedule(TimeZoneInfo timeZone, TimeOnly start, TimeOnly end, string breakMode,
        TimeOnly? breakStart, TimeOnly? breakEnd, int breakMinutes)
    {
        TimeZone = timeZone;
        Start = start;
        End = end;

        // TimeOnly subtraction wraps past midnight (08:00 - 09:00 is 23 hours),
        // so the differences here go through TimeSpan to keep their sign.
        var scheduled = (int)(end.ToTimeSpan() - start.ToTimeSpan()).TotalMinutes;
        if (scheduled <= 0)
        {
            start = DefaultStart;
            end = DefaultEnd;
            scheduled = (int)(DefaultEnd.ToTimeSpan() - DefaultStart.ToTimeSpan()).TotalMinutes;
        }

        var breakLength = 0;
        switch (breakMode)
        {
            case "fixed" when breakStart is { } bs && breakEnd is { } be && bs >= start && be <= end:
                var window = (int)(be.ToTimeSpan() - bs.ToTimeSpan()).TotalMinutes;
                if (window > 0)
                {
                    breakLength = window;
                    BreakStart = bs;
                    BreakEnd = be;
                }
                break;
            case "flexible" when breakMinutes > 0:
                breakLength = breakMinutes;
                break;
        }

        // A break as long as the day leaves nothing to work; treat it as the typo it is.
        BreakMinutes = breakLength < scheduled ? breakLength : 0;
        if (BreakMinutes == 0) { BreakStart = null; BreakEnd = null; }
        ScheduledMinutes = scheduled - BreakMinutes;
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
        var breakMode = string.IsNullOrWhiteSpace(settings?.BreakMode) ? "none" : settings.BreakMode.Trim().ToLowerInvariant();
        TimeOnly? breakStart = TimeOnly.TryParse(settings?.BreakStart, out var bs) ? bs : null;
        TimeOnly? breakEnd = TimeOnly.TryParse(settings?.BreakEnd, out var be) ? be : null;
        return new WorkingDaySchedule(ResolveTimeZone(settings?.TimeZoneId), start, end,
            breakMode, breakStart, breakEnd, settings?.BreakMinutes ?? 0);
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

    /// <summary>
    /// Minutes of break taken so far today: the closed breaks the calculator
    /// totalled plus a break still running, measured to <paramref name="nowUtc"/>.
    /// The calculator's <see cref="AttendanceDayState.TotalBreakMinutes"/> covers
    /// the closed ones only, so somebody twenty minutes past their hour while
    /// still on it would otherwise read as inside the allowance.
    /// </summary>
    public int BreakMinutesTaken(AttendanceDayState state, DateTime nowUtc)
    {
        var open = state.OnBreakSince is { } since && state.CheckOutAt is null
            ? (int)Math.Max(0, (nowUtc - AttendanceDay.AsUtc(since)).TotalMinutes)
            : 0;
        return state.TotalBreakMinutes + open;
    }

    /// <summary>
    /// The break taken against <see cref="BreakMinutes"/>: positive minutes over
    /// the allowance, negative minutes under it, 0 on the allowance exactly, and
    /// null when there is nothing to say. There is nothing to say when no break
    /// is configured (a 0 allowance is "no policy", not "no breaks permitted"),
    /// and a shortfall is only news once the day is checked out of — ten minutes
    /// by mid-morning is not "fifty under", the lunch may still come. Going over
    /// is reported the moment it happens, running break included.
    /// </summary>
    public int? BreakVariance(AttendanceDayState state, DateTime nowUtc)
    {
        if (BreakMinutes == 0) return null;
        var variance = BreakMinutesTaken(state, nowUtc) - BreakMinutes;
        if (variance > 0) return variance;
        return state.Status == AttendanceDayStatus.Done ? variance : null;
    }

    /// <summary>The start plus a grace, as "HH:mm", for the wording beside a flag.</summary>
    public string StartPlus(int graceMinutes) => Start.AddMinutes(graceMinutes).ToString("HH:mm");
}
