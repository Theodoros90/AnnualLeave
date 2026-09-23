import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SweetAlert, AppDialog, AppDialogTitle, AppDialogContent, AppDialogActions, cancelBtnSx, saveBtnSx } from '../ui'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
    confirmAdminUserEmail,
    createAdminUser,
    createChild,
    deleteAdminUser,
    getAdminUsers,
    getDepartments,
    getEmployeeProfiles,
    getLeaveStatusHistories,
    getTimesheetStatusHistories,
    getUserPresence,
    setAdminUserActive,
    setAdminUserDepartments,
    setAdminUserRoles,
    updateAdminUser,
    updateEmployeeProfile,
} from '../../lib/api'
import { getApiErrorMessage } from '../../lib/api/error-utils'
import {
    dateOfBirthError, earliestAllowedStartDate, emailError, employmentStartDateError,
    GENDER_REQUIRED_MESSAGE, genderError, hrDepartmentsError, latestAllowedDateOfBirth, phoneNumberError,
} from '../../lib/validation/person'
import ChildrenSection from '../layout/ChildrenSection'
import { softBg, type SxColor } from '../../lib/theme-tokens'
import type {
    AdminCreateUserRequest, AdminUser, Department, EmployeeProfile, Gender, LeaveStatusHistory, PresenceStatus,
    TimesheetStatusHistory, UpsertChildRequest, UserRole,
} from '../../lib/types'
import { isAdministrator, isAdministratorRole } from '../../lib/roles'

const PROTECTED_ADMIN_EMAIL = 'systemadmin@annualleave.com'
const ALL_ROLES: UserRole[] = ['System Administrator', 'HR Administrator', 'Manager', 'Employee']

/**
 * Male / Female, styled as radios to match the Role row it sits above. This
 * field decides who is offered Maternity and Paternity Leave, and any other type
 * an admin restricted through "Available to" — see `lib/parental-leave.ts` and
 * the server rule it mirrors — so the hint says so rather than, as it once did,
 * saying the opposite.
 *
 * Required, and there is deliberately no "Not specified" any more. There used to
 * be one, and both DTOs being full-replace it sent a genuine null — but the
 * eligibility rule reads a stored null as "offer every type" (so that accounts
 * predating the column keep their parental leave), which made a leave type
 * restricted to one gender reachable by anyone an admin left unspecified. The
 * restriction looked like a rule and behaved like none. Both admin validators
 * now refuse a save without a gender (`Gender is required.`), and this control
 * mirrors that: a stored null shows as neither radio checked, with the error
 * beside it, and Save stays disabled until one is picked.
 */
function GenderRadioGroup(props: {
    name: string
    value: Gender | null
    onChange: (value: Gender) => void
    /** Whether a blank is *shown* as an error — see `showGenderError` in the caller. */
    error: boolean
}) {
    return (
        <Box>
            {/* body2, not the subtitle2 the section headings use: this is one field's
                label, and styling it like a heading made it read as a section of its
                own sitting immediately above Role — which is exactly the reading the
                hint below then has to undo. */}
            <Typography variant="body2" color={props.error ? 'error' : 'text.secondary'}>
                Gender <Box component="span" aria-hidden sx={{ color: 'error.main' }}>*</Box>
            </Typography>
            <RadioGroup
                row
                name={props.name}
                value={props.value ?? ''}
                onChange={(e) => props.onChange(e.target.value as Gender)}
            >
                <FormControlLabel value="Male" control={<Radio required />} label="Male" />
                <FormControlLabel value="Female" control={<Radio required />} label="Female" />
            </RadioGroup>
            <Typography
                variant="caption"
                color={props.error ? 'error' : 'text.secondary'}
                sx={{ display: 'block' }}
            >
                {props.error
                    ? GENDER_REQUIRED_MESSAGE
                    : 'Decides who is offered Maternity and Paternity Leave, and any leave type restricted to one gender.'}
            </Typography>
        </Box>
    )
}

/**
 * What each role actually gets, shown under the Role radios for whichever is
 * selected. System Administrator's line is the load-bearing one: picking it removes the entire
 * Profile section, and until it said so that was a surprise rather than a rule.
 */
const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
    'System Administrator': 'Full access to every department. An admin has no department or manager of their own.',
    'HR Administrator': 'Leave, attendance and timesheets for the departments assigned below, but no access to Users, Departments, Configuration or System. Has no department or manager of their own.',
    Manager: "Manages their department's people, leave and timesheets.",
    Employee: "Files their own leave and timesheets; approvals go to their department's manager.",
}

/**
 * Which departments an HR Administrator runs. Shown under the role radios only
 * while that role is selected, and required there: their reach is exactly this
 * set, so an empty one is an HR Administrator who can see nothing. Active
 * departments are offered; one already assigned but since deactivated stays
 * selectable, so Edit User does not open invalid on a record nobody touched.
 */
function HrDepartmentsField(props: {
    idPrefix: string
    departments: Department[]
    value: number[]
    onChange: (ids: number[]) => void
    error?: string
    showError: boolean
}) {
    const options = props.departments.filter((d) => d.isActive || props.value.includes(d.id))
    const selected = options.filter((d) => props.value.includes(d.id))

    return (
        <Autocomplete<Department, true, false, false>
            multiple
            id={`${props.idPrefix}-hr-departments`}
            options={options}
            value={selected}
            getOptionLabel={(d) => `${d.name} (${d.code})`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, next) => props.onChange(next.map((d) => d.id))}
            renderValue={(chosen, getItemProps) =>
                chosen.map((d, index) => {
                    /* The chip's own props carry a `key`, which React 19 warns
                       about being spread into JSX — and the department's id is the
                       stabler key anyway, since the chips reorder as they are
                       picked and dropped. */
                    const { key: _key, ...itemProps } = getItemProps({ index })
                    return <Chip {...itemProps} key={d.id} label={`${d.name} (${d.code})`} size="small" />
                })
            }
            renderInput={(params) => (
                <TextField
                    {...params}
                    label="Departments"
                    required
                    error={props.showError && !!props.error}
                    helperText={props.showError && props.error
                        ? props.error
                        : 'This HR Administrator will see leave, attendance and timesheets for these departments only.'}
                />
            )}
            sx={{ mt: 1.5 }}
        />
    )
}

/**
 * One block of a user dialog: a rule, the block's name, and optionally a line
 * saying what the block is for. Both dialogs render the same three in the same
 * order, so an admin reads one form rather than two that drifted apart.
 *
 * `first` drops the leading rule — the dialog title already draws one, and a
 * second immediately under it reads as an empty section.
 */
function DialogSection({ title, hint, first, children }: {
    title: string
    hint?: string
    first?: boolean
    children: React.ReactNode
}) {
    return (
        <>
            {first ? null : <Divider />}
            <Box>
                <Typography variant="subtitle2" color="text.secondary">{title}</Typography>
                {hint ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {hint}
                    </Typography>
                ) : null}
            </Box>
            {children}
        </>
    )
}

/**
 * Two short fields sharing a row — the pairing the rest of the admin dialogs
 * already use (see LeaveTypesPanel's Icon/Name row). Each of these fields used
 * to take a full row of an `sm` dialog on its own, which is what made the user
 * form a scroll rather than a form.
 *
 * Stacks below `sm`: the dialog is close to full screen width on a phone, and
 * halving that squeezes the date input below the width its native picker needs.
 */
function FieldRow({ children }: { children: React.ReactNode }) {
    return (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
            {children}
        </Stack>
    )
}

interface PersonalDetails {
    email: string
    displayName: string
    phoneNumber: string
    dateOfBirth: string
    gender: Gender | null
}

/**
 * The five identity fields, rendered by both user dialogs from one definition.
 * Extracted for the same reason `DialogSection` was: the two forms are supposed
 * to read as one, and the only way that stays true is for there to be a single
 * copy of each field rather than two that drift.
 *
 * Order is display name → email → phone → date of birth → gender. The dialog is
 * about a person, so it opens on who they are; Add User used to open on an
 * address, which is the one thing about a new hire an admin is least sure of.
 * Gender stays last in the group, immediately above Role — its hint is about
 * what the employee is offered, so it belongs beside what else they are granted.
 *
 * Gender is also the one field here that follows the role: it exists to decide
 * who is offered gender-restricted leave, and a System Administrator sits outside every leave
 * rule the department structure applies, so it is hidden for them the way the
 * whole Profile section is — and the API refuses one for a System Administrator outright, the
 * same as the department and the start date. The callers pass `showGender` off
 * their live role radio, and send null in its place.
 */
function PersonalDetailsFields({ idPrefix, values, onChange, flag, emailHelperText, announceMissing, showGender }: {
    /** Namespaces the gender radios, which are two `name`d groups in one app. */
    idPrefix: string
    values: PersonalDetails
    /** Patch-merged by the caller, which also marks its form dirty. */
    onChange: (patch: Partial<PersonalDetails>) => void
    /** Whether a gap is *shown* as an error — see the `dirty` flag in each dialog. */
    flag: (missing: boolean) => boolean
    /** The one line that genuinely differs: Create emails a welcome link, Edit does not. */
    emailHelperText: string
    /**
     * Whether a *blank* date of birth or gender says so on open, rather than
     * waiting for `flag`. Edit passes true, Create false — see the note below.
     */
    announceMissing: boolean
    /** False for a System Administrator, for whom the field is neither asked nor accepted. */
    showGender: boolean
}) {
    const emailMissing = !values.email.trim()
    const displayNameMissing = !values.displayName.trim()

    /* The three content rules. A value that is *present and wrong* always says
       so, `flag` or no `flag`: that gate keeps an untouched form from opening
       painted red, and it is about fields left blank. Save is disabled for a bad
       value either way, and a disabled button with no reason beside it is the
       worse half of that pair.

       Blankness is the part that differs per field. A blank phone number is
       valid and says nothing. A blank email or date of birth is not, so each
       reports itself — but only once the form has been started, or the dialog
       would greet the admin with a list of what they have not typed yet.

       Edit is the exception for the date of birth and the gender, hence the prop:
       every account predating either field has a null one, and on those the
       dialog opens with Save already disabled. There, "Date of birth is
       required." is the whole explanation for why, so it is shown straight away
       rather than withheld until the admin touches an unrelated field. */
    const phoneError = phoneNumberError(values.phoneNumber)
    const emailFormatError = values.email.trim() ? emailError(values.email) : undefined

    const dobError = dateOfBirthError(values.dateOfBirth)
    const dobMissing = !values.dateOfBirth
    const showDobError = !!dobError
        && (!dobMissing || announceMissing || flag(dobMissing))

    // A gender can only be missing, never wrong — the radios offer two answers.
    const genderMissing = !!genderError(values.gender)
    const showGenderError = genderMissing && (announceMissing || flag(genderMissing))

    return (
        <>
            <FieldRow>
                <TextField
                    label="Display name"
                    value={values.displayName}
                    onChange={(e) => onChange({ displayName: e.target.value })}
                    fullWidth
                    required
                    error={flag(displayNameMissing)}
                    helperText={flag(displayNameMissing) ? 'Display name is required' : 'Shown throughout the app and used to greet them in emails.'}
                />
                <TextField
                    label="Email"
                    value={values.email}
                    onChange={(e) => onChange({ email: e.target.value })}
                    fullWidth
                    required
                    error={flag(emailMissing) || !!emailFormatError}
                    helperText={
                        flag(emailMissing) ? 'Email is required'
                            : emailFormatError ?? emailHelperText
                    }
                />
            </FieldRow>

            <FieldRow>
                <TextField
                    label="Phone number"
                    type="tel"
                    value={values.phoneNumber}
                    onChange={(e) => onChange({ phoneNumber: e.target.value })}
                    fullWidth
                    error={!!phoneError}
                    helperText={phoneError ?? 'Optional.'}
                />
                <TextField
                    label="Date of birth"
                    type="date"
                    value={values.dateOfBirth}
                    onChange={(e) => onChange({ dateOfBirth: e.target.value })}
                    fullWidth
                    /* `max` is the youngest allowed date of birth, not today: the
                       picker should not offer a date the form is about to refuse.
                       It is an affordance only — a date input can still be typed
                       into, and `dobError` is what actually holds the line. */
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: latestAllowedDateOfBirth() } }}
                    required
                    error={showDobError}
                    helperText={showDobError ? dobError : 'Used for birthday reminders.'}
                />
            </FieldRow>

            {showGender && (
                <GenderRadioGroup
                    name={`${idPrefix}-gender`}
                    value={values.gender}
                    onChange={(gender) => onChange({ gender })}
                    error={showGenderError}
                />
            )}
        </>
    )
}

