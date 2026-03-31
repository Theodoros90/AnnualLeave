import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import {
    Check as CheckIcon,
    Close as CloseIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
} from '@mui/icons-material'
import { deleteAnnualLeave, updateLeaveStatus } from '../../lib/api'
import type { AnnualLeave, AnnualLeaveStatus, UserInfo } from '../../lib/types'
import AnnualLeaveForm from './AnnualLeaveForm'

function statusColor(status: AnnualLeaveStatus): 'warning' | 'success' | 'error' | 'default' {
    switch (status) {
        case 'Pending': return 'warning'
        case 'Approved': return 'success'
        case 'Rejected': return 'error'
        case 'Cancelled': return 'default'
    }
}

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    })
}

interface AnnualLeaveCardProps {
    leave: AnnualLeave
    user: UserInfo
}

function AnnualLeaveCard({ leave, user }: AnnualLeaveCardProps) {
    const queryClient = useQueryClient()
    const [editOpen, setEditOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [rejectOpen, setRejectOpen] = useState(false)
    const [rejectComment, setRejectComment] = useState('')

    const isAdmin = user.roles.includes('Admin')
    const isManager = user.roles.includes('Manager')
    const isOwnLeave = leave.employeeId === user.id

    // Approve / Reject: Admin any, Manager dept-team-only (server enforces), Employee never
    const canApproveReject = (isAdmin || isManager) && leave.status === 'Pending'

    // Edit dates/type/reason: Admin any, Manager any, Employee own only
    const canEdit = isAdmin || isManager || isOwnLeave

    // Cancel: Admin any, Manager own, Employee own-pending-only
    const canCancel =
        isAdmin ||
        (isManager && isOwnLeave) ||
        (isOwnLeave && leave.status === 'Pending')

    const invalidateLeaves = () => void queryClient.invalidateQueries({ queryKey: ['annualLeaves'] })

    const deleteMutation = useMutation({
        mutationFn: () => deleteAnnualLeave(leave.id),
        onSuccess: () => {
            invalidateLeaves()
            setDeleteOpen(false)
        },
    })

    const statusMutation = useMutation({
        mutationFn: (vars: { status: 'Approved' | 'Rejected'; comment?: string }) =>
            updateLeaveStatus(leave.id, vars.status, vars.comment),
        onSuccess: () => {
            invalidateLeaves()
            void queryClient.invalidateQueries({ queryKey: ['leaveStatusHistories'] })
            setRejectOpen(false)
            setRejectComment('')
        },
    })

    const statusAccentColor =
        leave.status === 'Approved'
            ? 'success.main'
            : leave.status === 'Rejected'
                ? 'error.main'
                : leave.status === 'Cancelled'
                    ? 'grey.500'
                    : 'warning.main'

    return (
        <>
            <Paper
                elevation={0}
                sx={{
                    p: { xs: 2.25, sm: 3 },
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderLeft: '4px solid',
                    borderLeftColor: statusAccentColor,
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    '&:hover': {
                        transform: 'translateY(-1px)',
                        boxShadow: '0 8px 22px rgba(15, 23, 42, 0.08)',
                    },
                }}
            >
                <Stack spacing={2}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Stack spacing={0.5}>
                            <Typography variant="subtitle1" fontWeight={800}>
                                {formatDate(leave.startDate)} — {formatDate(leave.endDate)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {leave.totalDays} day{leave.totalDays !== 1 ? 's' : ''}
                            </Typography>
                            {leave.employeeName && (
                                <Typography variant="body2" fontWeight={500}>
                                    {leave.employeeName}
                                    {leave.departmentName ? ` — ${leave.departmentName}` : ''}
                                </Typography>
                            )}
                        </Stack>
                        <Stack direction="row" spacing={0.25} alignItems="center" sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <Chip
                                label={leave.status}
                                color={statusColor(leave.status)}
                                size="small"
                                sx={{ fontWeight: 700, mr: 0.5 }}
                            />
                            {canApproveReject ? (
                                <>
                                    <Tooltip title="Approve">
                                        <IconButton
                                            size="small"
                                            color="success"
                                            disabled={statusMutation.isPending}
                                            onClick={() => statusMutation.mutate({ status: 'Approved' })}
                                        >
                                            {statusMutation.isPending
                                                ? <CircularProgress size={16} />
                                                : <CheckIcon fontSize="small" />}
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Reject">
                                        <IconButton
                                            size="small"
                                            color="error"
                                            disabled={statusMutation.isPending}
                                            onClick={() => setRejectOpen(true)}
                                        >
                                            <CloseIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </>
                            ) : null}
                            {canEdit ? (
                                <Tooltip title="Edit">
                                    <IconButton size="small" onClick={() => setEditOpen(true)}>
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            ) : null}
                            {canCancel ? (
                                <Tooltip title="Cancel">
                                    <IconButton size="small" color="error" onClick={() => setDeleteOpen(true)}>
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            ) : null}
                        </Stack>
                    </Stack>

                    {leave.reason ? (
                        <>
                            <Divider />
                            <Typography variant="body2" color="text.secondary">
                                {leave.reason}
                            </Typography>
                        </>
                    ) : null}

                    <Box sx={{ pt: 0.25 }}>
                        <Typography variant="caption" color="text.disabled">
                            {leave.approvedAt
                                ? `Approved on ${formatDate(leave.approvedAt)}`
                                : `Submitted ${formatDate(leave.createdAt)}`}
                        </Typography>
                    </Box>
                </Stack>
            </Paper>

            {/* Edit dialog */}
            <AnnualLeaveForm
                key={leave.id}
                open={editOpen}
                onClose={() => setEditOpen(false)}
                leave={leave}
            />

            {/* Cancel confirmation dialog */}
            <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle fontWeight={700}>Cancel Leave Request?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Cancel the leave request from{' '}
                        <strong>{formatDate(leave.startDate)}</strong> to{' '}
                        <strong>{formatDate(leave.endDate)}</strong>?
                    </DialogContentText>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button onClick={() => setDeleteOpen(false)} disabled={deleteMutation.isPending}>
                        Keep
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        disabled={deleteMutation.isPending}
                        startIcon={deleteMutation.isPending ? <CircularProgress size={16} color="inherit" /> : null}
                        onClick={() => deleteMutation.mutate()}
                    >
                        {deleteMutation.isPending ? 'Cancelling...' : 'Cancel Request'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Reject dialog */}
            <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle fontWeight={700}>Reject Leave Request?</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <DialogContentText>
                            Reject the leave request from{' '}
                            <strong>{formatDate(leave.startDate)}</strong> to{' '}
                            <strong>{formatDate(leave.endDate)}</strong>?
                        </DialogContentText>
                        <TextField
                            label="Reason (optional)"
                            value={rejectComment}
                            onChange={(e) => setRejectComment(e.target.value)}
                            multiline
                            rows={2}
                            fullWidth
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button onClick={() => setRejectOpen(false)} disabled={statusMutation.isPending}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        disabled={statusMutation.isPending}
                        startIcon={statusMutation.isPending ? <CircularProgress size={16} color="inherit" /> : null}
                        onClick={() => statusMutation.mutate({ status: 'Rejected', comment: rejectComment || undefined })}
                    >
                        {statusMutation.isPending ? 'Rejecting...' : 'Reject'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    )
}

export default AnnualLeaveCard

