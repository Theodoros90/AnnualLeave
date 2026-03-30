import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { createAnnualLeave, editAnnualLeave, getLeaveTypes } from '../../lib/api'
import type { AnnualLeave, CreateAnnualLeaveRequest, EditAnnualLeaveRequest } from '../../lib/types'

function getErrorMessage(error: unknown) {
    if (isAxiosError(error)) {
        const data = error.response?.data as {
            message?: string
            details?: string
            errors?: Record<string, string[]>
        } | undefined

        if (data?.errors) {
            const first = Object.values(data.errors).flat()[0]
            if (first) return first
        }

        if (typeof data?.message === 'string' && data.message.length > 0) {
            return data.message
        }

        if (typeof data?.details === 'string' && data.details.length > 0) {
            return data.details
        }

        if (error.response?.status === 403) {
            return 'You do not have permission to perform this action.'
        }
    }

    return 'Something went wrong. Please try again.'
}

function toInputDate(dateStr: string) {
    return dateStr ? dateStr.substring(0, 10) : ''
}

interface AnnualLeaveFormProps {
    open: boolean
    onClose: () => void
    /** Pass an existing leave to edit; omit for create */
    leave?: AnnualLeave
}

function AnnualLeaveForm({ open, onClose, leave }: AnnualLeaveFormProps) {
    const isEdit = !!leave
    const queryClient = useQueryClient()

    const [startDate, setStartDate] = useState(leave ? toInputDate(leave.startDate) : '')
    const [endDate, setEndDate] = useState(leave ? toInputDate(leave.endDate) : '')
    const [leaveTypeId, setLeaveTypeId] = useState<number>(leave?.leaveTypeId ?? 0)
    const [reason, setReason] = useState(leave?.reason ?? '')

    const { data: leaveTypes, isLoading: isLoadingLeaveTypes } = useQuery({
        queryKey: ['leaveTypes'],
        queryFn: getLeaveTypes,
    })

    const createMutation = useMutation({
        mutationFn: (req: CreateAnnualLeaveRequest) => createAnnualLeave(req),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['annualLeaves'] })
            onClose()
        },
    })

    const editMutation = useMutation({
        mutationFn: (req: EditAnnualLeaveRequest) => editAnnualLeave(req),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['annualLeaves'] })
            onClose()
        },
    })

    const isPending = createMutation.isPending || editMutation.isPending
    const error = createMutation.error ?? editMutation.error

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (isEdit && leave) {
            editMutation.mutate({ id: leave.id, startDate, endDate, leaveTypeId, reason })
        } else {
            // employeeId is set server-side from the auth cookie
            createMutation.mutate({ startDate, endDate, leaveTypeId, reason, employeeId: '' })
        }
    }

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>
                {isEdit ? 'Edit Leave Request' : 'New Leave Request'}
            </DialogTitle>

            <DialogContent>
                <Stack spacing={3} component="form" id="leave-form" onSubmit={handleSubmit} noValidate sx={{ pt: 1 }}>
                    <TextField
                        label="Start Date"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                        label="End Date"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        required
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        inputProps={{ min: startDate }}
                    />
                    <TextField
                        label="Leave Type"
                        select
                        value={leaveTypeId}
                        onChange={(e) => setLeaveTypeId(Number(e.target.value))}
                        required
                        fullWidth
                        disabled={isLoadingLeaveTypes}
                        helperText="Required"
                    >
                        <MenuItem value={0} disabled>
                            Select leave type
                        </MenuItem>
                        {(leaveTypes ?? []).map((leaveType) => (
                            <MenuItem key={leaveType.id} value={leaveType.id}>
                                {leaveType.name}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        label="Reason (optional)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        multiline
                        rows={3}
                        fullWidth
                    />

                    {error ? <Alert severity="error">{getErrorMessage(error)}</Alert> : null}
                </Stack>
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 3 }}>
                <Button onClick={onClose} disabled={isPending}>
                    Cancel
                </Button>
                <Button
                    type="submit"
                    form="leave-form"
                    variant="contained"
                    disabled={isPending || leaveTypeId <= 0 || isLoadingLeaveTypes}
                    startIcon={isPending ? <CircularProgress size={16} color="inherit" /> : null}
                >
                    {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Submit Request'}
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default AnnualLeaveForm
