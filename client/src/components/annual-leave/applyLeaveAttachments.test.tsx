import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StoreProvider } from '../../lib/mobx'
import type { EmployeeProfile, LeaveType, UserInfo } from '../../lib/types'
import ApplyLeavePage from './ApplyLeavePage'

/**
 * Step 5 of `/apply-leave` follows the leave type's **Attachment policy**, set by
 * an admin on Leave Types.
 *
 * It used to follow the type's *name*: `name.includes('sick')` earned the amber
 * "(recommended for sick leave)" label and everything else read "(optional)", so
 * an admin who set *Attachment required* on Personal Days changed nothing an
 * employee could see and the request submitted with no document at all. These
 * tests fail if that guess comes back — which is the client half of
 * `Application/AnnualLeaves/Commands/AttachmentPolicyRule.cs`.
 *
 * The rule gates *approval*, not filing. Call-up papers are dated the day of
 * service, so a Military Leave request has to go in before its document exists:
 * the employee files, attaches it later from My Leave, and only then can a
 * manager approve. So a missing document disables submit only where submitting
 * would approve — a type that auto-approves.
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

// Annotated rather than `as const`: every test varies attachmentPolicy, which a
// const assertion would narrow to the one literal spelled here.
const BASE_TYPE: LeaveType = {
    id: 1, name: 'Personal Days', requiresApproval: true, isActive: true, affectsBalance: false,
    icon: '', colorKey: 'personal', description: '', paid: true, attachmentPolicy: 'None',
    defaultAllowance: 3, allowanceUnit: 'days/year', maxCarryoverDays: 0,
    perChildEntitlement: false, perChildTotalWeeks: 0, perChildWeeksPerYear: 0, childEligibleUntilAge: 0,
    accrualNotes: '', minNoticeDays: 0,
    maxConsecutiveDays: 0, halfDayAllowed: false, availableTo: 'Both',
}

const USER: UserInfo = {
    id: 'emp-1', userName: 'employee@worktrack.com', email: 'employee@worktrack.com',
    displayName: 'Andreas Georgiou', imageUrl: '', roles: ['Employee'], departmentId: 2,
}

const PROFILE: EmployeeProfile = {
    id: 'pr1', userId: USER.id, displayName: USER.displayName, departmentId: 2,
    managerId: null, annualLeaveEntitlement: 25, leaveBalance: 25,
    jobTitle: null, employmentStartDate: null, createdAt: '2026-01-01T00:00:00',
}

const EVIDENCE_URL = '/api/files/8f2c1b6e-0000-4000-8000-000000000001'

beforeEach(() => {
    vi.clearAllMocks()
    api.getEmployeeProfiles.mockResolvedValue([PROFILE])
    api.getAnnualLeaves.mockResolvedValue([])
    api.getTeammates.mockResolvedValue([])
    api.getHolidays.mockResolvedValue([])
    api.getAppSettings.mockResolvedValue({ leaveYearStartMonth: 1 } as never)
    api.createAnnualLeave.mockResolvedValue('new-leave-id' as never)
    api.uploadLeaveEvidence.mockResolvedValue({ evidenceUrl: EVIDENCE_URL } as never)
})

/** Renders the page with a single leave type carrying `overrides`. */
async function renderWithType(overrides: Partial<LeaveType> = {}) {
    const type = { ...BASE_TYPE, ...overrides }
    api.getLeaveTypes.mockResolvedValue([type] as never)

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
        <StoreProvider>
            <QueryClientProvider client={queryClient}>
                <ApplyLeavePage user={USER} />
            </QueryClientProvider>
        </StoreProvider>,
    )
    // The only type is auto-selected once the query settles.
    await screen.findByRole('button', { name: new RegExp(type.name, 'i') })
    return view
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
 * Step 5's own subtree. "(optional)" also labels Coverage and Reason, so the
 * policy label has to be read inside this section and nowhere else. Found by
 * walking up from the dropzone to the smallest ancestor that also holds the
 * heading — the section box — since nothing in this codebase carries a test id.
 */
function documentsSection(): HTMLElement {
    let el: HTMLElement | null = screen.getByText(/Drop a file here or/i)
    while (el && !el.textContent?.includes('Supporting documents')) el = el.parentElement
    if (!el) throw new Error('Could not find the Supporting documents section.')
    return el
}