type StatusTab = 'all' | 'systemAdmins' | 'hrAdmins' | 'managers' | 'employees' | 'deactivated' | 'online'

type Presence = PresenceStatus

interface DerivedUser {
    user: AdminUser
    profile?: EmployeeProfile
    departmentName: string | null
    /**
     * The departments assigned to this account — an HR Administrator's whole
     * reach — resolved to names here rather than in the row, which has no
     * department lookup of its own. Empty for everybody else.
     */
    departmentNames: string[]
    primaryRole: UserRole
    presence: Presence
    isAutoBreak: boolean
    lastSeenLabel: string
    isProtected: boolean
    isActive: boolean
}

/**
 * One manager and the people who report to them. `manager` is null when the
 * current filter dropped the manager's own row but kept some of their reports:
 * the group then renders a caption naming them rather than pulling the excluded
 * row back in.
 */
interface ManagerGroup {
    key: string
    managerName: string
    manager: DerivedUser | null
    reports: DerivedUser[]
}

interface GroupedUsers {
    /**
     * The two administrator roles are separate sections, not one pile: a System
     * Administrator configures the workspace, an HR Administrator runs Leave &
     * Time for their assigned departments, and the list should say which is which.
     */
    systemAdmins: DerivedUser[]
    hrAdmins: DerivedUser[]
    teams: ManagerGroup[]
    /** Employees whose profile names no manager, or one who is not a manager here. */
    unassigned: DerivedUser[]
}

const byName = (a: DerivedUser, b: DerivedUser) =>
    (a.user.displayName ?? a.user.email).localeCompare(b.user.displayName ?? b.user.email)

/**
 * Reads the filtered list as an org chart: System Administrators, then HR
 * Administrators, then each manager with
 * their reports underneath, then anyone with no manager. A report's manager is
 * the profile id on their own profile — the one the edit dialog derives from the
 * department — so in practice each group is a department team.
 *
 * Groups are headed by every manager in `all`, not just the filtered ones, so a
 * filter that keeps a report but drops the manager still files the report under
 * a caption naming them. A group with nobody in it is left out.
 */
function groupByReportingLine(filtered: DerivedUser[], all: DerivedUser[]): GroupedUsers {
    const managers = all.filter((d) => d.primaryRole === 'Manager' && d.profile).sort(byName)
    const managerByProfileId = new Map(managers.map((m) => [m.profile!.id, m]))
    const filteredIds = new Set(filtered.map((d) => d.user.id))

    const systemAdmins = filtered.filter((d) => d.primaryRole === 'System Administrator').sort(byName)
    const hrAdmins = filtered.filter((d) => d.primaryRole === 'HR Administrator').sort(byName)
    const employees = filtered.filter((d) => d.primaryRole === 'Employee')

    const reportsByManagerProfileId = new Map<string, DerivedUser[]>()
    const unassigned: DerivedUser[] = []
    for (const e of employees) {
        const managerProfileId = e.profile?.managerId ?? null
        if (managerProfileId && managerByProfileId.has(managerProfileId)) {
            const list = reportsByManagerProfileId.get(managerProfileId) ?? []
            list.push(e)
            reportsByManagerProfileId.set(managerProfileId, list)
        } else {
            unassigned.push(e)
        }
    }

    const teams: ManagerGroup[] = []
    for (const m of managers) {
        const reports = (reportsByManagerProfileId.get(m.profile!.id) ?? []).sort(byName)
        const manager = filteredIds.has(m.user.id) ? m : null
        if (!manager && reports.length === 0) continue
        teams.push({ key: m.user.id, managerName: m.user.displayName || m.user.email, manager, reports })
    }

    return { systemAdmins, hrAdmins, teams, unassigned: unassigned.sort(byName) }
}

interface ActivityItem {
    iconEl: string
    color: 'green' | 'amber' | 'blue' | 'red' | 'gray'
    text: string
    age: string
    timestamp: number
}

