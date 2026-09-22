import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAdminUser } from '../../lib/api'
import AdminUsersPanel from './AdminUsersPanel'

// An admin creating a user must not choose a password — the new user sets their
// own from the welcome email — and a display name is now mandatory.
vi.mock('../../lib/api', () => ({
    getAdminUsers: vi.fn(),
    getAppSettings: vi.fn(),
    getEmployeeProfiles: vi.fn(),
    getDepartments: vi.fn(),
    getLeaveTypes: vi.fn(),
    getUserPresence: vi.fn(),
    getLeaveStatusHistories: vi.fn(),
    getTimesheetStatusHistories: vi.fn(),
    getAnnualLeaves: vi.fn(),
    createAdminUser: vi.fn(),
    updateAdminUser: vi.fn(),
    setAdminUserRoles: vi.fn(),
    confirmAdminUserEmail: vi.fn(),
    setAdminUserActive: vi.fn(),
    deleteAdminUser: vi.fn(),
    updateEmployeeProfile: vi.fn(),
    getChildren: vi.fn(),
    createChild: vi.fn(),
    updateChild: vi.fn(),
    deleteChild: vi.fn(),
}))

// Only SweetAlert is stubbed: sweetalert2 renders a real modal and resolves on a
// click nobody makes in jsdom, so an unmocked confirm hangs the test. Everything
// else in ../ui (AppDialog and friends) stays real, because the dialogs under
// test are built from it. vi.hoisted, because vi.mock's factory is lifted above
// ordinary declarations and would not see a plain const.
const { sweetAlertFire } = vi.hoisted(() => ({ sweetAlertFire: vi.fn() }))

vi.mock('../ui', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../ui')>()),
    SweetAlert: { fire: sweetAlertFire },
}))

const api = vi.mocked(await import('../../lib/api'))

const DEPARTMENT = { id: 7, name: 'Engineering', code: 'ENG', isActive: true }

/* The annual-leave allowance an employee's entitlement is measured against comes from
   Leave Types (25 days/year as seeded), not from a number hard-coded in the panel. */
const ANNUAL_LEAVE_TYPE = {
    id: 1, name: 'Annual Leave', isActive: true, affectsBalance: true, defaultAllowance: 25,
    allowanceUnit: 'days/year',
}

beforeEach(() => {
    vi.clearAllMocks()

    api.getAdminUsers.mockResolvedValue([])
    api.getEmployeeProfiles.mockResolvedValue([])
    api.getDepartments.mockResolvedValue([DEPARTMENT] as never)
    api.getUserPresence.mockResolvedValue([])
    api.getLeaveStatusHistories.mockResolvedValue([])
    api.getTimesheetStatusHistories.mockResolvedValue([])
    api.getAnnualLeaves.mockResolvedValue([])
    api.getLeaveTypes.mockResolvedValue([ANNUAL_LEAVE_TYPE] as never)
    api.getAppSettings.mockResolvedValue({} as never)
})

function renderPanel() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    return render(
        <QueryClientProvider client={queryClient}>
            <AdminUsersPanel />
        </QueryClientProvider>,
    )
}

/** Opens the Create User dialog and returns it. */
async function openCreateDialog() {
    renderPanel()

    const addUser = await screen.findByText('+ Add user')
    fireEvent.click(addUser)

    return screen.getByRole('dialog')
}

describe('AdminUsersPanel — Create User', () => {
    it('offers no password field', async () => {
        const dialog = await openCreateDialog()

        expect(within(dialog).queryByLabelText(/password/i)).not.toBeInTheDocument()
        expect(dialog.querySelectorAll('input[type="password"]')).toHaveLength(0)
    })

    it('explains that the new user sets their own password', async () => {
        const dialog = await openCreateDialog()

        expect(within(dialog).getByText(/secure link to set their own/i)).toBeInTheDocument()
    })

    it('will not submit without a display name', async () => {
        const dialog = await openCreateDialog()

        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'newjoiner@example.test' } })
        await selectDepartment(dialog)
        setDateOfBirth(dialog)
        setGender(dialog)
        setEmploymentStartDate(dialog)

        expect(within(dialog).getByText('Display name is required')).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeDisabled()

        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Joiner' } })

        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeEnabled()
    })

    it('sends the account details without a password', async () => {
        const dialog = await openCreateDialog()

        api.createAdminUser.mockResolvedValue({
            id: 'u1',
            userName: 'newjoiner@example.test',
            email: 'newjoiner@example.test',
            displayName: 'New Joiner',
            imageUrl: '',
            emailConfirmed: true,
            isActive: true,
            roles: ['Employee'],
            inviteEmailSent: true,
        })

        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: ' newjoiner@example.test ' } })
        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Joiner' } })
        await selectDepartment(dialog)
        setDateOfBirth(dialog)
        setGender(dialog)
        setEmploymentStartDate(dialog)

        fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

        await waitFor(() => expect(createAdminUser).toHaveBeenCalledTimes(1))

        // toEqual on the payload alone: React Query passes its own second
        // argument, and an exact match is what proves no `password` slipped in.
        expect(api.createAdminUser.mock.calls[0][0]).toEqual({
            email: 'newjoiner@example.test',
            displayName: 'New Joiner',
            roles: ['Employee'],
            departmentId: DEPARTMENT.id,
            managerId: null,
            jobTitle: null,
            // No entitlement at all: the server reads the allowance off the
            // balance-affecting leave type (CreateAdminUser), so the client has no
            // figure to send and no chance to send a stale one.
            phoneNumber: null,
            dateOfBirth: '1990-03-04',
            employmentStartDate: '2024-02-01',
            // Required — the API refuses a null, and Create is disabled until one
            // is picked (see "recording gender" below).
            gender: 'Female',
        })
    })

    // The account has no password until the invite is used, so a send failure
    // has to reach the admin rather than dying in the log.
    it('reports whether the welcome email went out', async () => {
        const dialog = await openCreateDialog()

        api.createAdminUser.mockResolvedValue({
            id: 'u1',
            userName: 'newjoiner@example.test',
            email: 'newjoiner@example.test',
            displayName: 'New Joiner',
            imageUrl: '',
            emailConfirmed: true,
            isActive: true,
            roles: ['Employee'],
            inviteEmailSent: false,
        })

        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'newjoiner@example.test' } })
        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Joiner' } })
        await selectDepartment(dialog)
        setDateOfBirth(dialog)
        setGender(dialog)
        setEmploymentStartDate(dialog)
        fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

        expect(await screen.findByText(/the welcome email could not be sent/i)).toBeInTheDocument()
        expect(screen.getByText(/forgot password/i)).toBeInTheDocument()
    })
})

// Presence must come from the check-in state keyed by user id. It was
// previously inferred client-side by substring-matching the company activity
// feed, where the synthetic "Not checked in" row contains "checked in" — so the
// panel badged exactly the people who had *not* checked in as Online.
describe('AdminUsersPanel — presence', () => {
    const USERS = [
        { id: 'u-in', userName: 'in@example.test', email: 'in@example.test', displayName: 'Checked In', imageUrl: '', emailConfirmed: true, roles: ['Employee'] },
        { id: 'u-out', userName: 'out@example.test', email: 'out@example.test', displayName: 'Never In', imageUrl: '', emailConfirmed: true, roles: ['Employee'] },
        { id: 'u-done', userName: 'done@example.test', email: 'done@example.test', displayName: 'Checked Out', imageUrl: '', emailConfirmed: true, roles: ['Employee'] },
        { id: 'u-break', userName: 'break@example.test', email: 'break@example.test', displayName: 'Break User', imageUrl: '', emailConfirmed: true, roles: ['Employee'] },
    ]

    beforeEach(() => {
        api.getAdminUsers.mockResolvedValue(USERS as never)
        api.getUserPresence.mockResolvedValue([
            { userId: 'u-in', status: 'online', checkInAt: '2026-08-04T08:00:00Z', lastActivityAt: '2026-08-04T08:00:00Z', isAutoBreak: false },
            { userId: 'u-out', status: 'offline', checkInAt: null, lastActivityAt: null, isAutoBreak: false },
            { userId: 'u-done', status: 'offline', checkInAt: '2026-08-04T08:00:00Z', lastActivityAt: '2026-08-04T17:00:00Z', isAutoBreak: false },
            { userId: 'u-break', status: 'away', checkInAt: '2026-08-04T08:00:00Z', lastActivityAt: '2026-08-04T12:00:00Z', isAutoBreak: false },
        ])
    })

    it('badges one user Online, one On Break, and the rest Offline', async () => {
        renderPanel()

        // Four users: only the open check-in is Online, the break is On Break, and
        // both "never checked in" and "checked out" are Offline.
        expect(await screen.findByText('Online')).toBeInTheDocument()
        expect(screen.getAllByText('Online')).toHaveLength(1)
        expect(screen.getAllByText('On Break')).toHaveLength(1)
        expect(screen.getAllByText('Offline')).toHaveLength(2)
    })

    // The regression itself: never checking in must never read as Online.
    it('shows a user who has never checked in as Offline with no activity', async () => {
        renderPanel()

        await screen.findByText('Never In')
        expect(screen.getByText('No activity')).toBeInTheDocument()
    })

    it('counts and filters only checked-in users as Online', async () => {
        renderPanel()

        const tab = await screen.findByRole('button', { name: /🟢 Online/ })
        expect(within(tab).getByText('1')).toBeInTheDocument()

        fireEvent.click(tab)

        expect(screen.getByText('Checked In')).toBeInTheDocument()
        for (const absent of ['Never In', 'Checked Out', 'Break User']) {
            expect(screen.queryByText(absent)).not.toBeInTheDocument()
        }
    })
})

