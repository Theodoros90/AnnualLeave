import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { StoreProvider } from '../../lib/mobx'
import type { LeaveType } from '../../lib/types'
import LeaveTypesPanel from './LeaveTypesPanel'

// Leave types configure the org-wide rules (approval, attachment, allowance) and,
// for paternity leave, a separate per-child ledger. What matters here is that the
// three per-child numbers only reveal once their own toggle is on, that turning
// the toggle on clears and disables "Affects leave balance" (the server refuses
// that combination outright), and that a per-child type's card quotes the policy
// instead of the meaningless 0 `defaultAllowance` migration leaves behind.
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
        name: 'Paternity Leave',
        requiresManagerApproval: true,
        isActive: true,
        affectsBalance: false,
        icon: '👶',
        colorKey: 'paternity',
        description: '',
        paid: true,
        attachmentPolicy: 'None',
        defaultAllowance: 0,
        allowanceUnit: 'days/year',
        maxCarryoverDays: 0,
        perChildEntitlement: true,
        perChildTotalWeeks: 18,
        perChildWeeksPerYear: 5,
        childEligibleUntilAge: 15,
        accrualNotes: '',
        minNoticeDays: 0,
        maxConsecutiveDays: 0,
        halfDayAllowed: false,
        availableTo: 'Both',
        ...overrides,
        // Both flags are server-derived from the name (Domain/SystemLeaveTypes.cs),
        // so a fixture must not be free to disagree with its own name — that is how
        // a test ends up asserting against a shape the API never sends. An explicit
        // override still wins, for the cases that want an impossible combination.
        isSystem: overrides.isSystem
            ?? SYSTEM_NAMES.includes(overrides.name ?? 'Paternity Leave'),
        supportsPerChildEntitlement: overrides.supportsPerChildEntitlement
            ?? PER_CHILD_NAMES.includes(overrides.name ?? 'Paternity Leave'),
    }
}

const SYSTEM_NAMES = ['Annual Leave', 'Maternity Leave', 'Paternity Leave']
const PER_CHILD_NAMES = ['Maternity Leave', 'Paternity Leave']

const PATERNITY = leaveType()

beforeEach(() => {
    vi.clearAllMocks()
    api.getLeaveTypes.mockResolvedValue([PATERNITY])
    api.getAnnualLeaves.mockResolvedValue([])
    api.createLeaveType.mockResolvedValue(PATERNITY)
    api.updateLeaveType.mockResolvedValue(PATERNITY)
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

it('quotes the per-child policy on the card instead of the meaningless 0 allowance', async () => {
    await renderPanel()

    // The weeks take the headline slot the flat allowance would, with the unit
    // beside them; the yearly cap is the line beneath.
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('weeks per child')).toBeInTheDocument()
    expect(screen.getByText('Max 5 weeks per child per leave year')).toBeInTheDocument()
})

/*
 * Per-child entitlement is not a setting an admin chooses -- it is what Maternity
 * and Paternity Leave are. So the three numbers are always visible for those two
 * and there is no switch to reveal them, and every other type gets no section at
 * all rather than a switch it must never turn on. It used to be a toggle on every
 * type, which let an admin put a per-child ledger on, say, Sick Leave -- where a
 * request would then have to name a child.
 */
it.each(['Maternity Leave', 'Paternity Leave'])('always shows the three per-child fields for %s, with no toggle', async (name) => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ name })])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))

    expect(screen.getByLabelText(/1st child/)).toBeInTheDocument()
    expect(screen.getByLabelText(/2nd child/)).toBeInTheDocument()
    expect(screen.getByLabelText(/3rd child onwards/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Max per year, per child/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Eligible until age/)).toBeInTheDocument()

    // The section is labelled, but there is nothing to switch.
    expect(screen.getByText('Per-child entitlement')).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Per-child entitlement' })).not.toBeInTheDocument()
})

it('shows no per-child section at all for any other leave type', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ name: 'Sick Leave', perChildEntitlement: false })])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))

    expect(screen.queryByLabelText(/1st child/)).not.toBeInTheDocument()
    expect(screen.queryByText('Total per child, by birth order')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Max per year, per child/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Eligible until age/)).not.toBeInTheDocument()
    expect(screen.queryByText('Per-child entitlement')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Per-child entitlement' })).not.toBeInTheDocument()
})