function initials(name: string) {
    const parts = (name ?? '').trim().split(/\s+/)
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function avatarBg(seed: string) {
    const palette = ['primary.main', 'success.main', 'warning.main', 'secondary.main', '#EC4899', '#06B6D4', '#84CC16', 'error.main']
    let hash = 0
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
    return palette[Math.abs(hash) % palette.length]
}

function primaryRoleOf(roles: UserRole[]): UserRole {
    if (roles.includes('System Administrator')) return 'System Administrator'
    if (roles.includes('HR Administrator')) return 'HR Administrator'
    if (roles.includes('Manager')) return 'Manager'
    return 'Employee'
}

function fmtRelative(ts: number) {
    const diff = Date.now() - ts
    const m = Math.floor(diff / 60_000)
    if (m < 1) return 'Just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.floor(h / 24)
    if (d < 7) return `${d}d ago`
    return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fmtJoined(iso?: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

/* ════════════════════════════════════════════════════════════════════════ */

function AdminUsersPanel() {
    const queryClient = useQueryClient()

    const [statusTab, setStatusTab] = useState<StatusTab>('all')
    const [searchText, setSearchText] = useState('')
    const [deptFilter, setDeptFilter] = useState<string>('all')
    const [roleFilter, setRoleFilter] = useState<string>('all')
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [createOpen, setCreateOpen] = useState(false)
    const [editData, setEditData] = useState<{ user: AdminUser; profile?: EmployeeProfile } | null>(null)
    const [apiError, setApiError] = useState('')
    const [inviteNotice, setInviteNotice] = useState<{ severity: 'success' | 'warning'; message: string } | null>(null)

    const { data: users = [], isLoading, isError, error } = useQuery({
        queryKey: ['adminUsers'],
        queryFn: getAdminUsers,
    })
    const { data: profiles = [] } = useQuery({ queryKey: ['employeeProfiles'], queryFn: getEmployeeProfiles })
    const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: getDepartments })
    const { data: presences = [] } = useQuery({
        queryKey: ['attendance', 'presence'],
        queryFn: getUserPresence,
        refetchInterval: 30_000,
    })
    const { data: leaveHistories = [] } = useQuery({ queryKey: ['leaveStatusHistories'], queryFn: getLeaveStatusHistories })
    const { data: timesheetHistories = [] } = useQuery({ queryKey: ['timesheetStatusHistories'], queryFn: getTimesheetStatusHistories })

    const profilesByUserId = useMemo(() => new Map(profiles.map((p) => [p.userId, p])), [profiles])
    const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments])
    const userByName = useMemo(() => new Map(users.map((u) => [u.displayName, u])), [users])

    // Presence comes from /attendance/presence, keyed by user id: a user is
    // online only while checked in (away while on break), and offline once they
    // check out or if they never checked in. It is deliberately NOT inferred
    // from the company "recent activity" feed — that feed is capped at 20
    // events, keyed by display name, and includes synthetic "Not checked in"
    // rows, so string-matching it reported exactly the wrong users as online.
    const presenceByUserId = useMemo(
        () => new Map(presences.map((p) => [p.userId, p])),
        [presences],
    )

    // Last-seen label per user, from that same authoritative feed.
    const lastSeenByUserId = useMemo(() => {
        const map = new Map<string, string>()
        for (const p of presences) {
            if (!p.lastActivityAt) continue
            map.set(p.userId, fmtRelative(new Date(p.lastActivityAt).getTime()))
        }
        return map
    }, [presences])

    /* Derive a unified user list */
    const derivedAll: DerivedUser[] = useMemo(() => {
        return users.map((u) => {
            const profile = profilesByUserId.get(u.id)
            const departmentName = profile?.departmentId ? deptById.get(profile.departmentId)?.name ?? null : null
            const presence = presenceByUserId.get(u.id)?.status ?? 'offline'
            const isAutoBreak = presenceByUserId.get(u.id)?.isAutoBreak ?? false
            const lastSeenLabel = presence === 'online' ? 'Online now'
                : presence === 'away' ? (isAutoBreak ? 'Idle' : 'On break')
                : (lastSeenByUserId.get(u.id) ?? 'No activity')
            return {
                user: u,
                profile,
                departmentName,
                // An id with no department behind it still says something — the
                // assignment is real, the catalogue row is the part that is missing.
                departmentNames: (u.departmentIds ?? []).map((id) => deptById.get(id)?.name ?? `#${id}`),
                primaryRole: primaryRoleOf(u.roles),
                presence,
                isAutoBreak,
                lastSeenLabel,
                isProtected: u.email.trim().toLowerCase() === PROTECTED_ADMIN_EMAIL,
                // Rows written before the column existed come back without the
                // field; those accounts are active, as the migration's default says.
                isActive: u.isActive !== false,
            }
        })
    }, [users, profilesByUserId, deptById, presenceByUserId, lastSeenByUserId])

    /* Stats */
    const counts = useMemo(() => {
        const c = {
            all: derivedAll.length,
            systemAdmins: derivedAll.filter((d) => d.primaryRole === 'System Administrator').length,
            hrAdmins: derivedAll.filter((d) => d.primaryRole === 'HR Administrator').length,
            managers: derivedAll.filter((d) => d.primaryRole === 'Manager').length,
            employees: derivedAll.filter((d) => d.primaryRole === 'Employee').length,
            online: derivedAll.filter((d) => d.presence === 'online').length,
            deactivated: derivedAll.filter((d) => !d.isActive).length,
            withProfile: derivedAll.filter((d) => d.profile).length,
        }
        return c
    }, [derivedAll])

    /* Filtering */
    const filtered = useMemo(() => {
        let out = derivedAll
        if (statusTab === 'systemAdmins') out = out.filter((d) => d.primaryRole === 'System Administrator')
        else if (statusTab === 'hrAdmins') out = out.filter((d) => d.primaryRole === 'HR Administrator')
        else if (statusTab === 'managers') out = out.filter((d) => d.primaryRole === 'Manager')
        else if (statusTab === 'employees') out = out.filter((d) => d.primaryRole === 'Employee')
        else if (statusTab === 'deactivated') out = out.filter((d) => !d.isActive)
        else if (statusTab === 'online') out = out.filter((d) => d.presence === 'online')

        if (roleFilter !== 'all') out = out.filter((d) => d.primaryRole === roleFilter)
        if (deptFilter !== 'all') out = out.filter((d) => d.departmentName === deptFilter)

        if (searchText.trim()) {
            const q = searchText.trim().toLowerCase()
            out = out.filter((d) =>
                d.user.email.toLowerCase().includes(q) ||
                (d.user.displayName ?? '').toLowerCase().includes(q)
            )
        }
        return out.sort(byName)
    }, [derivedAll, statusTab, roleFilter, deptFilter, searchText])

    const grouped = useMemo(() => groupByReportingLine(filtered, derivedAll), [filtered, derivedAll])
    // A lone section needs no heading — the active tab already names it.
    const showSectionHeadings =
        [grouped.systemAdmins, grouped.hrAdmins, grouped.teams, grouped.unassigned].filter((section) => section.length > 0).length > 1

    /* Mutations */
    const createMutation = useMutation({
        /* Two steps, because a child needs a profile to belong to and the profile
           does not exist until the account does. The account is what matters, so a
           child that fails to write is reported rather than allowed to fail the
           whole create — by then the user exists, and throwing here would say
           otherwise and invite the admin to try again with a taken email. */
        mutationFn: async ({ children, ...request }: AdminCreateUserRequest & { children: UpsertChildRequest[] }) => {
            const created = await createAdminUser(request)

            const failed: string[] = []
            for (const child of children) {
                try {
                    await createChild(child, created.id)
                } catch {
                    failed.push(child.name)
                }
            }

            return { created, failedChildren: failed }
        },
        onSuccess: ({ created, failedChildren }) => {
            void queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
            void queryClient.invalidateQueries({ queryKey: ['employeeProfiles'] })
            void queryClient.invalidateQueries({ queryKey: ['children'] })
            setCreateOpen(false)

            // The account is created without a password, so whether the invite
            // email actually left matters: if it didn't, the new user has no way
            // in until someone tells them to use "Forgot password?".
            const childProblem = failedChildren.length > 0
                ? ` Their ${failedChildren.length === 1 ? 'child' : 'children'} ${failedChildren.join(', ')} could not be saved — add them from Edit User.`
                : ''

            setInviteNotice(created.inviteEmailSent === false || childProblem
                ? {
                    severity: 'warning',
                    message: created.inviteEmailSent === false
                        ? `${created.email} was created, but the welcome email could not be sent. Ask them to use “Forgot password?” on the sign-in page to set their password.${childProblem}`
                        : `${created.email} was created.${childProblem}`,
                }
                : {
                    severity: 'success',
                    message: `${created.email} was created. A welcome email with a link to set their password is on its way.`,
                })
        },
        onError: (err) => setApiError(getApiErrorMessage(err, 'Could not create user.')),
    })

    const editMutation = useMutation({
        mutationFn: async (payload: {
            userId: string
            email: string
            displayName: string
            roles: UserRole[]
            /** The HR Administrator's departments; null for every other role, which the API refuses the field for. */
            departmentIds: number[] | null
            profile: EmployeeProfile | undefined
            departmentId: number | null
            jobTitle: string
            managerId: string | null
            phoneNumber: string | null
            dateOfBirth: string | null
            /** Null for a System Administrator — the API refuses one for that role. */
            gender: Gender | null
            employmentStartDate: string | null
        }) => {
            // The order of these four is load-bearing. Roles go first: the user
            // validator reads the *stored* role to decide whether a gender is
            // required or refused, and the departments endpoint refuses anyone who
            // is not, as stored, an HR Administrator — so both have to land after
            // the role they were built for, or every role change 400s on a field
            // the admin cannot see. (A role change *out* of HR clears the stored
            // departments itself, which is why there is no call for that case.)
            // The user then goes before the profile: the profile validator checks
            // the start date against the *stored* date of birth, so the one just
            // typed has to be in the database by the time it lands.
            await setAdminUserRoles(payload.userId, { roles: payload.roles })
            if (payload.departmentIds) {
                await setAdminUserDepartments(payload.userId, { departmentIds: payload.departmentIds })
            }
            await updateAdminUser(payload.userId, { email: payload.email, displayName: payload.displayName, phoneNumber: payload.phoneNumber, dateOfBirth: payload.dateOfBirth, gender: payload.gender })
            if (payload.profile) {
                await updateEmployeeProfile({
                    id: payload.profile.id,
                    departmentId: payload.departmentId,
                    managerId: payload.managerId,
                    jobTitle: payload.jobTitle || null,
                    employmentStartDate: payload.employmentStartDate,
                })
            }
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
            void queryClient.invalidateQueries({ queryKey: ['employeeProfiles'] })
            setEditData(null)
        },
        onError: (err) => setApiError(getApiErrorMessage(err, 'Could not update user.')),
    })

    const deleteMutation = useMutation({
        mutationFn: deleteAdminUser,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
            void queryClient.invalidateQueries({ queryKey: ['employeeProfiles'] })
        },
        onError: (err) => setApiError(getApiErrorMessage(err, 'Could not delete user.')),
    })

    const setActiveMutation = useMutation({
        mutationFn: (vars: { id: string; isActive: boolean }) =>
            setAdminUserActive(vars.id, { isActive: vars.isActive }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
        },
        onError: (err, vars) => setApiError(getApiErrorMessage(
            err,
            vars.isActive ? 'Could not activate the account.' : 'Could not deactivate the account.')),
    })

    const confirmEmailMutation = useMutation({
        mutationFn: confirmAdminUserEmail,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
        },
        onError: (err) => setApiError(getApiErrorMessage(err, 'Could not mark email as verified.')),
    })

    function toggleSelected(id: string) {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
        })
    }
    function toggleExpanded(id: string) {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
        })
    }
    async function bulkDelete() {
        const ids = selectableIds()
        if (ids.length === 0) return
        const result = await SweetAlert.fire({
            title: `Delete ${ids.length} user${ids.length === 1 ? '' : 's'}?`,
            text: 'This cannot be undone.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, delete',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#EF4444',
            reverseButtons: true,
        })
        if (!result.isConfirmed) return
        for (const id of ids) await deleteMutation.mutateAsync(id).catch(() => {})
        setSelected(new Set())
    }
    /** Ids in the selection that may be acted on — never the protected admin. */
    function selectableIds() {
        return Array.from(selected).filter((id) => {
            const u = users.find((u) => u.id === id)
            return u && u.email.trim().toLowerCase() !== PROTECTED_ADMIN_EMAIL
        })
    }
    async function bulkDeactivate() {
        const ids = selectableIds().filter((id) => users.find((u) => u.id === id)?.isActive !== false)
        if (ids.length === 0) return
        const result = await SweetAlert.fire({
            title: `Deactivate ${ids.length} user${ids.length === 1 ? '' : 's'}?`,
            text: 'They will not be able to sign in, and any session they have open ends within a minute. Their data is kept, and you can switch them back on at any time.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, deactivate',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#F59E0B',
            reverseButtons: true,
        })
        if (!result.isConfirmed) return
        for (const id of ids) await setActiveMutation.mutateAsync({ id, isActive: false }).catch(() => {})
        setSelected(new Set())
    }

    /** One list row. The grouped list renders it in three places, so it lives here. */
    function renderRow(d: DerivedUser) {
        return (
            <UserRow
                key={d.user.id}
                derived={d}
                isSelected={selected.has(d.user.id)}
                isExpanded={expanded.has(d.user.id)}
                leaveHistories={leaveHistories}
                timesheetHistories={timesheetHistories}
                usersByName={userByName}
                onToggleSelect={() => toggleSelected(d.user.id)}
                onToggleExpand={() => toggleExpanded(d.user.id)}
                onEdit={() => setEditData({ user: d.user, profile: d.profile })}
                onConfirmEmail={() => confirmEmailMutation.mutate(d.user.id)}
                confirmingEmail={confirmEmailMutation.isPending}
                togglingActive={setActiveMutation.isPending}
                onToggleActive={async () => {
                    // Reactivating restores access rather than removing
                    // it, so it does not ask; switching an account off
                    // ends the person's working session, so it does.
                    if (!d.isActive) {
                        setActiveMutation.mutate({ id: d.user.id, isActive: true })
                        return
                    }
                    const result = await SweetAlert.fire({
                        title: `Deactivate ${d.user.displayName || d.user.email}?`,
                        text: 'They will not be able to sign in, and any session they have open ends within a minute. Their data is kept, and you can switch them back on at any time.',
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Yes, deactivate',
                        cancelButtonText: 'Cancel',
                        confirmButtonColor: '#F59E0B',
                        reverseButtons: true,
                    })
                    if (result.isConfirmed) setActiveMutation.mutate({ id: d.user.id, isActive: false })
                }}
                onDelete={async () => {
                    const result = await SweetAlert.fire({
                        title: `Delete ${d.user.displayName || d.user.email}?`,
                        text: 'This cannot be undone.',
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Yes, delete',
                        cancelButtonText: 'Cancel',
                        confirmButtonColor: '#EF4444',
                        reverseButtons: true,
                    })
                    if (result.isConfirmed) deleteMutation.mutate(d.user.id)
                }}
                disabled={deleteMutation.isPending}
            />
        )
    }

    if (isLoading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress size={28} /></Box>
    }
    if (isError) {
        return <Box sx={{ p: 2 }}><Alert severity="error">{getApiErrorMessage(error, 'Failed to load users.')}</Alert></Box>
    }

    const onlinePct = counts.all > 0 ? Math.round((counts.online / counts.all) * 100) : 0
    const managerRatio = counts.managers > 0 ? `1 : ${Math.round(counts.employees / counts.managers)}` : '—'

    return (
        <Box>
            {apiError && (
                <Alert severity="error" onClose={() => setApiError('')} sx={{ mb: 2 }}>{apiError}</Alert>
            )}

            {inviteNotice && (
                <Alert severity={inviteNotice.severity} onClose={() => setInviteNotice(null)} sx={{ mb: 2 }}>
                    {inviteNotice.message}
                </Alert>
            )}

            {/* Stats row */}
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
                gap: '12px', mb: '14px',
            }}>
                <Box sx={statCardSx}>
                    <Box sx={statLabelSx}>👥 Total Users</Box>
                    <Box sx={{ fontSize: 22, fontWeight: 700, color: 'text.primary', lineHeight: 1 }}>{counts.all}</Box>
                    <Box sx={{ display: 'flex', gap: '12px', mt: '8px', fontSize: 11, color: 'text.secondary', flexWrap: 'wrap' }}>
                        <RoleDot color="#FEE2E2" label={`${counts.systemAdmins} system admin${counts.systemAdmins === 1 ? '' : 's'}`} />
                        <RoleDot color="#FEE2E2" label={`${counts.hrAdmins} HR admin${counts.hrAdmins === 1 ? '' : 's'}`} />
                        <RoleDot color="#FEF3C7" label={`${counts.managers} manager${counts.managers === 1 ? '' : 's'}`} />
                        <RoleDot color="#DBEAFE" label={`${counts.employees} employee${counts.employees === 1 ? '' : 's'}`} />
                    </Box>
                </Box>
                <Box sx={statCardSx}>
                    <Box sx={statLabelSx}>🟢 Online Now</Box>
                    <Box sx={{ fontSize: 22, fontWeight: 700, color: 'success.main', lineHeight: 1 }}>{counts.online}</Box>
                    <Box sx={{ fontSize: 11, color: 'text.secondary', mt: '4px' }}>of {counts.all} users · {onlinePct}%</Box>
                </Box>
                <Box sx={statCardSx}>
                    <Box sx={statLabelSx}>📋 With Profile</Box>
                    <Box sx={{ fontSize: 22, fontWeight: 700, color: 'primary.main', lineHeight: 1 }}>{counts.withProfile}</Box>
                    <Box sx={{ fontSize: 11, color: 'text.secondary', mt: '4px' }}>
                        of {counts.all} users have an employee profile
                    </Box>
                </Box>
                <Box sx={statCardSx}>
                    <Box sx={statLabelSx}>📊 Manager Ratio</Box>
                    <Box sx={{ fontSize: 22, fontWeight: 700, color: 'primary.main', lineHeight: 1 }}>{managerRatio}</Box>
                    <Box sx={{ fontSize: 11, color: 'text.secondary', mt: '4px' }}>
                        {counts.managers} manager{counts.managers === 1 ? '' : 's'} for {counts.employees} employee{counts.employees === 1 ? '' : 's'}
                    </Box>
                </Box>
            </Box>

            {/* Toolbar */}
            <Box sx={{
                bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '10px',
                p: '10px 12px', display: 'flex', gap: '10px', flexWrap: 'wrap',
                alignItems: 'center', mb: '14px',
            }}>
                <Box sx={{ flex: 1, minWidth: 220 }}>
                    <Box
                        component="input"
                        type="search"
                        placeholder="Search by name or email…"
                        value={searchText}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchText(e.target.value)}
                        sx={{
                            width: '100%', p: '7px 10px', fontSize: 13, fontFamily: 'inherit',
                            border: '1px solid', borderColor: 'divider', borderRadius: '6px', outline: 'none',
                            bgcolor: 'background.paper', color: 'text.primary',
                            '&::placeholder': { color: 'text.disabled' },
                            '&:focus': { borderColor: 'primary.main' },
                        }}
                    />
                </Box>
                <SelectFilter value={roleFilter} onChange={setRoleFilter} options={[
                    { value: 'all', label: 'All roles' },
                    { value: 'System Administrator', label: `👑 System Administrator (${counts.systemAdmins})` },
                    { value: 'HR Administrator', label: `🛡️ HR Administrator (${counts.hrAdmins})` },
                    { value: 'Manager', label: `👥 Manager (${counts.managers})` },
                    { value: 'Employee', label: `👤 Employee (${counts.employees})` },
                ]} />
                <SelectFilter value={deptFilter} onChange={setDeptFilter} options={[
                    { value: 'all', label: 'All departments' },
                    ...departments.map((d) => ({ value: d.name, label: d.name })),
                ]} />
                <Box
                    component="button"
                    onClick={() => setCreateOpen(true)}
                    sx={{
                        bgcolor: 'primary.main', color: '#fff', border: 'none', borderRadius: '6px',
                        px: '14px', py: '7px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                        fontFamily: 'inherit', whiteSpace: 'nowrap',
                        '&:hover': { bgcolor: 'primary.dark' },
                    }}
                >
                    + Add user
                </Box>
            </Box>

            {/* Bulk action bar */}
            {selected.size > 0 && (
                <Box sx={{
                    position: 'sticky', top: 0, zIndex: 5,
                    bgcolor: 'background.paper', color: '#fff', borderRadius: '10px',
                    p: '10px 14px', display: 'flex', alignItems: 'center', gap: '14px',
                    mb: '14px', flexWrap: 'wrap',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}>
                    <Box sx={{ fontSize: 13 }}>
                        <Box component="strong">{selected.size}</Box> user{selected.size === 1 ? '' : 's'} selected
                    </Box>
                    <Box sx={{ ml: 'auto', display: 'flex', gap: '8px' }}>
                        <Box
                            component="button"
                            onClick={() => setSelected(new Set())}
                            disabled={deleteMutation.isPending}
                            sx={{
                                bgcolor: 'transparent', color: '#fff', border: '1px solid #fff',
                                px: '12px', py: '5px', borderRadius: '6px', fontSize: 12, fontWeight: 500,
                                cursor: 'pointer', fontFamily: 'inherit',
                                '&:hover:not(:disabled)': { bgcolor: 'rgba(255,255,255,0.1)' },
                                '&:disabled': { opacity: 0.5 },
                            }}
                        >Clear</Box>
                        <Box
                            component="button"
                            onClick={() => void bulkDeactivate()}
                            disabled={setActiveMutation.isPending}
                            sx={{
                                bgcolor: 'warning.main', color: '#fff', border: 'none',
                                px: '14px', py: '6px', borderRadius: '6px', fontSize: 12, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit',
                                '&:hover:not(:disabled)': { bgcolor: 'warning.dark' },
                                '&:disabled': { opacity: 0.5 },
                            }}
                        >⏸ Deactivate</Box>
                        <Box
                            component="button"
                            onClick={() => void bulkDelete()}
                            disabled={deleteMutation.isPending}
                            sx={{
                                bgcolor: 'error.main', color: '#fff', border: 'none',
                                px: '14px', py: '6px', borderRadius: '6px', fontSize: 12, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit',
                                '&:hover:not(:disabled)': { bgcolor: 'error.dark' },
                                '&:disabled': { opacity: 0.5 },
                            }}
                        >🚫 Delete</Box>
                    </Box>
                </Box>
            )}

            {/* Status tabs */}
            <Box sx={{ display: 'flex', gap: '2px', mb: '14px', borderBottom: '1px solid', borderColor: 'divider', px: '2px', flexWrap: 'wrap' }}>
                {([
                    { value: 'all',       label: 'All',       count: counts.all },
                    { value: 'systemAdmins', label: 'System Administrators', count: counts.systemAdmins },
                    { value: 'hrAdmins',  label: 'HR Administrators', count: counts.hrAdmins },
                    { value: 'managers',  label: 'Managers',  count: counts.managers },
                    { value: 'employees', label: 'Employees', count: counts.employees },
                    { value: 'deactivated', label: '⏸ Deactivated', count: counts.deactivated },
                    { value: 'online',    label: '🟢 Online',  count: counts.online },
                ] as { value: StatusTab; label: string; count: number }[]).map((tab) => {
                    const active = statusTab === tab.value
                    return (
                        <Box
                            key={tab.value}
                            component="button"
                            onClick={() => setStatusTab(tab.value)}
                            sx={{
                                p: '9px 16px', fontSize: 13,
                                color: active ? 'primary.main' : 'text.secondary',
                                cursor: 'pointer',
                                borderBottom: active ? `2px solid ${'primary.main'}` : '2px solid transparent',
                                mb: '-1px', display: 'flex', alignItems: 'center', gap: '6px',
                                background: 'none', border: 'none', fontFamily: 'inherit',
                                fontWeight: active ? 600 : 500,
                                '&:hover': { color: active ? 'primary.main' : 'text.primary' },
                            }}
                        >
                            {tab.label}
                            <Box component="span" sx={{
                                bgcolor: active ? softBg('primary') : 'action.hover',
                                color: active ? 'primary.main' : 'text.secondary',
                                fontSize: 10, fontWeight: 600,
                                px: '7px', borderRadius: '10px',
                            }}>{tab.count}</Box>
                        </Box>
                    )
                })}
            </Box>

            {/* User rows */}
            {filtered.length === 0 ? (
                <Box sx={{
                    bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '10px',
                    py: 6, textAlign: 'center', color: 'text.secondary', fontSize: 13,
                }}>
                    No users match the current filters.
                </Box>
            ) : (
                <>
                    {grouped.systemAdmins.length > 0 && (
                        <>
                            {showSectionHeadings && <SectionHeading>System Administrators</SectionHeading>}
                            {grouped.systemAdmins.map(renderRow)}
                        </>
                    )}
                    {grouped.hrAdmins.length > 0 && (
                        <>
                            {showSectionHeadings && <SectionHeading>HR Administrators</SectionHeading>}
                            {grouped.hrAdmins.map(renderRow)}
                        </>
                    )}
                    {grouped.teams.length > 0 && (
                        <>
                            {showSectionHeadings && <SectionHeading>Managers &amp; teams</SectionHeading>}
                            {grouped.teams.map((team) => (
                                <Box key={team.key}>
                                    {team.manager ? renderRow(team.manager) : (
                                        <Box sx={{ fontSize: 11, color: 'text.secondary', px: '16px', pb: '6px' }}>
                                            Reports to {team.managerName}
                                        </Box>
                                    )}
                                    {team.reports.length > 0 && (
                                        <Box
                                            role="group"
                                            aria-label={`${team.managerName}'s team`}
                                            sx={{
                                                ml: { xs: '16px', md: '32px' }, pl: '14px', mb: '8px',
                                                borderLeft: '2px solid', borderColor: 'divider',
                                            }}
                                        >
                                            {team.reports.map(renderRow)}
                                        </Box>
                                    )}
                                </Box>
                            ))}
                        </>
                    )}
                    {grouped.unassigned.length > 0 && (
                        <>
                            {showSectionHeadings && <SectionHeading>No manager assigned</SectionHeading>}
                            {grouped.unassigned.map(renderRow)}
                        </>
                    )}
                </>
            )}

            {/* Dialogs */}
            <CreateUserDialog
                open={createOpen}
                isPending={createMutation.isPending}
                error={createMutation.error}
                onClose={() => setCreateOpen(false)}
                onSubmit={(payload) => createMutation.mutate(payload)}
                departments={departments}
                profiles={profiles}
                users={users}
            />
            <EditUserDialog
                data={editData}
                departments={departments}
                profiles={profiles}
                users={users}
                isPending={editMutation.isPending}
                error={editMutation.error}
                onClose={() => setEditData(null)}
                onSubmit={(payload) => editMutation.mutate(payload)}
            />
        </Box>
    )
}