// A user's manager is whoever manages their department, not a free pick — an
// admin could previously assign anyone (even across departments) as the person
// this user reports to, which drifted from what the Departments page showed as
// that department's manager.
describe('AdminUsersPanel — manager is derived from department', () => {
    const MANAGER_USER = { id: 'u-manager', userName: 'manager@example.test', email: 'manager@example.test', displayName: 'Andreas Georgiou', imageUrl: '', emailConfirmed: true, roles: ['Manager'], dateOfBirth: '1990-03-04', gender: 'Female' }
    const EMPLOYEE_USER = { id: 'u-employee', userName: 'employee@example.test', email: 'employee@example.test', displayName: 'Theodoros Iona', imageUrl: '', emailConfirmed: true, roles: ['Employee'], dateOfBirth: '1990-03-04', gender: 'Female' }

    const MANAGER_PROFILE = { id: 'p-manager', userId: 'u-manager', displayName: 'Andreas Georgiou', departmentId: DEPARTMENT.id, managerId: null, annualLeaveEntitlement: 20, leaveBalance: 20, jobTitle: null, employmentStartDate: '2024-02-01', createdAt: '2026-01-01' }
    const EMPLOYEE_PROFILE = { id: 'p-employee', userId: 'u-employee', displayName: 'Theodoros Iona', departmentId: DEPARTMENT.id, managerId: null, annualLeaveEntitlement: 20, leaveBalance: 20, jobTitle: null, employmentStartDate: '2024-02-01', createdAt: '2026-01-01' }

    beforeEach(() => {
        api.getAdminUsers.mockResolvedValue([MANAGER_USER, EMPLOYEE_USER] as never)
        api.getEmployeeProfiles.mockResolvedValue([MANAGER_PROFILE, EMPLOYEE_PROFILE] as never)
    })

    async function openEditFor(displayName: string) {
        renderPanel()
        const nameEl = await screen.findByText(displayName)
        // Four ancestors up from the name text: its own box -> the "User" cell
        // -> the row's grid -> the row container that also holds the action buttons.
        const row = nameEl.parentElement!.parentElement!.parentElement!.parentElement!
        fireEvent.click(within(row).getByTitle('Edit'))
        return screen.getByRole('dialog')
    }

    it('shows the department manager as a fixed value, not a pickable dropdown', async () => {
        const dialog = await openEditFor('Theodoros Iona')

        expect(await within(dialog).findByDisplayValue('Andreas Georgiou')).toBeInTheDocument()
        expect(within(dialog).queryByRole('combobox', { name: /manager/i })).not.toBeInTheDocument()
        // The Manager field is read-only rather than disabled, so the derived name
        // renders as a filled-in value instead of greyed-out placeholder-looking
        // text. getByLabelText would also match the "Manager" role radio, so target
        // the textbox role specifically.
        const managerField = within(dialog).getByRole('textbox', { name: 'Manager' })
        expect(managerField).toHaveAttribute('readonly')
        expect(managerField).not.toBeDisabled()
    })

    it('sends the department manager\'s profile id on save without letting it be edited', async () => {
        const dialog = await openEditFor('Theodoros Iona')

        // Wait for the department-driven effect to populate the form before
        // saving — otherwise the click races the microtask that sets it.
        await within(dialog).findByDisplayValue('Andreas Georgiou')
        fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

        await waitFor(() => expect(api.updateEmployeeProfile).toHaveBeenCalledTimes(1))
        expect(api.updateEmployeeProfile.mock.calls[0][0]).toMatchObject({
            id: EMPLOYEE_PROFILE.id,
            managerId: MANAGER_PROFILE.id,
        })
    })

    // A manager *is* the person the field would name, so they get no Manager field
    // at all — and never themself, which is what this used to guard against.
    it('offers no manager for a manager\'s own record, and saves none', async () => {
        const dialog = await openEditFor('Andreas Georgiou')

        // Wait for the role-driven effect to settle before reading the form.
        await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'Manager' })).toBeChecked())

        expect(within(dialog).queryByRole('textbox', { name: 'Manager' })).not.toBeInTheDocument()
        expect(within(dialog).queryByText(/set by the department's manager/i)).not.toBeInTheDocument()
        // The rest of the Profile section stays.
        expect(within(dialog).getByText('Profile')).toBeInTheDocument()

        fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

        await waitFor(() => expect(api.updateEmployeeProfile).toHaveBeenCalledTimes(1))
        expect(api.updateEmployeeProfile.mock.calls[0][0]).toMatchObject({
            id: MANAGER_PROFILE.id,
            managerId: null,
        })
    })

    // The hidden field must not rewrite what is stored: a manager who already has
    // a managerId keeps it on save rather than having it cleared or re-derived.
    it('leaves a manager\'s stored managerId untouched when the field is hidden', async () => {
        api.getEmployeeProfiles.mockResolvedValue([
            { ...MANAGER_PROFILE, managerId: 'p-someone-else' },
            EMPLOYEE_PROFILE,
        ] as never)

        const dialog = await openEditFor('Andreas Georgiou')
        await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'Manager' })).toBeChecked())

        fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

        await waitFor(() => expect(api.updateEmployeeProfile).toHaveBeenCalledTimes(1))
        expect(api.updateEmployeeProfile.mock.calls[0][0]).toMatchObject({
            id: MANAGER_PROFILE.id,
            managerId: 'p-someone-else',
        })
    })

    // Create User must land a new hire on the same manager Edit would show for
    // that department — the two forms should never disagree about who manages whom.
    it('Create User picks up the department manager too, once a department is chosen', async () => {
        const dialog = await openCreateDialog()

        api.createAdminUser.mockResolvedValue({
            id: 'u-new',
            userName: 'newhire@example.test',
            email: 'newhire@example.test',
            displayName: 'New Hire',
            imageUrl: '',
            emailConfirmed: true,
            isActive: true,
            roles: ['Employee'],
            inviteEmailSent: true,
        })

        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'newhire@example.test' } })
        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Hire' } })
        await selectDepartment(dialog)
        setDateOfBirth(dialog)
        setGender(dialog)
        setEmploymentStartDate(dialog)

        expect(await within(dialog).findByDisplayValue('Andreas Georgiou')).toBeInTheDocument()

        fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

        await waitFor(() => expect(api.createAdminUser).toHaveBeenCalledTimes(1))
        expect(api.createAdminUser.mock.calls[0][0]).toMatchObject({
            managerId: MANAGER_PROFILE.id,
        })
    })

    it('hides the Manager field when creating a manager, and sends no manager', async () => {
        const dialog = await openCreateDialog()

        api.createAdminUser.mockResolvedValue({
            id: 'u-new',
            userName: 'newmanager@example.test',
            email: 'newmanager@example.test',
            displayName: 'New Manager',
            imageUrl: '',
            emailConfirmed: true,
            isActive: true,
            roles: ['Manager'],
            inviteEmailSent: true,
        })

        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'newmanager@example.test' } })
        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Manager' } })
        fireEvent.click(within(dialog).getByRole('radio', { name: 'Manager' }))
        await selectDepartment(dialog)
        setDateOfBirth(dialog)
        setGender(dialog)
        setEmploymentStartDate(dialog)

        expect(within(dialog).queryByRole('textbox', { name: 'Manager' })).not.toBeInTheDocument()
        expect(within(dialog).queryByDisplayValue('Andreas Georgiou')).not.toBeInTheDocument()
        // Department, Job title and entitlement are still theirs to set.
        expect(within(dialog).getByDisplayValue(`${DEPARTMENT.id}`)).toBeInTheDocument()

        fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

        await waitFor(() => expect(api.createAdminUser).toHaveBeenCalledTimes(1))
        expect(api.createAdminUser.mock.calls[0][0]).toMatchObject({
            roles: ['Manager'],
            departmentId: DEPARTMENT.id,
            managerId: null,
        })
    })
})

// A user holds exactly one role, so the role picker must be radios rather than
// checkboxes — checkboxes let an admin tick Manager *and* Employee.
describe('AdminUsersPanel — role selection', () => {
    it('offers the three roles as a single choice, not as checkboxes', async () => {
        const dialog = await openCreateDialog()

        for (const role of ['Admin', 'Manager', 'Employee']) {
            expect(within(dialog).getByRole('radio', { name: role })).toBeInTheDocument()
            expect(within(dialog).queryByRole('checkbox', { name: role })).not.toBeInTheDocument()
        }

        // Employee is the default for a new joiner.
        expect(within(dialog).getByRole('radio', { name: 'Employee' })).toBeChecked()
    })

    it('replaces the current role instead of adding to it', async () => {
        const dialog = await openCreateDialog()

        fireEvent.click(within(dialog).getByRole('radio', { name: 'Manager' }))
        expect(within(dialog).getByRole('radio', { name: 'Manager' })).toBeChecked()
        expect(within(dialog).getByRole('radio', { name: 'Employee' })).not.toBeChecked()

        fireEvent.click(within(dialog).getByRole('radio', { name: 'Admin' }))
        expect(within(dialog).getByRole('radio', { name: 'Admin' })).toBeChecked()
        expect(within(dialog).getByRole('radio', { name: 'Manager' })).not.toBeChecked()

        // Exactly one role checked at any time. Scoped to the role group by its
        // input name rather than counting every radio in the dialog — Gender is
        // a radio group too, and always has one of its own selected.
        const checked = dialog.querySelectorAll('input[name="create-user-role"]:checked')
        expect(checked).toHaveLength(1)
    })

    it('submits the chosen role as the only role', async () => {
        const dialog = await openCreateDialog()

        api.createAdminUser.mockResolvedValue({
            id: 'u1',
            userName: 'newjoiner@example.test',
            email: 'newjoiner@example.test',
            displayName: 'New Joiner',
            imageUrl: '',
            emailConfirmed: true,
            isActive: true,
            roles: ['Manager'],
            inviteEmailSent: true,
        })

        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'newjoiner@example.test' } })
        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Joiner' } })
        fireEvent.click(within(dialog).getByRole('radio', { name: 'Manager' }))
        await selectDepartment(dialog)
        setDateOfBirth(dialog)
        setGender(dialog)
        setEmploymentStartDate(dialog)
        fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

        await waitFor(() => expect(createAdminUser).toHaveBeenCalledTimes(1))

        expect(api.createAdminUser.mock.calls[0][0].roles).toEqual(['Manager'])
    })
})

