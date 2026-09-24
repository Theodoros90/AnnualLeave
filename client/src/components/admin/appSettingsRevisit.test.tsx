import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../../lib/types'
import AppSettingsPanel from './AppSettingsPanel'

/*
 * Leave Settings looked like it forgot the working week whenever an admin came back to
 * it: every field in the Working Week & Policy card read the hardcoded default (09:00,
 * 18:00, UTC, Monday–Friday) rather than what was saved, and Save Changes lit up
 * offering to write those defaults over the real settings.
 *
 * The first visit was fine. On a revisit react-query hands the cached settings over
 * synchronously, so the "has `saved` changed since last render" sync that copies them
 * into the form never fires — it was primed with the very object it was waiting for —
 * and the form keeps the defaults it was seeded with.
 */
vi.mock('../../lib/api', () => ({
    getAppSettings: vi.fn(),
    getDepartments: vi.fn(),
    getEmployeeProfiles: vi.fn(),
    getHolidayCountries: vi.fn(),
    getLeaveTypes: vi.fn(),
    updateAppSettings: vi.fn(),
}))

const api = vi.mocked(await import('../../lib/api'))

// Nothing here is the panel's default, so a default leaking through is visible.
const SETTINGS: AppSettings = {
    leaveYearStartMonth: 4,
    autoRunRollover: false,
    sendYearEndWarningEmails: true,
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
    breakMode: 'none',
    breakStart: '13:00',
    breakEnd: '14:00',
    breakMinutes: 0,
    weeklyHoursTarget: 37,
    timesheetSubmissionDeadlineDay: 'thu',
    timesheetSubmissionDeadlineTime: '16:00',
    emailNotificationsEnabled: true,
    emailDailyDigest: true,
    emailUrgentOnly: false,
    reminders: [],
}

beforeEach(() => {
    vi.clearAllMocks()
    api.getAppSettings.mockResolvedValue(SETTINGS)
    api.getDepartments.mockResolvedValue([])
    api.getEmployeeProfiles.mockResolvedValue([])
    api.getHolidayCountries.mockResolvedValue([])
    api.getLeaveTypes.mockResolvedValue([])
    api.updateAppSettings.mockResolvedValue(SETTINGS)
})

function expectSavedValuesOnScreen() {
    expect(screen.getByLabelText('Working hours start')).toHaveValue('08:30')
    expect(screen.getByLabelText('Working hours end')).toHaveValue('17:15')
    // MUI's Select renders the choice as text on a combobox div, not as an input value.
    expect(screen.getByRole('combobox', { name: 'Timezone' })).toHaveTextContent('Asia/Nicosia')
    expect(screen.getByRole('combobox', { name: 'Working days' })).toHaveTextContent('Monday – Saturday (6-day week)')
    expect(screen.getByLabelText('Weekly hours target')).toHaveValue(37)
}

describe('Leave Settings shows the saved working week on a revisit', () => {
    it('shows the saved values on the first visit', async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        render(<QueryClientProvider client={queryClient}><AppSettingsPanel /></QueryClientProvider>)
        await screen.findByText('Leave Year Configuration')

        expectSavedValuesOnScreen()
    })

    it('still shows them after leaving the page and coming back', async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const first = render(<QueryClientProvider client={queryClient}><AppSettingsPanel /></QueryClientProvider>)
        await screen.findByText('Leave Year Configuration')
        first.unmount()

        // Same query client, as the app keeps one across navigation: the settings are
        // now cached, and the panel receives them on its very first render.
        render(<QueryClientProvider client={queryClient}><AppSettingsPanel /></QueryClientProvider>)
        await screen.findByText('Leave Year Configuration')

        expectSavedValuesOnScreen()
        // And nothing is dirty, so the card is not offering to save the defaults back.
        expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Save Settings' })).toBeDisabled()
    })

    it('edits made on the revisit are saved on top of the saved settings, not the defaults', async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const first = render(<QueryClientProvider client={queryClient}><AppSettingsPanel /></QueryClientProvider>)
        await screen.findByText('Leave Year Configuration')
        first.unmount()

        render(<QueryClientProvider client={queryClient}><AppSettingsPanel /></QueryClientProvider>)
        await screen.findByText('Leave Year Configuration')

        fireEvent.change(screen.getByLabelText('Working hours start'), { target: { value: '07:45' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

        await waitFor(() => expect(api.updateAppSettings).toHaveBeenCalledTimes(1))
        const sent = api.updateAppSettings.mock.calls[0][0]
        expect(sent.workingHoursStart).toBe('07:45')
        expect(sent.workingHoursEnd).toBe('17:15')
        expect(sent.timeZoneId).toBe('Asia/Nicosia')
        expect(sent.workingDays).toBe('mon-sat')
    })
})
