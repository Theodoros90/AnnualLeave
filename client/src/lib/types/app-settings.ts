export type ReminderFrequency = 'daily' | 'weekly'

export interface ReminderSetting {
    id: string
    enabled: boolean
    time: string // "HH:mm"
    frequency: ReminderFrequency
}

export interface AppSettings {
    leaveYearStartMonth: number
    autoRunRollover: boolean
    sendYearEndWarningEmails: boolean
    blockLeaveSpanningIntoNextYear: boolean
    notifyManagersOfTeamExpiries: boolean
    holidayCountryCode: string | null
    holidayCountryName: string | null

    // Organization
    workingHoursStart: string // "HH:mm"
    workingHoursEnd: string // "HH:mm"
    timeZoneId: string
    financialYearStartMonth: number
    workingDays: string // "mon-fri" | "mon-sat" | "sun-fri" | "custom"
    workingDaysCustom: string // CSV of day tokens, e.g. "mon,wed,fri" (used when workingDays === "custom")

    // The break the working day allows for. `lib/break-policy.ts` reads these the
    // way the server's WorkingDaySchedule does: the window in fixed mode, the
    // duration in flexible mode, nothing otherwise.
    breakMode: 'none' | 'fixed' | 'flexible'
    breakStart: string // "HH:mm", read when breakMode === "fixed"
    breakEnd: string // "HH:mm", read when breakMode === "fixed"
    breakMinutes: number // read when breakMode === "flexible"

    // Timesheet policy
    weeklyHoursTarget: number // expected hours logged per week
    timesheetSubmissionDeadlineDay: string // week token "mon".."sun"
    timesheetSubmissionDeadlineTime: string // "HH:mm" (UTC)

    // Email notifications
    emailNotificationsEnabled: boolean
    emailDailyDigest: boolean
    emailUrgentOnly: boolean

    // Reminders
    reminders: ReminderSetting[]
}