// Admins sit outside the department structure, so Create User hides the whole
// Profile section for them. A profile row is still written server-side and its
// DepartmentId is a required FK, so the panel has to supply one without asking.
describe('AdminUsersPanel — Admin hides the Profile section', () => {
    it('drops the profile fields when Admin is picked, and brings them back otherwise', async () => {
        const dialog = await openCreateDialog()

        expect(within(dialog).getByText('Profile')).toBeInTheDocument()

        fireEvent.click(within(dialog).getByRole('radio', { name: 'Admin' }))

        expect(within(dialog).queryByText('Profile')).not.toBeInTheDocument()
        expect(within(dialog).queryByLabelText(/department/i)).not.toBeInTheDocument()
        expect(within(dialog).queryByLabelText(/job title/i)).not.toBeInTheDocument()
        expect(within(dialog).queryByLabelText(/annual leave entitlement/i)).not.toBeInTheDocument()
        // The read-only Manager field goes with them — not asserted by label, since
        // "Manager" also names one of the role radios above.
        expect(within(dialog).queryByText(/set by the department's manager/i)).not.toBeInTheDocument()

        // Not a one-way door: switching back off Admin restores the section.
        fireEvent.click(within(dialog).getByRole('radio', { name: 'Manager' }))
        expect(within(dialog).getByText('Profile')).toBeInTheDocument()
    })

    /// The dialog hides the department for an Admin and used to send "the first
    /// active department" in its place, because the column was a required foreign
    /// key. That invented assignment was not invisible: it put the admin in that
    /// department's team strip and headcount on the Departments panel, in its "not
    /// checked in" warning, and in the blocker list that refused to delete it. The
    /// field it never asked about now goes unanswered.
    it('creates an admin with no department at all, not a fallback one', async () => {
        const dialog = await openCreateDialog()

        api.createAdminUser.mockResolvedValue({
            id: 'u1',
            userName: 'newadmin@example.test',
            email: 'newadmin@example.test',
            displayName: 'New Admin',
            imageUrl: '',
            emailConfirmed: true,
            isActive: true,
            roles: ['Admin'],
            inviteEmailSent: true,
        })

        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'newadmin@example.test' } })
        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Admin' } })
        fireEvent.click(within(dialog).getByRole('radio', { name: 'Admin' }))
        setDateOfBirth(dialog)
        setEmploymentStartDate(dialog)

        // No department to select, and no gender either — Create is enabled all
        // the same.
        const create = within(dialog).getByRole('button', { name: /^create$/i })
        expect(create).toBeEnabled()
        fireEvent.click(create)

        await waitFor(() => expect(createAdminUser).toHaveBeenCalledTimes(1))

        expect(api.createAdminUser.mock.calls[0][0]).toMatchObject({
            roles: ['Admin'],
            departmentId: null,
            managerId: null,
            jobTitle: null,
            gender: null,
        })
    })

    /* Gender sits in Personal details rather than Profile, but it follows the same
       rule: it is recorded to decide who is offered gender-restricted leave, which
       an Admin is outside of, and the API refuses one for them outright. So the
       radios go with the role, and Create must not gate on a field it is not
       showing — the report that started this was an Edit User dialog for an Admin
       stuck on "Gender is required." with nothing the admin could do about it. */
    it('hides Gender when Admin is picked, and brings it back otherwise', async () => {
        const dialog = await openCreateDialog()

        expect(within(dialog).getByRole('radio', { name: 'Female' })).toBeInTheDocument()

        fireEvent.click(within(dialog).getByRole('radio', { name: 'Admin' }))

        expect(within(dialog).queryByRole('radio', { name: 'Male' })).not.toBeInTheDocument()
        expect(within(dialog).queryByRole('radio', { name: 'Female' })).not.toBeInTheDocument()
        expect(within(dialog).queryByText('Gender is required.')).not.toBeInTheDocument()

        fireEvent.click(within(dialog).getByRole('radio', { name: 'Employee' }))
        expect(within(dialog).getByRole('radio', { name: 'Female' })).toBeInTheDocument()
    })

    // A gender picked *before* the role was switched to Admin is not sent: the API
    // refuses one for an Admin, and the dialog stopped showing it.
    it('does not send a gender picked before the role was switched to Admin', async () => {
        const dialog = await openCreateDialog()

        api.createAdminUser.mockResolvedValue({
            id: 'u1', userName: 'newadmin@example.test', email: 'newadmin@example.test', displayName: 'New Admin',
            imageUrl: '', emailConfirmed: true, isActive: true, roles: ['Admin'], inviteEmailSent: true,
        })

        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'newadmin@example.test' } })
        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Admin' } })
        setDateOfBirth(dialog)
        setGender(dialog, 'Male')
        fireEvent.click(within(dialog).getByRole('radio', { name: 'Admin' }))

        fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

        await waitFor(() => expect(createAdminUser).toHaveBeenCalledTimes(1))
        expect(api.createAdminUser.mock.calls[0][0]).toMatchObject({ roles: ['Admin'], gender: null })
    })

    // An Employee or Manager still has to be placed in one: it is where their
    // manager, their leave routing and their project visibility come from.
    it('still requires a department for every other role', async () => {
        const dialog = await openCreateDialog()

        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'newjoiner@example.test' } })
        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Joiner' } })

        for (const role of ['Employee', 'Manager']) {
            fireEvent.click(within(dialog).getByRole('radio', { name: role }))
            expect(within(dialog).getByText('Department is required')).toBeInTheDocument()
            expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeDisabled()
        }
    })
})

// An Admin sits outside the department structure, so the edit dialog has to be
// able to move a profile out of a department as well as into one — and must not
// send back the department a promoted user is leaving behind.
describe('AdminUsersPanel — editing across the Admin boundary', () => {
    const EMPLOYEE_USER = { id: 'u-employee', userName: 'employee@example.test', email: 'employee@example.test', displayName: 'Theodoros Iona', imageUrl: '', emailConfirmed: true, isActive: true, roles: ['Employee'], dateOfBirth: '1990-03-04', gender: 'Female' }
    // No gender: an Admin is never asked one, and the API refuses one for them.
    const ADMIN_USER = { id: 'u-admin', userName: 'admin@example.test', email: 'admin@example.test', displayName: 'Admin User', imageUrl: '', emailConfirmed: true, isActive: true, roles: ['Admin'], dateOfBirth: '1990-03-04', gender: null }

    const EMPLOYEE_PROFILE = { id: 'p-employee', userId: 'u-employee', displayName: 'Theodoros Iona', departmentId: DEPARTMENT.id, managerId: null, annualLeaveEntitlement: 20, leaveBalance: 20, jobTitle: null, employmentStartDate: '2024-02-01', createdAt: '2026-01-01' }
    // What the server now returns for an admin: a profile, and no department.
    const ADMIN_PROFILE = { id: 'p-admin', userId: 'u-admin', displayName: 'Admin User', departmentId: null, managerId: null, annualLeaveEntitlement: 20, leaveBalance: 20, jobTitle: null, employmentStartDate: '2024-02-01', createdAt: '2026-01-01' }

    beforeEach(() => {
        api.getAdminUsers.mockResolvedValue([EMPLOYEE_USER, ADMIN_USER] as never)
        api.getEmployeeProfiles.mockResolvedValue([EMPLOYEE_PROFILE, ADMIN_PROFILE] as never)
    })

    async function openEditFor(displayName: string) {
        renderPanel()
        const nameEl = await screen.findByText(displayName)
        const row = nameEl.parentElement!.parentElement!.parentElement!.parentElement!
        fireEvent.click(within(row).getByTitle('Edit'))
        return screen.getByRole('dialog')
    }

    it('clears the department when an employee is promoted to Admin', async () => {
        const dialog = await openEditFor('Theodoros Iona')

        await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'Employee' })).toBeChecked())
        fireEvent.click(within(dialog).getByRole('radio', { name: 'Admin' }))

        fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

        await waitFor(() => expect(api.updateEmployeeProfile).toHaveBeenCalledTimes(1))
        // Not DEPARTMENT.id: the department the dialog stopped showing must not be
        // the one it quietly sends back.
        expect(api.updateEmployeeProfile.mock.calls[0][0]).toMatchObject({
            id: EMPLOYEE_PROFILE.id,
            departmentId: null,
        })
    })

    it('saves an admin with no department rather than inventing one', async () => {
        const dialog = await openEditFor('Admin User')

        await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'Admin' })).toBeChecked())
        fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

        await waitFor(() => expect(api.updateEmployeeProfile).toHaveBeenCalledTimes(1))
        expect(api.updateEmployeeProfile.mock.calls[0][0]).toMatchObject({
            id: ADMIN_PROFILE.id,
            departmentId: null,
        })
    })

    // The other direction has to supply one. An admin has no department to inherit,
    // so demoting them without picking a department would save a nobody: invisible
    // to every manager, with no leave routing.
    it('will not save a demoted admin until a department is picked', async () => {
        const dialog = await openEditFor('Admin User')

        await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'Admin' })).toBeChecked())
        fireEvent.click(within(dialog).getByRole('radio', { name: 'Employee' }))

        expect(within(dialog).getByText('Department is required')).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeDisabled()

        await selectDepartment(dialog)
        setDateOfBirth(dialog)
        setGender(dialog)
        setEmploymentStartDate(dialog)

        expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeEnabled()
        fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

        await waitFor(() => expect(api.updateEmployeeProfile).toHaveBeenCalledTimes(1))
        expect(api.updateEmployeeProfile.mock.calls[0][0]).toMatchObject({
            id: ADMIN_PROFILE.id,
            departmentId: DEPARTMENT.id,
        })
    })

    /* Gender follows the role the same way, though it sits in Personal details:
       an Admin is never asked one and the API refuses one for them. The report
       that started this was exactly this dialog, opened on an Admin, stuck on
       "Gender is required." with Save disabled and no way past it. */
    it('hides Gender for an admin and saves them with none', async () => {
        const dialog = await openEditFor('Admin User')

        await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'Admin' })).toBeChecked())
        expect(within(dialog).queryByRole('radio', { name: 'Male' })).not.toBeInTheDocument()
        expect(within(dialog).queryByRole('radio', { name: 'Female' })).not.toBeInTheDocument()
        expect(within(dialog).queryByText('Gender is required.')).not.toBeInTheDocument()

        const save = within(dialog).getByRole('button', { name: /^save$/i })
        expect(save).toBeEnabled()
        fireEvent.click(save)

        await waitFor(() => expect(api.updateAdminUser).toHaveBeenCalledTimes(1))
        expect(api.updateAdminUser.mock.calls[0][1]).toMatchObject({ gender: null })
    })

    // Same as the department and the start date: the stored answer is cleared on
    // a promotion, not sent back from a field the dialog stopped showing.
    it('clears the gender when an employee is promoted to Admin', async () => {
        const dialog = await openEditFor('Theodoros Iona')

        await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'Female' })).toBeChecked())
        fireEvent.click(within(dialog).getByRole('radio', { name: 'Admin' }))

        expect(within(dialog).queryByRole('radio', { name: 'Female' })).not.toBeInTheDocument()
        fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

        await waitFor(() => expect(api.updateAdminUser).toHaveBeenCalledTimes(1))
        expect(api.updateAdminUser.mock.calls[0][1]).toMatchObject({ gender: null })
    })

    // And a demotion has to pick one, just as it has to pick a department.
    it('will not save a demoted admin until a gender is picked', async () => {
        const dialog = await openEditFor('Admin User')

        await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'Admin' })).toBeChecked())
        fireEvent.click(within(dialog).getByRole('radio', { name: 'Employee' }))
        await selectDepartment(dialog)
        setEmploymentStartDate(dialog)

        expect(within(dialog).getByText('Gender is required.')).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeDisabled()

        setGender(dialog, 'Male')

        expect(within(dialog).queryByText('Gender is required.')).not.toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeEnabled()
        fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

        await waitFor(() => expect(api.updateAdminUser).toHaveBeenCalledTimes(1))
        expect(api.updateAdminUser.mock.calls[0][1]).toMatchObject({ gender: 'Male' })
    })

    /* The server decides whether a gender is required or refused from the *stored*
       role, so on a role change the roles call has to land first — the user save
       arrives with the null a promotion sends, or the value a demotion sends, and
       has to be judged against the role it was built for. The user still goes
       before the profile, whose start-date check reads the stored date of birth.
       Reordering any of the three refuses a save with a message about a field the
       admin cannot see. */
    it('sets the roles before it saves the user, and the user before the profile', async () => {
        const dialog = await openEditFor('Theodoros Iona')

        await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'Employee' })).toBeChecked())
        fireEvent.click(within(dialog).getByRole('radio', { name: 'Admin' }))
        fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

        await waitFor(() => expect(api.updateEmployeeProfile).toHaveBeenCalledTimes(1))

        const order = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0]
        expect(order(api.setAdminUserRoles)).toBeLessThan(order(api.updateAdminUser))
        expect(order(api.updateAdminUser)).toBeLessThan(order(api.updateEmployeeProfile))
    })

    it('does not quote a gender on an admin\'s expanded row', async () => {
        renderPanel()

        const nameEl = await screen.findByText('Admin User')
        fireEvent.click(nameEl)

        const row = nameEl.parentElement!.parentElement!.parentElement!.parentElement!
        await within(row.parentElement!).findByText('Date of birth')
        expect(within(row.parentElement!).queryByText('Gender')).not.toBeInTheDocument()
    })
})