// A per-child type keeps its own ledger and must never also be deducted from the
// pooled balance -- the server refuses that combination, and one day counted in
// both would be charged twice.
it('locks "Affects leave balance" off for a per-child type', async () => {
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))

    const balanceSwitch = screen.getByRole('switch', { name: 'Affects leave balance' })
    expect(balanceSwitch).not.toBeChecked()
    expect(balanceSwitch).toBeDisabled()
})

it('leaves "Affects leave balance" editable on an ordinary type', async () => {
    api.getLeaveTypes.mockResolvedValue([
        leaveType({ name: 'Sick Leave', perChildEntitlement: false, affectsBalance: true, defaultAllowance: 25 }),
    ])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))

    const balanceSwitch = screen.getByRole('switch', { name: 'Affects leave balance' })
    expect(balanceSwitch).toBeChecked()
    expect(balanceSwitch).toBeEnabled()
})

/*
 * The server refuses a 0 total, cap or age on a per-child type, so a stored 0 must
 * not reach the field -- the dialog would open already invalid, with the reason
 * shown only after a save. Reachable on any database configured before this
 * section became unconditional: Maternity Leave is seeded with the column at 0.
 */
it('falls back to a valid default rather than opening on a stored 0', async () => {
    api.getLeaveTypes.mockResolvedValue([
        leaveType({
            name: 'Maternity Leave',
            perChildTotalWeeks: 0,
            perChildWeeksPerYear: 0,
            childEligibleUntilAge: 0,
        }),
    ])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))

    expect(screen.getByLabelText(/1st child/)).toHaveValue(18)
    expect(screen.getByLabelText(/2nd child/)).toHaveValue(18)
    expect(screen.getByLabelText(/3rd child onwards/)).toHaveValue(18)
    expect(screen.getByLabelText(/Max per year, per child/)).toHaveValue(5)
    expect(screen.getByLabelText(/Eligible until age/)).toHaveValue(15)
})

it('sends the per-child fields in the update payload', async () => {
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledWith(PATERNITY.id, expect.objectContaining({
        perChildEntitlement: true,
        perChildTotalWeeks: 18,
        perChildWeeksPerYear: 5,
        childEligibleUntilAge: 15,
        affectsBalance: false,
    })))
})

/**
 * The card's Enabled/Disabled switch is a shortcut for an edit, and the endpoint
 * replaces the leave type rather than patching it (see `toggleActive` in
 * LeaveTypesPanel.tsx) -- so a per-child type's 18/5/15 configuration has to be
 * sent back unchanged, or flipping the switch would silently zero it. A zeroed
 * `perChildTotalWeeks` refuses every request for that type (the server's
 * per-child balance calculator has nothing to grant), so this would read as
 * paternity leave quietly breaking with no error anywhere -- not as a crash this
 * suite would otherwise catch.
 */
it('sends a per-child type\'s policy unchanged when toggling it off from the card', async () => {
    await renderPanel()

    // The panel starts with no dialog open, so the card's own switch is the only
    // one on screen.
    fireEvent.click(screen.getAllByRole('switch')[0])

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledWith(PATERNITY.id, expect.objectContaining({
        isActive: false,
        perChildEntitlement: true,
        perChildTotalWeeks: 18,
        perChildWeeksPerYear: 5,
        childEligibleUntilAge: 15,
    })))
})

/*
 * Annual, Maternity and Paternity Leave are seeded and found by name elsewhere, so
 * they cannot be renamed or deleted. The panel follows the server's `isSystem`
 * flag rather than matching names itself -- it used to hard-code 'annual leave',
 * which protected only that one type and only in the UI.
 */
it('makes a built-in leave type\'s name read-only, and says why', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ isSystem: true })])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))

    // Read-only rather than disabled, so the name still reads as a real value and
    // is still submitted back unchanged.
    const nameField = screen.getByLabelText(/^Name/)
    expect(nameField).toHaveAttribute('readonly')
    expect(nameField).not.toBeDisabled()
    expect(screen.getByText('Built-in leave type — the name cannot be changed.')).toBeInTheDocument()
})

