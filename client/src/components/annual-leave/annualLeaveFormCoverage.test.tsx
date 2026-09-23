import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnnualLeave, Teammate, UserInfo } from '../../lib/types'
import AnnualLeaveForm from './AnnualLeaveForm'

/**
 * Coverage on the edit dialog — the other form that files or changes a leave.
 *
 * This dialog is a full replace, and it used to carry the existing delegate
 * through untouched with no way to set one. Now that cover is mandatory for an
 * Employee (`CoverageRule`), a request filed before the rule has to be given a
 * delegate the next time it is saved, and this dialog is where that happens: My
 * Leave's Edit button opens it. The handover note and document ride along.
 *
 * The rule reads whose leave it is. An employee editing their own request is held
 * to it; an admin editing somebody else's is not blocked here, since the leave
 * carries no role and a mirror must never over-refuse — the server answers.
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

vi.mock('../../lib/mobx', () => ({ useStore: vi.fn() }))

const api = vi.mocked(await import('../../lib/api'))
const mobx = vi.mocked(await import('../../lib/mobx'))

const ANNUAL_LEAVE_TYPE = {
    id: 1, name: 'Annual Leave', requiresApproval: true, isActive: true, affectsBalance: true,
    icon: '', colorKey: 'primary', description: '', paid: true, attachmentPolicy: 'None',
    defaultAllowance: 25, allowanceUnit: 'days/year', maxCarryoverDays: 0,
    perChildEntitlement: false, perChildTotalWeeks: 0, perChildWeeksPerYear: 0, childEligibleUntilAge: 0,
    accrualNotes: '', minNoticeDays: 0, maxConsecutiveDays: 0, halfDayAllowed: false,
    availableTo: 'Both',
} as const

const EMPLOYEE: UserInfo = {
    id: 'emp-1', userName: 'employee@worktrack.com', email: 'employee@worktrack.com',
    displayName: 'Andreas Georgiou', imageUrl: '', roles: ['Employee'], departmentId: 2,
}

const ADMIN: UserInfo = { ...EMPLOYEE, id: 'adm-1', displayName: 'Chris System Administrator', roles: ['System Administrator'], departmentId: null }

const TEAMMATE: Teammate = { userId: 'u-delegate', displayName: 'Maria Ioannou', jobTitle: 'Accountant', departmentId: 2 }

/** Filed before the rule: pending, and nobody covering. */
const UNCOVERED_LEAVE: AnnualLeave = {
    id: 'L1', employeeId: EMPLOYEE.id, startDate: '2026-11-09T00:00:00', endDate: '2026-11-10T00:00:00',
    leaveTypeId: ANNUAL_LEAVE_TYPE.id, reason: 'Family trip', evidenceUrl: null,
    delegateId: null, delegateName: '', status: 'Pending',
    createdAt: '2026-09-01T00:00:00', approvedAt: null,
    totalDays: 2, duration: 'Full',
    employeeName: EMPLOYEE.displayName, departmentName: 'Delivery', childId: null, childName: '',
}

beforeEach(() => {
    vi.clearAllMocks()
    api.getLeaveTypes.mockResolvedValue([ANNUAL_LEAVE_TYPE] as never)
    api.getAdminUsers.mockResolvedValue([] as never)
    api.getTeammates.mockResolvedValue([TEAMMATE])
    api.getChildLeaveEntitlements.mockResolvedValue({
        leaveTypeId: null, leaveTypeName: '', eligibleChildCount: 0,
        totalRemainingDays: 0, thisYearCapDays: 0, thisYearRemainingDays: 0, children: [],
    } as never)
    api.editAnnualLeave.mockResolvedValue(undefined as never)
    api.uploadCoverageHandover.mockResolvedValue({ coverageAttachmentUrl: '/api/files/handover-1', fileName: 'handover.pdf' })
})

