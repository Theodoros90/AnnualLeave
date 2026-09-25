import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimesheetStatusHistory, UserInfo } from '../../lib/types'
import type { Timesheet } from '../../lib/types/timesheet'
import TeamTimesheetPage from './TeamTimesheetPage'

/*
 * When an HR Administrator cancels an approval (ReopenTimesheet), the reason is
 * written to the status history and emailed. It also has to be on screen: the
 * sheet lands back in the manager's queue, and a manager asked to review a week
 * they already approved needs to know why without hunting for the email.
 */
vi.mock('../../lib/api')

const api = vi.mocked(await import('../../lib/api'))

const manager: UserInfo = {
    id: 'u-manager',
    userName: 'mark',
    email: 'mark@example.com',
    displayName: 'Mark Manager',
    imageUrl: '',
    roles: ['Manager'],
}

function sheet(overrides: Partial<Timesheet> = {}): Timesheet {
    return {
        id: 'ts-1',
        employeeId: 'p-athos',
        employeeName: 'Athos Lamprou',
        departmentId: 1,
        periodStart: '2026-08-03T00:00:00Z',
        periodEnd: '2026-08-07T00:00:00Z',
        totalHours: 8,
        status: 'Submitted',
        submittedAt: '2026-08-05T06:51:00Z',
        approvedAt: null,
        createdAt: '2026-08-03T00:00:00Z',
        projectSummaries: [],
        dailyHours: [8, 0, 0, 0, 0],
        entries: [],
        ...overrides,
    } as Timesheet
}

function history(overrides: Partial<TimesheetStatusHistory> = {}): TimesheetStatusHistory {
    return {
        id: 'h-1',
        timesheetId: 'ts-1',
        employeeId: 'p-athos',
        employeeName: 'Athos Lamprou',
        changedByUserId: 'u-hr',
        changedByUserName: 'Helen HR',
        oldStatus: 'Approved',
        newStatus: 'Submitted',
        comment: 'Wednesday hours do not match the project log.',
        changedAt: '2026-09-25T08:00:00Z',
        ...overrides,
    }
}

async function renderPage(timesheets: Timesheet[], histories: TimesheetStatusHistory[]) {
    api.getTimesheets.mockResolvedValue(timesheets)
    api.getTimesheetStatusHistories.mockResolvedValue(histories)
    api.getTimesheet.mockImplementation(async (id) => timesheets.find((t) => t.id === id)!)
    api.getEmployeeProfiles.mockResolvedValue([])
    api.getDepartments.mockResolvedValue([])
    api.getProjects.mockResolvedValue([])
    api.getProjectTypes.mockResolvedValue([])
    api.getProjectComponents.mockResolvedValue([])
    api.getProjectActivityTypes.mockResolvedValue([])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><TeamTimesheetPage user={manager} /></QueryClientProvider>)
    await screen.findByText(timesheets[0].employeeName)
}

beforeEach(() => vi.clearAllMocks())

describe('Team Timesheets shows the manager why a sheet is back in their queue', () => {
    it('quotes the cancelled approval and its reason on the row', async () => {
        await renderPage([sheet()], [history()])

        expect(await screen.findByText('Approval cancelled by Helen HR')).toBeInTheDocument()
        expect(screen.getByText(/Wednesday hours do not match the project log\./)).toBeInTheDocument()
    })

    it('quotes it again in the View dialog', async () => {
        await renderPage([sheet()], [history()])
        await screen.findByText('Approval cancelled by Helen HR')

        fireEvent.click(screen.getByRole('button', { name: 'View' }))

        const dialog = await screen.findByRole('dialog')
        expect(await within(dialog).findByText('Approval cancelled by Helen HR')).toBeInTheDocument()
        expect(within(dialog).getByText(/Wednesday hours do not match the project log\./)).toBeInTheDocument()
    })

    it('says nothing on a sheet whose latest note no longer applies', async () => {
        // A rejection reason belongs to the Rejected state; once the employee
        // resubmits, the manager is reviewing new work, not the old reason.
        await renderPage(
            [sheet({ status: 'Resubmitted' })],
            [history({ oldStatus: 'Submitted', newStatus: 'Rejected', changedByUserName: 'Mark Manager', comment: 'Old reason' })],
        )

        expect(screen.queryByText(/Old reason/)).not.toBeInTheDocument()
        expect(screen.queryByText(/Rejected by/)).not.toBeInTheDocument()
    })
})
