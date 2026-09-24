namespace Domain;

public class AppSettings
{
    public int Id { get; set; }

    public int LeaveYearStartMonth { get; set; } = 1;
    // The carryover cap moved to LeaveType.MaxCarryoverDays, beside the allowance it
    // caps -- see migration MoveCarryoverCapToLeaveType.
    // YearEndWarningDays and FinalWarningDays were here too: editable on Leave
    // Settings, read by nothing but that same page's schedule preview -- two knobs
    // that moved a caption and no behaviour. They are fixed points of the rollover
    // now, stated by the client (migration RemoveAppSettingsWarningDays).
    public bool AutoRunRollover { get; set; } = true;
    public bool SendYearEndWarningEmails { get; set; } = true;
    public bool BlockLeaveSpanningIntoNextYear { get; set; } = true;
    public bool NotifyManagersOfTeamExpiries { get; set; } = true;

    public string? HolidayCountryCode { get; set; }
    public string? HolidayCountryName { get; set; }

    // ── Organization settings ──────────────────────────────────────────────
    // Stored as "HH:mm" strings (display/config only — no scheduler consumes
    // them yet). Serve as the org-wide defaults for attendance/check-in.
    public string WorkingHoursStart { get; set; } = "09:00";
    public string WorkingHoursEnd { get; set; } = "18:00";
    public string TimeZoneId { get; set; } = "UTC";
    public int FinancialYearStartMonth { get; set; } = 1;
    // "mon-fri" | "mon-sat" | "sun-fri" | "custom"
    public string WorkingDays { get; set; } = "mon-fri";
    // Only consulted when WorkingDays == "custom": CSV of day tokens
    // ("mon,tue,wed,thu,fri,sat,sun") that count as working days.
    public string WorkingDaysCustom { get; set; } = "mon,tue,wed,thu,fri";

    // ── The break ──────────────────────────────────────────────────────────
    // "none" | "fixed" | "flexible". The working day the attendance rules measure
    // against (WorkingDaySchedule.ScheduledMinutes) is WorkingHoursStart..End net
    // of this break, so 08:00–17:00 with an hour's lunch is an eight-hour day.
    // Nothing here pauses anyone: employees still record their own breaks; this
    // says how long a break the day allows for, and (fixed) when it falls.
    public string BreakMode { get; set; } = "none";
    // Only consulted when BreakMode == "fixed": the window, "HH:mm" local, inside
    // the working hours.
    public string BreakStart { get; set; } = "13:00";
    public string BreakEnd { get; set; } = "14:00";
    // Only consulted when BreakMode == "flexible": how long, taken whenever.
    public int BreakMinutes { get; set; }

    // ── Timesheet policy ───────────────────────────────────────────────────
    // Target hours an employee is expected to log per week (drives the
    // under/on-target colouring on the timesheet review page).
    public int WeeklyHoursTarget { get; set; } = 40;
    // The day (week-token "mon".."sun") and "HH:mm" UTC time by which a
    // timesheet must be submitted to count as on-time. Default: Friday 18:00.
    public string TimesheetSubmissionDeadlineDay { get; set; } = "fri";
    public string TimesheetSubmissionDeadlineTime { get; set; } = "18:00";

    // ── Email notification preferences ─────────────────────────────────────
    public bool EmailNotificationsEnabled { get; set; } = true;
    public bool EmailDailyDigest { get; set; } = true;
    public bool EmailUrgentOnly { get; set; }

    // ── Reminders ──────────────────────────────────────────────────────────
    // Serialized JSON list of ReminderSetting (id/enabled/time/frequency).
    // Empty string means "use defaults". Kept as a single column because the
    // settings row is a singleton and the shape is small and read together.
    public string RemindersJson { get; set; } = string.Empty;
}
