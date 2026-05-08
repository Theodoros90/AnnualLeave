import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SweetAlert, AppDialog, AppDialogTitle, AppDialogContent, AppDialogActions, cancelBtnSx, saveBtnSx } from '../ui'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
    createAdminUser,
    deleteAdminUser,
    getDepartments,
    getAdminUsers,
    getEmployeeProfiles,
    setAdminUserRoles,
    updateEmployeeProfile,
    updateAdminUser,
} from '../../lib/api'
import { getApiErrorMessage } from '../../lib/api/error-utils'
import type { AdminUser, Department, EmployeeProfile, UserRole } from '../../lib/types'

const C_BORDER = '#E4E6EA'
const C_HEADING = '#1A1A2E'
const C_MUTED = '#6B7280'

const TH = {
    py: '10px',
    px: '14px',
    fontSize: 11,
    fontWeight: 600,
    color: C_MUTED,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    bgcolor: '#F9FAFB',
    borderBottom: `1px solid ${C_BORDER}`,
}

const TD = {
    py: '11px',
    px: '14px',
    fontSize: 13,
    color: '#374151',
    borderBottom: `1px solid #F3F4F6`,
}

const ROLE_COLORS: Record<UserRole, { bg: string; color: string }> = {
    Admin:    { bg: '#FEE2E2', color: '#991B1B' },
    Manager:  { bg: '#FEF3C7', color: '#92400E' },
    Employee: { bg: '#EFF6FF', color: '#1D4ED8' },
}

function RoleBadge({ role }: { role: UserRole }) {
    const s = ROLE_COLORS[role] ?? { bg: '#F3F4F6', color: '#6B7280' }
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                px: 1.25,
                py: 0.35,
                borderRadius: '20px',
                fontSize: 11,
                fontWeight: 500,
                bgcolor: s.bg,
                color: s.color,
                whiteSpace: 'nowrap',
                mr: 0.5,
            }}
        >
            {role}
        </Box>
    )
}

function DeptBadge({ dept }: { dept: string }) {
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-block',
                bgcolor: '#EFF6FF',
                color: '#1D4ED8',
                borderRadius: '4px',
                px: 1,
                py: 0.25,
                fontSize: 11,
                fontWeight: 500,
            }}
        >
            {dept}
        </Box>
    )
}

const allRoles: UserRole[] = ['Admin', 'Manager', 'Employee']
const protectedSeedAdminEmail = 'admin@annualleave.com'

function getErrorMessage(error: unknown) {
    return getApiErrorMessage(error, 'Something went wrong. Please try again.')
}

function isReadOnlyAdminUser(user: AdminUser) {
    return user.email.trim().toLowerCase() === protectedSeedAdminEmail
}

type EditData = { user: AdminUser; profile: EmployeeProfile | undefined }

