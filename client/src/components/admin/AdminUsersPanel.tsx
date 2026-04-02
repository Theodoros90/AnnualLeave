import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
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

const allRoles: UserRole[] = ['Admin', 'Manager', 'Employee']

function getErrorMessage(error: unknown) {
    return getApiErrorMessage(error, 'Something went wrong. Please try again.')
}

function roleChipColor(role: UserRole): 'primary' | 'secondary' | 'success' {
    if (role === 'Admin') return 'secondary'
    if (role === 'Manager') return 'primary'
    return 'success'
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
            leaveBalance: number
        }) => {
            await updateAdminUser(payload.userId, {
                email: payload.email,
                displayName: payload.displayName,
            })

            await setAdminUserRoles(payload.userId, { roles: payload.roles })

            if (payload.profile) {
                await updateEmployeeProfile({
                    id: payload.profile.id,
                    departmentId: payload.departmentId,
                    managerId: payload.profile.managerId,
                    annualLeaveEntitlement: payload.profile.annualLeaveEntitlement,
                    leaveBalance: payload.leaveBalance,
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
        () => new Map(employeeProfiles.map((profile) => [profile.userId, profile])),
        [employeeProfiles]
    )

    const departmentsById = useMemo(
        () => new Map(departments.map((department) => [department.id, department.name])),
        [departments]
    )

    return (
        <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1.5}>
                <Stack spacing={0.5}>
                    <Typography variant="h6" fontWeight={800}>User Management</Typography>
                    <Typography variant="body2" color="text.secondary">Manage user identities, roles, and profile settings.</Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Chip label={`${sortedUsers.length} users`} size="small" variant="outlined" />
                    <Button variant="contained" sx={{ textTransform: 'none', borderRadius: 999, px: 2.25 }} onClick={() => setCreateOpen(true)}>
                        Create User
                    </Button>
                </Stack>
            </Stack>

            {isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                    <CircularProgress />
                </Box>
            ) : null}

            {isError ? <Alert severity="error">{getErrorMessage(error)}</Alert> : null}

            {!isLoading && !isError && sortedUsers.length === 0 ? (
                <Paper elevation={0} sx={{ p: 3, border: '1px dashed', borderColor: 'divider' }}>
                    <Typography color="text.secondary">No users found.</Typography>
                </Paper>
            ) : null}

            {!isLoading && !isError
                ? sortedUsers.map((user) => (
                    <Paper
                        key={user.id}
                        elevation={0}
                        sx={{
                            p: 2.5,
                            border: '1px solid',
                            borderColor: 'divider',
                            borderLeft: '4px solid',
                            borderLeftColor: 'rgba(15,118,110,0.45)',
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                            '&:hover': { borderColor: 'rgba(15,118,110,0.35)', boxShadow: '0 8px 20px rgba(15,23,42,0.06)' },
                        }}
                    >
                        <Stack spacing={1.5}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
                                <Box>
                                    <Typography fontWeight={700}>{user.displayName || user.email}</Typography>
                                    <Typography variant="body2" color="text.secondary">{user.email}</Typography>
                                </Box>
                                <Stack direction="row" spacing={1}>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        sx={{ textTransform: 'none' }}
                                        onClick={() => setEditData({ user, profile: profilesByUserId.get(user.id) })}
                                    >
                                        Edit
                                    </Button>
                                    <Button
                                        size="small"
                                        color="error"
                                        variant="outlined"
                                        sx={{ textTransform: 'none' }}
                                        disabled={deleteMutation.isPending}
                                        onClick={() => {
                                            if (window.confirm(`Delete user ${user.email}?`)) {
                                                deleteMutation.mutate(user.id)
                                            }
                                        }}
                                    >
                                        Delete
                                    </Button>
                                </Stack>
                            </Stack>
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                {user.roles.map((role) => (
                                    <Chip key={`${user.id}-${role}`} label={role} size="small" color={roleChipColor(role)} variant="outlined" />
                                ))}
                            </Stack>
                            {profilesByUserId.get(user.id) ? (
                                <Typography variant="caption" color="text.secondary">
                                    {profilesByUserId.get(user.id)?.jobTitle || 'No job title'}
                                    &nbsp;|&nbsp; Department: {departmentsById.get(profilesByUserId.get(user.id)?.departmentId ?? 0) ?? 'Unassigned'}
                                    &nbsp;|&nbsp; Leave balance: {profilesByUserId.get(user.id)?.leaveBalance}
                                </Typography>
                            ) : null}
                        </Stack>
                    </Paper>
                ))
                : null}

            <CreateUserDialog
                open={createOpen}
                isPending={createMutation.isPending}
                error={createMutation.error}
                onClose={() => setCreateOpen(false)}
                onSubmit={(payload) => createMutation.mutate(payload)}
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
        leaveBalance: number
    }) => void
}) {
    const open = !!props.data
    const { user, profile } = props.data ?? {}

    const [email, setEmail] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [roles, setRoles] = useState<UserRole[]>([])
    const [departmentId, setDepartmentId] = useState(0)
    const [jobTitle, setJobTitle] = useState('')
    const [leaveBalance, setLeaveBalance] = useState(0)

    useEffect(() => {
        if (props.data) {
            setEmail(props.data.user.email)
            setDisplayName(props.data.user.displayName ?? '')
            setRoles(props.data.user.roles)
            setDepartmentId(props.data.profile?.departmentId ?? 0)
            setJobTitle(props.data.profile?.jobTitle ?? '')
            setLeaveBalance(props.data.profile?.leaveBalance ?? 0)
        }
    }, [props.data])

    const toggleRole = (role: UserRole) => {
        setRoles((current) =>
            current.includes(role) ? current.filter((r) => r !== role) : [...current, role]
        )
    }

    return (
        <Dialog open={open} onClose={props.onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Edit User</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
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
                            >
                                {props.departments.map((dept) => (
                                    <MenuItem key={dept.id} value={dept.id}>
                                        {dept.name} ({dept.code})
                                    </MenuItem>
                                ))}
                            </TextField>
                            <TextField
                                label="Job title"
                                value={jobTitle}
                                onChange={(e) => setJobTitle(e.target.value)}
                                fullWidth
                            />
                            <TextField
                                label="Leave balance"
                                type="number"
                                value={leaveBalance}
                                onChange={(e) => setLeaveBalance(Number(e.target.value))}
                                inputProps={{ min: 0, step: 0.5 }}
                                fullWidth
                            />
                        </>
                    )}

                    {props.error ? <Alert severity="error">{getErrorMessage(props.error)}</Alert> : null}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={props.onClose} disabled={props.isPending}>Cancel</Button>
                <Button
                    variant="contained"
                    disabled={props.isPending || !user || roles.length === 0}
                    onClick={() =>
                        user &&
                        props.onSubmit({
                            userId: user.id,
                            email,
                            displayName,
                            roles,
                            profile,
                            departmentId,
                            jobTitle,
                            leaveBalance,
                        })
                    }
                >
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    )
}

function CreateUserDialog(props: {
    open: boolean
    onClose: () => void
    isPending: boolean
    error: unknown
    onSubmit: (payload: { email: string; displayName: string; password: string; roles: UserRole[] }) => void
}) {
    const [email, setEmail] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [password, setPassword] = useState('')
    const [roles, setRoles] = useState<UserRole[]>(['Employee'])

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
        props.onClose()
    }

    return (
        <Dialog open={props.open} onClose={close} maxWidth="sm" fullWidth>
            <DialogTitle>Create User</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth required />
                    <TextField label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} fullWidth />
                    <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth required />
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
            </DialogContent>
            <DialogActions>
                <Button onClick={close} disabled={props.isPending}>Cancel</Button>
                <Button
                    variant="contained"
                    disabled={props.isPending}
                    onClick={() => props.onSubmit({ email, displayName, password, roles })}
                >
                    Create
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default AdminUsersPanel