it('leaves a custom leave type\'s name editable', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ name: 'Study Leave', isSystem: false })])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))

    const nameField = screen.getByLabelText(/^Name/)
    expect(nameField).not.toHaveAttribute('readonly')
    fireEvent.change(nameField, { target: { value: 'Training Leave' } })
    expect(nameField).toHaveValue('Training Leave')
})

it('offers no delete button for a built-in leave type', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ isSystem: true })])
    await renderPanel()

    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument()
    // Editing it is still offered -- only the name and deletion are off limits.
    expect(screen.getByTitle('Edit')).toBeInTheDocument()
})

it('still offers delete for a custom leave type', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ name: 'Study Leave', isSystem: false })])
    await renderPanel()

    expect(screen.getByTitle('Delete')).toBeInTheDocument()
})

/*
 * Being built in is not the same as being undisableable. Annual leave alone cannot
 * be switched off, because it is the type the enforced balance is a budget for.
 * Maternity and Paternity are protected from renaming and deletion but an
 * organisation that does not offer them must still be able to hide them.
 */
it('keeps annual leave from being switched off', async () => {
    api.getLeaveTypes.mockResolvedValue([
        leaveType({ name: 'Annual Leave', isSystem: true, affectsBalance: true, perChildEntitlement: false, defaultAllowance: 25 }),
    ])
    await renderPanel()

    expect(screen.getAllByRole('switch')[0]).toBeDisabled()
})

it('lets the other built-in types be switched off', async () => {
    for (const name of ['Maternity Leave', 'Paternity Leave']) {
        api.getLeaveTypes.mockResolvedValue([leaveType({ name, isSystem: true })])
        const view = await renderPanel()

        expect(screen.getAllByRole('switch')[0]).toBeEnabled()
        view.unmount()
    }
})

/*
 * A flat "allowance" is meaningless on Maternity and Paternity Leave: their
 * budget is per child, expressed by the three numbers above, and the card has always
 * quoted those instead. Leaving the input on screen invited an admin to set a number
 * nothing reads — and Maternity Leave ships with a stored 90 doing exactly that.
 *
 * So the field is gone for those two and the payload carries 0, including from the
 * Enabled toggle, which resubmits the whole type and would otherwise write the stale
 * 90 straight back.
 */
it.each(['Maternity Leave', 'Paternity Leave'])('offers no flat allowance field for %s', async (name) => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ name, defaultAllowance: 90 })])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))

    expect(screen.queryByLabelText('Allowance')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Unit')).not.toBeInTheDocument()
})

it('still offers the allowance field for a type whose budget really is a flat one', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ name: 'Sick Leave', perChildEntitlement: false, defaultAllowance: 10 })])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))

    expect(screen.getByLabelText('Allowance')).toBeInTheDocument()
})

it('clears the stored allowance when a parental type is saved', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ name: 'Maternity Leave', defaultAllowance: 90 })])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledTimes(1))
    expect(api.updateLeaveType.mock.calls[0][1]).toMatchObject({ defaultAllowance: 0 })
})

/* The trap CLAUDE.md warns about: this toggle resubmits the whole leave type. */
it('does not write the stale allowance back when a parental type is toggled', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ name: 'Maternity Leave', defaultAllowance: 90 })])
    await renderPanel()

    // The card's Enabled switch carries no accessible name, and it is the only
    // switch on screen while no dialog is open.
    fireEvent.click(screen.getByRole('switch'))

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledTimes(1))
    expect(api.updateLeaveType.mock.calls[0][1]).toMatchObject({ defaultAllowance: 0 })
})

/*
 * The three built-in types (Domain/SystemLeaveTypes.cs) may be reconfigured and
 * disabled freely but never renamed or deleted. Until now that only surfaced once
 * you opened the edit dialog and found the name greyed out, or pressed a delete
 * button that was not there. Grouping them says it on the page instead.
 */
