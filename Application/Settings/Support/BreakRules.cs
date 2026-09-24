namespace Application.Settings.Support;

/// <summary>
/// What a valid break setting is, shared by <c>UpdateAppSettingsValidator</c> and
/// the handler's backstop so the two cannot disagree — the same arrangement as
/// <see cref="WorkingTimeFormat"/>.
///
/// A fixed break is a window strictly inside the working hours with a positive
/// length; a flexible one is a positive number of minutes shorter than the working
/// day. Both are judged against the working hours *in the same payload*, since the
/// admin edits them on one card and saves them together. When the working hours
/// themselves are not a valid day (inverted, or unparseable), the break rules pass
/// and leave the hours' own rules to complain: two errors about one typo help nobody.
/// </summary>
internal static class BreakRules
{
    public const string ModeMessage = "Break must be none, fixed or flexible.";
    public const string StartTimeMessage = "Break start must be a valid time (HH:mm).";
    public const string EndTimeMessage = "Break end must be a valid time (HH:mm).";
    public const string EndAfterStartMessage = "Break end must be after the break start.";
    public const string StartInsideMessage = "Break start must fall within the working hours.";
    public const string EndInsideMessage = "Break end must fall within the working hours.";
    public const string MinutesMessage = "Break length must be at least 1 minute and shorter than the working day.";

    public static bool EndsAfterStart(string breakStart, string breakEnd) =>
        TimeOnly.TryParse(breakStart, out var s) && TimeOnly.TryParse(breakEnd, out var e) && e > s;

    public static bool StartsInsideWorkingHours(string breakStart, string workStart, string workEnd)
    {
        if (!TryDay(workStart, workEnd, out var ws, out var we)) return true;
        return TimeOnly.TryParse(breakStart, out var s) && s >= ws && s < we;
    }

    public static bool EndsInsideWorkingHours(string breakEnd, string workStart, string workEnd)
    {
        if (!TryDay(workStart, workEnd, out var ws, out var we)) return true;
        return TimeOnly.TryParse(breakEnd, out var e) && e > ws && e <= we;
    }

    public static bool FitsTheDay(int breakMinutes, string workStart, string workEnd)
    {
        if (breakMinutes < 1) return false;
        if (!TryDay(workStart, workEnd, out var ws, out var we)) return true;
        return breakMinutes < (int)(we.ToTimeSpan() - ws.ToTimeSpan()).TotalMinutes;
    }

    private static bool TryDay(string workStart, string workEnd, out TimeOnly start, out TimeOnly end)
    {
        start = default;
        end = default;
        return TimeOnly.TryParse(workStart, out start) && TimeOnly.TryParse(workEnd, out end) && end > start;
    }
}