/* ════════════════════════════════════════════════════════════════════════ */
/* User row                                                                  */
/* ════════════════════════════════════════════════════════════════════════ */

function UserRow({
    derived, isSelected, isExpanded, leaveHistories, timesheetHistories, usersByName,
    onToggleSelect, onToggleExpand, onEdit, onConfirmEmail, confirmingEmail, onDelete, disabled,
    onToggleActive, togglingActive,
}: {
    derived: DerivedUser
    isSelected: boolean
    isExpanded: boolean
    leaveHistories: LeaveStatusHistory[]
    timesheetHistories: TimesheetStatusHistory[]
    usersByName: Map<string, AdminUser>
    onToggleSelect: () => void
    onToggleExpand: () => void
    onEdit: () => void
    onConfirmEmail: () => void
    confirmingEmail: boolean
    onDelete: () => void
    disabled: boolean
    onToggleActive: () => void
    togglingActive: boolean
}) {
    const u = derived.user
    const role = derived.primaryRole
    const presence = derived.presence

    const activity = useMemo<ActivityItem[]>(() => {
        const items: ActivityItem[] = []
        for (const h of leaveHistories) {
            if (h.employeeId !== u.id && h.changedByUserId !== u.id) continue
            const isOwn = h.employeeId === u.id
            const ts = new Date(h.changedAt).getTime()
            const action = isOwn
                ? `${h.newStatus === 'Pending' ? 'Submitted leave request' : `Leave ${h.newStatus.toLowerCase()}`}`
                : `${h.newStatus === 'Approved' ? 'Approved' : h.newStatus === 'Rejected' ? 'Rejected' : 'Changed'} ${h.employeeName}'s leave`
            const color = h.newStatus === 'Approved' ? 'green'
                : h.newStatus === 'Rejected' ? 'red'
                : h.newStatus === 'Pending' ? 'amber' : 'blue'
            items.push({
                iconEl: '🌴',
                color,
                text: action,
                age: fmtRelative(ts),
                timestamp: ts,
            })
        }
        for (const h of timesheetHistories) {
            if (h.employeeId !== u.id && h.changedByUserId !== u.id) continue
            const isOwn = h.employeeId === u.id
            const ts = new Date(h.changedAt).getTime()
            const action = isOwn
                ? `Timesheet ${h.newStatus.toLowerCase()}`
                : `${h.newStatus === 'Approved' ? 'Approved' : h.newStatus === 'Rejected' ? 'Rejected' : 'Changed'} ${h.employeeName}'s timesheet`
            const color = h.newStatus === 'Approved' ? 'green'
                : h.newStatus === 'Rejected' ? 'red' : 'blue'
            items.push({
                iconEl: '📋',
                color,
                text: action,
                age: fmtRelative(ts),
                timestamp: ts,
            })
        }
        items.sort((a, b) => b.timestamp - a.timestamp)
        return items.slice(0, 5)
    }, [leaveHistories, timesheetHistories, u.id])

    const { data: profiles = [] } = useQuery({ queryKey: ['employeeProfiles'], queryFn: getEmployeeProfiles })
    const managerName = useMemo(() => {
        if (!derived.profile?.managerId) return null
        const managerProfile = profiles.find((p) => p.id === derived.profile!.managerId)
        if (!managerProfile) return null
        const managerUser = usersByName.size > 0
            ? Array.from(usersByName.values()).find((u) => u.id === managerProfile.userId)
            : undefined
        return managerUser?.displayName || managerUser?.email || null
    }, [derived.profile, profiles, usersByName])

    const accentColor = isAdministratorRole(role) ? 'secondary.main'
        : role === 'Manager' ? 'warning.main' : 'primary.main'

    return (
        <Box data-testid="user-row" data-user-id={u.id} sx={{
            bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
            borderLeft: `3px solid ${accentColor}`,
            borderRadius: '10px', mb: '8px',
            ...(isSelected && { boxShadow: (theme) => `inset 0 0 0 2px ${theme.palette.primary.main}`, bgcolor: softBg('primary') }),
        }}>
            <Box
                onClick={onToggleExpand}
                sx={{
                    display: 'grid',
                    /* The user cell is the one that takes the slack: it is the only
                       column whose content varies in length, and the rest are pills
                       and short labels that a wider track only pushes apart. */
                    gridTemplateColumns: {
                        xs: '24px 1fr auto',
                        md: '24px minmax(0, 1fr) minmax(0, 110px) minmax(0, 140px) minmax(0, 130px) minmax(0, 150px) auto',
                    },
                    gap: '12px', alignItems: 'center',
                    p: '14px 16px', cursor: 'pointer',
                    '&:hover': { bgcolor: isSelected ? softBg('primary') : 'action.hover' },
                }}
            >
                <Box
                    component="input"
                    type="checkbox"
                    checked={isSelected}
                    disabled={derived.isProtected}
                    onChange={onToggleSelect}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    sx={{
                        cursor: derived.isProtected ? 'not-allowed' : 'pointer',
                        width: 16, height: 16,
                        accentColor: 'primary.main',
                        opacity: derived.isProtected ? 0.3 : 1,
                    }}
                />

                {/* User */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <Box sx={{ position: 'relative' }}>
                        <Box sx={{
                            width: 36, height: 36, borderRadius: '50%',
                            bgcolor: avatarBg(u.displayName || u.email), color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 600, flexShrink: 0,
                        }}>{initials(u.displayName || u.email)}</Box>
                        <Box sx={{
                            position: 'absolute', bottom: 0, right: 0,
                            width: 10, height: 10, borderRadius: '50%',
                            border: '2px solid #fff',
                            bgcolor: presence === 'online' ? 'success.main'
                                : presence === 'away' ? 'warning.main' : 'text.disabled',
                        }} />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.displayName || u.email}
                            {derived.isProtected && (
                                <Box component="span" sx={{ ml: '6px', fontSize: 10, color: 'text.disabled', fontStyle: 'italic' }}>· protected</Box>
                            )}
                        </Box>
                        <Box sx={{ fontSize: 11, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.email}
                        </Box>
                    </Box>
                </Box>

                {/* Role pill */}
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                    <RolePill role={role} />
                </Box>

                {/* Department — an Employee's or Manager's own; an HR Administrator's assigned set; blank for a System Administrator */}
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                    {!isAdministratorRole(role) && derived.departmentName ? (
                        <Box component="span" sx={{
                            display: 'inline-block', bgcolor: softBg('info'), color: 'info.dark',
                            borderRadius: '4px', px: '8px', py: '2px',
                            fontSize: 11, fontWeight: 500,
                        }}>{derived.departmentName}</Box>
                    ) : role === 'HR Administrator' && derived.departmentNames.length > 0 ? (
                        /* An HR Administrator's cell reads the departments assigned to
                           them — their reach — where a System Administrator's stays blank. */
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {derived.departmentNames.map((name, index) => (
                                <Box key={index} component="span" sx={{
                                    display: 'inline-block', bgcolor: softBg('info'), color: 'info.dark',
                                    borderRadius: '4px', px: '8px', py: '2px', fontSize: 11, fontWeight: 500,
                                }}>{name}</Box>
                            ))}
                        </Box>
                    ) : <Box sx={{ fontSize: 11, color: 'text.disabled' }}>—</Box>}
                </Box>

                {/* Status. Being switched off replaces presence rather than sitting
                    beside it: a deactivated account cannot be signed in, so
                    "Offline" would be both redundant and the less useful fact. */}
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                    {derived.isActive ? (
                        <Box component="span" sx={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            fontSize: 11, fontWeight: 500,
                            color: presence === 'online' ? 'success.dark'
                                : presence === 'away' ? 'warning.dark' : 'text.secondary',
                            bgcolor: presence === 'online' ? softBg('success')
                                : presence === 'away' ? softBg('warning') : 'action.hover',
                            px: '8px', py: '3px', borderRadius: '12px',
                        }}>
                            {presence === 'online' ? 'Online' : presence === 'away' ? (derived.isAutoBreak ? 'Idle' : 'On Break') : 'Offline'}
                        </Box>
                    ) : (
                        <Box component="span" sx={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            fontSize: 11, fontWeight: 600,
                            color: 'error.dark', bgcolor: softBg('error'),
                            px: '8px', py: '3px', borderRadius: '12px',
                        }}>
                            Deactivated
                        </Box>
                    )}
                </Box>

                {/* Last active */}
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                    <Box sx={{ fontSize: 12, fontWeight: 600, color: presence === 'online' ? 'success.main' : 'text.primary' }}>
                        {derived.lastSeenLabel}
                    </Box>
                    {derived.lastSeenLabel !== 'No activity' && (
                        <Box sx={{ fontSize: 10, color: 'text.secondary', mt: '2px' }}>
                            {presence === 'online' ? 'right now' : 'last active'}
                        </Box>
                    )}
                </Box>

                {/* Actions */}
                <Box
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    sx={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexShrink: 0 }}
                >
                    {!derived.isProtected && (
                        <>
                            <IconBtn title="Edit" onClick={onEdit}>✏️</IconBtn>
                            <IconBtn
                                title={derived.isActive ? 'Deactivate' : 'Activate'}
                                onClick={onToggleActive}
                                disabled={togglingActive}
                            >{derived.isActive ? '⏸' : '▶'}</IconBtn>
                            <IconBtn title="Delete" onClick={onDelete} disabled={disabled} danger>🗑</IconBtn>
                        </>
                    )}
                </Box>
            </Box>

            {isExpanded && (
                <Box sx={{
                    px: '16px', py: '14px', borderTop: '1px solid #F3F4F6',
                    bgcolor: 'action.hover',
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
                    gap: '14px',
                }}>
                    <ExpandBlock title="Account details">
                        <ExpandRow label="Joined" value={fmtJoined(derived.profile?.createdAt)} />
                        <ExpandRow label="Phone" value={u.phoneNumber || '—'} />
                        <ExpandRow label="Date of birth" value={u.dateOfBirth ? new Date(u.dateOfBirth).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
                        {/* System Administrators sit outside the department structure, so none of
                            these rows apply to them — including Gender, which is
                            only recorded to route leave the structure offers. */}
                        {!isAdministratorRole(role) && (
                            <>
                                <ExpandRow label="Gender" value={u.gender ?? '—'} />
                                <ExpandRow label="Department" value={derived.departmentName ?? '—'} />
                                <ExpandRow label="Job title" value={derived.profile?.jobTitle || '—'} />
                                <ExpandRow
                                    label="Employment start date"
                                    value={derived.profile?.employmentStartDate
                                        ? new Date(derived.profile.employmentStartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                                        : '—'}
                                />
                                {role === 'Employee' && (
                                    <ExpandRow label="Manager" value={managerName ?? '—'} />
                                )}
                            </>
                        )}
                    </ExpandBlock>

                    <ExpandBlock title="Recent activity">
                        {activity.length === 0 ? (
                            <Box sx={{ fontSize: 11, color: 'text.disabled', fontStyle: 'italic' }}>No recent activity</Box>
                        ) : (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {activity.map((a, i) => (
                                    <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: '8px', alignItems: 'center' }}>
                                        <Box sx={{
                                            width: 22, height: 22, borderRadius: '50%',
                                            bgcolor: activityIconBg[a.color],
                                            color: activityIconFg[a.color],
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 11,
                                        }}>{a.iconEl}</Box>
                                        <Box sx={{ fontSize: 11, color: 'text.primary', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {a.text}
                                        </Box>
                                        <Box sx={{ fontSize: 10, color: 'text.disabled', whiteSpace: 'nowrap' }}>{a.age}</Box>
                                    </Box>
                                ))}
                            </Box>
                        )}
                    </ExpandBlock>

                    <ExpandBlock title={role === 'Manager' || isAdministratorRole(role) ? 'Reach' : 'Quick info'}>
                        {role === 'Manager' || isAdministratorRole(role) ? (
                            <DirectReports user={derived.user} role={role} />
                        ) : (
                            <>
                                <ExpandRow
                                    label="Email verified"
                                    value={u.emailConfirmed
                                        ? <Box component="span" sx={{ color: 'success.main' }}>✓ Yes</Box>
                                        : (
                                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                                <Box component="span" sx={{ color: 'warning.main' }}>⚠ No</Box>
                                                <Box
                                                    component="button"
                                                    onClick={onConfirmEmail}
                                                    disabled={confirmingEmail}
                                                    sx={{
                                                        bgcolor: 'transparent', border: '1px solid', borderColor: 'primary.main',
                                                        color: 'primary.main', borderRadius: '4px',
                                                        px: '8px', py: '2px', fontSize: 10, fontWeight: 600,
                                                        cursor: confirmingEmail ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                                                        '&:hover:not(:disabled)': { bgcolor: softBg('primary') },
                                                        '&:disabled': { opacity: 0.5 },
                                                    }}
                                                >
                                                    {confirmingEmail ? 'Verifying…' : 'Mark verified'}
                                                </Box>
                                            </Box>
                                        )}
                                />
                                <ExpandRow label="Roles" value={u.roles.join(', ')} />
                                <ExpandRow label="User ID" value={<Box component="code" sx={{ fontSize: 10 }}>{u.id.slice(0, 8)}…</Box>} />
                            </>
                        )}
                    </ExpandBlock>
                </Box>
            )}
        </Box>
    )
}