it('groups the built-in leave types apart from the custom ones', async () => {
    api.getLeaveTypes.mockResolvedValue([
        leaveType({ id: 1, name: 'Annual Leave' }),
        leaveType({ id: 2, name: 'Sick Leave', perChildEntitlement: false }),
    ])
    await renderPanel()

    const builtIn = within(screen.getByRole('region', { name: 'Built-in leave types' }))
    const custom = within(screen.getByRole('region', { name: 'Custom leave types' }))

    expect(builtIn.getByText('Annual Leave')).toBeInTheDocument()
    expect(builtIn.queryByText('Sick Leave')).not.toBeInTheDocument()
    expect(custom.getByText('Sick Leave')).toBeInTheDocument()
    expect(custom.queryByText('Annual Leave')).not.toBeInTheDocument()
})

// A heading over an empty grid reads as a group that lost its cards rather than
// one the filter excluded, so a section with nothing in it is not rendered.
it('drops a section a filter has emptied rather than heading an empty grid', async () => {
    api.getLeaveTypes.mockResolvedValue([
        leaveType({ id: 1, name: 'Annual Leave' }),
        leaveType({ id: 2, name: 'Sick Leave', perChildEntitlement: false }),
    ])
    await renderPanel()

    fireEvent.change(screen.getByPlaceholderText('Search leave types…'), { target: { value: 'sick' } })

    await waitFor(() =>
        expect(screen.queryByRole('region', { name: 'Built-in leave types' })).not.toBeInTheDocument())
    expect(screen.getByRole('region', { name: 'Custom leave types' })).toBeInTheDocument()
})

/*
 * A built-in type cannot be created, so the create card belongs with the custom
 * ones -- and stays there when an org has none yet, which is the moment it is
 * most needed.
 */
it('keeps the create card with the custom types, even when there are none yet', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ id: 1, name: 'Annual Leave' })])
    await renderPanel()

    const custom = within(screen.getByRole('region', { name: 'Custom leave types' }))
    expect(custom.getByText('Create a new leave type')).toBeInTheDocument()

    const builtIn = within(screen.getByRole('region', { name: 'Built-in leave types' }))
    expect(builtIn.queryByText('Create a new leave type')).not.toBeInTheDocument()
})

/*
 * Military Leave is seeded with colorKey 'military'. The palette is a closed list
 * -- COLOR_KEYS drives the dropdown and HEADER_GRADIENTS the card -- so a key the
 * palette does not carry is a key an admin cannot pick and a card that silently
 * falls back to the neutral grey. These two hold the pair together.
 */
it('offers the military colour in the palette dropdown', async () => {
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))
    fireEvent.mouseDown(screen.getByLabelText('Color theme'))

    expect(within(screen.getByRole('listbox')).getByText('military')).toBeInTheDocument()
})

it('gives a military card its own header rather than the neutral fallback', async () => {
    api.getLeaveTypes.mockResolvedValue([
        leaveType({ id: 1, name: 'Military Leave', icon: '🎖️', colorKey: 'military', perChildEntitlement: false }),
        leaveType({ id: 2, name: 'Sabbatical', icon: '🎓', colorKey: 'default', perChildEntitlement: false }),
    ])
    await renderPanel()

    // icon box -> the min-width box -> the flex row -> the header that carries the gradient
    const headerOf = (icon: string) =>
        screen.getByText(icon).parentElement!.parentElement!.parentElement!
    const military = getComputedStyle(headerOf('🎖️')).background
    const fallback = getComputedStyle(headerOf('🎓')).background

    expect(military).toContain('gradient')
    expect(military).not.toBe(fallback)
})

/*
 * Who a type is available to -- Both, Male or Female -- is a real setting on a
 * custom type and a fixed fact on the three built-in ones: Annual Leave is for
 * everyone, Maternity Leave for women, Paternity Leave for men. The dialog follows
 * the server's `availabilityLocked` flag for the same reason it follows `isSystem`
 * for the name, and the card's toggle has to send the value back unchanged or
 * flipping Enabled would quietly reopen a men-only type to everyone.
 */
