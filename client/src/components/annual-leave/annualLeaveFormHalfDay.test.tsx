import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StoreProvider } from '../../lib/mobx'
import type { AnnualLeave, ChildLeaveEntitlementSummary } from '../../lib/types'
import AnnualLeaveForm from './AnnualLeaveForm'

/**
 * The edit dialog is a full replace: it posts every field it carries, so a field it
 * does not carry is a field it silently resets. That is why it needs a duration
 * control of its own — without one, an admin correcting a typo in the reason on a
 * half-day request would promote it to a full day and take another half day off the
 * employee's balance, with nothing on screen having said so.
 *
 * Reached from `MyLeavePage` and `AnnualLeaveCard`, so this is not a hypothetical
 * surface.
 */
vi.mock('../../lib/api', () => ({
    createAnnualLeave: vi.fn(),
    editAnnualLeave: vi.fn(),
    getAdminUsers: vi.fn(),
    getChildLeaveEntitlements: vi.fn(),
    getLeaveTypes: vi.fn(),
    getTeammates: vi.fn(),
    uploadCoverageHandover: vi.fn(),
    uploadLeaveEvidence: vi.fn(),
}))

vi.mock('../../lib/mobx/authStore', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../lib/mobx/authStore')>()
    return actual
})

const api = vi.mocked(await import('../../lib/api'))

const ANNUAL_LEAVE_TYPE = {
    id: 1, name: 'Annual Leave', requiresApproval: true, isActive: true, affectsBalance: true,
    icon: '', colorKey: 'primary', description: '', paid: true, attachmentPolicy: 'None',
    defaultAllowance: 23, allowanceUnit: 'days/year', maxCarryoverDays: 0,
    perChildEntitlement: false, perChildTotalWeeks: 0, perChildWeeksPerYear: 0, childEligibleUntilAge: 0,
    accrualNotes: '', minNoticeDays: 0, maxConsecutiveDays: 0,
    halfDayAllowed: true, availableTo: 'Both',
} as const

const FULL_DAY_ONLY_TYPE = {
    ...ANNUAL_LEAVE_TYPE, id: 2, name: 'Unpaid Leave', affectsBalance: false, halfDayAllowed: false,
} as const

const NO_CHILDREN: ChildLeaveEntitlementSummary = {
    leaveTypeId: null, leaveTypeName: '', eligibleChildCount: 0,
    totalRemainingDays: 0, thisYearCapDays: 0, thisYearRemainingDays: 0, children: [],
}

const HALF_DAY_LEAVE: AnnualLeave = {
    id: 'L1', employeeId: 'emp-1', startDate: '2026-09-09T00:00:00', endDate: '2026-09-09T00:00:00',
    leaveTypeId: ANNUAL_LEAVE_TYPE.id, reason: 'Dentist', evidenceUrl: null,
    delegateId: null, delegateName: '', status: 'Pending',
    createdAt: '2026-09-01T00:00:00', approvedAt: null,
    totalDays: 0.5, duration: 'HalfDayAfternoon',
    employeeName: 'Andreas Georgiou', departmentName: 'Delivery', childId: null, childName: '',
}

beforeEach(() => {
    vi.clearAllMocks()
    api.getTeammates.mockResolvedValue([])
    api.getLeaveTypes.mockResolvedValue([ANNUAL_LEAVE_TYPE, FULL_DAY_ONLY_TYPE] as never)
    api.getAdminUsers.mockResolvedValue([] as never)
    api.getChildLeaveEntitlements.mockResolvedValue(NO_CHILDREN)
    api.editAnnualLeave.mockResolvedValue(undefined as never)
    api.createAnnualLeave.mockResolvedValue('new-leave-id' as never)
})

function renderForm(leave?: AnnualLeave) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
        <StoreProvider>
            <QueryClientProvider client={queryClient}>
                <AnnualLeaveForm open onClose={() => {}} isAdmin leave={leave} />
            </QueryClientProvider>
        </StoreProvider>,
    )
}

const save = () => screen.getByRole('button', { name: /save changes|assign leave|submit request/i })

describe('AnnualLeaveForm — half days', () => {
    it('opens an existing half day on the half it was booked for', async () => {
        renderForm(HALF_DAY_LEAVE)

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Half day (PM)' })).toHaveAttribute('aria-pressed', 'true'))
    })

    /**
     * The regression this control exists to prevent.
     */
    it('keeps the half day when nothing about it is touched', async () => {
        renderForm(HALF_DAY_LEAVE)
        await screen.findByRole('button', { name: 'Half day (PM)' })

        fireEvent.click(save())

        await waitFor(() => expect(api.editAnnualLeave).toHaveBeenCalledTimes(1))
        expect(api.editAnnualLeave.mock.calls[0][0]).toMatchObject({ duration: 'HalfDayAfternoon' })
    })

    it('promotes a half day to a full day when asked to', async () => {
        renderForm(HALF_DAY_LEAVE)

        fireEvent.click(await screen.findByRole('button', { name: 'Full day(s)' }))
        fireEvent.click(save())

        await waitFor(() => expect(api.editAnnualLeave).toHaveBeenCalledTimes(1))
        expect(api.editAnnualLeave.mock.calls[0][0]).toMatchObject({ duration: 'Full' })
    })

    /** A half day covers one date, here as much as on the apply page. */
    it('ends a half day on the date it starts', async () => {
        renderForm({ ...HALF_DAY_LEAVE, duration: 'Full', endDate: '2026-09-18T00:00:00', totalDays: 8 })

        fireEvent.click(await screen.findByRole('button', { name: 'Half day (AM)' }))
        fireEvent.click(save())

        await waitFor(() => expect(api.editAnnualLeave).toHaveBeenCalledTimes(1))
        const sent = api.editAnnualLeave.mock.calls[0][0] as { startDate: string; endDate: string }
        expect(sent.endDate).toBe(sent.startDate)
    })

    it('offers no half-day buttons on a type that disallows them', async () => {
        renderForm({ ...HALF_DAY_LEAVE, leaveTypeId: FULL_DAY_ONLY_TYPE.id, duration: 'Full', totalDays: 1 })

        await screen.findByRole('button', { name: /save changes/i })
        expect(screen.queryByRole('button', { name: 'Half day (AM)' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Half day (PM)' })).not.toBeInTheDocument()
    })
})