function DirectReports({ user, role }: { user: AdminUser; role: UserRole }) {
    const { data: profiles = [] } = useQuery({ queryKey: ['employeeProfiles'], queryFn: getEmployeeProfiles })
    const { data: users = [] } = useQuery({ queryKey: ['adminUsers'], queryFn: getAdminUsers })
    const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: getDepartments })

    /* An HR Administrator's reach is the departments assigned to them, not the
       company — so their block is an org chart of exactly those departments, the
       way the main list draws a team: the manager as the parent, their employees
       nested underneath. Counting every account here, as it once did for any
       administrator, would have shown a reach the API no longer grants. */
    if (role === 'HR Administrator') {
        return <HrReach user={user} users={users} profiles={profiles} departments={departments} />
    }

    const myProfile = profiles.find((p) => p.userId === user.id)
    if (!myProfile && !isAdministratorRole(role)) {
        return <Box sx={{ fontSize: 11, color: 'text.disabled', fontStyle: 'italic' }}>No profile linked</Box>
    }

    const reports = isAdministratorRole(role)
        ? users.filter((u) => u.id !== user.id)
        : profiles
            .filter((p) => p.managerId && myProfile && p.managerId === myProfile.id)
            .map((p) => users.find((u) => u.id === p.userId))
            .filter((u): u is AdminUser => !!u)

    if (reports.length === 0) {
        return <Box sx={{ fontSize: 11, color: 'text.disabled', fontStyle: 'italic' }}>No direct reports</Box>
    }

    const visible = reports.slice(0, 4)
    const remaining = reports.length - visible.length

    return (
        <>
            <Box sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary', mb: '8px' }}>
                {reports.length} {isAdministratorRole(role) ? 'people in scope' : `report${reports.length === 1 ? '' : 's'}`}
            </Box>
            <Box sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {visible.map((r) => (
                    <Box key={r.id} title={r.displayName || r.email} sx={{
                        width: 28, height: 28, borderRadius: '50%',
                        bgcolor: avatarBg(r.displayName || r.email), color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 600,
                        border: '2px solid #fff', marginLeft: '-2px',
                    }}>{initials(r.displayName || r.email)}</Box>
                ))}
                {remaining > 0 && (
                    <Box sx={{
                        width: 28, height: 28, borderRadius: '50%',
                        bgcolor: 'divider', color: 'text.secondary',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 600, border: '2px solid #fff', marginLeft: '-2px',
                    }}>+{remaining}</Box>
                )}
            </Box>
        </>
    )
}

/**
 * The departments an HR Administrator runs, each drawn as a small team tree:
 * the department's Manager first, their Employees indented beneath, and any
 * employee of the department who reports to nobody at the department level.
 * Administrators never appear — they sit outside every department — and the
 * HR Administrator's own row is not their own reach.
 */
