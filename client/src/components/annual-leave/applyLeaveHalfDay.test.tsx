import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StoreProvider } from '../../lib/mobx'
import type { ChildLeaveEntitlementSummary, EmployeeProfile, UserInfo } from '../../lib/types'
import ApplyLeavePage from './ApplyLeavePage'

/**
 * Half days used to be a pair of buttons and nothing else.
 *
 * Selecting "Half day (PM)" and clicking one date left the form reading
 * "End date —, Working days 0, Days deducted 0" with submit disabled, because the
 * calendar's first click always sets the start and clears the end — right for a
 * range, wrong for a half day, which covers exactly one date. The only way forward
 * was to click the same cell twice, and even then the payload carried no duration,
 * so the server stored and charged a whole day against the 0.5 the summary panel
 * had just promised.
 *
 * `LeaveType.halfDayAllowed` was likewise saved by the admin dialog, rendered as a
 * badge on the type's card, and read by nothing here: the AM and PM buttons showed
 * for every type either way.
 */
vi.mock('../../lib/api', () => ({
    createAnnualLeave: vi.fn(),
    getAnnualLeaves: vi.fn(),
    getAppSettings: vi.fn(),
    getChildLeaveEntitlements: vi.fn(),
    getEmployeeProfiles: vi.fn(),
    getHolidays: vi.fn(),
    getLeaveTypes: vi.fn(),
    getTeammates: vi.fn(),
    uploadLeaveEvidence: vi.fn(),
}))

const api = vi.mocked(await import('../../lib/api'))

const ANNUAL_LEAVE_TYPE = {
    id: 1, name: 'Annual Leave', requiresApproval: true, isActive: true, affectsBalance: true,
    icon: '', colorKey: 'primary', description: '', paid: true, attachmentPolicy: 'None',
    defaultAllowance: 23, allowanceUnit: 'days/year', maxCarryoverDays: 0,
    perChildEntitlement: false, perChildTotalWeeks: 0, perChildWeeksPerYear: 0, childEligibleUntilAge: 0,
    accrualNotes: '', minNoticeDays: 0,
    maxConsecutiveDays: 0, halfDayAllowed: true, availableTo: 'Both',
} as const

/** As seeded: Unpaid Leave is one of the types an admin has switched half days off for. */
const FULL_DAY_ONLY_TYPE = {
    ...ANNUAL_LEAVE_TYPE, id: 2, name: 'Unpaid Leave', colorKey: 'unpaid',
    affectsBalance: false, halfDayAllowed: false,
} as const

const USER: UserInfo = {
    id: 'emp-1', userName: 'employee@worktrack.com', email: 'employee@worktrack.com',
    displayName: 'Andreas Georgiou', imageUrl: '', roles: ['Employee'], departmentId: 2,
}

const PROFILE: EmployeeProfile = {
    id: 'pr1', userId: USER.id, displayName: USER.displayName, departmentId: 2,
    managerId: null, annualLeaveEntitlement: 23, leaveBalance: 23,
    jobTitle: null, employmentStartDate: null, createdAt: '2026-01-01T00:00:00',
}

const NO_CHILDREN: ChildLeaveEntitlementSummary = {
    leaveTypeId: null, leaveTypeName: '', eligibleChildCount: 0,
    totalRemainingDays: 0, thisYearCapDays: 0, thisYearRemainingDays: 0, children: [],
}

beforeEach(() => {
    vi.clearAllMocks()
    api.getLeaveTypes.mockResolvedValue([ANNUAL_LEAVE_TYPE, FULL_DAY_ONLY_TYPE] as never)
    api.getEmployeeProfiles.mockResolvedValue([PROFILE])
    api.getAnnualLeaves.mockResolvedValue([])
    api.getTeammates.mockResolvedValue([])
    api.getHolidays.mockResolvedValue([])
    api.getAppSettings.mockResolvedValue({ leaveYearStartMonth: 1 } as never)
    api.getChildLeaveEntitlements.mockResolvedValue(NO_CHILDREN)
    api.createAnnualLeave.mockResolvedValue('new-leave-id' as never)
})

async function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
        <StoreProvider>
            <QueryClientProvider client={queryClient}>
                <ApplyLeavePage user={USER} />
            </QueryClientProvider>
        </StoreProvider>,
    )
    await screen.findByRole('button', { name: /unpaid leave/i })
}

/**
 * The first weekday in the displayed (current) month, and the next one after it.
 * Computed rather than hard-coded because the calendar opens on whatever month
 * today is in, and weekend cells are not clickable.
 */
function weekdays() {
    const now = new Date()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const found: string[] = []
    for (let day = 1; day <= daysInMonth && found.length < 2; day++) {
        const dow = new Date(now.getFullYear(), now.getMonth(), day).getDay()
        if (dow !== 0 && dow !== 6) found.push(String(day))
    }
    if (found.length < 2) throw new Error('Fewer than two weekdays in the month — impossible, but fail loudly.')
    return found as [string, string]
}