// Switching an account off is the answer for someone who has left: deleting them
// rewrites history (every approval they gave is nulled out), and leaving the
// account enabled leaves working credentials behind.
describe('AdminUsersPanel — activating and deactivating', () => {
    const ADMIN = { id: 'u-admin', userName: 'admin@annualleave.com', email: 'admin@annualleave.com', displayName: 'Admin User', imageUrl: '', emailConfirmed: true, isActive: true, roles: ['Admin'] }
    const ACTIVE = { id: 'u-active', userName: 'active@example.test', email: 'active@example.test', displayName: 'Still Here', imageUrl: '', emailConfirmed: true, isActive: true, roles: ['Employee'] }
    const INACTIVE = { id: 'u-inactive', userName: 'gone@example.test', email: 'gone@example.test', displayName: 'Long Gone', imageUrl: '', emailConfirmed: true, isActive: false, roles: ['Employee'] }

    beforeEach(() => {
        api.getAdminUsers.mockResolvedValue([ADMIN, ACTIVE, INACTIVE] as never)
        api.setAdminUserActive.mockResolvedValue(INACTIVE as never)
        sweetAlertFire.mockResolvedValue({ isConfirmed: true })
    })

    /** The row container, which holds both the name and the action buttons. */
    async function rowFor(displayName: string) {
        const nameEl = await screen.findByText(displayName)
        return nameEl.parentElement!.parentElement!.parentElement!.parentElement!
    }

    it('badges a deactivated account instead of showing it as merely offline', async () => {
        renderPanel()

        const row = await rowFor('Long Gone')
        expect(within(row).getByText('Deactivated')).toBeInTheDocument()
        expect(within(row).queryByText('Offline')).not.toBeInTheDocument()

        // An active account is unaffected: presence is a separate axis.
        const active = await rowFor('Still Here')
        expect(within(active).getByText('Offline')).toBeInTheDocument()
        expect(within(active).queryByText('Deactivated')).not.toBeInTheDocument()
    })

    it('deactivates an account once the admin confirms', async () => {
        renderPanel()

        const row = await rowFor('Still Here')
        fireEvent.click(within(row).getByTitle('Deactivate'))

        await waitFor(() => expect(api.setAdminUserActive).toHaveBeenCalledTimes(1))
        expect(sweetAlertFire).toHaveBeenCalled()
        expect(api.setAdminUserActive.mock.calls[0].slice(0, 2)).toEqual([ACTIVE.id, { isActive: false }])
    })

    it('leaves the account alone when the admin cancels', async () => {
        sweetAlertFire.mockResolvedValueOnce({ isConfirmed: false } as never)
        renderPanel()

        const row = await rowFor('Still Here')
        fireEvent.click(within(row).getByTitle('Deactivate'))

        await waitFor(() => expect(sweetAlertFire).toHaveBeenCalled())
        expect(api.setAdminUserActive).not.toHaveBeenCalled()
    })

    // Reactivating restores access rather than removing it, so it does not ask.
    it('reactivates a deactivated account without a confirmation', async () => {
        renderPanel()

        const row = await rowFor('Long Gone')
        expect(within(row).queryByTitle('Deactivate')).not.toBeInTheDocument()
        fireEvent.click(within(row).getByTitle('Activate'))

        await waitFor(() => expect(api.setAdminUserActive).toHaveBeenCalledTimes(1))
        expect(api.setAdminUserActive.mock.calls[0].slice(0, 2)).toEqual([INACTIVE.id, { isActive: true }])
        expect(sweetAlertFire).not.toHaveBeenCalled()
    })

    it('counts and filters deactivated accounts on their own tab', async () => {
        renderPanel()

        const tab = await screen.findByRole('button', { name: /Deactivated/ })
        expect(within(tab).getByText('1')).toBeInTheDocument()

        fireEvent.click(tab)

        expect(screen.getByText('Long Gone')).toBeInTheDocument()
        expect(screen.queryByText('Still Here')).not.toBeInTheDocument()
    })

    // The seeded admin is the account the panel already refuses to edit or
    // delete; switching it off would be just as effective a way to lose access.
    it('offers no toggle for the protected admin', async () => {
        renderPanel()

        const row = await rowFor('Admin User')
        expect(within(row).queryByTitle('Deactivate')).not.toBeInTheDocument()
        expect(within(row).queryByTitle('Activate')).not.toBeInTheDocument()
    })

    it('deactivates every selected account from the bulk bar', async () => {
        renderPanel()

        const row = await rowFor('Still Here')
        fireEvent.click(within(row).getByRole('checkbox'))

        fireEvent.click(await screen.findByText('⏸ Deactivate'))

        await waitFor(() => expect(api.setAdminUserActive).toHaveBeenCalledTimes(1))
        expect(api.setAdminUserActive.mock.calls[0].slice(0, 2)).toEqual([ACTIVE.id, { isActive: false }])
        // Deleting is a separate, still-available action — not what this button does.
        expect(api.deleteAdminUser).not.toHaveBeenCalled()
    })
})

/*
 * Leave is no longer configured per person. The annual-leave allowance on Leave Types
 * is what every employee gets, so neither user dialog asks for an entitlement, and
 * saving a user must not write one — a stale number sent back from a dialog that no
 * longer shows it would silently override the allowance for that person, and a 0
 * would switch their balance check off entirely (AnnualLeaveBalanceCalculator).
 */
describe('AdminUsersPanel — leave is not configured per user', () => {
    const EMPLOYEE = { id: 'u-employee', userName: 'e@example.test', email: 'e@example.test', displayName: 'Some Employee', imageUrl: '', emailConfirmed: true, isActive: true, roles: ['Employee'], dateOfBirth: '1990-03-04', gender: 'Female' }
    const PROFILE = { id: 'p-employee', userId: 'u-employee', displayName: 'Some Employee', departmentId: DEPARTMENT.id, managerId: null, annualLeaveEntitlement: 20, leaveBalance: 14, jobTitle: 'Engineer', employmentStartDate: '2024-02-01', createdAt: '2026-01-01' }

    beforeEach(() => {
        api.getAdminUsers.mockResolvedValue([EMPLOYEE] as never)
        api.getEmployeeProfiles.mockResolvedValue([PROFILE] as never)
    })

    async function openEditDialog() {
        renderPanel()
        const nameEl = await screen.findByText('Some Employee')
        const row = nameEl.parentElement!.parentElement!.parentElement!.parentElement!
        fireEvent.click(within(row).getByTitle('Edit'))
        return screen.getByRole('dialog')
    }

    it('offers no entitlement field when editing a user', async () => {
        const dialog = await openEditDialog()

        await waitFor(() => expect(within(dialog).getByLabelText(/job title/i)).toHaveValue('Engineer'))
        expect(within(dialog).queryByLabelText(/annual leave entitlement/i)).not.toBeInTheDocument()
        expect(within(dialog).queryByRole('switch', { name: /own entitlement/i })).not.toBeInTheDocument()
    })

    it('offers no entitlement field when creating a user', async () => {
        const dialog = await openCreateDialog()

        expect(within(dialog).queryByLabelText(/annual leave entitlement/i)).not.toBeInTheDocument()
    })

    it('sends no leave numbers when a user is saved', async () => {
        const dialog = await openEditDialog()

        await waitFor(() => expect(within(dialog).getByLabelText(/job title/i)).toHaveValue('Engineer'))
        fireEvent.change(within(dialog).getByLabelText(/job title/i), { target: { value: 'Senior Engineer' } })
        fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

        await waitFor(() => expect(api.updateEmployeeProfile).toHaveBeenCalledTimes(1))
        const sent = api.updateEmployeeProfile.mock.calls[0][0]
        expect(sent).toMatchObject({ id: PROFILE.id, jobTitle: 'Senior Engineer' })
        expect(sent).not.toHaveProperty('annualLeaveEntitlement')
        expect(sent).not.toHaveProperty('leaveBalance')
    })
})

/*
 * Gender decides who is offered a leave type restricted through "Available to"
 * (see lib/parental-leave.ts), so the control has to round-trip — show what is
 * stored, send what is picked — and it has to be *required*.
 *
 * It used to offer an explicit "Not specified". The eligibility rule reads a
 * stored null as "offer every type", so that accounts predating the field keep
 * their parental leave; letting an admin choose that null meant a type restricted
 * to Male was still offered to anyone left unspecified. The option is gone, the
 * API refuses a null, and a stored null now shows as neither radio checked with
 * Save disabled — the same backfill-on-next-save the date of birth gets.
 */