function HrReach({ user, users, profiles, departments }: {
    user: AdminUser
    users: AdminUser[]
    profiles: EmployeeProfile[]
    departments: Department[]
}) {
    const assigned = user.departmentIds ?? []
    if (assigned.length === 0) {
        return <Box sx={{ fontSize: 11, color: 'text.disabled', fontStyle: 'italic' }}>No departments assigned</Box>
    }

    const userById = new Map(users.map((u) => [u.id, u]))

    const groups = assigned
        .map((id) => departments.find((d) => d.id === id) ?? { id, name: `Department #${id}`, code: '', isActive: true, createdAt: '' })
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((department) => {
            const members = profiles
                .filter((p) => p.departmentId === department.id && p.userId !== user.id)
                .map((p) => ({ profile: p, user: userById.get(p.userId) }))
                .filter((m): m is { profile: EmployeeProfile; user: AdminUser } => !!m.user && !isAdministrator(m.user.roles))
            const managers = members
                .filter((m) => primaryRoleOf(m.user.roles) === 'Manager')
                .sort((a, b) => (a.user.displayName || a.user.email).localeCompare(b.user.displayName || b.user.email))
            const managerProfileIds = new Set(managers.map((m) => m.profile.id))
            const reportsOf = (managerProfileId: string) => members
                .filter((m) => m.profile.managerId === managerProfileId && !managerProfileIds.has(m.profile.id))
                .sort((a, b) => (a.user.displayName || a.user.email).localeCompare(b.user.displayName || b.user.email))
            const unassigned = members
                .filter((m) => !managerProfileIds.has(m.profile.id)
                    && !(m.profile.managerId && managerProfileIds.has(m.profile.managerId)))
                .sort((a, b) => (a.user.displayName || a.user.email).localeCompare(b.user.displayName || b.user.email))
            return { department, count: members.length, managers, reportsOf, unassigned }
        })

    const person = (u: AdminUser) => (
        <Box key={u.id} sx={{ display: 'flex', alignItems: 'center', gap: '8px', py: '3px', minWidth: 0 }}>
            <Box sx={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                bgcolor: avatarBg(u.displayName || u.email), color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600,
            }}>{initials(u.displayName || u.email)}</Box>
            <Box sx={{ fontSize: 12, fontWeight: 500, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.displayName || u.email}
            </Box>
            <Box sx={{ ml: 'auto', flexShrink: 0 }}><RolePill role={primaryRoleOf(u.roles)} /></Box>
        </Box>
    )

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {groups.map(({ department, count, managers, reportsOf, unassigned }) => (
                <Box key={department.id}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '6px', mb: '4px' }}>
                        <Box sx={{ fontSize: 12, fontWeight: 600, color: 'text.primary' }}>
                            {department.name}{department.code ? ` (${department.code})` : ''}
                        </Box>
                        <Box sx={{ fontSize: 11, color: 'text.secondary' }}>
                            · {count} {count === 1 ? 'person' : 'people'}
                        </Box>
                    </Box>
                    {count === 0 && (
                        <Box sx={{ fontSize: 11, color: 'text.disabled', fontStyle: 'italic' }}>Nobody in this department</Box>
                    )}
                    {managers.map((m) => {
                        const name = m.user.displayName || m.user.email
                        const reports = reportsOf(m.profile.id)
                        return (
                            <Box key={m.user.id}>
                                {person(m.user)}
                                {reports.length > 0 && (
                                    <Box role="group" aria-label={`${name}'s team`} sx={{ ml: '11px', pl: '12px', borderLeft: '2px solid', borderColor: 'divider' }}>
                                        {reports.map((r) => person(r.user))}
                                    </Box>
                                )}
                            </Box>
                        )
                    })}
                    {unassigned.map((m) => person(m.user))}
                </Box>
            ))}
        </Box>
    )
}

/* ════════════════════════════════════════════════════════════════════════ */
/* Small UI bits                                                            */
/* ════════════════════════════════════════════════════════════════════════ */

const statCardSx = {
    bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '10px', p: '14px 16px',
} as const

const statLabelSx = {
    fontSize: 11, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em',
    mb: '6px', display: 'flex', alignItems: 'center', gap: '6px',
} as const

function RoleDot({ color, label }: { color: string; label: string }) {
    return (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
            {label}
        </Box>
    )
}

function SelectFilter({ value, onChange, options }: {
    value: string
    onChange: (v: string) => void
    options: { value: string; label: string }[]
}) {
    return (
        <Box
            component="select"
            value={value}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
            sx={{
                fontSize: 12, fontFamily: 'inherit', p: '7px 10px',
                border: '1px solid', borderColor: 'divider', borderRadius: '6px',
                color: 'text.primary', bgcolor: 'background.paper', outline: 'none', cursor: 'pointer',
                '&:focus': { borderColor: 'primary.main' },
            }}
        >
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Box>
    )
}

function ExpandBlock({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '8px', p: '12px 14px' }}>
            <Box sx={{ fontSize: 11, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', mb: '8px' }}>
                {title}
            </Box>
            {children}
        </Box>
    )
}

function ExpandRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: '8px', py: '4px', fontSize: 11 }}>
            <Box sx={{ color: 'text.secondary' }}>{label}</Box>
            <Box sx={{ color: 'text.primary', fontWeight: 500, textAlign: 'right' }}>{value}</Box>
        </Box>
    )
}

function IconBtn({ title, onClick, disabled, danger, children }: {
    title: string
    onClick: () => void
    disabled?: boolean
    danger?: boolean
    children: React.ReactNode
}) {
    return (
        <Box
            component="button"
            title={title}
            onClick={onClick}
            disabled={disabled}
            sx={{
                width: 30, height: 30, borderRadius: '6px',
                bgcolor: 'transparent', border: '1px solid', borderColor: 'divider',
                color: danger ? 'error.dark' : 'text.secondary',
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13,
                '&:hover:not(:disabled)': {
                    bgcolor: danger ? softBg('error') : 'action.hover',
                    borderColor: danger ? 'error.main' : 'divider',
                },
                '&:disabled': { opacity: 0.4, cursor: 'not-allowed' },
            }}
        >
            {children}
        </Box>
    )
}

const roleStyles: Record<UserRole, { bg: SxColor; fg: string }> = {
    'System Administrator': { bg: softBg('secondary'), fg: 'secondary.dark' },
    'HR Administrator': { bg: softBg('secondary'), fg: 'secondary.dark' },
    Manager:  { bg: softBg('warning'), fg: 'warning.dark' },
    Employee: { bg: softBg('info'), fg: 'info.dark' },
}

const roleIcons: Record<UserRole, string> = {
    'System Administrator': '👑', 'HR Administrator': '🛡️', Manager: '👥', Employee: '👤',
}

/** A caption over one section of the grouped list: Administrators, Managers & teams, No manager assigned. */
function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
        <Box component="h3" sx={{
            m: 0, mt: '6px', mb: '8px', px: '2px',
            fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'text.secondary',
        }}>{children}</Box>
    )
}

/** The role badge, shared by the list row and the Edit dialog's header. */
function RolePill({ role }: { role: UserRole }) {
    return (
        <Box component="span" sx={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            bgcolor: roleStyles[role].bg, color: roleStyles[role].fg,
            fontSize: 11, fontWeight: 500, px: '8px', py: '3px',
            borderRadius: '12px', flexShrink: 0, whiteSpace: 'nowrap',
        }}>
            {roleIcons[role]} {role}
        </Box>
    )
}

const activityIconBg: Record<ActivityItem['color'], SxColor> = {
    green: softBg('success'), amber: softBg('warning'), blue: softBg('info'), red: softBg('error'), gray: 'action.hover',
}
const activityIconFg: Record<ActivityItem['color'], string> = {
    green: 'success.dark', amber: 'warning.dark', blue: 'info.dark', red: 'error.dark', gray: 'text.secondary',
}

/* ════════════════════════════════════════════════════════════════════════ */
/* Dialogs                                                                  */
/* ════════════════════════════════════════════════════════════════════════ */

/**
 * Both user dialogs' header: what the form is, and one line saying what it is
 * about — who is being edited, or that creating somebody needs no password.
 * Identical shape in both, so moving between them does not re-lay-out the top
 * of the screen.
 *
 * The avatar and role badge are Edit's alone: while creating there is nobody to
 * picture and no role that has been granted yet. The subtitle is one joined
 * string rather than two lines, which is also what the header test reads.
 */
function UserDialogHeader({ title, subtitle, avatarSeed, role }: {
    title: string
    subtitle: string
    avatarSeed?: string
    role?: UserRole
}) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {avatarSeed ? (
                <Box sx={{
                    width: 36, height: 36, borderRadius: '50%',
                    bgcolor: avatarBg(avatarSeed), color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600, flexShrink: 0,
                }}>{initials(avatarSeed)}</Box>
            ) : null}
            <Box sx={{ minWidth: 0, flex: 1 }}>
                {title}
                {subtitle ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 400 }}>
                        {subtitle}
                    </Typography>
                ) : null}
            </Box>
            {role ? <RolePill role={role} /> : null}
        </Box>
    )
}

// A user's manager is whoever manages their department — not a free pick.
// Mirrors DepartmentsPanel's "Department manager" derivation (the department's
// Manager-role profile) so the two views agree. Shared by Create and Edit so
// both dialogs land on the same person. excludeUserId keeps a department
// manager from being shown as their own manager while editing themselves.
function deriveDepartmentManager(
    departmentId: number,
    profiles: EmployeeProfile[],
    users: AdminUser[],
    excludeUserId?: string,
): { profileId: string; name: string } | null {
    if (!departmentId) return null
    const candidate = profiles.find((p) => {
        if (p.departmentId !== departmentId) return false
        if (p.userId === excludeUserId) return false
        const u = users.find((u) => u.id === p.userId)
        return !!u?.roles.includes('Manager')
    })
    if (!candidate) return null
    const u = users.find((u) => u.id === candidate.userId)
    return { profileId: candidate.id, name: u?.displayName || u?.email || 'Unknown' }
}