it('lets an admin choose who a custom type is available to, and sends the choice', async () => {
    const study = leaveType({ id: 7, name: 'Study Leave', perChildEntitlement: false, availableTo: 'Both' })
    api.getLeaveTypes.mockResolvedValue([study])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))

    const group = screen.getByRole('radiogroup', { name: /available to/i })
    expect(within(group).getByRole('radio', { name: 'Both' })).toBeChecked()
    fireEvent.click(within(group).getByRole('radio', { name: 'Male' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledWith(7, expect.objectContaining({
        availableTo: 'Male',
    })))
})

it.each([
    ['Annual Leave', 'Both'],
    ['Maternity Leave', 'Female'],
    ['Paternity Leave', 'Male'],
] as const)('locks who %s is available to at %s, and says why', async (name, availableTo) => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ name, availableTo, availabilityLocked: true })])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))

    const group = screen.getByRole('radiogroup', { name: /available to/i })
    expect(within(group).getByRole('radio', { name: availableTo })).toBeChecked()
    for (const radio of within(group).getAllByRole('radio')) expect(radio).toBeDisabled()
    expect(screen.getByText('Built-in leave type — who it is available to cannot be changed.')).toBeInTheDocument()
})

it('leaves the choice open on a custom type', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ name: 'Study Leave', availabilityLocked: false })])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))

    const group = screen.getByRole('radiogroup', { name: /available to/i })
    for (const radio of within(group).getAllByRole('radio')) expect(radio).not.toBeDisabled()
})

it('sends who a type is available to unchanged when toggling it from the card', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ availableTo: 'Male' })])
    await renderPanel()

    fireEvent.click(screen.getAllByRole('switch')[0])

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledWith(PATERNITY.id, expect.objectContaining({
        isActive: false,
        availableTo: 'Male',
    })))
})

/*
 * Minimum service. The seeded Unpaid Leave chip has read "Employees after 1yr"
 * since the type existed, and nothing enforced it; `minServiceMonths` is the
 * column MinimumServiceRule now reads. The card has to say it, the dialog has to
 * edit it, and — the trap CLAUDE.md warns about — the Enabled toggle, a full
 * replace, has to send it back unchanged.
 */
const UNPAID = leaveType({ id: 9, name: 'Unpaid Leave', perChildEntitlement: false, minServiceMonths: 12 })

it('says on the card how long an employee has to have served', async () => {
    api.getLeaveTypes.mockResolvedValue([UNPAID])
    await renderPanel()

    expect(screen.getByText(/12 months of service/)).toBeInTheDocument()
})

it('offers a minimum service field prefilled from the type and saves what is typed', async () => {
    api.getLeaveTypes.mockResolvedValue([UNPAID])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))
    const field = screen.getByLabelText(/Min service \(months\)/)
    expect(field).toHaveValue(12)

    fireEvent.change(field, { target: { value: '24' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledTimes(1))
    expect(api.updateLeaveType.mock.calls[0][1]).toMatchObject({ minServiceMonths: 24 })
})

it('sends the minimum service unchanged when toggling a type from the card', async () => {
    api.getLeaveTypes.mockResolvedValue([UNPAID])
    await renderPanel()

    fireEvent.click(screen.getAllByRole('switch')[0])

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledWith(UNPAID.id, expect.objectContaining({
        isActive: false,
        minServiceMonths: 12,
    })))
})

it('says on the card when a type is for one gender only, and nothing when it is for everyone', async () => {
    api.getLeaveTypes.mockResolvedValue([
        leaveType({ id: 1, name: 'Paternity Leave', availableTo: 'Male' }),
        leaveType({ id: 2, name: 'Menstrual Leave', perChildEntitlement: false, availableTo: 'Female' }),
        leaveType({ id: 3, name: 'Study Leave', perChildEntitlement: false, availableTo: 'Both' }),
    ])
    await renderPanel()

    expect(screen.getByText('Male only')).toBeInTheDocument()
    expect(screen.getByText('Female only')).toBeInTheDocument()
    expect(screen.queryByText(/Both only/)).not.toBeInTheDocument()
})

/*
 * The lock must not depend on the server saying so. An API built before the column
 * sends neither `availableTo` nor `availabilityLocked`, and the row for Maternity
 * Leave reads Both until the migration runs -- the dialog still has to show Female,
 * read-only, and send Female back, or the first save would try to open it to men.
 */
