import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SweetAlert, AppDialog, AppDialogTitle, AppDialogContent, AppDialogActions, cancelBtnSx, saveBtnSx } from '../ui'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
    createDepartment,
    deleteDepartment,
    getDepartments,
    getAdminUsers,
    getEmployeeProfiles,
    updateDepartment,
    type UpsertDepartmentRequest,
} from '../../lib/api'
import { getApiErrorMessage } from '../../lib/api/error-utils'
import type { Department } from '../../lib/types'

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

function CodeBadge({ code }: { code: string }) {
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
            {code}
        </Box>
    )
}

function StatusBadge({ active }: { active: boolean }) {
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
                bgcolor: active ? '#D1FAE5' : '#F3F4F6',
                color: active ? '#065F46' : '#6B7280',
                whiteSpace: 'nowrap',
            }}
        >
            {active ? 'Active' : 'Inactive'}
        </Box>
    )
}

function getErrorMessage(error: unknown) {
    return getApiErrorMessage(error, 'Something went wrong. Please try again.')
}

function DepartmentsPanel() {
    const queryClient = useQueryClient()
    const [createOpen, setCreateOpen] = useState(false)
    const [editDept, setEditDept] = useState<Department | null>(null)

    const { data: departments = [], isLoading, isError, error } = useQuery({
        queryKey: ['departments'],
        queryFn: getDepartments,
    })

    const { data: profiles = [] } = useQuery({
        queryKey: ['employeeProfiles'],
        queryFn: getEmployeeProfiles,
    })

    const { data: adminUsers = [] } = useQuery({
        queryKey: ['adminUsers'],
        queryFn: getAdminUsers,
    })

    const createMutation = useMutation({
        mutationFn: createDepartment,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['departments'] })
            setCreateOpen(false)
        },
    })

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: UpsertDepartmentRequest }) =>
            updateDepartment(id, payload),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['departments'] })
            setEditDept(null)
        },
    })

    const deleteMutation = useMutation({
        mutationFn: deleteDepartment,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['departments'] })
        },
    })

    const managerUserIds = useMemo(
        () => new Set(adminUsers.filter((u) => u.roles.includes('Manager')).map((u) => u.id)),
        [adminUsers]
    )

    const userDisplayNames = useMemo(
        () => new Map(adminUsers.map((u) => [u.id, u.displayName || u.email])),
        [adminUsers]
    )

    function deptStats(deptId: number) {
        const deptProfiles = profiles.filter((p) => p.departmentId === deptId)
        const employeeCount = deptProfiles.length
        const managers = deptProfiles
            .filter((p) => managerUserIds.has(p.userId))
            .map((p) => userDisplayNames.get(p.userId) ?? p.displayName)
        return { employeeCount, managers }
    }

    const sortedDepts = useMemo(
        () => [...departments].sort((a, b) => a.name.localeCompare(b.name)),
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
                    <Typography sx={{ fontSize: 14, fontWeight: 600, color: C_HEADING }}>Departments</Typography>
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
                        + New Department
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
                {deleteMutation.isError && (
                    <Box sx={{ px: 2, pb: 1 }}>
                        <Alert severity="error">{getErrorMessage(deleteMutation.error)}</Alert>
                    </Box>
                )}
                {!isLoading && !isError && sortedDepts.length === 0 && (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                        <Typography sx={{ fontSize: 13, color: '#9CA3AF' }}>No departments found.</Typography>
                    </Box>
                )}

                {/* Table */}
                {!isLoading && !isError && sortedDepts.length > 0 && (
                    <Box sx={{ overflowX: 'auto' }}>
                        <Table sx={{ width: '100%', borderCollapse: 'collapse' }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={TH}>Name</TableCell>
                                    <TableCell sx={TH}>Code</TableCell>
                                    <TableCell sx={TH}>Employees</TableCell>
                                    <TableCell sx={TH}>Managers</TableCell>
                                    <TableCell sx={TH}>Status</TableCell>
                                    <TableCell sx={TH}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sortedDepts.map((dept) => {
                                    const { employeeCount, managers } = deptStats(dept.id)
                                    return (
                                        <TableRow
                                            key={dept.id}
                                            sx={{ '&:last-child td': { borderBottom: 'none' }, '&:hover td': { bgcolor: '#F9FAFB' } }}
                                        >
                                            <TableCell sx={TD}><strong>{dept.name}</strong></TableCell>
                                            <TableCell sx={TD}><CodeBadge code={dept.code} /></TableCell>
                                            <TableCell sx={TD}>{employeeCount}</TableCell>
                                            <TableCell sx={{ ...TD, color: managers.length ? '#374151' : C_MUTED }}>
                                                {managers.length ? managers.join(', ') : '—'}
                                            </TableCell>
                                            <TableCell sx={TD}><StatusBadge active={dept.isActive} /></TableCell>
                                            <TableCell sx={TD}>
                                                <Stack direction="row" spacing={0.75}>
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        onClick={() => setEditDept(dept)}
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
                                                                title: `Delete "${dept.name}"?`,
                                                                text: 'This will fail if users are assigned to it.',
                                                                icon: 'warning',
                                                                showCancelButton: true,
                                                                confirmButtonText: 'Yes, delete',
                                                                cancelButtonText: 'Cancel',
                                                                reverseButtons: true,
                                                            })
                                                            if (result.isConfirmed) deleteMutation.mutate(dept.id)
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
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </Box>
                )}
            </Paper>

            <DepartmentFormDialog
                open={createOpen}
                title="New Department"
                isPending={createMutation.isPending}
                error={createMutation.error}
                onClose={() => setCreateOpen(false)}
                onSubmit={(payload) => createMutation.mutate(payload)}
            />

            <DepartmentFormDialog
                open={!!editDept}
                title="Edit Department"
                initial={editDept ?? undefined}
                isPending={updateMutation.isPending}
                error={updateMutation.error}
                onClose={() => setEditDept(null)}
                onSubmit={(payload) => editDept && updateMutation.mutate({ id: editDept.id, payload })}
            />
        </Stack>
    )
}

function DepartmentFormDialog(props: {
    open: boolean
    title: string
    initial?: Department
    isPending: boolean
    error: Error | null
    onClose: () => void
    onSubmit: (payload: UpsertDepartmentRequest) => void
}) {
    const [name, setName] = useState('')
    const [code, setCode] = useState('')
    const [isActive, setIsActive] = useState(true)

    useEffect(() => {
        if (props.open) {
            setName(props.initial?.name ?? '')
            setCode(props.initial?.code ?? '')
            setIsActive(props.initial?.isActive ?? true)
        }
    }, [props.open, props.initial])

    return (
        <AppDialog open={props.open} onClose={props.onClose} maxWidth="xs">
            <AppDialogTitle>{props.title}</AppDialogTitle>
            <AppDialogContent>
                <Stack spacing={2}>
                    <TextField
                        label="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        fullWidth
                        required
                    />
                    <TextField
                        label="Code"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        fullWidth
                        required
                        inputProps={{ maxLength: 10 }}
                        helperText="Short uppercase code e.g. ENG, HR"
                    />
                    <FormControlLabel
                        control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
                        label="Active"
                    />
                    {props.error != null && (
                        <Alert severity="error">{getErrorMessage(props.error)}</Alert>
                    )}
                </Stack>
            </AppDialogContent>
            <AppDialogActions>
                <Button variant="outlined" sx={cancelBtnSx} onClick={props.onClose} disabled={props.isPending}>Cancel</Button>
                <Button
                    variant="contained"
                    sx={saveBtnSx}
                    disabled={props.isPending || !name.trim() || !code.trim()}
                    onClick={() => props.onSubmit({ name: name.trim(), code: code.trim(), isActive })}
                >
                    Save
                </Button>
            </AppDialogActions>
        </AppDialog>
    )
}

export default DepartmentsPanel