/** Day cells are plain divs holding the day number, so scope the query to the calendar. */
function clickDay(day: string) {
    const calendar = screen.getByText('Mon').parentElement!.parentElement!
    fireEvent.click(within(calendar).getByText(day))
}

const summary = () => screen.getByText('Days deducted').closest('div')!.parentElement!

describe('ApplyLeavePage — half days', () => {
    /**
     * The reported bug, end to end: one click, one date, submit enabled.
     */
    it('takes a single click to book a half day', async () => {
        await renderPage()
        const [first] = weekdays()

        fireEvent.click(screen.getByRole('button', { name: 'Half day (PM)' }))
        clickDay(first)

        await waitFor(() =>
            expect(screen.getByRole('button', { name: /submit for approval/i })).toBeEnabled())
    })

    it('deducts half a day for a half day', async () => {
        await renderPage()
        const [first] = weekdays()

        fireEvent.click(screen.getByRole('button', { name: 'Half day (AM)' }))
        clickDay(first)

        await waitFor(() => expect(within(summary()).getByText('0.5')).toBeInTheDocument())
    })

    it('sends the chosen half to the server', async () => {
        await renderPage()
        const [first] = weekdays()

        fireEvent.click(screen.getByRole('button', { name: 'Half day (PM)' }))
        clickDay(first)
        fireEvent.click(await screen.findByRole('button', { name: /submit for approval/i }))

        await waitFor(() => expect(api.createAnnualLeave).toHaveBeenCalledTimes(1))
        expect(api.createAnnualLeave.mock.calls[0][0]).toMatchObject({
            duration: 'HalfDayAfternoon',
        })
    })

    it('sends a full day as a full day', async () => {
        await renderPage()
        const [first, second] = weekdays()

        clickDay(first)
        clickDay(second)
        fireEvent.click(await screen.findByRole('button', { name: /submit for approval/i }))

        await waitFor(() => expect(api.createAnnualLeave).toHaveBeenCalledTimes(1))
        expect(api.createAnnualLeave.mock.calls[0][0]).toMatchObject({ duration: 'Full' })
    })

    /**
     * A half day already picked, then the range widened: the end date has to come
     * back to the start, or the form would post a week calling itself a half day —
     * which `HalfDayRule` refuses.
     */
    it('keeps a half day on one date when a second is clicked', async () => {
        await renderPage()
        const [first, second] = weekdays()

        fireEvent.click(screen.getByRole('button', { name: 'Half day (AM)' }))
        clickDay(first)
        clickDay(second)
        fireEvent.click(await screen.findByRole('button', { name: /submit for approval/i }))

        await waitFor(() => expect(api.createAnnualLeave).toHaveBeenCalledTimes(1))
        const sent = api.createAnnualLeave.mock.calls[0][0] as { startDate: string; endDate: string }
        expect(sent.endDate).toBe(sent.startDate)
    })

    /** Switching to a half day narrows a range already picked down to its first date. */
    it('collapses a range already picked when a half day is chosen', async () => {
        await renderPage()
        const [first, second] = weekdays()

        clickDay(first)
        clickDay(second)
        fireEvent.click(screen.getByRole('button', { name: 'Half day (PM)' }))
        fireEvent.click(await screen.findByRole('button', { name: /submit for approval/i }))

        await waitFor(() => expect(api.createAnnualLeave).toHaveBeenCalledTimes(1))
        const sent = api.createAnnualLeave.mock.calls[0][0] as { startDate: string; endDate: string }
        expect(sent.endDate).toBe(sent.startDate)
    })

    describe('a type that does not allow half days', () => {
        it('offers no half-day buttons', async () => {
            await renderPage()

            fireEvent.click(screen.getByRole('button', { name: /unpaid leave/i }))

            await waitFor(() =>
                expect(screen.queryByRole('button', { name: 'Half day (AM)' })).not.toBeInTheDocument())
            expect(screen.queryByRole('button', { name: 'Half day (PM)' })).not.toBeInTheDocument()
        })

        /**
         * Switching type must not leave a half day selected behind a control that
         * is no longer on screen, or the request posts a duration the server
         * refuses with nothing visible to explain it — the same trap the
         * attachment section has when its policy moves to None.
         */
        it('drops a half day already chosen', async () => {
            await renderPage()
            const [first, second] = weekdays()

            fireEvent.click(screen.getByRole('button', { name: 'Half day (AM)' }))
            fireEvent.click(screen.getByRole('button', { name: /unpaid leave/i }))
            clickDay(first)
            clickDay(second)
            fireEvent.click(await screen.findByRole('button', { name: /submit for approval/i }))

            await waitFor(() => expect(api.createAnnualLeave).toHaveBeenCalledTimes(1))
            expect(api.createAnnualLeave.mock.calls[0][0]).toMatchObject({ duration: 'Full' })
        })
    })
})
