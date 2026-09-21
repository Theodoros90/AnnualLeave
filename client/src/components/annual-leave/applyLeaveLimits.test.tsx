import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StoreProvider } from '../../lib/mobx'
import type { ChildLeaveEntitlementSummary, EmployeeProfile, UserInfo } from '../../lib/types'
import ApplyLeavePage from './ApplyLeavePage'

/**
 * `LeaveType.minNoticeDays` and `LeaveType.maxConsecutiveDays` reaching the apply
 * page.
 *
 * Both were display-only. The admin dialog saved them and the leave type's card
 * rendered "Minimum 7 days notice required" and "Max 15 consecutive days per
 * request", while this page ignored both: it warned "Short notice" below a
 * hardcoded seven days whatever the type asked for — a guess of the same kind as
 * the old `name.includes('sick')` attachment sniff — and never mentioned length at
 * all. So a type asking for 30 days notice said nothing, and a request twice as
 * long as its type allows submitted happily and came back refused.
 */
vi.mock('../../lib/api', () => ({
    createAnnualLeave: vi.fn(),
    getAnnualLeaves: vi.fn(),
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
    maxConsecutiveDays: 0, halfDayAllowed: true, eligibilityNotes: '', eligibilityScope: 'All', availableTo: 'Both',
} as const

/** A year of notice, so every cell in the month the calendar opens on is too soon. */
const LONG_NOTICE_TYPE = {
    ...ANNUAL_LEAVE_TYPE, id: 2, name: 'Sabbatical', colorKey: 'default',
    affectsBalance: false, minNoticeDays: 365,
} as const

/** One working day at a time, so any two-day range breaches it. */
const ONE_DAY_TYPE = {
    ...ANNUAL_LEAVE_TYPE, id: 3, name: 'Brief Leave', colorKey: 'personal',
    affectsBalance: false, maxConsecutiveDays: 1,
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
    api.getLeaveTypes.mockResolvedValue([ANNUAL_LEAVE_TYPE, LONG_NOTICE_TYPE, ONE_DAY_TYPE] as never)
    api.getEmployeeProfiles.mockResolvedValue([PROFILE])
    api.getAnnualLeaves.mockResolvedValue([])
    api.getTeammates.mockResolvedValue([])
    api.getHolidays.mockResolvedValue([])
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
    await screen.findByRole('button', { name: /brief leave/i })
}

/**
 * Two weekdays in the displayed (current) month, computed rather than hard-coded
 * because the calendar opens on whatever month today is in and weekend cells are
 * not clickable.
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

function clickDay(day: string) {
    const calendar = screen.getByText('Mon').parentElement!.parentElement!
    fireEvent.click(within(calendar).getByText(day))
}

function chooseType(name: RegExp) {
    fireEvent.click(screen.getByRole('button', { name }))
}

const workingDaysValue = () => screen.getByText('Working days').nextElementSibling?.textContent ?? ''

describe('ApplyLeavePage — the leave type decides when a request may start', () => {
    /**
     * The limit is part of the calendar, like weekends and public holidays, rather
     * than a refusal that waits for submit.
     */
    it('will not let a day inside the notice period be picked', async () => {
        await renderPage()
        const [first, second] = weekdays()

        chooseType(/sabbatical/i)
        // Both clicks, so the count would move to 2 if either landed. Clicking once
        // proves nothing: the first click only ever sets the start date, leaving
        // the range — and so the working-day count — empty either way.
        clickDay(first)
        clickDay(second)

        await waitFor(() => expect(workingDaysValue()).toBe('0'))
        expect(screen.queryByRole('button', { name: /submit for approval/i })).toBeNull()
    })

    /**
     * The route to a breach the calendar cannot prevent: pick the dates first, then
     * switch to a type that wants more notice than they leave.
     */
    it('refuses dates already picked once a type wanting notice is chosen', async () => {
        await renderPage()
        const [first, second] = weekdays()

        clickDay(first)
        clickDay(second)
        await screen.findByRole('button', { name: /submit for approval/i })

        chooseType(/sabbatical/i)

        expect(await screen.findByText(/sabbatical needs 365 days notice/i)).toBeInTheDocument()
        // The button names what is standing in the way, as it already does for a
        // missing child and a missing document.
        expect(await screen.findByRole('button', { name: /start later to continue/i })).toBeDisabled()
    })
})

describe('ApplyLeavePage — the leave type decides how long a request may run', () => {
    it('refuses a request longer than the type allows', async () => {
        await renderPage()
        const [first, second] = weekdays()

        chooseType(/brief leave/i)
        clickDay(first)
        clickDay(second)

        expect(
            await screen.findByText(/brief leave allows at most 1 working days per request/i),
        ).toBeInTheDocument()
        expect(
            await screen.findByRole('button', { name: /shorten the request to continue/i }),
        ).toBeDisabled()
    })

    it('allows a request that fits inside the maximum', async () => {
        await renderPage()
        const [first] = weekdays()

        chooseType(/brief leave/i)
        clickDay(first)
        clickDay(first)

        await waitFor(() =>
            expect(screen.getByRole('button', { name: /submit for approval/i })).toBeEnabled())
        expect(screen.queryByText(/allows at most/i)).toBeNull()
    })
})
