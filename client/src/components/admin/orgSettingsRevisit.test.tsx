import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../../lib/types'
import OrgSettingsPanel from './OrgSettingsPanel'

/*
 * The revisit case, for Notification Settings. Leave Settings forgot the working week
 * whenever an admin came back to it (see appSettingsRevisit.test.tsx); this panel seeds
 * its form from the cached settings rather than from a constant, which is what keeps
 * it from doing the same. Pinned here so the two panels cannot drift apart.
 */
vi.mock('../../lib/api', () => ({
    getAppSettings: vi.fn(),
    updateAppSettings: vi.fn(),
    resetReminders: vi.fn(),
}))

const api = vi.mocked(await import('../../lib/api'))

// Nothing here is a factory default, so a default leaking through is visible.
const SETTINGS: AppSettings = {
    leaveYearStartMonth: 4,
    autoRunRollover: false,
    sendYearEndWarningEmails: false,
    blockLeaveSpanningIntoNextYear: false,
    notifyManagersOfTeamExpiries: true,
    holidayCountryCode: 'CY',
    holidayCountryName: 'Cyprus',
    workingHoursStart: '08:30',
    workingHoursEnd: '17:15',
    timeZoneId: 'Asia/Nicosia',
    financialYearStartMonth: 4,
    workingDays: 'mon-sat',
    workingDaysCustom: 'mon,tue,wed,thu,fri',
    weeklyHoursTarget: 37,
    timesheetSubmissionDeadlineDay: 'thu',
    timesheetSubmissionDeadlineTime: '16:00',
    emailNotificationsEnabled: false,
    emailDailyDigest: false,
    emailUrgentOnly: true,
    reminders: [
        { id: 'pending-approvals', enabled: true, time: '07:45', frequency: 'weekly' },
        { id: 'low-balance', enabled: false, time: '10:00', frequency: 'weekly' },
    ],
}

beforeEach(() => {
    vi.clearAllMocks()
    api.getAppSettings.mockResolvedValue(SETTINGS)
    api.updateAppSettings.mockResolvedValue(SETTINGS)
})

function renderPanel(queryClient: QueryClient) {
    return render(<QueryClientProvider client={queryClient}><OrgSettingsPanel /></QueryClientProvider>)
}

function expectSavedValuesOnScreen() {
    expect(screen.getByText('1 of 2 enabled')).toBeInTheDocument()
    // The one enabled reminder shows its own time and frequency.
    expect(screen.getByDisplayValue('07:45')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Weekly', pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Notification emails' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Urgent alerts only' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Send year-end warning emails' })).not.toBeChecked()
}

describe('Notification Settings shows the saved reminders on a revisit', () => {
    it('shows the saved values on the first visit', async () => {
        renderPanel(new QueryClient({ defaultOptions: { queries: { retry: false } } }))
        await screen.findByText('🔔 Notification Settings')

        expectSavedValuesOnScreen()
    })

    it('still shows them after leaving the page and coming back', async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const first = renderPanel(queryClient)
        await screen.findByText('🔔 Notification Settings')
        first.unmount()

        renderPanel(queryClient)
        await screen.findByText('🔔 Notification Settings')

        expectSavedValuesOnScreen()
        expect(screen.getByRole('button', { name: /Save changes/ })).toBeDisabled()
    })

    it('edits made on the revisit are saved on top of the saved settings', async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const first = renderPanel(queryClient)
        await screen.findByText('🔔 Notification Settings')
        first.unmount()

        renderPanel(queryClient)
        await screen.findByText('🔔 Notification Settings')

        fireEvent.change(screen.getByDisplayValue('07:45'), { target: { value: '06:30' } })
        fireEvent.click(screen.getByRole('button', { name: /Save changes/ }))

        await waitFor(() => expect(api.updateAppSettings).toHaveBeenCalledTimes(1))
        const sent = api.updateAppSettings.mock.calls[0][0]
        expect(sent.reminders[0]).toEqual({ id: 'pending-approvals', enabled: true, time: '06:30', frequency: 'weekly' })
        expect(sent.emailUrgentOnly).toBe(true)
        expect(sent.workingHoursStart).toBe('08:30')
        expect(sent.timeZoneId).toBe('Asia/Nicosia')
    })
})