function EditUserDialog(props: {
    data: { user: AdminUser; profile?: EmployeeProfile } | null
    departments: Department[]
    profiles: EmployeeProfile[]
    users: AdminUser[]
    onClose: () => void
    isPending: boolean
    error: unknown
    onSubmit: (payload: {
        userId: string
        email: string
        displayName: string
        roles: UserRole[]
        /** The HR Administrator's departments; null for every other role, which the API refuses the field for. */
        departmentIds: number[] | null
        profile: EmployeeProfile | undefined
        departmentId: number | null
        jobTitle: string
        managerId: string | null
        phoneNumber: string | null
        dateOfBirth: string | null
        /** Null for a System Administrator — the API refuses one for that role. */
        gender: Gender | null
        employmentStartDate: string | null
    }) => void
}) {
    const open = !!props.data
    const { user, profile } = props.data ?? {}

    const [email, setEmail] = useState('')
    const [displayName, setDisplayName] = useState('')
    // Exactly one role per user, so a single value rather than a set.
    const [role, setRole] = useState<UserRole>('Employee')
    const [departmentId, setDepartmentId] = useState(0)
    const [jobTitle, setJobTitle] = useState('')
    const [employmentStartDate, setEmploymentStartDate] = useState('')
    const [phoneNumber, setPhoneNumber] = useState('')
    const [dateOfBirth, setDateOfBirth] = useState('')
    const [gender, setGender] = useState<Gender | null>(null)
    const [hrDepartmentIds, setHrDepartmentIds] = useState<number[]>([])

    /* Has the admin started editing? Nothing is marked red until they have, so
       opening a record never greets them with errors — which matters twice over
       here, because the fields hydrate a microtask late and are all blank for one
       render, long enough to flash red on a record that is perfectly valid. Every
       field below sets this; a new one has to as well. Save stays disabled on an
       invalid form either way, so this only governs what is shown, never what
       can be sent. */
    const [dirty, setDirty] = useState(false)

    /* Which user the fields below currently hold. The form hydrates in a microtask
       rather than synchronously, so for one render `role` is still the default
       'Employee' — long enough for the Profile section to mount for a System Administrator, who
       must not have one, and fire off a request for children that are then thrown
       away. Anything in here that does real work on mount waits for this. */
    const [hydratedFor, setHydratedFor] = useState<string | null>(null)

    useEffect(() => {
        if (props.data) {
            Promise.resolve().then(() => {
                setHydratedFor(props.data!.user.id)
                // A freshly opened record has not been edited, whoever was in here before.
                setDirty(false)
                setEmail(props.data!.user.email)
                setDisplayName(props.data!.user.displayName ?? '')
                // Collapses any legacy multi-role account to its highest role.
                setRole(primaryRoleOf(props.data!.user.roles))
                setDepartmentId(props.data!.profile?.departmentId ?? 0)
                setJobTitle(props.data!.profile?.jobTitle ?? '')
                setEmploymentStartDate(props.data!.profile?.employmentStartDate ?? '')
                setPhoneNumber(props.data!.user.phoneNumber ?? '')
                setDateOfBirth(props.data!.user.dateOfBirth ?? '')
                setGender(props.data!.user.gender ?? null)
                setHrDepartmentIds(props.data!.user.departmentIds ?? [])
            })
        }

    }, [props.data])

    // If the person being edited *is* their department's manager, they have no
    // manager of their own here — excludeUserId keeps them from matching themselves.
    const departmentManager = useMemo(
        () => deriveDepartmentManager(departmentId, props.profiles, props.users, props.data?.user.id),
        [departmentId, props.profiles, props.users, props.data],
    )

    // System Administrators sit outside the department structure — same as CreateUserDialog, the
    // Profile section is hidden for them, and the department goes with it. Sending
    // back the stored value would strand a promoted user in the department they
    // just left, which is the whole thing being fixed: nothing may hold a
    // department for a System Administrator.
    const isAdmin = isAdministratorRole(role)
    const effectiveDepartmentId = isAdmin ? null : departmentId

    // Derived from the live radio, not the stored role, so a demotion out of System Administrator
    // has to pick a department before it can be saved: an admin has none to
    // inherit, and an Employee without one is invisible to every manager and has
    // no leave routing.
    const departmentMissing = !isAdmin && !departmentId

    /* The start date rides with the department, for the same reason: both live in
       the Profile section, which is hidden for a System Administrator. So a promotion sends null
       rather than the date it stopped showing, and a demotion has to supply one. */
    const effectiveEmploymentStartDate = isAdmin ? null : employmentStartDate || null
    const startDateError = isAdmin
        ? undefined
        : employmentStartDateError(employmentStartDate, dateOfBirth || null)

    /* Announced on an untouched form too, once the record's own values are in the
       fields — a profile predating the column opens with a genuine gap the admin
       has to fill, and saying nothing would leave Save disabled with no reason
       given. Same treatment, and same hydration guard, as the date of birth. */
    const showStartDateError = !!startDateError && (dirty || (!!user && hydratedFor === user.id))

    /* Gender follows the role too, though it sits in Personal details rather than
       Profile: it is recorded to route gender-restricted leave, which a System Administrator is
       outside of, and the API refuses one for them. So the radios hide for an
       System Administrator and a promotion sends null — clearing the stored answer, this being a
       full replace, rather than stranding one the dialog can no longer show. A
       demotion has to pick one before it can be saved. */
    const effectiveGender = isAdmin ? null : gender
    const genderMissing = !isAdmin && !!genderError(gender)

    /* The departments ride with the role: shown and required for an HR
       Administrator, sent as null for everyone else. A demotion from HR drops them
       (the server clears the rows with the role); a promotion to HR has to pick
       some before it can be saved. */
    const isHr = role === 'HR Administrator'
    const hrDepartmentsMissing = hrDepartmentsError(role, hrDepartmentIds)
    const effectiveDepartmentIds = isHr ? hrDepartmentIds : null

    /* Whether a gap is *shown* as an error, as opposed to whether it blocks Save.
       The two differ only on a form the admin has not started. */
    const flag = (missing: boolean) => dirty && missing

    /* One setter for the shared identity block. It marks the form dirty for every
       field in there, which the old per-field handlers each did by hand — a new
       field added to PersonalDetailsFields therefore cannot forget to. */
    const onPersonalDetailsChange = (patch: Partial<PersonalDetails>) => {
        setDirty(true)
        if (patch.email !== undefined) setEmail(patch.email)
        if (patch.displayName !== undefined) setDisplayName(patch.displayName)
        if (patch.phoneNumber !== undefined) setPhoneNumber(patch.phoneNumber)
        if (patch.dateOfBirth !== undefined) setDateOfBirth(patch.dateOfBirth)
        if ('gender' in patch) setGender(patch.gender ?? null)
    }

    // Only an employee reports to the department's manager. A manager *is* one, so
    // the field is meaningless for them and hidden — and, being hidden, it neither
    // sets nor clears anything: the stored managerId is submitted back untouched.
    const showManagerField = role === 'Employee'

    // Edit used to accept a blank email or display name and save it; Create has
    // always refused both. Same rule, same wording, in both places now. A blank
    // email is `emailError`'s own business, so Save gates on that rather than on
    // a second check here.
    const displayNameMissing = !displayName.trim()

    /* Who is being edited, from the stored record rather than the live fields —
       the header names the person you opened, and must not rewrite itself as you
       type a correction into Display name. Same reason the avatar and role badge
       below read the stored record: the header is a label for what you opened,
       not a preview of what you are about to save. */
    const identity = user ? [user.displayName, user.email].filter(Boolean).join(' · ') : ''
    const storedRole = user ? primaryRoleOf(user.roles) : undefined

    return (
        <AppDialog open={open} onClose={props.onClose} maxWidth="sm">
            <AppDialogTitle>
                <UserDialogHeader
                    title="Edit User"
                    subtitle={identity}
                    avatarSeed={user ? (user.displayName || user.email) : undefined}
                    role={storedRole}
                />
            </AppDialogTitle>
            <AppDialogContent>
                <Stack spacing={2}>
                    <DialogSection title="Role & access" first>
                        <Box>
                            <RadioGroup row name="edit-user-role" value={role} onChange={(e) => { setDirty(true); setRole(e.target.value as UserRole) }}>
                                {ALL_ROLES.map((option) => (
                                    <FormControlLabel key={option} value={option} control={<Radio />} label={option} />
                                ))}
                            </RadioGroup>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                {ROLE_DESCRIPTIONS[role]}
                            </Typography>
                            {isHr && (
                                <HrDepartmentsField
                                    idPrefix="edit-user"
                                    departments={props.departments}
                                    value={hrDepartmentIds}
                                    onChange={(ids) => { setDirty(true); setHrDepartmentIds(ids) }}
                                    error={hrDepartmentsMissing}
                                    showError={dirty || (!!user && hydratedFor === user.id)}
                                />
                            )}
                        </Box>
                    </DialogSection>

                    <DialogSection title="Personal details">
                        <PersonalDetailsFields
                            idPrefix="edit-user"
                            values={{ email, displayName, phoneNumber, dateOfBirth, gender }}
                            onChange={onPersonalDetailsChange}
                            flag={flag}
                            emailHelperText="Used to sign in and to receive notifications."
                            /* Only once the record's own values are in the fields.
                               They hydrate a microtask late, and until then the date
                               is blank for a reason that has nothing to do with the
                               record — announcing it there is the red flash on a
                               perfectly valid record that `dirty` exists to prevent. */
                            announceMissing={!!user && hydratedFor === user.id}
                            showGender={!isAdmin}
                        />

                        {/* Maternity and Paternity Leave are granted per child, so a
                            request against either has to name one — and until a child
                            is on file the employee cannot make that request at all.
                            An admin can now put them on file rather than only being
                            able to tell the employee to do it themselves.

                            Who somebody's children are is a fact about them, not about
                            where they sit in the organisation, so this belongs here
                            rather than under Profile — beside Gender, which is the
                            other half of the same rule: the two together decide which
                            parental leave type the employee is offered.

                            It still hides for a System Administrator. That used to fall out of living
                            inside the Profile section, which a System Administrator has none of; out
                            here it has to say so itself.

                            The rows commit immediately, unlike the rest of this
                            dialog, which saves on Save: each child is its own
                            resource. The Yes/No declaration is deliberately not asked
                            here — that is the employee's own statement — but the
                            server records it anyway, since adding a child sets
                            HasChildren on the profile. */}
                        {profile && !isAdmin && hydratedFor === user!.id && (
                            <>
                                <Divider />
                                <ChildrenSection
                                    employeeId={user!.id}
                                    onBehalfOfName={user!.displayName || user!.email}
                                    disabled={props.isPending}
                                />
                            </>
                        )}
                    </DialogSection>

                    {profile && !isAdmin && (
                        <DialogSection title="Profile" hint="Where this person sits in the organisation.">
                            {/* Department and Job title pair up; Manager sits full width
                                directly under the department that derives it, because both
                                its value ("No manager assigned to this department") and its
                                explanation need the room. */}
                            <FieldRow>
                                <TextField
                                    select
                                    label="Department"
                                    value={departmentId}
                                    onChange={(e) => { setDirty(true); setDepartmentId(Number(e.target.value)) }}
                                    fullWidth
                                    required
                                    error={flag(departmentId === 0)}
                                    helperText={flag(departmentId === 0) ? 'Department is required' : ''}
                                >
                                    <MenuItem value={0} disabled>Select department</MenuItem>
                                    {props.departments.map((dept) => (
                                        <MenuItem key={dept.id} value={dept.id}>{dept.name} ({dept.code})</MenuItem>
                                    ))}
                                </TextField>
                                <TextField
                                    label="Job title"
                                    value={jobTitle}
                                    onChange={(e) => { setDirty(true); setJobTitle(e.target.value) }}
                                    fullWidth
                                />
                            </FieldRow>
                            {/* On its own row rather than paired: it needs the width for
                                its error, and the Manager field below it is full width
                                for the same reason. */}
                            <FieldRow>
                                <TextField
                                    label="Employment start date"
                                    type="date"
                                    value={employmentStartDate}
                                    onChange={(e) => { setDirty(true); setEmploymentStartDate(e.target.value) }}
                                    fullWidth
                                    required
                                    /* `min` is their 16th birthday — an affordance only, the
                                       same way the date of birth's `max` is: a date input can
                                       still be typed into, and startDateError holds the line.
                                       No `max`: a start date in the future is a hire keyed in
                                       before their first day. */
                                    slotProps={{
                                        inputLabel: { shrink: true },
                                        htmlInput: { min: earliestAllowedStartDate(dateOfBirth || null) },
                                    }}
                                    error={showStartDateError}
                                    helperText={showStartDateError ? startDateError : 'The day this person joined.'}
                                />
                            </FieldRow>
                            {showManagerField && (
                                <TextField
                                    label="Manager"
                                    value={departmentManager?.name ?? 'No manager assigned to this department'}
                                    fullWidth
                                    /* read-only rather than disabled: the derived name has to read
                                       as a filled-in value, and greyed-out text looks like an empty
                                       placeholder — especially when the manager's own display name
                                       is something like "Manager". */
                                    slotProps={{ htmlInput: { readOnly: true } }}
                                    helperText="Set by the department's manager — change it by reassigning who manages this department."
                                />
                            )}
                        </DialogSection>
                    )}

                    {props.error ? <Alert severity="error">{getApiErrorMessage(props.error, 'Failed.')}</Alert> : null}
                </Stack>
            </AppDialogContent>
            <AppDialogActions>
                <Button variant="outlined" onClick={props.onClose} disabled={props.isPending} sx={cancelBtnSx}>Cancel</Button>
                <Button
                    variant="contained"
                    disabled={props.isPending || !user || departmentMissing || displayNameMissing || genderMissing || !!hrDepartmentsMissing || !!startDateError || !!emailError(email) || !!phoneNumberError(phoneNumber) || !!dateOfBirthError(dateOfBirth)}
                    onClick={() =>
                        /* No override means the leave type's own allowance, not 0: a stored 0
                           switches the approval-time balance check off outright (see
                           Application/AnnualLeaves/Commands/AnnualLeaveBalanceCalculator.cs). */
                        user && props.onSubmit({ userId: user.id, email, displayName, roles: [role], departmentIds: effectiveDepartmentIds, profile, departmentId: effectiveDepartmentId, jobTitle, managerId: showManagerField ? departmentManager?.profileId ?? null : profile?.managerId ?? null, phoneNumber: phoneNumber.trim() || null, dateOfBirth: dateOfBirth || null, gender: effectiveGender, employmentStartDate: effectiveEmploymentStartDate })
                    }
                    sx={saveBtnSx}
                >
                    Save
                </Button>
            </AppDialogActions>
        </AppDialog>
    )
}

