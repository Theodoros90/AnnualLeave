import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StoreProvider } from '../../lib/mobx'
import type { EmployeeProfile, Teammate, UserInfo } from '../../lib/types'
import ApplyLeavePage from './ApplyLeavePage'

/**
 * Coverage is mandatory for an Employee or a Manager, and the handover travels
 * with the nomination.
 *
 * Step 3 used to be "(optional)": a request with nobody covering submitted
 * happily, and the nominated colleague was told nothing beyond the dates. Now
 * the step is required for either role (`CoverageRule`, mirrored by
 * `lib/coverage.ts`), submit stays disabled until somebody is chosen, and once
 * they are the employee can leave them a note and a document — both of which go
 * into the payload, the document via its own upload endpoint. A System Administrator's own
 * request is the one exemption: they have no department to pick from.
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
    uploadCoverageHandover: vi.fn(),
    uploadLeaveEvidence: vi.fn(),
}))

const api = vi.mocked(await import('../../lib/api'))

const ANNUAL_LEAVE_TYPE = {
    id: 1, name: 'Annual Leave', requiresManagerApproval: true, isActive: true, affectsBalance: true,
    icon: '', colorKey: 'primary', description: '', paid: true, attachmentPolicy: 'None',
    defaultAllowance: 25, allowanceUnit: 'days/year', maxCarryoverDays: 0,
    perChildEntitlement: false, perChildTotalWeeks: 0, perChildWeeksPerYear: 0, childEligibleUntilAge: 0,
    accrualNotes: '', minNoticeDays: 0,
    maxConsecutiveDays: 0, halfDayAllowed: false, availableTo: 'Both',
} as const

const EMPLOYEE: UserInfo = {
    id: 'emp-1', userName: 'employee@worktrack.com', email: 'employee@worktrack.com',
    displayName: 'Andreas Georgiou', imageUrl: '', roles: ['Employee'], departmentId: 2,
}

const MANAGER: UserInfo = { ...EMPLOYEE, id: 'mgr-1', displayName: 'Nikos Manager', roles: ['Manager'] }

/** A System Administrator has no department, so the teammates list is empty for them. */
const ADMIN: UserInfo = { ...EMPLOYEE, id: 'adm-1', displayName: 'Chris System Administrator', roles: ['System Administrator'], departmentId: null }

const TEAMMATE: Teammate = { userId: 'u-delegate', displayName: 'Maria Ioannou', jobTitle: 'Accountant', departmentId: 2 }

function profileFor(user: UserInfo): EmployeeProfile {
    return {
        id: `pr-${user.id}`, userId: user.id, displayName: user.displayName, departmentId: user.departmentId ?? null,
        managerId: null, annualLeaveEntitlement: 25, leaveBalance: 25,
        jobTitle: null, employmentStartDate: null, createdAt: '2026-01-01T00:00:00',
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    api.getLeaveTypes.mockResolvedValue([ANNUAL_LEAVE_TYPE] as never)
    api.getAnnualLeaves.mockResolvedValue([])
    api.getHolidays.mockResolvedValue([])
    api.getAppSettings.mockResolvedValue({ leaveYearStartMonth: 1 } as never)
    api.getChildLeaveEntitlements.mockResolvedValue({
        leaveTypeId: null, leaveTypeName: '', eligibleChildCount: 0,
        totalRemainingDays: 0, thisYearCapDays: 0, thisYearRemainingDays: 0, children: [],
    } as never)
    api.createAnnualLeave.mockResolvedValue('new-leave-id' as never)
    api.uploadCoverageHandover.mockResolvedValue({ coverageAttachmentUrl: '/api/files/handover-1', fileName: 'handover.pdf' })
})

async function renderPage(user: UserInfo) {
    api.getEmployeeProfiles.mockResolvedValue([profileFor(user)])
    api.getTeammates.mockResolvedValue(user.departmentId == null ? [] : [TEAMMATE])

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
        <StoreProvider>
            <QueryClientProvider client={queryClient}>
                <ApplyLeavePage user={user} />
            </QueryClientProvider>
        </StoreProvider>,
    )
    await screen.findByRole('button', { name: /annual leave/i })
}

/** See ApplyLeavePage.test.tsx — weekend cells are not clickable. */
function consecutiveWeekdays() {
    const now = new Date()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const isWeekday = (day: number) => {
        const dow = new Date(now.getFullYear(), now.getMonth(), day).getDay()
        return dow !== 0 && dow !== 6
    }
    for (let day = 1; day < daysInMonth; day++) {
        if (isWeekday(day) && isWeekday(day + 1)) return [String(day), String(day + 1)] as const
    }
    throw new Error('No consecutive weekdays in the current month — impossible, but fail loudly.')
}

