import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../../lib/types'
import AppSettingsPanel from './AppSettingsPanel'

/*
 * The break is configured in the Working Week section: off, a fixed window (a start
 * and an end inside the working hours), or a flexible allowance (hours and minutes,
 * taken whenever). The mode decides which fields are shown, every mode's fields
 * travel in the organization card's payload, and the card's Reset puts the break
 * back to off with the rest of the working week.
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

const SETTINGS: AppSettings = {
    leaveYearStartMonth: 1,
    autoRunRollover: true,
    sendYearEndWarningEmails: true,
    blockLeaveSpanningIntoNextYear: true,
    notifyManagersOfTeamExpiries: true,
    holidayCountryCode: 'CY',
    holidayCountryName: 'Cyprus',
    workingHoursStart: '08:00',
    workingHoursEnd: '17:00',
    timeZoneId: 'UTC',
    financialYearStartMonth: 1,
    workingDays: 'mon-fri',
    workingDaysCustom: 'mon,tue,wed,thu,fri',
    breakMode: 'fixed',
    breakStart: '12:30',
    breakEnd: '13:15',
    breakMinutes: 0,
    weeklyHoursTarget: 40,
    timesheetSubmissionDeadlineDay: 'fri',
    timesheetSubmissionDeadlineTime: '18:00',
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

async function renderPanel(settings: AppSettings = SETTINGS) {
    api.getAppSettings.mockResolvedValue(settings)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><AppSettingsPanel /></QueryClientProvider>)
    await screen.findByText('Leave Year Configuration')
}

async function chooseBreakMode(label: string) {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Break' }))
    fireEvent.click(await screen.findByRole('option', { name: label }))
}

describe('the break is configured with the working week', () => {
    it('shows the saved fixed window', async () => {
        await renderPanel()

        expect(screen.getByRole('combobox', { name: 'Break' })).toHaveTextContent('Fixed time')
        expect(screen.getByLabelText('Break start')).toHaveValue('12:30')
        expect(screen.getByLabelText('Break end')).toHaveValue('13:15')
        expect(screen.queryByLabelText('Break hours')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Break minutes')).not.toBeInTheDocument()
    })

    it('shows the saved flexible allowance as hours and minutes', async () => {
        await renderPanel({ ...SETTINGS, breakMode: 'flexible', breakMinutes: 90 })

        expect(screen.getByRole('combobox', { name: 'Break' })).toHaveTextContent('Flexible')
        expect(screen.getByLabelText('Break hours')).toHaveValue(1)
        expect(screen.getByLabelText('Break minutes')).toHaveValue(30)
        expect(screen.queryByLabelText('Break start')).not.toBeInTheDocument()
    })

    it('shows no break fields while the break is off', async () => {
        await renderPanel({ ...SETTINGS, breakMode: 'none' })

        expect(screen.getByRole('combobox', { name: 'Break' })).toHaveTextContent('No break')
        expect(screen.queryByLabelText('Break start')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Break hours')).not.toBeInTheDocument()
    })

    it('saves a flexible allowance as minutes, with the mode', async () => {
        await renderPanel({ ...SETTINGS, breakMode: 'none' })

        await chooseBreakMode('Flexible')
        fireEvent.change(screen.getByLabelText('Break hours'), { target: { value: '1' } })
        fireEvent.change(screen.getByLabelText('Break minutes'), { target: { value: '15' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

        await waitFor(() => expect(api.updateAppSettings).toHaveBeenCalledTimes(1))
        const sent = api.updateAppSettings.mock.calls[0][0]
        expect(sent.breakMode).toBe('flexible')
        expect(sent.breakMinutes).toBe(75)
    })

    it('saves a fixed window, with the mode', async () => {
        await renderPanel({ ...SETTINGS, breakMode: 'none' })

        await chooseBreakMode('Fixed time')
        fireEvent.change(screen.getByLabelText('Break start'), { target: { value: '13:00' } })
        fireEvent.change(screen.getByLabelText('Break end'), { target: { value: '13:45' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

        await waitFor(() => expect(api.updateAppSettings).toHaveBeenCalledTimes(1))
        const sent = api.updateAppSettings.mock.calls[0][0]
        expect(sent.breakMode).toBe('fixed')
        expect(sent.breakStart).toBe('13:00')
        expect(sent.breakEnd).toBe('13:45')
    })

    it('holds Save while a fixed window does not fit the working hours', async () => {
        await renderPanel()

        fireEvent.change(screen.getByLabelText('Break end'), { target: { value: '12:00' } })
        expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
        expect(screen.getByText('Break end must be after the break start.')).toBeInTheDocument()

        fireEvent.change(screen.getByLabelText('Break end'), { target: { value: '17:30' } })
        expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
        expect(screen.getByText('Break end must fall within the working hours.')).toBeInTheDocument()

        fireEvent.change(screen.getByLabelText('Break end'), { target: { value: '13:30' } })
        expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled()
    })

    it('holds Save while a flexible allowance is empty', async () => {
        await renderPanel({ ...SETTINGS, breakMode: 'flexible', breakMinutes: 30 })

        fireEvent.change(screen.getByLabelText('Break minutes'), { target: { value: '0' } })
        expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
        expect(screen.getByText('Break length must be at least 1 minute and shorter than the working day.')).toBeInTheDocument()
    })

    it('resets the break to off with the rest of the working week', async () => {
        await renderPanel()

        fireEvent.click(screen.getByRole('button', { name: 'Reset working week & policy' }))

        expect(screen.getByRole('combobox', { name: 'Break' })).toHaveTextContent('No break')
        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

        await waitFor(() => expect(api.updateAppSettings).toHaveBeenCalledTimes(1))
        expect(api.updateAppSettings.mock.calls[0][0].breakMode).toBe('none')
    })
})