it.each([
    ['Annual Leave', 'Both'],
    ['Maternity Leave', 'Female'],
    ['Paternity Leave', 'Male'],
] as const)('fixes %s at %s by name even when the row says otherwise', async (name, fixed) => {
    const stale = leaveType({ name, availableTo: 'Both', availabilityLocked: undefined, perChildEntitlement: false })
    api.getLeaveTypes.mockResolvedValue([stale])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))

    const group = screen.getByRole('radiogroup', { name: /available to/i })
    expect(within(group).getByRole('radio', { name: fixed })).toBeChecked()
    for (const radio of within(group).getAllByRole('radio')) expect(radio).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledWith(stale.id, expect.objectContaining({
        availableTo: fixed,
    })))
})

it('sends the fixed value from the card toggle too, whatever the row says', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ name: 'Paternity Leave', availableTo: 'Both' })])
    await renderPanel()

    fireEvent.click(screen.getAllByRole('switch')[0])

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledWith(PATERNITY.id, expect.objectContaining({
        availableTo: 'Male',
    })))
})

/*
 * The rule behind the card's line: a required document holds *approval*, not
 * filing (AttachmentPolicyRule). The card used to read "Attachment required",
 * which promised a refusal at filing time that call-up papers, dated the day of
 * service, could never satisfy.
 */
it('says on the card that a required document is needed before approval', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ name: 'Military Leave', perChildEntitlement: false, attachmentPolicy: 'Required' })])
    await renderPanel()

    expect(screen.getByText('Document required before approval')).toBeInTheDocument()
})

/*
 * Pro-rating the first year. `proRateFirstYear` is the switch the balance
 * calculator reads: on, a September joiner on 23 days is measured against 8 in
 * their first leave year. It belongs only to the balance type — the server refuses
 * it anywhere else — so the dialog offers it only beside "Affects leave balance".
 * The card has to say it, and the Enabled toggle, a full replace, has to send it
 * back unchanged or flipping the switch silently turns pro-rating off.
 */
const ANNUAL = leaveType({
    id: 11, name: 'Annual Leave', perChildEntitlement: false, affectsBalance: true,
    defaultAllowance: 23, proRateFirstYear: true,
})

it('says on the card when the first year is pro-rated, and nothing when it is not', async () => {
    api.getLeaveTypes.mockResolvedValue([
        ANNUAL,
        leaveType({ id: 12, name: 'Sick Leave', perChildEntitlement: false, affectsBalance: false, proRateFirstYear: false }),
    ])
    await renderPanel()

    expect(screen.getAllByText(/pro-rated from the start date/i)).toHaveLength(1)
})

it('offers the pro-rating switch prefilled from the type and saves what is chosen', async () => {
    api.getLeaveTypes.mockResolvedValue([{ ...ANNUAL, proRateFirstYear: false }])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))
    const proRate = screen.getByRole('switch', { name: /Pro-rate the first year/ })
    expect(proRate).not.toBeChecked()

    fireEvent.click(proRate)
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledTimes(1))
    expect(api.updateLeaveType.mock.calls[0][1]).toMatchObject({ proRateFirstYear: true })
})

it('offers the pro-rating switch on a type that does not affect the balance, and sends it', async () => {
    api.getLeaveTypes.mockResolvedValue([
        leaveType({ id: 12, name: 'Sick Leave', perChildEntitlement: false, affectsBalance: false }),
    ])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))
    fireEvent.click(screen.getByRole('switch', { name: /Pro-rate the first year/ }))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledTimes(1))
    expect(api.updateLeaveType.mock.calls[0][1]).toMatchObject({ affectsBalance: false, proRateFirstYear: true })
})

it('hides the pro-rating switch on a per-child type, whose budget is bounded by the child\'s age', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ id: 1, name: 'Paternity Leave' })])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))

    expect(screen.queryByRole('switch', { name: /Pro-rate the first year/ })).not.toBeInTheDocument()
})

it('says on the card when a non-balance type is pro-rated', async () => {
    api.getLeaveTypes.mockResolvedValue([
        leaveType({ id: 12, name: 'Sick Leave', perChildEntitlement: false, affectsBalance: false, proRateFirstYear: true }),
    ])
    await renderPanel()

    expect(screen.getByText(/pro-rated from the start date/i)).toBeInTheDocument()
})