function pickDates() {
    const calendar = screen.getByText('Mon').parentElement!.parentElement!
    const [start, end] = consecutiveWeekdays()
    fireEvent.click(within(calendar).getByText(start))
    fireEvent.click(within(calendar).getByText(end))
}

/**
 * Matched by the subtitle, since "Choose a delegate" is also how the submit
 * button reads while cover is missing. Then waits for the picker dialog to have
 * gone: while it is open MUI marks the rest of the page aria-hidden, and role
 * queries against the form would find nothing.
 */
async function nominate() {
    fireEvent.click(screen.getByRole('button', { name: /click to pick a teammate/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Maria Ioannou/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await screen.findByLabelText(/handover note/i)
}

/**
 * Step 3's heading, where the required/optional label sits. Found by the label
 * because "Coverage" is also a row in the summary panel and "(optional)" also
 * sits on the Reason step.
 */
function coverageHeading() {
    const heading = screen.getAllByText('Coverage')
        .map((el) => el.parentElement!)
        .find((el) => /\((required|optional)\)/.test(el.textContent ?? ''))
    if (!heading) throw new Error('Step 3 heading not found')
    return heading
}

const submitButton = () => screen.getByRole('button', { name: /submit for approval|to continue/i })

describe('ApplyLeavePage — coverage is mandatory', () => {
    it('labels step 3 required for an employee and holds submit until somebody is nominated', async () => {
        await renderPage(EMPLOYEE)
        pickDates()

        expect(within(coverageHeading()).getByText('(required)')).toBeInTheDocument()
        await waitFor(() => expect(submitButton()).toHaveTextContent(/choose a delegate to continue/i))
        expect(submitButton()).toBeDisabled()

        await nominate()

        await waitFor(() => expect(submitButton()).toBeEnabled())
        expect(submitButton()).toHaveTextContent(/submit for approval/i)
    })

    it('holds a manager to the same rule', async () => {
        await renderPage(MANAGER)
        pickDates()

        expect(within(coverageHeading()).getByText('(required)')).toBeInTheDocument()
        await waitFor(() => expect(submitButton()).toBeDisabled())
    })

    it("exempts an admin's own request, who has nobody to pick from", async () => {
        await renderPage(ADMIN)
        pickDates()

        expect(within(coverageHeading()).getByText('(optional)')).toBeInTheDocument()
        await waitFor(() => expect(submitButton()).toBeEnabled())

        fireEvent.click(submitButton())

        await waitFor(() => expect(api.createAnnualLeave).toHaveBeenCalledTimes(1))
        expect(api.createAnnualLeave.mock.calls[0][0]).toMatchObject({ delegateId: undefined })
    })
})

describe('ApplyLeavePage — the handover travels with the nomination', () => {
    it('offers the note and the document only once somebody is nominated', async () => {
        await renderPage(EMPLOYEE)

        expect(screen.queryByLabelText(/handover note/i)).not.toBeInTheDocument()

        await nominate()

        expect(screen.getByLabelText(/handover note/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /attach a handover document/i })).toBeInTheDocument()
    })

    it('sends the delegate, the note and the uploaded document with the request', async () => {
        await renderPage(EMPLOYEE)
        pickDates()
        await nominate()

        fireEvent.change(screen.getByLabelText(/handover note/i), {
            target: { value: '  Client X calls on Tuesday; the deck is on the shared drive.  ' },
        })
        const file = new File(['%PDF-1.4'], 'handover.pdf', { type: 'application/pdf' })
        fireEvent.change(screen.getByTestId('handover-file-input'), { target: { files: [file] } })
        expect(await screen.findByText('handover.pdf')).toBeInTheDocument()

        fireEvent.click(await screen.findByRole('button', { name: /submit for approval/i }))

        await waitFor(() => expect(api.createAnnualLeave).toHaveBeenCalledTimes(1))
        expect(api.uploadCoverageHandover).toHaveBeenCalledWith(file)
        expect(api.createAnnualLeave.mock.calls[0][0]).toMatchObject({
            delegateId: TEAMMATE.userId,
            coverageNote: 'Client X calls on Tuesday; the deck is on the shared drive.',
            coverageAttachmentUrl: '/api/files/handover-1',
        })
    })

    it('sends no note and uploads nothing when the fields are left empty', async () => {
        await renderPage(EMPLOYEE)
        pickDates()
        await nominate()

        fireEvent.click(await screen.findByRole('button', { name: /submit for approval/i }))

        await waitFor(() => expect(api.createAnnualLeave).toHaveBeenCalledTimes(1))
        expect(api.uploadCoverageHandover).not.toHaveBeenCalled()
        expect(api.createAnnualLeave.mock.calls[0][0]).toMatchObject({
            delegateId: TEAMMATE.userId,
            coverageNote: undefined,
            coverageAttachmentUrl: undefined,
        })
    })
})