describe('AdminUsersPanel — recording gender', () => {
    const MALE_USER = { id: 'u-male', userName: 'm@example.test', email: 'm@example.test', displayName: 'Stored Male', imageUrl: '', emailConfirmed: true, isActive: true, roles: ['Employee'], gender: 'Male', dateOfBirth: '1990-03-04' }
    const UNSET_USER = { id: 'u-unset', userName: 'u@example.test', email: 'u@example.test', displayName: 'No Gender', imageUrl: '', emailConfirmed: true, isActive: true, roles: ['Employee'], gender: null, dateOfBirth: '1990-03-04' }

    const MALE_PROFILE = { id: 'p-male', userId: 'u-male', displayName: 'Stored Male', departmentId: DEPARTMENT.id, managerId: null, annualLeaveEntitlement: 20, leaveBalance: 20, jobTitle: null, employmentStartDate: '2024-02-01', createdAt: '2026-01-01' }
    const UNSET_PROFILE = { id: 'p-unset', userId: 'u-unset', displayName: 'No Gender', departmentId: DEPARTMENT.id, managerId: null, annualLeaveEntitlement: 20, leaveBalance: 20, jobTitle: null, employmentStartDate: '2024-02-01', createdAt: '2026-01-01' }

    beforeEach(() => {
        api.getAdminUsers.mockResolvedValue([MALE_USER, UNSET_USER] as never)
        api.getEmployeeProfiles.mockResolvedValue([MALE_PROFILE, UNSET_PROFILE] as never)
    })

    async function openEditFor(displayName: string) {
        renderPanel()
        const nameEl = await screen.findByText(displayName)
        const row = nameEl.parentElement!.parentElement!.parentElement!.parentElement!
        fireEvent.click(within(row).getByTitle('Edit'))
        return screen.getByRole('dialog')
    }

    /** What updateAdminUser was called with, once the save has gone through. */
    async function savedUserPayload() {
        await waitFor(() => expect(api.updateAdminUser).toHaveBeenCalledTimes(1))
        return api.updateAdminUser.mock.calls[0][1]
    }

    it('offers Male and Female as radios, and nothing else', async () => {
        const dialog = await openEditFor('No Gender')

        for (const option of ['Male', 'Female']) {
            expect(within(dialog).getByRole('radio', { name: option })).toBeInTheDocument()
        }
        // The old third answer. Choosing it sent a null the eligibility rule reads
        // as "offer every type", which defeated any "Available to" restriction.
        expect(within(dialog).queryByRole('radio', { name: /not specified/i })).not.toBeInTheDocument()
        expect(within(dialog).getAllByRole('radio', { name: /male|female/i })).toHaveLength(2)
        // Not a dropdown: it sits directly above the Role radios and matches them.
        expect(within(dialog).queryByRole('combobox', { name: /gender/i })).not.toBeInTheDocument()
    })

    // A stored null is a gap, not an answer: the dialog opens with neither radio
    // checked, says why Save is disabled straight away (as it does for a missing
    // date of birth), and stays disabled until one is picked.
    it('opens with neither checked, the error shown and Save disabled for a user who has none stored', async () => {
        const dialog = await openEditFor('No Gender')

        await waitFor(() => expect(within(dialog).getByText('Gender is required.')).toBeInTheDocument())
        expect(within(dialog).getByRole('radio', { name: 'Male' })).not.toBeChecked()
        expect(within(dialog).getByRole('radio', { name: 'Female' })).not.toBeChecked()
        expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeDisabled()
    })

    it('enables Save once a gender is picked for a user who had none', async () => {
        const dialog = await openEditFor('No Gender')

        await waitFor(() => expect(within(dialog).getByText('Gender is required.')).toBeInTheDocument())
        fireEvent.click(within(dialog).getByRole('radio', { name: 'Female' }))

        expect(within(dialog).queryByText('Gender is required.')).not.toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeEnabled()
    })

    it('shows the stored gender when the dialog opens, with no error', async () => {
        const dialog = await openEditFor('Stored Male')

        await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'Male' })).toBeChecked())
        expect(within(dialog).getByRole('radio', { name: 'Female' })).not.toBeChecked()
        expect(within(dialog).queryByText('Gender is required.')).not.toBeInTheDocument()
    })

    it('sends the gender the admin picks', async () => {
        const dialog = await openEditFor('No Gender')

        await waitFor(() => expect(within(dialog).getByText('Gender is required.')).toBeInTheDocument())
        fireEvent.click(within(dialog).getByRole('radio', { name: 'Female' }))
        fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

        expect(await savedUserPayload()).toMatchObject({ gender: 'Female' })
    })

    it('can change a stored gender', async () => {
        const dialog = await openEditFor('Stored Male')

        await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'Male' })).toBeChecked())
        fireEvent.click(within(dialog).getByRole('radio', { name: 'Female' }))
        fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

        expect(await savedUserPayload()).toMatchObject({ gender: 'Female' })
    })

    // A save that touches nothing else must not drop the stored answer.
    it('sends the stored gender back unchanged when it is not touched', async () => {
        const dialog = await openEditFor('Stored Male')

        await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'Male' })).toBeChecked())
        fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

        expect(await savedUserPayload()).toMatchObject({ gender: 'Male' })
    })

    it('quotes the recorded gender on the expanded row', async () => {
        renderPanel()

        const nameEl = await screen.findByText('Stored Male')
        const row = nameEl.parentElement!.parentElement!.parentElement!.parentElement!
        fireEvent.click(nameEl)

        const gender = await within(row.parentElement!).findByText('Gender')
        expect(within(gender.parentElement!).getByText('Male')).toBeInTheDocument()
    })
})

/** MUI's select renders its options into a portal, hence the two steps. */
/**
 * Fills the date of birth, which is required on both dialogs. Paired with
 * `selectDepartment` in every test that goes on to submit: between them they
 * supply the two required fields a test is not otherwise about.
 */
function setDateOfBirth(dialog: HTMLElement, value = "1990-03-04") {
    fireEvent.change(within(dialog).getByLabelText(/date of birth/i), { target: { value } })
}

/* The mandatory gender, picked so a test about something else can still reach
   Save or Create — the dedicated "recording gender" cases hold the rule itself. */
function setGender(dialog: HTMLElement, value: 'Male' | 'Female' = 'Female') {
    fireEvent.click(within(dialog).getByRole('radio', { name: value }))
}

/* The Profile section's mandatory start date, filled so a test about something
   else can still reach Save. Tolerant of the field's absence, because the whole
   Profile section is hidden for an Admin and several of these tests pick that
   role — the dedicated cases below are what hold the rule itself. */
function setEmploymentStartDate(dialog: HTMLElement, value = '2024-02-01') {
    const field = within(dialog).queryByLabelText(/employment start date/i)
    if (field) fireEvent.change(field, { target: { value } })
}

async function selectDepartment(dialog: HTMLElement) {
    fireEvent.mouseDown(within(dialog).getByRole('combobox'))

    const option = await screen.findByRole('option', { name: `${DEPARTMENT.name} (${DEPARTMENT.code})` })
    fireEvent.click(option)
}

/*
 * Maternity and Paternity Leave are granted per child, so a request against either
 * has to name one -- and until a child is on file the employee cannot make that
 * request at all. Previously only they could fix that: the child picker on the
 * leave form even said so ("... they need to add them in Edit profile first"),
 * with nothing an admin could do about it. An admin can now put children on file
 * from the Users panel.
 */
describe('AdminUsersPanel — managing an employee\'s children', () => {
    const EMPLOYEE = { id: 'u-employee', userName: 'e@example.test', email: 'e@example.test', displayName: 'Theodoros Iona', imageUrl: '', emailConfirmed: true, isActive: true, roles: ['Employee'] }
    const ADMIN = { id: 'u-admin', userName: 'a@example.test', email: 'a@example.test', displayName: 'Admin User', imageUrl: '', emailConfirmed: true, isActive: true, roles: ['Admin'] }

    const EMPLOYEE_PROFILE = { id: 'p-employee', userId: 'u-employee', displayName: 'Theodoros Iona', departmentId: DEPARTMENT.id, managerId: null, annualLeaveEntitlement: 20, leaveBalance: 20, jobTitle: null, employmentStartDate: '2024-02-01', createdAt: '2026-01-01' }
    // An admin sits outside the department structure and gets no Profile section.
    const ADMIN_PROFILE = { id: 'p-admin', userId: 'u-admin', displayName: 'Admin User', departmentId: null, managerId: null, annualLeaveEntitlement: 20, leaveBalance: 20, jobTitle: null, employmentStartDate: '2024-02-01', createdAt: '2026-01-01' }

    beforeEach(() => {
        api.getAdminUsers.mockResolvedValue([EMPLOYEE, ADMIN] as never)
        api.getEmployeeProfiles.mockResolvedValue([EMPLOYEE_PROFILE, ADMIN_PROFILE] as never)
        api.getChildren.mockResolvedValue([])
    })

    async function openEditFor(displayName: string) {
        renderPanel()
        const nameEl = await screen.findByText(displayName)
        const row = nameEl.parentElement!.parentElement!.parentElement!.parentElement!
        fireEvent.click(within(row).getByTitle('Edit'))
        return screen.getByRole('dialog')
    }

    it('reads that employee\'s children, not the signed-in admin\'s own', async () => {
        const dialog = await openEditFor('Theodoros Iona')

        expect(await within(dialog).findByText("Theodoros Iona's children")).toBeInTheDocument()
        // The employee's user id, which is what the server resolves the owner by.
        expect(api.getChildren).toHaveBeenCalledWith(EMPLOYEE.id)
    })

    // The declaration is the employee's own statement, so the admin is not asked to
    // make it on their behalf -- the server records it when a child is added.
    it('asks the admin no Yes/No declaration', async () => {
        const dialog = await openEditFor('Theodoros Iona')

        await within(dialog).findByText("Theodoros Iona's children")
        expect(within(dialog).queryByRole('radio', { name: 'Yes' })).not.toBeInTheDocument()
        expect(within(dialog).queryByRole('radio', { name: 'No' })).not.toBeInTheDocument()
    })

    it('adds a child against that employee', async () => {
        api.createChild.mockResolvedValue({ id: 'c-new', name: 'Maria', dateOfBirth: '2021-06-01', ageYears: 5, isEligible: true, lastEligibleDate: '2036-05-31' } as never)
        const dialog = await openEditFor('Theodoros Iona')
        await within(dialog).findByText("Theodoros Iona's children")

        fireEvent.click(within(dialog).getByRole('button', { name: 'Add child' }))
        fireEvent.change(within(dialog).getByLabelText(/Child's name/), { target: { value: 'Maria' } })
        fireEvent.change(within(dialog).getByLabelText(/Child's date of birth/), { target: { value: '2021-06-01' } })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save child' }))

        await waitFor(() => expect(api.createChild).toHaveBeenCalledWith(
            { name: 'Maria', dateOfBirth: '2021-06-01' },
            EMPLOYEE.id,
        ))
    })

    // It rides with the Profile section, which an Admin does not get -- they sit
    // outside the department structure and take no per-child leave through it.
    it('offers no children section for an admin account', async () => {
        const dialog = await openEditFor('Admin User')

        await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'Admin' })).toBeChecked())
        // The Profile section is what carries it, and an Admin gets none of it.
        expect(within(dialog).queryByText('Profile')).not.toBeInTheDocument()
        expect(within(dialog).queryByText("Admin User's children")).not.toBeInTheDocument()
        expect(within(dialog).queryByRole('button', { name: 'Add child' })).not.toBeInTheDocument()
        expect(api.getChildren).not.toHaveBeenCalled()
    })
})