function CreateUserDialog(props: {
    open: boolean
    onClose: () => void
    isPending: boolean
    error: unknown
    onSubmit: (payload: {
        email: string
        displayName: string
        roles: UserRole[]
        /** The HR Administrator's departments; null for every other role, which the API refuses the field for. */
        departmentIds: number[] | null
        departmentId: number | null
        managerId: string | null
        jobTitle: string | null
        phoneNumber: string | null
        dateOfBirth: string | null
        /** Null for a System Administrator — the API refuses one for that role. */
        gender: Gender | null
        employmentStartDate: string | null
        /** Written after the account exists — see the create mutation. */
        children: UpsertChildRequest[]
    }) => void
    departments: Department[]
    profiles: EmployeeProfile[]
    users: AdminUser[]
}) {
    const [email, setEmail] = useState('')
    const [displayName, setDisplayName] = useState('')
    // Exactly one role per user, so a single value rather than a set.
    const [role, setRole] = useState<UserRole>('Employee')
    const [departmentId, setDepartmentId] = useState<number>(0)
    const [jobTitle, setJobTitle] = useState('')
    const [employmentStartDate, setEmploymentStartDate] = useState('')
    const [phoneNumber, setPhoneNumber] = useState('')
    const [dateOfBirth, setDateOfBirth] = useState('')
    const [gender, setGender] = useState<Gender | null>(null)
    const [hrDepartmentIds, setHrDepartmentIds] = useState<number[]>([])
    const [pendingChildren, setPendingChildren] = useState<UpsertChildRequest[]>([])

    /* Has the admin started? Nothing is marked red until they have — an empty form
       on open is not a form full of mistakes. Every field below sets this; a new
       one has to as well. Create stays disabled on an incomplete form either way,
       so this governs only what is shown. Same flag as EditUserDialog. */
    const [dirty, setDirty] = useState(false)
    const flag = (missing: boolean) => dirty && missing

    /* One setter for the shared identity block — see EditUserDialog's copy. */
    const onPersonalDetailsChange = (patch: Partial<PersonalDetails>) => {
        setDirty(true)
        if (patch.email !== undefined) setEmail(patch.email)
        if (patch.displayName !== undefined) setDisplayName(patch.displayName)
        if (patch.phoneNumber !== undefined) setPhoneNumber(patch.phoneNumber)
        if (patch.dateOfBirth !== undefined) setDateOfBirth(patch.dateOfBirth)
        if ('gender' in patch) setGender(patch.gender ?? null)
    }

    // Same rule as EditUserDialog: a new hire reports to whoever manages the
    // department they're placed in — not a free pick.
    const departmentManager = useMemo(
        () => deriveDepartmentManager(departmentId, props.profiles, props.users),
        [departmentId, props.profiles, props.users],
    )

    /* System Administrators sit outside the department structure, so the whole Profile section is
       hidden for them — and the field it never asks about now goes unanswered. It
       used to fall back to the first active department, because DepartmentId was a
       required FK; that invented assignment then showed up as a real one, putting
       the admin in that department's team strip and headcount and blocking its
       deletion. A profile row is still written server-side, with no department. */
    const isAdmin = isAdministratorRole(role)
    const effectiveDepartmentId = isAdmin ? null : departmentId

    // Only an employee reports to the department's manager — a manager *is* one, so
    // the field is hidden for them and no manager is set.
    const showManagerField = role === 'Employee'

    /* Rides with the department, for the same reason — see EditUserDialog's copy.
       Unlike there, a blank is only announced once the admin has started: an empty
       form on open is not a form full of mistakes. */
    const effectiveEmploymentStartDate = isAdmin ? null : employmentStartDate || null
    const startDateError = isAdmin
        ? undefined
        : employmentStartDateError(employmentStartDate, dateOfBirth || null)
    const showStartDateError = dirty && !!startDateError

    /* And the gender, for the same reason — see EditUserDialog's copy. Anything
       picked before the role was switched to System Administrator is not sent. */
    const effectiveGender = isAdmin ? null : gender
    const genderMissing = !isAdmin && !!genderError(gender)

    /* See EditUserDialog's copy. Announced once the admin has started, like the
       other blanks on a fresh form. */
    const isHr = role === 'HR Administrator'
    const hrDepartmentsMissing = hrDepartmentsError(role, hrDepartmentIds)
    const effectiveDepartmentIds = isHr ? hrDepartmentIds : null

    const close = () => {
        setEmail('')
        setDisplayName('')
        setRole('Employee')
        setDepartmentId(0)
        setJobTitle('')
        setEmploymentStartDate('')
        setPhoneNumber('')
        setDateOfBirth('')
        setGender(null)
        setHrDepartmentIds([])
        setPendingChildren([])
        setDirty(false)
        props.onClose()
    }

    return (
        <AppDialog open={props.open} onClose={close} maxWidth="sm">
            {/* Titled to match the "+ Add user" button that opens it — calling the
                same thing two names made it read as a different screen.

                The "no password needed" line is the subtitle rather than the info
                Alert it used to be: the same sentence, in the slot where Edit says
                who it is editing, so both dialogs open the same way and the form
                starts at a field instead of a coloured block. */}
            <AppDialogTitle>
                <UserDialogHeader
                    title="Add User"
                    subtitle="No password needed — we'll email this person a secure link to set their own."
                />
            </AppDialogTitle>
            <AppDialogContent>
                <Stack spacing={2}>
                    <DialogSection title="Role & access" first>
                        <Box>
                            <RadioGroup row name="create-user-role" value={role} onChange={(e) => { setDirty(true); setRole(e.target.value as UserRole) }}>
                                {ALL_ROLES.map((option) => (
                                    <FormControlLabel key={option} value={option} control={<Radio />} label={option} />
                                ))}
                            </RadioGroup>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                {ROLE_DESCRIPTIONS[role]}
                            </Typography>
                            {isHr && (
                                <HrDepartmentsField
                                    idPrefix="create-user"
                                    departments={props.departments}
                                    value={hrDepartmentIds}
                                    onChange={(ids) => { setDirty(true); setHrDepartmentIds(ids) }}
                                    error={hrDepartmentsMissing}
                                    showError={dirty}
                                />
                            )}
                        </Box>
                    </DialogSection>

                    <DialogSection title="Personal details">
                        <PersonalDetailsFields
                            idPrefix="create-user"
                            values={{ email, displayName, phoneNumber, dateOfBirth, gender }}
                            onChange={onPersonalDetailsChange}
                            flag={flag}
                            emailHelperText="Where the welcome link and all notifications are sent."
                            announceMissing={false}
                            showGender={!isAdmin}
                        />

                        {/* Beside Gender rather than under Profile — see EditUserDialog
                            for why, including why it still has to hide for a System Administrator now
                            that it no longer sits inside a section that does.

                            Collected here and written straight after the account
                            exists — there is no profile for a child to belong to
                            until then, so unlike the Edit dialog these rows cannot
                            commit as they are entered. The panel's create mutation
                            writes them and reports any that fail; the account is
                            already made by then, so a failure here must not read
                            as the create having failed. */}
                        {!isAdmin && (
                            <>
                                <Divider />
                                <ChildrenSection
                                    pendingChildren={pendingChildren}
                                    onPendingChildrenChange={setPendingChildren}
                                    onBehalfOfName={displayName.trim() || 'This person'}
                                    disabled={props.isPending}
                                />
                            </>
                        )}
                    </DialogSection>

                    {!isAdmin && (
                        <DialogSection title="Profile" hint="Where this person sits in the organisation.">
                            {/* Same pairing as EditUserDialog — see the note there. */}
                            <FieldRow>
                                <TextField
                                    select
                                    label="Department"
                                    value={departmentId}
                                    onChange={(e) => { setDirty(true); setDepartmentId(Number(e.target.value)) }}
                                    fullWidth
                                    required
                                    error={flag(departmentId === 0)}
                                    helperText={flag(departmentId === 0) ? 'Department is required' : ''}
                                >
                                    <MenuItem value={0} disabled>Select department</MenuItem>
                                    {props.departments.map((dept) => (
                                        <MenuItem key={dept.id} value={dept.id}>{dept.name} ({dept.code})</MenuItem>
                                    ))}
                                </TextField>
                                <TextField
                                    label="Job title"
                                    value={jobTitle}
                                    onChange={(e) => { setDirty(true); setJobTitle(e.target.value) }}
                                    fullWidth
                                />
                            </FieldRow>
                            {/* On its own row — see EditUserDialog. */}
                            <FieldRow>
                                <TextField
                                    label="Employment start date"
                                    type="date"
                                    value={employmentStartDate}
                                    onChange={(e) => { setDirty(true); setEmploymentStartDate(e.target.value) }}
                                    fullWidth
                                    required
                                    // `min` is their 16th birthday, and there is no `max` — see EditUserDialog.
                                    slotProps={{
                                        inputLabel: { shrink: true },
                                        htmlInput: { min: earliestAllowedStartDate(dateOfBirth || null) },
                                    }}
                                    error={showStartDateError}
                                    helperText={showStartDateError ? startDateError : 'The day this person joined.'}
                                />
                            </FieldRow>
                            {showManagerField && (
                                <TextField
                                    label="Manager"
                                    value={departmentManager?.name ?? 'No manager assigned to this department'}
                                    fullWidth
                                    // Read-only, not disabled — see EditUserDialog.
                                    slotProps={{ htmlInput: { readOnly: true } }}
                                    helperText="Set by the department's manager — change it by reassigning who manages this department."
                                />
                            )}
                        </DialogSection>
                    )}

                    {props.error ? <Alert severity="error">{getApiErrorMessage(props.error, 'Failed.')}</Alert> : null}
                </Stack>
            </AppDialogContent>
            <AppDialogActions>
                <Button variant="outlined" onClick={close} disabled={props.isPending} sx={cancelBtnSx}>Cancel</Button>
                <Button
                    variant="contained"
                    disabled={props.isPending || !displayName.trim() || effectiveDepartmentId === 0 || genderMissing || !!hrDepartmentsMissing || !!startDateError || !!emailError(email) || !!phoneNumberError(phoneNumber) || !!dateOfBirthError(dateOfBirth)}
                    onClick={() => props.onSubmit({
                        email: email.trim(),
                        displayName: displayName.trim(),
                        roles: [role],
                        // Only an HR Administrator has a set of these; the API refuses the field for every other role.
                        departmentIds: effectiveDepartmentIds,
                        departmentId: effectiveDepartmentId,
                        managerId: showManagerField ? departmentManager?.profileId ?? null : null,
                        jobTitle: isAdmin ? null : jobTitle.trim() || null,
                        phoneNumber: phoneNumber.trim() || null,
                        dateOfBirth: dateOfBirth || null,
                        // Null for a System Administrator, same rule as the start date below: the API refuses one for that role.
                        gender: effectiveGender,
                        // Null for a System Administrator, same rule as jobTitle and the department:
                        // the API refuses one outright for that role.
                        employmentStartDate: effectiveEmploymentStartDate,
                        // Never for a System Administrator: the Profile section is hidden for them,
                        // so anything collected before the role was switched must not
                        // be sent — same rule as jobTitle above.
                        children: isAdmin ? [] : pendingChildren,
                    })}
                    sx={saveBtnSx}
                >
                    Create
                </Button>
            </AppDialogActions>
        </AppDialog>
    )
}

export default AdminUsersPanel