it('sends the pro-rating switch unchanged when toggling a type from the card', async () => {
    api.getLeaveTypes.mockResolvedValue([ANNUAL])
    await renderPanel()

    fireEvent.click(screen.getAllByRole('switch')[0])

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledWith(ANNUAL.id, expect.objectContaining({
        isActive: false,
        proRateFirstYear: true,
    })))
})

/*
 * The lifetime total can differ by birth order -- 22 weeks for the 1st and 2nd
 * child and 26 from the 3rd is the maternity policy that could not be entered
 * with one "per child" field. The two later columns are nullable and null means
 * "the same as the one before", so a stored 18 / null / null opens as 18, 18, 18
 * and every field is pre-filled: the admin only changes the ones that differ.
 */
const MATERNITY_22_22_26 = leaveType({
    id: 2,
    name: 'Maternity Leave',
    availableTo: 'Female',
    perChildTotalWeeks: 22,
    perChildTotalWeeksSecondChild: null,
    perChildTotalWeeksThirdChildOnwards: 26,
    perChildWeeksPerYear: 22,
})

it('opens the birth-order totals resolved, a blank later column reading as the one before it', async () => {
    api.getLeaveTypes.mockResolvedValue([MATERNITY_22_22_26])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))

    expect(screen.getByLabelText(/1st child/)).toHaveValue(22)
    expect(screen.getByLabelText(/2nd child/)).toHaveValue(22)
    expect(screen.getByLabelText(/3rd child onwards/)).toHaveValue(26)
})

it('saves a policy that differs by birth order', async () => {
    api.getLeaveTypes.mockResolvedValue([leaveType({ name: 'Maternity Leave', availableTo: 'Female' })])
    await renderPanel()

    fireEvent.click(screen.getByTitle('Edit'))
    fireEvent.change(screen.getByLabelText(/1st child/), { target: { value: '22' } })
    fireEvent.change(screen.getByLabelText(/2nd child/), { target: { value: '22' } })
    fireEvent.change(screen.getByLabelText(/3rd child onwards/), { target: { value: '26' } })
    fireEvent.change(screen.getByLabelText(/Max per year, per child/), { target: { value: '22' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledWith(PATERNITY.id, expect.objectContaining({
        perChildEntitlement: true,
        perChildTotalWeeks: 22,
        perChildTotalWeeksSecondChild: 22,
        perChildTotalWeeksThirdChildOnwards: 26,
        perChildWeeksPerYear: 22,
    })))
})

/*
 * Same trap as the 18/5/15 case above: the card's switch is a full replace, so
 * the two later columns have to travel back exactly as stored -- null included.
 * Flattening a null to 0 or dropping it would silently turn 22 / 22 / 26 back
 * into 22 for everyone the moment somebody flipped Enabled.
 */
it('sends the birth-order totals unchanged, null included, when toggling from the card', async () => {
    api.getLeaveTypes.mockResolvedValue([MATERNITY_22_22_26])
    await renderPanel()

    fireEvent.click(screen.getAllByRole('switch')[0])

    await waitFor(() => expect(api.updateLeaveType).toHaveBeenCalledWith(MATERNITY_22_22_26.id, expect.objectContaining({
        isActive: false,
        perChildTotalWeeks: 22,
        perChildTotalWeeksSecondChild: null,
        perChildTotalWeeksThirdChildOnwards: 26,
    })))
})

/*
 * The headline is sized for a short figure, so a policy that differs by birth
 * order shows its range there and spells itself out on the line beneath. The
 * whole sentence used to sit in the 28px headline and wrapped over four lines.
 */
it('describes a policy that differs by birth order on the card', async () => {
    api.getLeaveTypes.mockResolvedValue([MATERNITY_22_22_26])
    await renderPanel()

    expect(screen.getByText('22–26')).toBeInTheDocument()
    expect(screen.getByText('weeks per child')).toBeInTheDocument()
    expect(screen.getByText('22 weeks for the 1st and 2nd child · 26 weeks from the 3rd · max 22 weeks/year')).toBeInTheDocument()
})