/*
 * Children on Create. A child needs a profile to belong to and the profile does
 * not exist until the account does, so unlike the Edit dialog these rows cannot
 * commit as they are entered: they are collected locally and written immediately
 * after the account is made.
 */
describe('AdminUsersPanel — adding children while creating a user', () => {
    const CREATED = {
        id: 'u-new',
        userName: 'newhire@example.test',
        email: 'newhire@example.test',
        displayName: 'New Hire',
        imageUrl: '',
        emailConfirmed: true,
        isActive: true,
        roles: ['Employee'],
        inviteEmailSent: true,
    }

    async function fillCreateForm(dialog: HTMLElement) {
        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'newhire@example.test' } })
        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Hire' } })
        await selectDepartment(dialog)
        setDateOfBirth(dialog)
        setGender(dialog)
        setEmploymentStartDate(dialog)
    }

    async function addPendingChild(dialog: HTMLElement, name: string, dateOfBirth: string) {
        fireEvent.click(within(dialog).getByRole('button', { name: 'Add child' }))
        fireEvent.change(within(dialog).getByLabelText(/Child's name/), { target: { value: name } })
        fireEvent.change(within(dialog).getByLabelText(/Child's date of birth/), { target: { value: dateOfBirth } })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save child' }))
        await waitFor(() => expect(within(dialog).getByText(name)).toBeInTheDocument())
    }

    // Nothing to write against yet, so collecting a row must not call the API --
    // and must not read a list for an account that does not exist.
    it('collects the rows locally, touching no endpoint until Create', async () => {
        const dialog = await openCreateDialog()
        await fillCreateForm(dialog)

        await addPendingChild(dialog, 'Maria', '2021-06-01')

        expect(api.createChild).not.toHaveBeenCalled()
        expect(api.getChildren).not.toHaveBeenCalled()
    })

    it('writes each collected child against the new account', async () => {
        api.createAdminUser.mockResolvedValue(CREATED as never)
        api.createChild.mockResolvedValue({ id: 'c1', name: 'Maria', dateOfBirth: '2021-06-01', ageYears: 5, isEligible: true, lastEligibleDate: '2036-05-31' } as never)

        const dialog = await openCreateDialog()
        await fillCreateForm(dialog)
        await addPendingChild(dialog, 'Maria', '2021-06-01')
        await addPendingChild(dialog, 'Andreas', '2019-03-04')

        fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

        await waitFor(() => expect(api.createChild).toHaveBeenCalledTimes(2))
        // Against the id the create returned, which is the whole reason this waits
        // for the account instead of sending the children with it.
        expect(api.createChild).toHaveBeenNthCalledWith(1, { name: 'Maria', dateOfBirth: '2021-06-01' }, CREATED.id)
        expect(api.createChild).toHaveBeenNthCalledWith(2, { name: 'Andreas', dateOfBirth: '2019-03-04' }, CREATED.id)
    })

    it('lets a collected child be removed again before Create', async () => {
        api.createAdminUser.mockResolvedValue(CREATED as never)

        const dialog = await openCreateDialog()
        await fillCreateForm(dialog)
        await addPendingChild(dialog, 'Maria', '2021-06-01')

        fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Maria' }))
        await waitFor(() => expect(within(dialog).queryByText('Maria')).not.toBeInTheDocument())

        fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

        await waitFor(() => expect(api.createAdminUser).toHaveBeenCalled())
        expect(api.createChild).not.toHaveBeenCalled()
    })

    /*
     * The account is already made by the time a child write can fail, so the create
     * must not read as having failed -- that would invite the admin to try again
     * with an email that is now taken. It is reported instead, saying where to
     * finish the job.
     */
    it('reports a child that could not be saved without failing the create', async () => {
        api.createAdminUser.mockResolvedValue(CREATED as never)
        api.createChild.mockRejectedValue(new Error('nope'))

        const dialog = await openCreateDialog()
        await fillCreateForm(dialog)
        await addPendingChild(dialog, 'Maria', '2021-06-01')

        fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

        expect(await screen.findByText(/child Maria could not be saved/i)).toBeInTheDocument()
        expect(screen.getByText(/add them from Edit User/i)).toBeInTheDocument()
        // Not the generic create failure.
        expect(screen.queryByText(/could not create user/i)).not.toBeInTheDocument()
    })

    // Admins get no Profile section, so anything collected before the role was
    // switched must not be sent -- the same rule jobTitle already follows.
    it('sends no children for an admin account', async () => {
        api.createAdminUser.mockResolvedValue({ ...CREATED, roles: ['Admin'] } as never)

        const dialog = await openCreateDialog()
        await fillCreateForm(dialog)
        await addPendingChild(dialog, 'Maria', '2021-06-01')

        fireEvent.click(within(dialog).getByRole('radio', { name: 'Admin' }))
        expect(within(dialog).queryByRole('button', { name: 'Add child' })).not.toBeInTheDocument()

        fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

        await waitFor(() => expect(api.createAdminUser).toHaveBeenCalled())
        expect(api.createChild).not.toHaveBeenCalled()
    })
})

// The dialogs say what each field is for, rather than leaving an admin to infer
// it from a label. Two things were genuinely misleading: Gender sits directly
// above Role, and what it gates — which parental leave types the employee is
// offered — is nowhere near this dialog; and picking Admin silently removes the
// whole Profile section.
describe('AdminUsersPanel — dialogs explain themselves', () => {
    const EMPLOYEE_USER = { id: 'u-employee', userName: 'employee@example.test', email: 'employee@example.test', displayName: 'Theodoros Iona', imageUrl: '', emailConfirmed: true, roles: ['Employee'], dateOfBirth: '1990-03-04', gender: 'Female' }
    const EMPLOYEE_PROFILE = { id: 'p-employee', userId: 'u-employee', displayName: 'Theodoros Iona', departmentId: DEPARTMENT.id, managerId: null, annualLeaveEntitlement: 20, leaveBalance: 20, jobTitle: null, employmentStartDate: '2024-02-01', createdAt: '2026-01-01' }

    beforeEach(() => {
        api.getAdminUsers.mockResolvedValue([EMPLOYEE_USER] as never)
        api.getEmployeeProfiles.mockResolvedValue([EMPLOYEE_PROFILE] as never)
    })

    async function openEdit() {
        renderPanel()
        const nameEl = await screen.findByText('Theodoros Iona')
        const row = nameEl.parentElement!.parentElement!.parentElement!.parentElement!
        fireEvent.click(within(row).getByTitle('Edit'))
        const dialog = screen.getByRole('dialog')
        // The form hydrates in a microtask, so wait for it before asserting.
        await within(dialog).findByDisplayValue('Theodoros Iona')
        return dialog
    }

    it('names the person being edited in the dialog header', async () => {
        const dialog = await openEdit()

        expect(within(dialog).getByText('Theodoros Iona · employee@example.test')).toBeInTheDocument()
    })

    /**
     * The hint used to say the opposite — "Recorded for HR only — it does not
     * affect leave eligibility" — which was true until gender started deciding
     * who is offered Maternity and Paternity Leave. An admin setting this field
     * is now making a decision about somebody's leave, so the dialog has to say
     * so. It no longer says what leaving it unspecified does, because that is
     * no longer a choice — see "recording gender" above.
     */
    it('says Gender decides who is offered parental leave', async () => {
        const dialog = await openEdit()

        const hint = within(dialog).getByText(/maternity and paternity leave/i)
        expect(hint).toBeInTheDocument()
        expect(hint.textContent).not.toMatch(/not specified/i)
    })

    // The Profile section disappearing on Admin was the surprise this explains.
    it('explains the selected role, and says an admin has no department', async () => {
        const dialog = await openEdit()

        expect(within(dialog).getByText(/approvals go to their department's manager/i)).toBeInTheDocument()

        fireEvent.click(within(dialog).getByRole('radio', { name: 'Admin' }))

        expect(within(dialog).getByText(/no department or manager/i)).toBeInTheDocument()
        expect(within(dialog).queryByText(/approvals go to their department's manager/i)).not.toBeInTheDocument()
    })

    // Create already refused a blank display name; Edit happily saved one.
    it('refuses to save an edit that blanks the display name', async () => {
        const dialog = await openEdit()

        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: '  ' } })

        expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeDisabled()
        expect(within(dialog).getByText('Display name is required')).toBeInTheDocument()
    })

    it('refuses to save an edit that blanks the email', async () => {
        const dialog = await openEdit()

        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: '' } })

        expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeDisabled()
        expect(within(dialog).getByText('Email is required')).toBeInTheDocument()
    })

    it('titles the create dialog the same as the button that opens it', async () => {
        const dialog = await openCreateDialog()

        expect(within(dialog).getByText('Add User')).toBeInTheDocument()
    })
})

