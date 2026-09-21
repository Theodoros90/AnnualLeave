import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { StoreProvider } from '../../lib/mobx'
import type { LeaveType } from '../../lib/types'
import LeaveTypesPanel from './LeaveTypesPanel'

/*
 * The carryover cap is bounded by the allowance it caps, and "nothing expires" is the
 * field left blank rather than a number too large to reach. Before this, the cap was
 * validated against the calendar alone, so an admin could grant 23 days a year and
 * carry over 80 — reachable only after four consecutive years of taking no leave, and
 * quoted on the card as though it were a limit.
 *
 * Three readings the card and the dialog have to keep apart: null (no cap), 0 (nothing
 * carries) and N (at most N days, N <= the allowance).
 */
vi.mock('../../lib/api', () => ({
    getLeaveTypes: vi.fn(),
    getAnnualLeaves: vi.fn(),
    createLeaveType: vi.fn(),
    updateLeaveType: vi.fn(),
    deleteLeaveType: vi.fn(),
}))

const api = vi.mocked(await import('../../lib/api'))

function leaveType(overrides: Partial<LeaveType> = {}): LeaveType {
    return {
        id: 1,
        name: 'Annual Leave',
        requiresApproval: true,
        isActive: true,
        affectsBalance: true,
        icon: '🌴',
        colorKey: 'annual',
        description: '',
        paid: true,
        attachmentPolicy: 'None',
        defaultAllowance: 23,
        allowanceUnit: 'days/year',
        maxCarryoverDays: 5,
        perChildEntitlement: false,
        perChildTotalWeeks: 0,
        perChildWeeksPerYear: 0,
        childEligibleUntilAge: 0,
        accrualNotes: '',
        minNoticeDays: 0,
        maxConsecutiveDays: 0,
        halfDayAllowed: false,
        eligibilityNotes: 'All employees',
        eligibilityScope: 'All', availableTo: 'Both',
        isSystem: true,
        supportsPerChildEntitlement: false,
        ...overrides,
    } as LeaveType
}

const PATERNITY = leaveType({
    id: 2,
    name: 'Paternity Leave',
    affectsBalance: false,
    defaultAllowance: 0,
    maxCarryoverDays: 0,
    perChildEntitlement: true,
    perChildTotalWeeks: 18,
    perChildWeeksPerYear: 5,
    childEligibleUntilAge: 15,
    supportsPerChildEntitlement: true,
})

beforeEach(() => {
    vi.clearAllMocks()
    api.getLeaveTypes.mockResolvedValue([leaveType()])
    api.getAnnualLeaves.mockResolvedValue([])
    api.createLeaveType.mockResolvedValue(leaveType())
    api.updateLeaveType.mockResolvedValue(leaveType())
})

async function renderPanel() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
        <StoreProvider>
            <QueryClientProvider client={queryClient}>
                <LeaveTypesPanel />
            </QueryClientProvider>
        </StoreProvider>,
    )
    await screen.findByPlaceholderText('Search leave types…')
    return view
}

it('reads a cap on the card as the limit it is', async () => {
    await renderPanel()

    expect(screen.getByText('Carries over up to 5 days')).toBeInTheDocument()
})

it('reads a zero cap as nothing carrying over', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ maxCarryoverDays: 0 })])
    await renderPanel()

    expect(screen.getByText('No carryover — unused days expire at year end')).toBeInTheDocument()
})

/* The reading the old 80 was standing in for, said plainly. */
it('reads no cap as everything carrying over', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ maxCarryoverDays: null })])
    await renderPanel()

    expect(screen.getByText('All unused days carry over')).toBeInTheDocument()
})

/* A per-child ledger does not roll over at year end — it is bounded by the child's
   age, not by the leave year. The line was printing "No carryover" beside Maternity
   and Paternity Leave, which invites a question the type cannot answer. */
it('says nothing about carryover on a per-child type', async () => {
    api.getLeaveTypes.mockResolvedValue([PATERNITY])
    await renderPanel()

    expect(screen.queryByText(/carry/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/No carryover/)).not.toBeInTheDocument()
})

it('bounds the field by the allowance it caps', async () => {
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))

    expect(screen.getByLabelText(/Max carryover/)).toHaveAttribute('max', '23')
})

it('sends no cap when the field is cleared', async () => {
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))
    fireEvent.change(screen.getByLabelText(/Max carryover/), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledWith(1, expect.objectContaining({
        maxCarryoverDays: null,
    })))
})

/* Distinct from clearing it: a 0 means the opposite, and the two must not collapse
   into one another on the way to the server. */
it('sends a zero when the field says zero', async () => {
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))
    fireEvent.change(screen.getByLabelText(/Max carryover/), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledWith(1, expect.objectContaining({
        maxCarryoverDays: 0,
    })))
})

/* A per-child type carries no flat allowance, so the cap could only ever be 0 or no
   cap — neither of which means anything for a ledger that does not roll over. The
   field is hidden the same way the allowance is, and the payload sends 0. */
it('offers no carryover field on a per-child type, and sends zero', async () => {
    api.getLeaveTypes.mockResolvedValue([PATERNITY])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))
    expect(screen.queryByLabelText(/Max carryover/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledWith(2, expect.objectContaining({
        maxCarryoverDays: 0,
    })))
})

/**
 * The card's Enabled/Disabled switch resubmits the whole leave type, so it has to
 * agree with the edit dialog: an uncapped type flipped off and on again must not come
 * back capped at 0, which is the opposite policy.
 */
it('keeps no cap through the Enabled toggle', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ maxCarryoverDays: null })])
    await renderPanel()

    // The panel starts with no dialog open, so the card's own switch is the only one.
    fireEvent.click(screen.getAllByRole('switch')[0])

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledWith(1, expect.objectContaining({
        maxCarryoverDays: null,
    })))
})

it('sends zero through the Enabled toggle for a per-child type', async () => {
    api.getLeaveTypes.mockResolvedValue([PATERNITY])
    await renderPanel()

    // The panel starts with no dialog open, so the card's own switch is the only one.
    fireEvent.click(screen.getAllByRole('switch')[0])

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledWith(2, expect.objectContaining({
        maxCarryoverDays: 0,
    })))
})
