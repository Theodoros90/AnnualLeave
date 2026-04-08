import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import { useState } from 'react'
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
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
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

function getErrorMessage(error: unknown) {
    return getApiErrorMessage(error, 'Something went wrong. Please try again.')
}

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

    return (
        <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1.5}>
                <Typography variant="body2" color="text.secondary">Define leave categories and approval behavior.</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Chip label={`${leaveTypes.length} types`} size="small" variant="outlined" />
                    <Button variant="contained" sx={{ textTransform: 'none', borderRadius: 999, px: 2.25 }} onClick={() => setCreateOpen(true)}>
                        Add Leave Type
                    </Button>
                </Stack>
            </Stack>

            {isLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                    <CircularProgress />
                </Box>
            )}

            {isError && <Alert severity="error">{getErrorMessage(error)}</Alert>}

            {!isLoading && !isError && leaveTypes.length === 0 && (
                <Paper elevation={0} sx={{ p: 3, border: '1px dashed', borderColor: 'divider' }}>
                    <Typography color="text.secondary">No leave types found.</Typography>
                </Paper>
            )}

            {!isLoading && !isError && leaveTypes.map((leaveType) => {
                const isReadOnlyType = leaveType.name.trim().toLowerCase() === 'annual leave'

                return (
                    <Paper
                        key={leaveType.id}
                        elevation={0}
                        sx={{
                            px: 2,
                            py: 1.35,
                            border: '1px solid',
                            borderColor: 'divider',
                            borderLeft: '4px solid',
                            borderLeftColor: leaveType.requiresApproval ? 'rgba(237,108,2,0.65)' : 'rgba(15,118,110,0.55)',
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                            '&:hover': { borderColor: 'rgba(15,118,110,0.35)', boxShadow: '0 8px 20px rgba(15,23,42,0.06)' },
                        }}
                    >
                        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={0.75}>
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                                    <Typography fontWeight={700}>{leaveType.name}</Typography>
                                    <Chip
                                        label={leaveType.requiresApproval ? 'Approval Required' : 'Auto Approved'}
                                        size="small"
                                        color={leaveType.requiresApproval ? 'warning' : 'default'}
                                    />
                                    <Chip
                                        label={leaveType.isActive ? 'Active' : 'Inactive'}
                                        size="small"
                                        color={leaveType.isActive ? 'success' : 'default'}
                                    />
                                </Stack>
                            </Box>
                            {isReadOnlyType ? (
                                <Stack
                                    direction="row"
                                    spacing={0.75}
                                    alignItems="center"
                                    useFlexGap
                                    sx={{
                                        alignSelf: { xs: 'flex-start', sm: 'center' },
                                        px: 1,
                                        py: 0.45,
                                        borderRadius: 1.5,
                                        border: '1px solid',
                                        borderColor: 'rgba(2,132,199,0.22)',
                                        bgcolor: 'rgba(2,132,199,0.08)',
                                    }}
                                >
                                    <AdminPanelSettingsRoundedIcon sx={{ fontSize: 17, color: 'info.main' }} />
                                    <Box>
                                        <Typography
                                            variant="caption"
                                            sx={{ display: 'block', fontWeight: 700, lineHeight: 1.15, color: 'text.primary' }}
                                        >
                                            Admin protected
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{ display: 'block', lineHeight: 1.15 }}
                                        >
                                            System default · no row actions
                                        </Typography>
                                    </Box>
                                </Stack>
                            ) : (
                                <Stack
                                    direction="row"
                                    spacing={0.25}
                                    alignItems="center"
                                    useFlexGap
                                    sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap' }}
                                >
                                    <Button
                                        size="small"
                                        color="inherit"
                                        variant="text"
                                        startIcon={<EditOutlinedIcon sx={{ fontSize: 16 }} />}
                                        aria-label={`Edit leave type ${leaveType.name}`}
                                        sx={{
                                            textTransform: 'none',
                                            minWidth: 'auto',
                                            px: 1,
                                            py: 0.375,
                                            borderRadius: 1.5,
                                            color: 'text.secondary',
                                            fontWeight: 600,
                                            '& .MuiButton-startIcon': { mr: 0.5 },
                                            '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                                        }}
                                        onClick={() => setEditType(leaveType)}
                                    >
                                        Edit
                                    </Button>
                                    <Button
                                        size="small"
                                        color="error"
                                        variant="text"
                                        startIcon={<DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />}
                                        aria-label={`Delete leave type ${leaveType.name}`}
                                        sx={{
                                            textTransform: 'none',
                                            minWidth: 'auto',
                                            px: 1,
                                            py: 0.375,
                                            borderRadius: 1.5,
                                            fontWeight: 600,
                                            '& .MuiButton-startIcon': { mr: 0.5 },
                                        }}
                                        disabled={deleteMutation.isPending}
                                        onClick={() => {
                                            if (window.confirm(`Delete leave type "${leaveType.name}"? This will fail if leave requests use it.`)) {
                                                deleteMutation.mutate(leaveType.id)
                                            }
                                        }}
                                    >
                                        Delete
                                    </Button>
                                </Stack>
                            )}
                        </Stack>
                    </Paper>
                )
            })}

            {deleteMutation.isError && (
                <Alert severity="error">{getErrorMessage(deleteMutation.error)}</Alert>
            )}

            <LeaveTypeFormDialog
                key={createOpen ? 'leave-type-create-open' : 'leave-type-create-closed'}
                open={createOpen}
                title="Add Leave Type"
                isPending={createMutation.isPending}
                error={createMutation.error}
                onClose={() => setCreateOpen(false)}
                onSubmit={(payload) => createMutation.mutate(payload)}
            />

            <LeaveTypeFormDialog
                key={editType ? `leave-type-edit-${editType.id}` : 'leave-type-edit-none'}
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

    const handleSubmit = () => {
        props.onSubmit({ name: name.trim(), requiresApproval, isActive })
    }

    return (
        <Dialog open={props.open} onClose={props.onClose} maxWidth="xs" fullWidth>
            <DialogTitle>{props.title}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <TextField
                        label="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        fullWidth
                        required
                    />
                    <FormControlLabel
                        control={
                            <Switch
                                checked={requiresApproval}
                                onChange={(e) => setRequiresApproval(e.target.checked)}
                            />
                        }
                        label="Requires approval"
                    />
                    <FormControlLabel
                        control={
                            <Switch
                                checked={isActive}
                                onChange={(e) => setIsActive(e.target.checked)}
                            />
                        }
                        label="Active"
                    />
                    {props.error != null && <Alert severity="error">{getErrorMessage(props.error)}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={props.onClose} disabled={props.isPending}>Cancel</Button>
                <Button
                    variant="contained"
                    disabled={props.isPending || !name.trim()}
                    onClick={handleSubmit}
                >
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default LeaveTypesPanel
