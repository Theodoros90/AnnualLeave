import type { AppSettings, ReminderSetting } from './types'

/*
 * The Working Week as the reminder schedule reads it. The server's rule is
 * Application/Settings/Support/WorkingWeek.cs and Application/Reminders/ReminderSchedule.cs:
 * every reminder's time is read on the Organization time zone's clock, nothing is sent
 * on a non-working day (weekday preset plus public holidays), and a weekly reminder
 * goes out on the first working day of the week. The wording here is what Notification
 * Settings shows beside each reminder, so an admin can tell that the schedule follows
 * Organization › Working Week rather than the server's own clock and calendar.
 */

// "Europe/London (GMT+1)" reads better than the id alone, and the offset is the
// one thing an admin picking between two nearby zones actually wants to know.
// Intl is the same tz database the browser keeps its clock by; an id it does
// not know falls back to the bare id rather than throwing during render.
export function timeZoneLabel(id: string): string {
    try {
        const part = new Intl.DateTimeFormat('en-GB', { timeZone: id, timeZoneName: 'shortOffset' })
            .formatToParts(new Date())
            .find((p) => p.type === 'timeZoneName')?.value
        return part ? `${id} (${part})` : id
    } catch {
        return id
    }
}

export function describeWorkingDays(workingDays: string, custom: string): string {
    switch (workingDays) {
        case 'mon-fri': return 'Mon–Fri'
        case 'mon-sat': return 'Mon–Sat'
        case 'sun-fri': return 'Sun–Fri'
        case 'custom': return custom ? custom.split(',').filter((d) => d.trim()).map((d) => d.trim().charAt(0).toUpperCase() + d.trim().slice(1, 3)).join(', ') : 'Custom'
        default: return workingDays
    }
}

export function formatReminderTime(hhmm: string): string {
    const [h, m] = (hhmm ?? '').split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) return hhmm
    const period = h < 12 ? 'AM' : 'PM'
    const hour12 = h % 12 === 0 ? 12 : h % 12
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

/** The opening clause of a reminder's preview line: when it goes out. */
export function reminderScheduleClause(r: Pick<ReminderSetting, 'time' | 'frequency'>): string {
    return r.frequency === 'daily'
        ? `Every working day at ${formatReminderTime(r.time)}`
        : `On the first working day of each week at ${formatReminderTime(r.time)}`
}

/** One sentence saying which calendar and clock the reminder times follow. */
export function describeReminderCalendar(s: Pick<AppSettings, 'timeZoneId' | 'workingDays' | 'workingDaysCustom' | 'holidayCountryName' | 'holidayCountryCode'>): string {
    const days = describeWorkingDays(s.workingDays, s.workingDaysCustom)
    const country = s.holidayCountryName ?? s.holidayCountryCode
    const holidays = country ? `, skipping ${country} public holidays` : ''
    return `Reminders go out on working days only (${days}${holidays}), at the time shown in ${timeZoneLabel(s.timeZoneId)}.`
}
