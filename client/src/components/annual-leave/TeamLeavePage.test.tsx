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