// A dialog that paints every blank field red the moment it opens reads as a form
// full of mistakes rather than a form waiting to be filled. Nothing is flagged
// until the admin has actually started; from then on every remaining gap is.
describe('AdminUsersPanel — a form nobody has touched is not wrong yet', () => {
    const REQUIRED_MESSAGES = [/email is required/i, /display name is required/i, /department is required/i]

    it('opens Add User with nothing flagged, but still cannot be submitted', async () => {
        const dialog = await openCreateDialog()

        for (const message of REQUIRED_MESSAGES) {
            expect(within(dialog).queryByText(message)).not.toBeInTheDocument()
        }
        expect(dialog.querySelectorAll('input[aria-invalid="true"]')).toHaveLength(0)
        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeDisabled()
    })

    it('flags what is still missing once the admin starts filling it in', async () => {
        const dialog = await openCreateDialog()

        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'newjoiner@example.test' } })

        expect(within(dialog).getByText('Display name is required')).toBeInTheDocument()
        expect(within(dialog).getByText('Department is required')).toBeInTheDocument()
        // The field they did fill in is not flagged.
        expect(within(dialog).queryByText('Email is required')).not.toBeInTheDocument()
    })

    // Edit hydrates its fields in a microtask, so for one render they are all
    // blank -- long enough to flash red on a record that is perfectly valid.
    it('opens Edit User with nothing flagged', async () => {
        const EMPLOYEE_USER = { id: 'u-employee', userName: 'employee@example.test', email: 'employee@example.test', displayName: 'Theodoros Iona', imageUrl: '', emailConfirmed: true, roles: ['Employee'], dateOfBirth: '1990-03-04', gender: 'Female' }
        const EMPLOYEE_PROFILE = { id: 'p-employee', userId: 'u-employee', displayName: 'Theodoros Iona', departmentId: DEPARTMENT.id, managerId: null, annualLeaveEntitlement: 20, leaveBalance: 20, jobTitle: null, employmentStartDate: '2024-02-01', createdAt: '2026-01-01' }
        api.getAdminUsers.mockResolvedValue([EMPLOYEE_USER] as never)
        api.getEmployeeProfiles.mockResolvedValue([EMPLOYEE_PROFILE] as never)

        renderPanel()
        const nameEl = await screen.findByText('Theodoros Iona')
        const row = nameEl.parentElement!.parentElement!.parentElement!.parentElement!
        fireEvent.click(within(row).getByTitle('Edit'))
        const dialog = screen.getByRole('dialog')

        for (const message of REQUIRED_MESSAGES) {
            expect(within(dialog).queryByText(message)).not.toBeInTheDocument()
        }
        expect(dialog.querySelectorAll('input[aria-invalid="true"]')).toHaveLength(0)

        // And still nothing flagged once the fields have hydrated.
        await within(dialog).findByDisplayValue('Theodoros Iona')
        expect(dialog.querySelectorAll('input[aria-invalid="true"]')).toHaveLength(0)
    })
})

/* Phone number was a free-text field on both admin dialogs: "cvbcvb" saved with
   a 200. The employee's own Edit profile had refused letters all along, so this
   is the same rule reaching the other two surfaces that collect the number. */
describe('AdminUsersPanel — phone number takes only a number', () => {
    const EMPLOYEE_USER = { id: 'u-employee', userName: 'employee@example.test', email: 'employee@example.test', displayName: 'Theodoros Iona', imageUrl: '', emailConfirmed: true, roles: ['Employee'], phoneNumber: '99123456', dateOfBirth: '1990-03-04' }
    const EMPLOYEE_PROFILE = { id: 'p-employee', userId: 'u-employee', displayName: 'Theodoros Iona', departmentId: DEPARTMENT.id, managerId: null, annualLeaveEntitlement: 20, leaveBalance: 20, jobTitle: null, employmentStartDate: '2024-02-01', createdAt: '2026-01-01' }

    it('refuses to create a user whose phone number contains letters', async () => {
        const dialog = await openCreateDialog()

        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Joiner' } })
        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'newjoiner@example.test' } })
        await selectDepartment(dialog)
        setDateOfBirth(dialog)
        setGender(dialog)
        setEmploymentStartDate(dialog)
        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeEnabled()

        fireEvent.change(within(dialog).getByLabelText(/phone number/i), { target: { value: 'cvbcvb' } })

        expect(within(dialog).getByText('Phone number can only contain numbers.')).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeDisabled()
    })

    it('accepts a number written with a dialling code', async () => {
        const dialog = await openCreateDialog()

        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Joiner' } })
        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'newjoiner@example.test' } })
        await selectDepartment(dialog)
        setDateOfBirth(dialog)
        setGender(dialog)
        setEmploymentStartDate(dialog)
        fireEvent.change(within(dialog).getByLabelText(/phone number/i), { target: { value: '+357 99 123456' } })

        expect(within(dialog).queryByText('Phone number can only contain numbers.')).not.toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeEnabled()
    })

    it('refuses to save an edit that puts letters in the phone number', async () => {
        api.getAdminUsers.mockResolvedValue([EMPLOYEE_USER] as never)
        api.getEmployeeProfiles.mockResolvedValue([EMPLOYEE_PROFILE] as never)

        renderPanel()
        const nameEl = await screen.findByText('Theodoros Iona')
        const row = nameEl.parentElement!.parentElement!.parentElement!.parentElement!
        fireEvent.click(within(row).getByTitle('Edit'))
        const dialog = screen.getByRole('dialog')
        await within(dialog).findByDisplayValue('Theodoros Iona')

        fireEvent.change(within(dialog).getByLabelText(/phone number/i), { target: { value: 'cvbcvb' } })

        expect(within(dialog).getByText('Phone number can only contain numbers.')).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeDisabled()
    })
})

/* Email and date of birth were free text too: "ZXzx" was an address, and the
   date picker happily took today, making the new hire a newborn. Same treatment
   as the phone number above — the rule lives in lib/validation/person. */
describe('AdminUsersPanel — email and date of birth are checked as they are typed', () => {
    /** A create form that is complete and valid apart from what each test breaks. */
    async function openCompleteCreateDialog() {
        const dialog = await openCreateDialog()
        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Joiner' } })
        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'newjoiner@example.test' } })
        await selectDepartment(dialog)
        setDateOfBirth(dialog)
        setGender(dialog)
        setEmploymentStartDate(dialog)
        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeEnabled()
        return dialog
    }

    it('refuses an email that is not an address', async () => {
        const dialog = await openCompleteCreateDialog()

        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'ZXzx' } })

        expect(within(dialog).getByText('Enter a valid email address.')).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeDisabled()
    })

    it('refuses a date of birth that makes the new user under 16', async () => {
        const dialog = await openCompleteCreateDialog()
        const lastYear = new Date()
        lastYear.setFullYear(lastYear.getFullYear() - 1)

        fireEvent.change(within(dialog).getByLabelText(/date of birth/i), {
            target: { value: lastYear.toISOString().slice(0, 10) },
        })

        expect(within(dialog).getByText('Must be at least 16 years old.')).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeDisabled()
    })

    it('accepts a date of birth for somebody over 16', async () => {
        const dialog = await openCompleteCreateDialog()

        fireEvent.change(within(dialog).getByLabelText(/date of birth/i), { target: { value: '1990-03-04' } })

        expect(within(dialog).queryByText('Must be at least 16 years old.')).not.toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeEnabled()
    })

    it('stops the native picker offering an under-16 date in the first place', async () => {
        const dialog = await openCompleteCreateDialog()
        const sixteenYearsAgo = new Date()
        sixteenYearsAgo.setFullYear(sixteenYearsAgo.getFullYear() - 16)

        expect(within(dialog).getByLabelText(/date of birth/i))
            .toHaveAttribute('max', sixteenYearsAgo.toISOString().slice(0, 10))
    })
})

/* Date of birth is recorded HR data an admin maintains, and half the app that
   uses it — birthday reminders, and the age check on a parental-leave request —
   reads as "not recorded" rather than "none" when it is null. So it is now
   asked for rather than offered: required on both admin dialogs and on the
   employee's own Edit profile.

   Every account predating this has a null one, so an Edit that is otherwise
   untouched cannot be saved until the admin supplies it. That is the point —
   it is how the backfill happens — but it means a stored null has to announce
   itself rather than only disabling Save. */
describe('AdminUsersPanel — date of birth is required', () => {
    const EMPLOYEE_USER = { id: 'u-employee', userName: 'employee@example.test', email: 'employee@example.test', displayName: 'Theodoros Iona', imageUrl: '', emailConfirmed: true, roles: ['Employee'], gender: 'Female' }
    const EMPLOYEE_PROFILE = { id: 'p-employee', userId: 'u-employee', displayName: 'Theodoros Iona', departmentId: DEPARTMENT.id, managerId: null, annualLeaveEntitlement: 20, leaveBalance: 20, jobTitle: null, employmentStartDate: '2024-02-01', createdAt: '2026-01-01' }

    async function openEditFor(user: object) {
        api.getAdminUsers.mockResolvedValue([user] as never)
        api.getEmployeeProfiles.mockResolvedValue([EMPLOYEE_PROFILE] as never)

        renderPanel()
        const nameEl = await screen.findByText('Theodoros Iona')
        const row = nameEl.parentElement!.parentElement!.parentElement!.parentElement!
        fireEvent.click(within(row).getByTitle('Edit'))
        const dialog = screen.getByRole('dialog')
        await within(dialog).findByDisplayValue('Theodoros Iona')
        return dialog
    }

    it('will not create a user without one', async () => {
        const dialog = await openCreateDialog()

        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Joiner' } })
        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'newjoiner@example.test' } })
        await selectDepartment(dialog)
        // Also mandatory, and not what this is about — filled so the date of birth
        // is the only thing left holding Create shut.
        setEmploymentStartDate(dialog)
        setGender(dialog)

        expect(within(dialog).getByText('Date of birth is required.')).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeDisabled()

        fireEvent.change(within(dialog).getByLabelText(/date of birth/i), { target: { value: '1990-03-04' } })

        expect(within(dialog).queryByText('Date of birth is required.')).not.toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeEnabled()
    })

    it('says so on an existing record that has none, rather than only greying Save out', async () => {
        const dialog = await openEditFor(EMPLOYEE_USER)

        expect(within(dialog).getByText('Date of birth is required.')).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeDisabled()
    })

    it('lets that record be saved once the admin supplies one', async () => {
        const dialog = await openEditFor(EMPLOYEE_USER)

        fireEvent.change(within(dialog).getByLabelText(/date of birth/i), { target: { value: '1990-03-04' } })

        expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeEnabled()
    })

    it('leaves a record that already has one alone', async () => {
        const dialog = await openEditFor({ ...EMPLOYEE_USER, dateOfBirth: '1990-03-04' })

        expect(within(dialog).queryByText('Date of birth is required.')).not.toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeEnabled()
    })
})

/*
 * When somebody joined was recorded nowhere — EmployeeProfile.CreatedAt is when the
 * row was written, not a hire date. So Employment start date, in the Profile section
 * beside the department and the job title, mandatory for an Employee and a Manager
 * and absent for an Admin, exactly as the department is.
 *
 * Mirrors Application/Core/PersonFieldRules.cs and the two validators that apply it;
 * these keep the dialogs from offering a submit the API is certain to refuse.
 */
