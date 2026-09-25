import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../../lib/types'
import { describeReminderCalendar, reminderScheduleClause } from '../../lib/working-week'
import OrgSettingsPanel from './OrgSettingsPanel'

/*
 * Notification Settings follow Organization › Working Week: a reminder's time is read
 * on the org's time zone, nothing is sent on a weekend or public holiday, and a weekly
 * reminder goes out on the first working day of the week (ReminderSchedule on the
 * server). The panel used to say "Every day at 8:00 AM", which was also what the
 * scheduler did — on the server's own clock. Pinned here so the copy and the rule
 * cannot drift apart again.
 */
vi.mock('../../lib/api', () => ({
    getAppSettings: vi.fn(),
    updateAppSettings: vi.fn(),
    resetReminders: vi.fn(),
}))

const api = vi.mocked(await import('../../lib/api'))

const SETTINGS: AppSettings = {
    leaveYearStartMonth: 1,
    autoRunRollover: true,
    sendYearEndWarningEmails: true,
    blockLeaveSpanningIntoNextYear: true,
    notifyManagersOfTeamExpiries: false,
    holidayCountryCode: 'CY',
    holidayCountryName: 'Cyprus',
    workingHoursStart: '08:00',
    workingHoursEnd: '17:00',
    timeZoneId: 'Europe/Athens',
    financialYearStartMonth: 1,
    workingDays: 'mon-fri',
    workingDaysCustom: 'mon,tue,wed,thu,fri',
    breakMode: 'flexible',
    breakStart: '13:00',
    breakEnd: '14:00',
    breakMinutes: 60,
    weeklyHoursTarget: 40,
    timesheetSubmissionDeadlineDay: 'fri',
    timesheetSubmissionDeadlineTime: '18:00',
    emailNotificationsEnabled: true,
    emailDailyDigest: true,
    emailUrgentOnly: false,
    reminders: [
        { id: 'daily-attendance-report', enabled: true, time: '08:00', frequency: 'daily' },
        { id: 'late-submissions', enabled: true, time: '16:00', frequency: 'weekly' },
    ],
}

beforeEach(() => {
    vi.clearAllMocks()
    api.getAppSettings.mockResolvedValue(SETTINGS)
})

function renderPanel() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={queryClient}><OrgSettingsPanel /></QueryClientProvider>)
}

describe('Notification Settings say that reminders follow the Working Week', () => {
    it('names the working days, the holiday calendar and the time zone the reminders follow', async () => {
        renderPanel()
        expect(await screen.findByText(/Reminders go out on working days only \(Mon–Fri, skipping Cyprus public holidays\), at the time shown in Europe\/Athens \(GMT\+[23]\)\./)).toBeInTheDocument()
    })

    it('previews a daily reminder as every working day and a weekly one as the first working day of the week', async () => {
        renderPanel()
        expect(await screen.findByText('Every working day at 8:00 AM')).toBeInTheDocument()
        expect(screen.getByText('On the first working day of each week at 4:00 PM')).toBeInTheDocument()
        expect(screen.queryByText(/Every day at/)).not.toBeInTheDocument()
        expect(screen.queryByText(/Once a week at/)).not.toBeInTheDocument()
    })
})

describe('the working-week wording', () => {
    it('describes a custom week by its days and a workspace with no holiday country without one', () => {
        const custom = describeReminderCalendar({ ...SETTINGS, workingDays: 'custom', workingDaysCustom: 'tue,wed,thu,fri,sat', holidayCountryCode: null, holidayCountryName: null, timeZoneId: 'UTC' })
        expect(custom).toBe('Reminders go out on working days only (Tue, Wed, Thu, Fri, Sat), at the time shown in UTC (GMT).')
    })

    it('falls back to the country code when the name is not known', () => {
        expect(describeReminderCalendar({ ...SETTINGS, holidayCountryName: null, timeZoneId: 'UTC' }))
            .toContain('skipping CY public holidays')
    })

    it('reads a malformed time back as typed', () => {
        expect(reminderScheduleClause({ time: 'noon', frequency: 'daily' })).toBe('Every working day at noon')
    })
})
