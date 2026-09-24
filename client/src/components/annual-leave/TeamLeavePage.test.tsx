import { render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnnualLeave, UserInfo } from '../../lib/types'
import TeamLeavePage from './TeamLeavePage'

// Coverage was readable only by opening a request: the delegate's name lived in
// the view dialog and nowhere else. A manager scanning next week's absences is
// exactly the person who needs to see, without clicking, whether anyone is
// holding the fort.
vi.mock('../../lib/api', () => ({
    getAnnualLeaves: vi.fn(),
    getLeaveStatusHistories: vi.fn(),
    getLeaveTypes: vi.fn(),
    updateLeaveStatus: vi.fn(),
}))

const api = vi.mocked(await import('../../lib/api'))

const MANAGER: UserInfo = {
    id: 'u-manager',
    displayName: 'Nikos Manager',
    email: 'manager@test.local',
    roles: ['Manager'],
    departmentId: 1,
} as unknown as UserInfo

const BASE_LEAVE = {
    id: 'L-1',
    employeeId: 'u-employee',
    employeeName: 'Maria Ioannou',
    departmentName: 'Engineering',
    leaveTypeId: 1,
    startDate: '2026-03-04',
    endDate: '2026-03-06',
    totalDays: 3,
    // A manager opens on the Pending tab, which is also where coverage is worth
    // seeing: it is part of what they are deciding.
    status: 'Pending',
    reason: 'Family trip',
    delegateId: null,
    delegateName: '',
} as unknown as AnnualLeave

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={client}>
            <TeamLeavePage user={MANAGER} />
        </QueryClientProvider>
    )
}

const HR_ADMIN: UserInfo = { ...MANAGER, id: 'u-hr', displayName: 'Helen HR', roles: ['HR Administrator'] } as unknown as UserInfo

function renderPageAs(user: UserInfo) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={client}>
            <TeamLeavePage user={user} />
        </QueryClientProvider>
    )
}

describe('TeamLeavePage coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        api.getLeaveStatusHistories.mockResolvedValue([])
        api.getLeaveTypes.mockResolvedValue([
            { id: 1, name: 'Annual Leave' },
        ] as never)
    })

    it('names the delegate on the row, without opening the request', async () => {
        api.getAnnualLeaves.mockResolvedValue([
            { ...BASE_LEAVE, delegateId: 'u-delegate', delegateName: 'Andreas Georgiou' },
        ] as never)

        renderPage()

        const row = await screen.findByRole('row', { name: /Maria Ioannou/ })
        expect(within(row).getByText(/Covered by Andreas Georgiou/)).toBeInTheDocument()
    })

    it('says nothing about coverage when nobody was nominated', async () => {
        api.getAnnualLeaves.mockResolvedValue([BASE_LEAVE] as never)

        renderPage()

        await screen.findByRole('row', { name: /Maria Ioannou/ })
        await waitFor(() => {
            expect(screen.queryByText(/Covered by/)).not.toBeInTheDocument()
        })
    })
})

/**
 * The attachment policy gates approval on the server (`AttachmentPolicyRule`),
 * so a request on a Required type with no document yet cannot be approved from
 * here either — the button would only fail on the round trip. It stays visible
 * and disabled, with the reason beside it, until the employee attaches one.
 */
describe('TeamLeavePage attachment policy', () => {
    const EVIDENCE_URL = '/api/files/8f2c1b6e-0000-4000-8000-000000000001'

    beforeEach(() => {
        vi.clearAllMocks()
        api.getLeaveStatusHistories.mockResolvedValue([])
        api.getLeaveTypes.mockResolvedValue([
            { id: 1, name: 'Annual Leave', attachmentPolicy: 'None' },
            { id: 2, name: 'Military Leave', attachmentPolicy: 'Required' },
        ] as never)
    })

    it('holds Approve until the required document is attached', async () => {
        api.getAnnualLeaves.mockResolvedValue([{ ...BASE_LEAVE, leaveTypeId: 2, evidenceUrl: null }] as never)

        renderPage()

        const row = await screen.findByRole('row', { name: /Maria Ioannou/ })
        expect(within(row).getByRole('button', { name: 'Approve' })).toBeDisabled()
        expect(within(row).getByText(/Awaiting document/)).toBeInTheDocument()
    })

    it('offers Approve once the document is there', async () => {
        api.getAnnualLeaves.mockResolvedValue([{ ...BASE_LEAVE, leaveTypeId: 2, evidenceUrl: EVIDENCE_URL }] as never)

        renderPage()

        const row = await screen.findByRole('row', { name: /Maria Ioannou/ })
        expect(within(row).getByRole('button', { name: 'Approve' })).toBeEnabled()
        expect(within(row).queryByText(/Awaiting document/)).not.toBeInTheDocument()
    })

    it('never holds a type that asks for no document', async () => {
        api.getAnnualLeaves.mockResolvedValue([{ ...BASE_LEAVE, leaveTypeId: 1, evidenceUrl: null }] as never)

        renderPage()

        const row = await screen.findByRole('row', { name: /Maria Ioannou/ })
        expect(within(row).getByRole('button', { name: 'Approve' })).toBeEnabled()
    })
})

describe('TeamLeavePage approval stages', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        api.getLeaveStatusHistories.mockResolvedValue([])
        api.getLeaveTypes.mockResolvedValue([
            { id: 1, name: 'Annual Leave', requiresManagerApproval: true, requiresHrApproval: true, attachmentPolicy: 'None' },
        ] as never)
    })

    it("labels a manager's Approve as sending the request to HR when the type asks for HR", async () => {
        api.getAnnualLeaves.mockResolvedValue([BASE_LEAVE] as never)
        renderPageAs(MANAGER)

        const row = await screen.findByRole('row', { name: /Maria Ioannou/ })
        expect(within(row).getByRole('button', { name: 'Approve & send to HR' })).toBeInTheDocument()
    })

    it('shows a manager a request that is with HR without Approve or Reject', async () => {
        api.getAnnualLeaves.mockResolvedValue([{ ...BASE_LEAVE, status: 'AwaitingHrApproval' }] as never)
        renderPageAs(MANAGER)

        const row = await screen.findByRole('row', { name: /Maria Ioannou/ })
        expect(within(row).getByText('With HR')).toBeInTheDocument()
        expect(within(row).queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument()
        expect(within(row).queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
    })

    it('lets an HR Administrator approve a request that is with HR', async () => {
        api.getAnnualLeaves.mockResolvedValue([{ ...BASE_LEAVE, status: 'AwaitingHrApproval' }] as never)
        renderPageAs(HR_ADMIN)

        const row = await screen.findByRole('row', { name: /Maria Ioannou/ })
        expect(within(row).getByRole('button', { name: 'Approve' })).toBeEnabled()
    })
})