/** Nothing of step 5 on the page at all — heading, dropzone or summary row. */
function expectNoDocumentsSection() {
    expect(screen.queryByText('Supporting documents')).not.toBeInTheDocument()
    expect(screen.queryByText(/Drop a file here or/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Attachments')).not.toBeInTheDocument()
}

/** The dropzone's input is hidden, so drive it directly. */
function stageFile(container: HTMLElement) {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['%PDF-1.4'], 'doctors-note.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })
}

describe('ApplyLeavePage — supporting documents follow the attachment policy', () => {
    it('marks the section required before approval and still lets the request be filed', async () => {
        await renderWithType({ attachmentPolicy: 'Required' })
        pickDates()

        const section = documentsSection()
        expect(within(section).getByText('(required before approval)')).toBeInTheDocument()
        expect(within(section).getByText(/attach it later from My Leave/i)).toBeInTheDocument()

        const submit = await screen.findByRole('button', { name: /submit for approval/i })
        expect(submit).toBeEnabled()
        fireEvent.click(submit)

        await waitFor(() => expect(api.createAnnualLeave).toHaveBeenCalledTimes(1))
        expect(api.uploadLeaveEvidence).not.toHaveBeenCalled()
        expect(api.createAnnualLeave).toHaveBeenCalledWith(
            expect.objectContaining({ evidenceUrl: undefined }),
        )
    })

    /** Filing is approval for a type that approves itself, so filing is gated. */
    it('blocks submit for a Required policy on a type that approves itself', async () => {
        await renderWithType({ attachmentPolicy: 'Required', requiresApproval: false })
        pickDates()

        expect(within(documentsSection()).getByText('(required)')).toBeInTheDocument()

        const submit = await screen.findByRole('button', { name: /attach a document to continue/i })
        expect(submit).toBeDisabled()
    })

    it('uploads the staged document and submits once one is attached', async () => {
        const { container } = await renderWithType({ attachmentPolicy: 'Required' })
        pickDates()
        stageFile(container)

        const submit = await screen.findByRole('button', { name: /submit for approval/i })
        expect(submit).toBeEnabled()
        fireEvent.click(submit)

        await waitFor(() => expect(api.createAnnualLeave).toHaveBeenCalledTimes(1))
        expect(api.uploadLeaveEvidence).toHaveBeenCalledTimes(1)
        expect(api.createAnnualLeave).toHaveBeenCalledWith(
            expect.objectContaining({ evidenceUrl: EVIDENCE_URL }),
        )
    })

    it('encourages but never blocks for an Optional policy', async () => {
        await renderWithType({ attachmentPolicy: 'Optional' })
        pickDates()

        expect(within(documentsSection()).getByText('(recommended)')).toBeInTheDocument()
        expect(await screen.findByRole('button', { name: /submit for approval/i })).toBeEnabled()
    })

    /**
     * "No attachment needed" means the step is not there. It used to render the
     * whole dropzone under an "(optional)" label, which offered an upload for a
     * type the admin had said wants no document — five steps where four were the
     * request.
     */
    it('hides the section entirely under a None policy', async () => {
        await renderWithType({ attachmentPolicy: 'None' })
        pickDates()

        expectNoDocumentsSection()
        expect(await screen.findByRole('button', { name: /submit for approval/i })).toBeEnabled()
    })

    /**
     * The guess this replaces. A type called "Sick Leave" that the admin left at
     * None asks for nothing — the setting decides, not the name.
     */
    it('does not read a requirement out of the leave type name', async () => {
        await renderWithType({ name: 'Sick Leave', attachmentPolicy: 'None' })
        pickDates()

        expectNoDocumentsSection()
        expect(await screen.findByRole('button', { name: /submit for approval/i })).toBeEnabled()
    })

    /**
     * Switching away from a type that took a document must not leave the file
     * staged behind the hidden section — it would upload on submit with nothing
     * on screen to say so.
     */
    it('drops a staged document when the employee switches to a None type', async () => {
        const optional = { ...BASE_TYPE, id: 1, name: 'Sick Leave', attachmentPolicy: 'Optional' as const }
        const none = { ...BASE_TYPE, id: 2, name: 'Annual Leave', attachmentPolicy: 'None' as const }
        api.getLeaveTypes.mockResolvedValue([optional, none] as never)

        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const { container } = render(
            <StoreProvider>
                <QueryClientProvider client={queryClient}>
                    <ApplyLeavePage user={USER} />
                </QueryClientProvider>
            </StoreProvider>,
        )

        fireEvent.click(await screen.findByRole('button', { name: /sick leave/i }))
        pickDates()
        stageFile(container)
        expect(await screen.findByText('doctors-note.pdf')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: /annual leave/i }))
        await waitFor(expectNoDocumentsSection)
        expect(screen.queryByText('doctors-note.pdf')).not.toBeInTheDocument()

        fireEvent.click(await screen.findByRole('button', { name: /submit for approval/i }))
        await waitFor(() => expect(api.createAnnualLeave).toHaveBeenCalledTimes(1))
        expect(api.uploadLeaveEvidence).not.toHaveBeenCalled()
        expect(api.createAnnualLeave).toHaveBeenCalledWith(
            expect.objectContaining({ evidenceUrl: undefined }),
        )
    })
})
