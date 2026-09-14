import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserInfo } from '../../lib/types'
import AnnualLeaveForm from './AnnualLeaveForm'

/**
 * The attachment policy on the other form that files a leave request.
 *
 * There is no exemption for an admin here: `AttachmentPolicyRule` refuses a
 * request on a Required type with no evidence whoever sends it, so a dialog that
 * left Save enabled would just turn a disabled button into a failed round trip.
 *
 * Note this dialog is currently unreachable in the running app — `AnnualLeaveCard`
 * and `AnnualLeaveList` render it and nothing renders them. It is wired anyway, so
 * that bringing the surface back cannot quietly reopen the rule; the same reason
 * `AnnualLeaveForm.test.tsx` gives for gating parental leave here.
 */
vi.mock('../../lib/api', () => ({
    createAnnualLeave: vi.fn(),
    editAnnualLeave: vi.fn(),
    getAdminUsers: vi.fn(),
    getChildLeaveEntitlements: vi.fn(),
    getLeaveTypes: vi.fn(),
    uploadLeaveEvidence: vi.fn(),
}))

vi.mock('../../lib/mobx', () => ({ useStore: vi.fn() }))

const api = vi.mocked(await import('../../lib/api'))
const mobx = vi.mocked(await import('../../lib/mobx'))

const EVIDENCE_TYPE = {
    id: 1, name: 'Evidence Leave', requiresApproval: true, isActive: true, affectsBalance: false,
    icon: '', colorKey: 'primary', description: '', paid: true, attachmentPolicy: 'Required',
    defaultAllowance: 10, allowanceUnit: 'days/year', maxCarryoverDays: 0,
    perChildEntitlement: false, perChildTotalWeeks: 0, perChildWeeksPerYear: 0, childEligibleUntilAge: 0,
    accrualNotes: '', minNoticeDays: 0, maxConsecutiveDays: 0, halfDayAllowed: false,
    eligibilityNotes: '', eligibilityScope: 'All',
} as const

const RELAXED_TYPE = {
    ...EVIDENCE_TYPE, id: 2, name: 'Annual Leave', attachmentPolicy: 'None', affectsBalance: true,
} as const

const USER: UserInfo = {
    id: 'emp-1', userName: 'employee@worktrack.com', email: 'employee@worktrack.com',
    displayName: 'Andreas Georgiou', imageUrl: '', roles: ['Employee'], departmentId: 2,
}

const EVIDENCE_URL = '/api/files/8f2c1b6e-0000-4000-8000-000000000001'

beforeEach(() => {
    vi.clearAllMocks()
    api.getLeaveTypes.mockResolvedValue([EVIDENCE_TYPE, RELAXED_TYPE] as never)
    api.getAdminUsers.mockResolvedValue([] as never)
    api.getChildLeaveEntitlements.mockResolvedValue({
        leaveTypeId: 0, leaveTypeName: '', eligibleChildCount: 0,
        totalRemainingDays: 0, thisYearCapDays: 0, thisYearRemainingDays: 0, children: [],
    } as never)
    mobx.useStore.mockReturnValue({ authStore: { user: USER } } as never)
})

/** `leave` renders the edit variant, which opens on an existing request. */
async function renderForm(leave?: Parameters<typeof AnnualLeaveForm>[0]['leave']) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
        <QueryClientProvider client={queryClient}>
            <AnnualLeaveForm open onClose={() => {}} isAdmin leave={leave} />
        </QueryClientProvider>,
    )
    const select = await screen.findByRole('combobox', { name: /leave type/i })
    await waitFor(() => expect(select).not.toHaveAttribute('aria-disabled', 'true'))
    return select
}

/** Picks a type by name from the MUI select, which only lists options once open. */
async function chooseType(select: HTMLElement, name: string) {
    fireEvent.mouseDown(select)
    const option = await screen.findByRole('option', { name })
    fireEvent.click(option)
}

function saveButton() {
    return screen.getByRole('button', { name: /assign leave|save|create|update/i })
}

describe('AnnualLeaveForm — the attachment policy gates Save', () => {
    it('blocks Save for a Required type with no evidence', async () => {
        const select = await renderForm()
        await chooseType(select, 'Evidence Leave')

        expect(screen.getByText(/required: upload PDF/i)).toBeInTheDocument()
        await waitFor(() => expect(saveButton()).toBeDisabled())
    })

    it('leaves Save enabled once evidence is attached', async () => {
        const select = await renderForm()
        await chooseType(select, 'Evidence Leave')

        const input = document.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, {
            target: { files: [new File(['%PDF-1.4'], 'note.pdf', { type: 'application/pdf' })] },
        })

        await waitFor(() => expect(saveButton()).toBeEnabled())
    })

    it('never blocks Save for a type that asks for nothing', async () => {
        const select = await renderForm()
        await chooseType(select, 'Annual Leave')

        expect(screen.getByText(/optional: upload PDF/i)).toBeInTheDocument()
        await waitFor(() => expect(saveButton()).toBeEnabled())
    })

    /**
     * The no-exemption decision seen from the client: a request filed before the
     * policy was set carries no evidence, and the server refuses the edit — so the
     * dialog must not offer a Save that is certain to fail.
     */
    it('blocks Save when editing a request that predates the policy', async () => {
        const select = await renderForm({
            id: 'L1', employeeId: USER.id, employeeName: USER.displayName,
            leaveTypeId: EVIDENCE_TYPE.id, leaveTypeName: EVIDENCE_TYPE.name,
            startDate: '2026-06-01T00:00:00', endDate: '2026-06-05T00:00:00',
            status: 'Pending', reason: 'Out of office', totalDays: 5,
            evidenceUrl: null, delegateId: null, childId: null,
        } as never)

        await waitFor(() => expect(select).toBeInTheDocument())
        await waitFor(() => expect(saveButton()).toBeDisabled())
    })

    it('allows the edit through when the request already carries evidence', async () => {
        await renderForm({
            id: 'L1', employeeId: USER.id, employeeName: USER.displayName,
            leaveTypeId: EVIDENCE_TYPE.id, leaveTypeName: EVIDENCE_TYPE.name,
            startDate: '2026-06-01T00:00:00', endDate: '2026-06-05T00:00:00',
            status: 'Pending', reason: 'Out of office', totalDays: 5,
            evidenceUrl: EVIDENCE_URL, delegateId: null, childId: null,
        } as never)

        await waitFor(() => expect(saveButton()).toBeEnabled())
    })
})