describe('AdminUsersPanel — employment start date', () => {
    const START_DATE = '2024-02-01'

    const EMPLOYEE_USER = {
        id: 'u-employee', userName: 'e@example.test', email: 'e@example.test',
        displayName: 'Some Employee', imageUrl: '', emailConfirmed: true, isActive: true,
        roles: ['Employee'], dateOfBirth: '1990-03-04', gender: 'Female',
    }
    const EMPLOYEE_PROFILE = {
        id: 'p-employee', userId: 'u-employee', displayName: 'Some Employee',
        departmentId: DEPARTMENT.id, managerId: null, annualLeaveEntitlement: 20,
        leaveBalance: 20, jobTitle: 'Engineer', employmentStartDate: START_DATE,
        createdAt: '2026-01-01',
    }

    function startDateField(dialog: HTMLElement) {
        return within(dialog).getByLabelText(/employment start date/i)
    }

    async function openEditDialog(
        user = EMPLOYEE_USER,
        profile: Record<string, unknown> = EMPLOYEE_PROFILE,
    ) {
        api.getAdminUsers.mockResolvedValue([user] as never)
        api.getEmployeeProfiles.mockResolvedValue([profile] as never)

        renderPanel()
        const nameEl = await screen.findByText(user.displayName)
        const row = nameEl.parentElement!.parentElement!.parentElement!.parentElement!
        fireEvent.click(within(row).getByTitle('Edit'))
        return screen.getByRole('dialog')
    }

    /* ── Creating ───────────────────────────────────────────────────────────── */

    it('will not create an employee without a start date', async () => {
        const dialog = await openCreateDialog()

        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'newjoiner@example.test' } })
        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Joiner' } })
        await selectDepartment(dialog)
        setDateOfBirth(dialog)
        setGender(dialog)

        expect(within(dialog).getByText('Employment start date is required.')).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeDisabled()

        fireEvent.change(startDateField(dialog), { target: { value: START_DATE } })

        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeEnabled()
    })

    it('sends the start date it collected', async () => {
        const dialog = await openCreateDialog()

        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'newjoiner@example.test' } })
        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Joiner' } })
        await selectDepartment(dialog)
        setDateOfBirth(dialog)
        setGender(dialog)
        fireEvent.change(startDateField(dialog), { target: { value: START_DATE } })

        fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

        await waitFor(() => expect(createAdminUser).toHaveBeenCalledTimes(1))
        expect(vi.mocked(createAdminUser).mock.calls[0][0]).toMatchObject({
            employmentStartDate: START_DATE,
        })
    })

    it('does not ask an Admin for one, and does not send one', async () => {
        const dialog = await openCreateDialog()

        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'boss@example.test' } })
        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Admin' } })
        setDateOfBirth(dialog)
        setGender(dialog)
        fireEvent.click(within(dialog).getByRole('radio', { name: 'Admin' }))

        // The whole Profile section goes with the role, so the field goes with it.
        expect(within(dialog).queryByLabelText(/employment start date/i)).not.toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeEnabled()

        fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

        await waitFor(() => expect(createAdminUser).toHaveBeenCalledTimes(1))
        expect(vi.mocked(createAdminUser).mock.calls[0][0]).toMatchObject({
            employmentStartDate: null,
        })
    })

    /* A date typed before the person turned sixteen is a typed year, not a career.
       The dialog holds both dates, so it can say so without asking the server. */
    it('refuses a start date before the sixteenth birthday', async () => {
        const dialog = await openCreateDialog()

        fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'newjoiner@example.test' } })
        fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: 'New Joiner' } })
        await selectDepartment(dialog)
        setDateOfBirth(dialog, '1990-03-04')
        setGender(dialog)
        fireEvent.change(startDateField(dialog), { target: { value: '2004-01-01' } })

        expect(within(dialog).getByText(/on or after their 16th birthday/i)).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^create$/i })).toBeDisabled()
    })

    /* ── Editing ────────────────────────────────────────────────────────────── */

    it('opens on the start date already on file', async () => {
        const dialog = await openEditDialog()

        await waitFor(() => expect(startDateField(dialog)).toHaveValue(START_DATE))
    })

    it('sends the start date when the profile is saved', async () => {
        const dialog = await openEditDialog()

        await waitFor(() => expect(startDateField(dialog)).toHaveValue(START_DATE))
        fireEvent.change(startDateField(dialog), { target: { value: '2025-06-16' } })
        fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

        await waitFor(() => expect(api.updateEmployeeProfile).toHaveBeenCalledTimes(1))
        expect(api.updateEmployeeProfile.mock.calls[0][0]).toMatchObject({
            id: EMPLOYEE_PROFILE.id,
            employmentStartDate: '2025-06-16',
        })
    })

    /* A full replace: clearing the field would clear the stored date, so Save has
       to block rather than let a blank through. */
    it('will not save an employee whose start date has been cleared', async () => {
        const dialog = await openEditDialog()

        await waitFor(() => expect(startDateField(dialog)).toHaveValue(START_DATE))
        fireEvent.change(startDateField(dialog), { target: { value: '' } })

        expect(within(dialog).getByText('Employment start date is required.')).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeDisabled()
    })

    /* The same trade the date of birth made: nothing backfills the column, so an
       older record has to be given a date before it can be saved again. */
    it('asks for one on a record that predates the field', async () => {
        const dialog = await openEditDialog(EMPLOYEE_USER, {
            ...EMPLOYEE_PROFILE,
            employmentStartDate: null,
        })

        await waitFor(() =>
            expect(within(dialog).getByText('Employment start date is required.')).toBeInTheDocument())
        expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeDisabled()

        fireEvent.change(startDateField(dialog), { target: { value: START_DATE } })

        expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeEnabled()
    })

    /* Same rule as the department beside it: nothing may hold a start date for an
       Admin, so a promotion must not send the one it stopped showing. */
    it('clears the start date when an employee is promoted to Admin', async () => {
        const dialog = await openEditDialog()

        await waitFor(() => expect(startDateField(dialog)).toHaveValue(START_DATE))
        fireEvent.click(within(dialog).getByRole('radio', { name: 'Admin' }))

        expect(within(dialog).queryByLabelText(/employment start date/i)).not.toBeInTheDocument()

        fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

        await waitFor(() => expect(api.updateEmployeeProfile).toHaveBeenCalledTimes(1))
        expect(api.updateEmployeeProfile.mock.calls[0][0]).toMatchObject({
            id: EMPLOYEE_PROFILE.id,
            departmentId: null,
            employmentStartDate: null,
        })
    })
})

/* The list is an org chart read top to bottom, not an alphabet: admins first,
   then each manager with the people who report to them hanging underneath, then
   anyone whose profile names no manager. A report's manager is the profile id
   the edit dialog derives from the department, so the groups are the department
   teams in practice. */
describe('AdminUsersPanel — the list is grouped by who reports to whom', () => {
    const user = (id: string, displayName: string, role: string) => ({
        id, userName: `${id}@example.test`, email: `${id}@example.test`, displayName,
        imageUrl: '', emailConfirmed: true, isActive: true, roles: [role],
    })
    const profile = (userId: string, managerId: string | null) => ({
        id: `p-${userId}`, userId, displayName: userId, departmentId: DEPARTMENT.id, managerId,
        annualLeaveEntitlement: 20, leaveBalance: 20, jobTitle: null, employmentStartDate: '2024-02-01', createdAt: '2026-01-01',
    })

    beforeEach(() => {
        // Alphabetically Anna would come first and Zed last; the grouping has to win.
        api.getAdminUsers.mockResolvedValue([
            user('anna', 'Anna Report', 'Employee'),
            user('mia', 'Mia Manager', 'Manager'),
            user('dora', 'Dora Loner', 'Employee'),
            user('bob', 'Bob Manager', 'Manager'),
            user('carl', 'Carl Report', 'Employee'),
            user('zed', 'Zed Admin', 'Admin'),
        ] as never)
        api.getEmployeeProfiles.mockResolvedValue([
            profile('anna', 'p-mia'),
            profile('mia', null),
            profile('dora', null),
            profile('bob', null),
            profile('carl', 'p-bob'),
            profile('zed', null),
        ] as never)
    })

    function rowOrder() {
        return screen.getAllByTestId('user-row').map((row) => row.getAttribute('data-user-id'))
    }

    it('lists admins, then each manager followed by their reports, then anyone without a manager', async () => {
        renderPanel()
        await screen.findByText('Zed Admin')

        expect(rowOrder()).toEqual(['zed', 'bob', 'carl', 'mia', 'anna', 'dora'])
    })

    it('nests a report inside a group named after their manager', async () => {
        renderPanel()
        await screen.findByText('Anna Report')

        const team = screen.getByRole('group', { name: "Mia Manager's team" })
        expect(within(team).getByText('Anna Report')).toBeInTheDocument()
        expect(within(team).queryByText('Carl Report')).not.toBeInTheDocument()
        expect(within(team).queryByText('Mia Manager')).not.toBeInTheDocument()
    })

    it('labels the three sections when more than one of them has rows', async () => {
        renderPanel()
        await screen.findByText('Zed Admin')

        expect(screen.getByRole('heading', { name: 'Admins' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Managers & teams' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'No manager assigned' })).toBeInTheDocument()
    })

    it('drops the section labels when only one section has rows', async () => {
        renderPanel()
        fireEvent.click(await screen.findByRole('button', { name: /^Admins/ }))

        expect(screen.getByText('Zed Admin')).toBeInTheDocument()
        // The Admins tab is still there; the section heading under the tabs is not.
        expect(screen.queryByRole('heading', { name: 'Admins' })).not.toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: 'Managers & teams' })).not.toBeInTheDocument()
    })

    // A filter that keeps the report but drops the manager must not pull the
    // manager's row back in — the caption names them instead.
    it('captions the reports when the filter drops their manager', async () => {
        renderPanel()
        fireEvent.click(await screen.findByRole('button', { name: /^Employees/ }))

        expect(screen.queryByText('Mia Manager')).not.toBeInTheDocument()
        expect(screen.getByText('Reports to Mia Manager')).toBeInTheDocument()
        const team = screen.getByRole('group', { name: "Mia Manager's team" })
        expect(within(team).getByText('Anna Report')).toBeInTheDocument()
        expect(rowOrder()).toEqual(['carl', 'anna', 'dora'])
    })

    it('files a report whose manager no longer exists under no manager', async () => {
        api.getEmployeeProfiles.mockResolvedValue([
            profile('anna', 'p-nobody'),
            profile('mia', null), profile('dora', null), profile('bob', null), profile('carl', 'p-bob'), profile('zed', null),
        ] as never)
        renderPanel()
        await screen.findByText('Anna Report')

        expect(rowOrder()).toEqual(['zed', 'bob', 'carl', 'mia', 'anna', 'dora'])
        expect(screen.queryByRole('group', { name: "Mia Manager's team" })).not.toBeInTheDocument()
    })
})
