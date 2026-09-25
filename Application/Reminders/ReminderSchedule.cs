using Application.Settings.DTOs;

namespace Application.Reminders;

/// <summary>Why a reminder is, or is not, due on this tick.</summary>
public enum ReminderDueState
{
    Due,
    Disabled,
    InvalidTime,
    NotWorkingDay,
    NotFirstWorkingDayOfWeek,
    NotYet,
    AlreadyRanToday,
}

/// <summary>
/// The pure part of the reminder schedule: given one reminder's settings and what
/// the org's calendar says about today, is it time to send it? The clock and the
/// calendar are inputs, so the rule is testable without a timer.
///
/// Every reminder — daily or weekly — is sent on working days only, as the
/// Organization settings' Working Week defines them (weekday preset plus public
/// holidays), and its time is read on the org's own clock
/// (<c>AppSettings.TimeZoneId</c>). A weekly reminder goes out on the first working
/// day of the week, so a Monday bank holiday moves it to Tuesday rather than
/// skipping the week. The scheduler used to fire on the server's local clock
/// every day of the year, and on Monday alone for weekly ones.
/// </summary>
public static class ReminderSchedule
{
    public const string Weekly = "weekly";

    /// <param name="reminder">The reminder as configured.</param>
    /// <param name="localNow">The time of day on the org's clock.</param>
    /// <param name="today">Today's date on the org's clock.</param>
    /// <param name="todayIsWorkingDay">Whether <paramref name="today"/> is a working day for the org.</param>
    /// <param name="firstWorkingDayOfWeek">The first working day of this week, or null if there has been none yet.</param>
    /// <param name="lastRun">The local date the reminder last went out, if it has this process lifetime.</param>
    public static ReminderDueState Evaluate(
        ReminderSettingDto reminder,
        TimeOnly localNow,
        DateOnly today,
        bool todayIsWorkingDay,
        DateOnly? firstWorkingDayOfWeek,
        DateOnly? lastRun)
    {
        if (!reminder.Enabled) return ReminderDueState.Disabled;
        if (!TimeOnly.TryParse(reminder.Time, out var scheduled)) return ReminderDueState.InvalidTime;
        if (!todayIsWorkingDay) return ReminderDueState.NotWorkingDay;
        if (reminder.Frequency == Weekly && firstWorkingDayOfWeek != today) return ReminderDueState.NotFirstWorkingDayOfWeek;
        if (localNow < scheduled) return ReminderDueState.NotYet;
        if (lastRun == today) return ReminderDueState.AlreadyRanToday;
        return ReminderDueState.Due;
    }
}