function AdminUsersPanel() {
    const queryClient = useQueryClient()
    const [createOpen, setCreateOpen] = useState(false)
    const [editData, setEditData] = useState<EditData | null>(null)

    const { data: users, isLoading, isError, error } = useQuery({
        queryKey: ['adminUsers'],
        queryFn: getAdminUsers,
    })

    const { data: employeeProfiles = [] } = useQuery({
        queryKey: ['employeeProfiles'],
        queryFn: getEmployeeProfiles,
    })

    const { data: departments = [] } = useQuery({
        queryKey: ['departments'],
        queryFn: getDepartments,
    })

    const createMutation = useMutation({
        mutationFn: createAdminUser,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
            setCreateOpen(false)
        },
    })

    const combinedEditMutation = useMutation({
        mutationFn: async (payload: {
            userId: string
            email: string
            displayName: string
            roles: UserRole[]
            profile: EmployeeProfile | undefined
            departmentId: number
            jobTitle: string
            annualLeaveEntitlement: number
        }) => {
            await updateAdminUser(payload.userId, { email: payload.email, displayName: payload.displayName })
            await setAdminUserRoles(payload.userId, { roles: payload.roles })
            if (payload.profile) {
                await updateEmployeeProfile({
                    id: payload.profile.id,
                    departmentId: payload.departmentId,
                    managerId: payload.profile.managerId,
                    annualLeaveEntitlement: payload.annualLeaveEntitlement,
                    leaveBalance: payload.profile.leaveBalance,
                    jobTitle: payload.jobTitle || null,
                })
            }
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
            void queryClient.invalidateQueries({ queryKey: ['employeeProfiles'] })
            setEditData(null)
        },
    })

    const deleteMutation = useMutation({
        mutationFn: deleteAdminUser,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['adminUsers'] })
            void queryClient.invalidateQueries({ queryKey: ['employeeProfiles'] })
        },
    })

    const sortedUsers = useMemo(
        () => [...(users ?? [])].sort((a, b) => a.email.localeCompare(b.email)),
        [users]
    )

    const profilesByUserId = useMemo(
        () => new Map(employeeProfiles.map((p) => [p.userId, p])),
        [employeeProfiles]
    )

    const departmentsById = useMemo(
        () => new Map(departments.map((d) => [d.id, d.name])),
        [departments]
    )

    return (
        <Stack spacing={2}>
            <Paper
                elevation={0}
                sx={{ bgcolor: '#fff', border: `1px solid ${C_BORDER}`, borderRadius: '10px', overflow: 'hidden' }}
            >
                {/* Card header */}
                <Box
                    sx={{
                        px: '18px',
                        py: '14px',
                        borderBottom: `1px solid ${C_BORDER}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 2,
                    }}
                >
                    <Typography sx={{ fontSize: 14, fontWeight: 600, color: C_HEADING }}>Users</Typography>
                    <Button
                        variant="contained"
                        size="small"
                        onClick={() => setCreateOpen(true)}
                        sx={{
                            fontSize: 12,
                            py: '5px',
                            px: 1.5,
                            bgcolor: '#4F8EF7',
                            '&:hover': { bgcolor: '#3A7AE4' },
                            textTransform: 'none',
                            boxShadow: 'none',
                        }}
                    >
                        + New User
                    </Button>
                </Box>

                {/* States */}
                {isLoading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                        <CircularProgress size={24} />
                    </Box>
                )}
                {isError && (
                    <Box sx={{ p: 2 }}>
                        <Alert severity="error">{getErrorMessage(error)}</Alert>
                    </Box>
                )}
                {!isLoading && !isError && sortedUsers.length === 0 && (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                        <Typography sx={{ fontSize: 13, color: '#9CA3AF' }}>No users found.</Typography>
                    </Box>
                )}

                {/* Table */}
                {!isLoading && !isError && sortedUsers.length > 0 && (
                    <Box sx={{ overflowX: 'auto' }}>
                        <Table sx={{ width: '100%', borderCollapse: 'collapse' }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={TH}>Name</TableCell>
                                    <TableCell sx={TH}>Email</TableCell>
                                    <TableCell sx={TH}>Role</TableCell>
                                    <TableCell sx={TH}>Department</TableCell>
                                    <TableCell sx={TH}>Leave Balance</TableCell>
                                    <TableCell sx={TH}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sortedUsers.map((user) => {
                                    const profile = profilesByUserId.get(user.id)
                                    const deptName = profile?.departmentId
                                        ? (departmentsById.get(profile.departmentId) ?? null)
                                        : null
                                    const isProtected = isReadOnlyAdminUser(user)

                                    return (
                                        <TableRow
                                            key={user.id}
                                            sx={{ '&:last-child td': { borderBottom: 'none' }, '&:hover td': { bgcolor: '#F9FAFB' } }}
                                        >
                                            <TableCell sx={TD}>
                                                <strong>{user.displayName || user.email}</strong>
                                            </TableCell>
                                            <TableCell sx={{ ...TD, color: C_MUTED }}>{user.email}</TableCell>
                                            <TableCell sx={TD}>
                                                {user.roles.map((role) => (
                                                    <RoleBadge key={role} role={role} />
                                                ))}
                                            </TableCell>
                                            <TableCell sx={TD}>
                                                {deptName ? <DeptBadge dept={deptName} /> : <span style={{ color: C_MUTED }}>—</span>}
                                            </TableCell>
                                            <TableCell sx={TD}>
                                                {profile != null
                                                    ? `${profile.leaveBalance} days`
                                                    : <span style={{ color: C_MUTED }}>—</span>}
                                            </TableCell>
                                            <TableCell sx={TD}>
                                                {isProtected ? (
                                                    <Typography sx={{ fontSize: 11, color: C_MUTED, fontStyle: 'italic' }}>
                                                        Protected
                                                    </Typography>
                                                ) : (
                                                    <Stack direction="row" spacing={0.75}>
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            onClick={() => setEditData({ user, profile })}
                                                            sx={{
                                                                fontSize: 12,
                                                                py: '5px',
                                                                px: 1.5,
                                                                minWidth: 'unset',
                                                                color: C_MUTED,
                                                                borderColor: C_BORDER,
                                                                textTransform: 'none',
                                                                '&:hover': { bgcolor: '#F4F5F7', borderColor: C_BORDER },
                                                            }}
                                                        >
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            disabled={deleteMutation.isPending}
                                                            onClick={async () => {
                                                                const result = await SweetAlert.fire({
                                                                    title: `Delete ${user.email}?`,
                                                                    icon: 'warning',
                                                                    showCancelButton: true,
                                                                    confirmButtonText: 'Yes, delete',
                                                                    cancelButtonText: 'Cancel',
                                                                    reverseButtons: true,
                                                                })
                                                                if (result.isConfirmed) deleteMutation.mutate(user.id)
                                                            }}
                                                            sx={{
                                                                fontSize: 12,
                                                                py: '5px',
                                                                px: 1.5,
                                                                minWidth: 'unset',
                                                                color: '#FF4D4F',
                                                                borderColor: '#FECACA',
                                                                textTransform: 'none',
                                                                '&:hover': { bgcolor: '#FFF5F5', borderColor: '#FECACA' },
                                                            }}
                                                        >
                                                            Delete
                                                        </Button>
                                                    </Stack>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </Box>
                )}
            </Paper>

            <CreateUserDialog
                open={createOpen}
                isPending={createMutation.isPending}
                error={createMutation.error}
                onClose={() => setCreateOpen(false)}
                onSubmit={(payload) => createMutation.mutate(payload)}
                departments={departments}
            />

            <EditUserDialog
                data={editData}
                departments={departments}
                isPending={combinedEditMutation.isPending}
                error={combinedEditMutation.error}
                onClose={() => setEditData(null)}
                onSubmit={(payload) => combinedEditMutation.mutate(payload)}
            />
        </Stack>
    )
}

function EditUserDialog(props: {
    data: EditData | null
    departments: Department[]
    onClose: () => void
    isPending: boolean
    error: unknown
    onSubmit: (payload: {
        userId: string
        email: string
        displayName: string
        roles: UserRole[]
        profile: EmployeeProfile | undefined
        departmentId: number
        jobTitle: string
        annualLeaveEntitlement: number
    }) => void
}) {
    const open = !!props.data
    const { user, profile } = props.data ?? {}

    const [email, setEmail] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [roles, setRoles] = useState<UserRole[]>([])
    const [departmentId, setDepartmentId] = useState(0)
    const [jobTitle, setJobTitle] = useState('')
    const [annualLeaveEntitlement, setAnnualLeaveEntitlement] = useState(0)

    useEffect(() => {
        if (props.data) {
            Promise.resolve().then(() => {
                setEmail(props.data!.user.email)
                setDisplayName(props.data!.user.displayName ?? '')
                setRoles(props.data!.user.roles)
                setDepartmentId(props.data!.profile?.departmentId ?? 0)
                setJobTitle(props.data!.profile?.jobTitle ?? '')
                setAnnualLeaveEntitlement(props.data!.profile?.annualLeaveEntitlement ?? 0)
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.data])

    const toggleRole = (role: UserRole) => {
        setRoles((current) =>
            current.includes(role) ? current.filter((r) => r !== role) : [...current, role]
        )
    }

    return (
        <AppDialog open={open} onClose={props.onClose} maxWidth="sm">
            <AppDialogTitle>Edit User</AppDialogTitle>
            <AppDialogContent>
                <Stack spacing={2}>
                    <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth required />
                    <TextField label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} fullWidth />

                    <Divider />
                    <Typography variant="subtitle2" color="text.secondary">Roles</Typography>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                        {allRoles.map((role) => (
                            <FormControlLabel
                                key={role}
                                control={<Checkbox checked={roles.includes(role)} onChange={() => toggleRole(role)} />}
                                label={role}
                            />
                        ))}
                    </Stack>

                    {profile && (
                        <>
                            <Divider />
                            <Typography variant="subtitle2" color="text.secondary">Profile</Typography>
                            <TextField
                                select
                                label="Department"
                                value={departmentId}
                                onChange={(e) => setDepartmentId(Number(e.target.value))}
                                fullWidth
                                required
                                error={departmentId === 0}
                                helperText={departmentId === 0 ? 'Department is required' : ''}
                            >
                                <MenuItem value={0} disabled>Select department</MenuItem>
                                {props.departments.map((dept) => (
                                    <MenuItem key={dept.id} value={dept.id}>{dept.name} ({dept.code})</MenuItem>
                                ))}
                            </TextField>
                            <TextField
                                label="Job title"
                                value={jobTitle}
                                onChange={(e) => setJobTitle(e.target.value)}
                                fullWidth
                            />
                            <TextField
                                label="Annual leave entitlement"
                                type="number"
                                value={annualLeaveEntitlement}
                                onChange={(e) => setAnnualLeaveEntitlement(Number(e.target.value))}
                                inputProps={{ min: 0, step: 0.5 }}
                                fullWidth
                            />
                        </>
                    )}

                    {props.error ? <Alert severity="error">{getErrorMessage(props.error)}</Alert> : null}
                </Stack>
            </AppDialogContent>
            <AppDialogActions>
                <Button variant="outlined" onClick={props.onClose} disabled={props.isPending} sx={cancelBtnSx}>Cancel</Button>
                <Button
                    variant="contained"
                    disabled={props.isPending || !user || roles.length === 0}
                    onClick={() =>
                        user && props.onSubmit({ userId: user.id, email, displayName, roles, profile, departmentId, jobTitle, annualLeaveEntitlement })
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
    onSubmit: (payload: { email: string; displayName: string; password: string; roles: UserRole[]; departmentId: number }) => void
    departments: Department[]
}) {
    const [email, setEmail] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [password, setPassword] = useState('')
    const [roles, setRoles] = useState<UserRole[]>(['Employee'])
    const [departmentId, setDepartmentId] = useState<number>(0)

    const toggleRole = (role: UserRole) => {
        setRoles((current) =>
            current.includes(role) ? current.filter((r) => r !== role) : [...current, role]
        )
    }

    const close = () => {
        setEmail('')
        setDisplayName('')
        setPassword('')
        setRoles(['Employee'])
        setDepartmentId(0)
        props.onClose()
    }

    return (
        <AppDialog open={props.open} onClose={close} maxWidth="sm">
            <AppDialogTitle>Create User</AppDialogTitle>
            <AppDialogContent>
                <Stack spacing={2}>
                    <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth required />
                    <TextField label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} fullWidth />
                    <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth required />
                    <TextField
                        select
                        label="Department"
                        value={departmentId}
                        onChange={(e) => setDepartmentId(Number(e.target.value))}
                        fullWidth
                        required
                        error={departmentId === 0}
                        helperText={departmentId === 0 ? 'Department is required' : ''}
                    >
                        <MenuItem value={0} disabled>Select department</MenuItem>
                        {props.departments.map((dept) => (
                            <MenuItem key={dept.id} value={dept.id}>{dept.name} ({dept.code})</MenuItem>
                        ))}
                    </TextField>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                        {allRoles.map((role) => (
                            <FormControlLabel
                                key={role}
                                control={<Checkbox checked={roles.includes(role)} onChange={() => toggleRole(role)} />}
                                label={role}
                            />
                        ))}
                    </Stack>
                    {props.error ? <Alert severity="error">{getErrorMessage(props.error)}</Alert> : null}
                </Stack>
            </AppDialogContent>
            <AppDialogActions>
                <Button variant="outlined" onClick={close} disabled={props.isPending} sx={cancelBtnSx}>Cancel</Button>
                <Button
                    variant="contained"
                    disabled={props.isPending || !email || !password || departmentId === 0}
                    onClick={() => props.onSubmit({ email, displayName, password, roles, departmentId })}
                    sx={saveBtnSx}
                >
                    Create
                </Button>
            </AppDialogActions>
        </AppDialog>
    )
}

export default AdminUsersPanel