async function renderEdit(leave: AnnualLeave, { as, isAdmin = false }: { as: UserInfo; isAdmin?: boolean }) {
    mobx.useStore.mockReturnValue({ authStore: { user: as } } as never)

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
        <QueryClientProvider client={queryClient}>
            <AnnualLeaveForm open onClose={() => {}} isAdmin={isAdmin} leave={leave} />
        </QueryClientProvider>,
    )
    const select = await screen.findByRole('combobox', { name: /leave type/i })
    await waitFor(() => expect(select).not.toHaveAttribute('aria-disabled', 'true'))
}

const save = () => screen.getByRole('button', { name: /save changes/i })

/** Picks a colleague from the MUI select, which only lists options once open. */
async function chooseDelegate(name: RegExp) {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /covered by/i }))
    fireEvent.click(await screen.findByRole('option', { name }))
}

describe('AnnualLeaveForm — coverage', () => {
    it('refuses to save an employee\'s own request with nobody covering', async () => {
        await renderEdit(UNCOVERED_LEAVE, { as: EMPLOYEE })

        fireEvent.click(save())

        expect(await screen.findByText(/please nominate a colleague to cover for you/i)).toBeInTheDocument()
        expect(api.editAnnualLeave).not.toHaveBeenCalled()
    })

    it('saves once a colleague is chosen, and carries the handover note', async () => {
        await renderEdit(UNCOVERED_LEAVE, { as: EMPLOYEE })

        await chooseDelegate(/Maria Ioannou/)
        fireEvent.change(await screen.findByLabelText(/handover note/i), { target: { value: 'Keep an eye on the deploy.' } })

        fireEvent.click(save())

        await waitFor(() => expect(api.editAnnualLeave).toHaveBeenCalledTimes(1))
        expect(api.editAnnualLeave.mock.calls[0][0]).toMatchObject({
            id: 'L1',
            delegateId: TEAMMATE.userId,
            coverageNote: 'Keep an eye on the deploy.',
        })
    })

    it('uploads a staged handover document and sends its path', async () => {
        await renderEdit(UNCOVERED_LEAVE, { as: EMPLOYEE })

        await chooseDelegate(/Maria Ioannou/)
        const file = new File(['%PDF-1.4'], 'handover.pdf', { type: 'application/pdf' })
        fireEvent.change(await screen.findByTestId('handover-file-input'), { target: { files: [file] } })

        fireEvent.click(save())

        await waitFor(() => expect(api.editAnnualLeave).toHaveBeenCalledTimes(1))
        expect(api.uploadCoverageHandover).toHaveBeenCalledWith(file)
        expect(api.editAnnualLeave.mock.calls[0][0]).toMatchObject({ coverageAttachmentUrl: '/api/files/handover-1' })
    })

    it('keeps the existing delegate on the list and in the payload when nothing is touched', async () => {
        const covered: AnnualLeave = { ...UNCOVERED_LEAVE, delegateId: 'u-old', delegateName: 'Petros Christou', coverageNote: 'Old note' }
        await renderEdit(covered, { as: EMPLOYEE })

        // Not on the teammates list any more — moved department, say — but still
        // the request's delegate, so the select must not open on a blank.
        expect(screen.getByRole('combobox', { name: /covered by/i })).toHaveTextContent('Petros Christou')

        fireEvent.click(save())

        await waitFor(() => expect(api.editAnnualLeave).toHaveBeenCalledTimes(1))
        expect(api.editAnnualLeave.mock.calls[0][0]).toMatchObject({ delegateId: 'u-old', coverageNote: 'Old note' })
    })

    it('asks for the employee\'s colleagues, not the admin\'s, when an admin edits on their behalf', async () => {
        await renderEdit(UNCOVERED_LEAVE, { as: ADMIN, isAdmin: true })

        await waitFor(() => expect(api.getTeammates).toHaveBeenCalledWith(EMPLOYEE.id))
    })

    it('does not block an admin editing somebody else\'s uncovered request; the server decides', async () => {
        await renderEdit(UNCOVERED_LEAVE, { as: ADMIN, isAdmin: true })

        fireEvent.click(save())

        await waitFor(() => expect(api.editAnnualLeave).toHaveBeenCalledTimes(1))
        expect(api.editAnnualLeave.mock.calls[0][0]).toMatchObject({ delegateId: undefined })
    })
})
