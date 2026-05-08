import { useState } from 'react'
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
    createLeaveType,
    deleteLeaveType,
    getLeaveTypes,
    updateLeaveType,
    type UpsertLeaveTypeRequest,
} from '../../lib/api'
import { getApiErrorMessage } from '../../lib/api/error-utils'
import type { LeaveType } from '../../lib/types'

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

const PROTECTED_NAME = 'annual leave'

function LeaveTypesPanel() {
    const queryClient = useQueryClient()
    const [createOpen, setCreateOpen] = useState(false)
    const [editType, setEditType] = useState<LeaveType | null>(null)

    const { data: leaveTypes = [], isLoading, isError, error } = useQuery({
        queryKey: ['leaveTypes'],
        queryFn: getLeaveTypes,
    })

    const createMutation = useMutation({
        mutationFn: createLeaveType,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['leaveTypes'] })
            setCreateOpen(false)
        },
    })

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: UpsertLeaveTypeRequest }) =>
            updateLeaveType(id, payload),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['leaveTypes'] })
            setEditType(null)
        },
    })

    const deleteMutation = useMutation({
        mutationFn: deleteLeaveType,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['leaveTypes'] })
        },
    })

    const sorted = [...leaveTypes].sort((a, b) => a.name.localeCompare(b.name))

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
                    <Typography sx={{ fontSize: 14, fontWeight: 600, color: C_HEADING }}>Leave Types</Typography>
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
                        + New Type
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
                {!isLoading && !isError && sorted.length === 0 && (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                        <Typography sx={{ fontSize: 13, color: '#9CA3AF' }}>No leave types found.</Typography>
                    </Box>
                )}

                {/* Table */}
                {!isLoading && !isError && sorted.length > 0 && (
                    <Box sx={{ overflowX: 'auto' }}>
                        <Table sx={{ width: '100%', borderCollapse: 'collapse' }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={TH}>Name</TableCell>
                                    <TableCell sx={TH}>Requires Approval</TableCell>
                                    <TableCell sx={TH}>Status</TableCell>
                                    <TableCell sx={TH}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sorted.map((lt) => {
                                    const isProtected = lt.name.trim().toLowerCase() === PROTECTED_NAME
                                    return (
                                        <TableRow
                                            key={lt.id}
                                            sx={{ '&:last-child td': { borderBottom: 'none' }, '&:hover td': { bgcolor: '#F9FAFB' } }}
                                        >
                                            <TableCell sx={TD}><strong>{lt.name}</strong></TableCell>
                                            <TableCell sx={TD}>
                                                {lt.requiresApproval ? '✅ Yes' : '—'}
                                            </TableCell>
                                            <TableCell sx={TD}><StatusBadge active={lt.isActive} /></TableCell>
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
                                                            onClick={() => setEditType(lt)}
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
                                                                    title: `Delete "${lt.name}"?`,
                                                                    text: 'This will fail if leave requests use it.',
                                                                    icon: 'warning',
                                                                    showCancelButton: true,
                                                                    confirmButtonText: 'Yes, delete',
                                                                    cancelButtonText: 'Cancel',
                                                                    reverseButtons: true,
                                                                })
                                                                if (result.isConfirmed) deleteMutation.mutate(lt.id)
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

            <LeaveTypeFormDialog
                key={createOpen ? 'lt-create-open' : 'lt-create-closed'}
                open={createOpen}
                title="New Leave Type"
                isPending={createMutation.isPending}
                error={createMutation.error}
                onClose={() => setCreateOpen(false)}
                onSubmit={(payload) => createMutation.mutate(payload)}
            />

            <LeaveTypeFormDialog
                key={editType ? `lt-edit-${editType.id}` : 'lt-edit-none'}
                open={!!editType}
                title="Edit Leave Type"
                initial={editType ?? undefined}
                isPending={updateMutation.isPending}
                error={updateMutation.error}
                onClose={() => setEditType(null)}
                onSubmit={(payload) => editType && updateMutation.mutate({ id: editType.id, payload })}
            />
        </Stack>
    )
}

function LeaveTypeFormDialog(props: {
    open: boolean
    title: string
    initial?: LeaveType
    isPending: boolean
    error: Error | null
    onClose: () => void
    onSubmit: (payload: UpsertLeaveTypeRequest) => void
}) {
    const [name, setName] = useState(props.initial?.name ?? '')
    const [requiresApproval, setRequiresApproval] = useState(props.initial?.requiresApproval ?? true)
    const [isActive, setIsActive] = useState(props.initial?.isActive ?? true)

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
                    <FormControlLabel
                        control={<Switch checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} />}
                        label="Requires approval"
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
                    disabled={props.isPending || !name.trim()}
                    onClick={() => props.onSubmit({ name: name.trim(), requiresApproval, isActive })}
                >
                    Save
                </Button>
            </AppDialogActions>
        </AppDialog>
    )
}

export default LeaveTypesPanel
