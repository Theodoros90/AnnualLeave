import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserInfo } from '../../lib/types'
import AnnualLeaveForm from './AnnualLeaveForm'

/**
 * The attachment policy on the other form that files a leave request.
 *
 * `AttachmentPolicyRule` gates *approval*, not filing: a request on a Required
 * type may be filed and edited without evidence while it is Pending — that is how
 * an employee attaches a document dated after they had to file — but nothing may
 * approve it, or leave it approved, undocumented. So Save is disabled only where
 * saving would do that: a type that approves itself, or an edit of a request
 * already approved. No exemption for an admin in either case.
 *
 * This dialog is what My Leave opens from a pending row's Edit button, which is
 * where an employee attaches the document once it exists.
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

const EVIDENCE_TYPE = {
    id: 1, name: 'Evidence Leave', requiresManagerApproval: true, isActive: true, affectsBalance: false,
    icon: '', colorKey: 'primary', description: '', paid: true, attachmentPolicy: 'Required',
    defaultAllowance: 10, allowanceUnit: 'days/year', maxCarryoverDays: 0,
    perChildEntitlement: false, perChildTotalWeeks: 0, perChildWeeksPerYear: 0, childEligibleUntilAge: 0,
    accrualNotes: '', minNoticeDays: 0, maxConsecutiveDays: 0, halfDayAllowed: false,
    availableTo: 'Both',
} as const

const RELAXED_TYPE = {
    ...EVIDENCE_TYPE, id: 2, name: 'Annual Leave', attachmentPolicy: 'None', affectsBalance: true,
} as const

/** Filing is approval here, so filing is where the document is asked for. */
const AUTO_EVIDENCE_TYPE = {
    ...EVIDENCE_TYPE, id: 3, name: 'Self-Approving Evidence Leave', requiresManagerApproval: false,
} as const

const USER: UserInfo = {
    id: 'emp-1', userName: 'employee@worktrack.com', email: 'employee@worktrack.com',
    displayName: 'Andreas Georgiou', imageUrl: '', roles: ['Employee'], departmentId: 2,
}

const EVIDENCE_URL = '/api/files/8f2c1b6e-0000-4000-8000-000000000001'

beforeEach(() => {
    vi.clearAllMocks()
    api.getTeammates.mockResolvedValue([])
    api.getLeaveTypes.mockResolvedValue([EVIDENCE_TYPE, RELAXED_TYPE, AUTO_EVIDENCE_TYPE] as never)
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
    it('lets a Required type be filed without evidence when it needs approval', async () => {
        const select = await renderForm()
        await chooseType(select, 'Evidence Leave')

        expect(screen.getByText(/required before approval: upload PDF/i)).toBeInTheDocument()
        await waitFor(() => expect(saveButton()).toBeEnabled())
    })

    it('blocks Save for a Required type that approves itself', async () => {
        const select = await renderForm()
        await chooseType(select, 'Self-Approving Evidence Leave')

        expect(screen.getByText(/required: upload PDF/i)).toBeInTheDocument()
        await waitFor(() => expect(saveButton()).toBeDisabled())
    })

    it('leaves Save enabled once evidence is attached', async () => {
        const select = await renderForm()
        await chooseType(select, 'Self-Approving Evidence Leave')

        const input = document.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, {
            target: { files: [new File(['%PDF-1.4'], 'note.pdf', { type: 'application/pdf' })] },
        })

        await waitFor(() => expect(saveButton()).toBeEnabled())
    })

    /**
     * "No attachment needed" takes the upload off the dialog rather than offering
     * it under an "Optional:" caption — an upload for a type the admin said wants
     * no document.
     */
    it('offers no upload at all for a type that asks for nothing', async () => {
        const select = await renderForm()
        await chooseType(select, 'Annual Leave')

        await waitFor(() => expect(saveButton()).toBeEnabled())
        expect(screen.queryByRole('button', { name: /upload evidence/i })).not.toBeInTheDocument()
        expect(screen.queryByText(/upload PDF, image, DOC, or DOCX/i)).not.toBeInTheDocument()
    })

    /**
     * A file staged under a type that took one must not survive behind the hidden
     * section — it would upload on Save with nothing on screen to say so.
     */
    it('drops a staged file when the type switches to one that asks for nothing', async () => {
        const select = await renderForm()
        await chooseType(select, 'Evidence Leave')

        const input = document.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, {
            target: { files: [new File(['%PDF-1.4'], 'note.pdf', { type: 'application/pdf' })] },
        })
        expect(await screen.findByText(/note\.pdf/)).toBeInTheDocument()

        await chooseType(select, 'Annual Leave')

        await waitFor(() => expect(screen.queryByText(/note\.pdf/)).not.toBeInTheDocument())
        expect(screen.queryByRole('button', { name: /evidence file/i })).not.toBeInTheDocument()
    })

    /**
     * The exception to hiding it. This dialog is the only place to open a request's
     * document, so a policy moved to None afterwards must not hide one already filed.
     */
    it('keeps the evidence visible when the request already carries one', async () => {
        await renderForm({
            id: 'L1', employeeId: USER.id, employeeName: USER.displayName,
            leaveTypeId: RELAXED_TYPE.id, leaveTypeName: RELAXED_TYPE.name,
            startDate: '2026-06-01T00:00:00', endDate: '2026-06-05T00:00:00',
            status: 'Pending', reason: 'Out of office', totalDays: 5,
            evidenceUrl: EVIDENCE_URL, delegateId: null, childId: null,
        } as never)

        expect(await screen.findByRole('link', { name: /view current evidence/i })).toBeInTheDocument()
        expect(screen.queryByText(/optional: upload PDF/i)).not.toBeInTheDocument()
        await waitFor(() => expect(saveButton()).toBeEnabled())
    })

    /**
     * The edit that attaches the document once it exists: a pending request on a
     * Required type opens with Save enabled even though it carries no evidence yet.
     */
    it('lets a pending request be edited without evidence', async () => {
        const select = await renderForm({
            id: 'L1', employeeId: USER.id, employeeName: USER.displayName,
            leaveTypeId: EVIDENCE_TYPE.id, leaveTypeName: EVIDENCE_TYPE.name,
            startDate: '2026-06-01T00:00:00', endDate: '2026-06-05T00:00:00',
            status: 'Pending', reason: 'Out of office', totalDays: 5,
            evidenceUrl: null, delegateId: null, childId: null,
        } as never)

        await waitFor(() => expect(select).toBeInTheDocument())
        await waitFor(() => expect(saveButton()).toBeEnabled())
    })

    /**
     * An approved request must not be left approved and undocumented, and the
     * server refuses that edit — so the dialog must not offer a Save certain to fail.
     */
    it('blocks Save when editing an approved request that carries no evidence', async () => {
        const select = await renderForm({
            id: 'L1', employeeId: USER.id, employeeName: USER.displayName,
            leaveTypeId: EVIDENCE_TYPE.id, leaveTypeName: EVIDENCE_TYPE.name,
            startDate: '2026-06-01T00:00:00', endDate: '2026-06-05T00:00:00',
            status: 'Approved', reason: 'Out of office', totalDays: 5,
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
