import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { CalendarMonth as CalendarMonthIcon } from '@mui/icons-material'
import { createAnnualLeave, editAnnualLeave, getLeaveTypes, getAdminUsers } from '../../lib/api'
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
    /** When true, an "Assign to Employee" dropdown is shown so admin can create on behalf of a user */
    isAdmin?: boolean
}

function AnnualLeaveForm({ open, onClose, leave, isAdmin = false }: AnnualLeaveFormProps) {
    const isEdit = !!leave
    const queryClient = useQueryClient()

    const [startDate, setStartDate] = useState(leave ? toInputDate(leave.startDate) : '')
    const [endDate, setEndDate] = useState(leave ? toInputDate(leave.endDate) : '')
    const [leaveTypeId, setLeaveTypeId] = useState<number>(leave?.leaveTypeId ?? 0)
    const [reason, setReason] = useState(leave?.reason ?? '')
    const [assignedUserId, setAssignedUserId] = useState('')

    const { data: leaveTypes, isLoading: isLoadingLeaveTypes } = useQuery({
        queryKey: ['leaveTypes'],
        queryFn: getLeaveTypes,
    })

    const { data: adminUsers, isLoading: isLoadingUsers } = useQuery({
        queryKey: ['adminUsers'],
        queryFn: getAdminUsers,
        enabled: isAdmin && !isEdit,
    })

    // Reset form state when dialog closes
    useEffect(() => {
        if (!open) {
            setStartDate(leave ? toInputDate(leave.startDate) : '')
            setEndDate(leave ? toInputDate(leave.endDate) : '')
            setLeaveTypeId(leave?.leaveTypeId ?? 0)
            setReason(leave?.reason ?? '')
            setAssignedUserId('')
        }
    }, [open])

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

    const dateFieldSx = {
        '& .MuiInputBase-root': {
            borderRadius: 2,
            backgroundColor: 'rgba(15, 23, 42, 0.02)',
        },
        '& input[type="date"]': {
            fontWeight: 600,
        },
        '& input[type="date"]::-webkit-calendar-picker-indicator': {
            cursor: 'pointer',
            opacity: 0.8,
            filter: 'saturate(1.2)',
        },
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (isEdit && leave) {
            editMutation.mutate({ id: leave.id, startDate, endDate, leaveTypeId, reason })
        } else {
            // Admin can assign to a specific user; others create for themselves (server sets employeeId)
            createMutation.mutate({ startDate, endDate, leaveTypeId, reason, employeeId: isAdmin ? assignedUserId : '' })
        }
    }

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2.5 } }}>
            <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
                {isEdit ? 'Edit Leave Request' : 'New Leave Request'}
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 400 }}>
                    {isEdit ? 'Update dates, leave type, and notes.' : 'Fill in details and submit your leave request.'}
                </Typography>
            </DialogTitle>

            <Divider />

            <DialogContent>
                <Stack spacing={3} component="form" id="leave-form" onSubmit={handleSubmit} noValidate sx={{ pt: 1 }}>
                    {isAdmin && !isEdit && (
                        <TextField
                            label="Assign to Employee"
                            select
                            value={assignedUserId}
                            onChange={(e) => setAssignedUserId(e.target.value)}
                            required
                            fullWidth
                            disabled={isLoadingUsers}
                            helperText="Required"
                        >
                            <MenuItem value="" disabled>
                                Select employee
                            </MenuItem>
                            {(adminUsers ?? [])
                                .filter((u) => u.roles.includes('Employee') || u.roles.includes('Manager'))
                                .map((u) => (
                                    <MenuItem key={u.id} value={u.id}>
                                        {u.displayName} ({u.email})
                                    </MenuItem>
                                ))}
                        </TextField>
                    )}
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                            label="Start Date"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            required
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            helperText="Select start of leave"
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <CalendarMonthIcon fontSize="small" color="action" />
                                    </InputAdornment>
                                ),
                            }}
                            sx={dateFieldSx}
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
                            helperText="Select end of leave"
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <CalendarMonthIcon fontSize="small" color="action" />
                                    </InputAdornment>
                                ),
                            }}
                            sx={dateFieldSx}
                        />
                    </Stack>
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
                        placeholder="Add a short reason for this request"
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
                    disabled={isPending || leaveTypeId <= 0 || isLoadingLeaveTypes || (isAdmin && !isEdit && !assignedUserId)}
                    startIcon={isPending ? <CircularProgress size={16} color="inherit" /> : null}
                >
                    {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Submit Request'}
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default AnnualLeaveForm
