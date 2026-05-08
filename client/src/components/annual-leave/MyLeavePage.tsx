import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { observer } from 'mobx-react-lite'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import { deleteAnnualLeave, getAnnualLeaves, getLeaveTypes } from '../../lib/api'
import { getApiErrorMessage } from '../../lib/api/error-utils'
import { useStore } from '../../lib/mobx'
import type { AnnualLeave, AnnualLeaveStatus, UserInfo } from '../../lib/types'
import AnnualLeaveForm from './AnnualLeaveForm'
import { SweetAlert } from '../ui'

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

type StatusFilter = 'All' | 'Pending' | 'Approved' | 'Rejected'

const STATUS_TABS: StatusFilter[] = ['All', 'Pending', 'Approved', 'Rejected']

function formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function StatusBadge({ status }: { status: AnnualLeaveStatus }) {
    const config: Record<AnnualLeaveStatus, { bg: string; color: string }> = {
        Pending:   { bg: '#FEF3C7', color: '#92400E' },
        Approved:  { bg: '#D1FAE5', color: '#065F46' },
        Rejected:  { bg: '#FEE2E2', color: '#991B1B' },
        Cancelled: { bg: '#F3F4F6', color: '#6B7280' },
    }
    const { bg, color } = config[status] ?? config.Cancelled

    return (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                bgcolor: bg,
                color,
                borderRadius: '20px',
                px: 1.25,
                py: '3px',
                fontSize: 11,
                fontWeight: 500,
                whiteSpace: 'nowrap',
            }}
        >
            {status}
        </Box>
    )
}

const MyLeavePage = observer(function MyLeavePage({ user }: { user: UserInfo }) {
    const { uiStore } = useStore()
    const queryClient = useQueryClient()
    const isAdminUser = user.roles.includes('Admin')

    const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
    const [viewLeave, setViewLeave] = useState<AnnualLeave | null>(null)
    const [apiError, setApiError] = useState('')

    useEffect(() => {
        if (uiStore.myLeaveSection === 'apply') {
            uiStore.navigateToApplyLeave()
        }
    }, [uiStore, uiStore.myLeaveSection])

    const { data: allLeaves = [], isLoading } = useQuery({
        queryKey: ['annualLeaves'],
        queryFn: getAnnualLeaves,
    })

    const { data: leaveTypes = [] } = useQuery({
        queryKey: ['leaveTypes'],
        queryFn: getLeaveTypes,
    })

    const leaveTypeById = useMemo(
        () => new Map(leaveTypes.map((lt) => [lt.id, lt.name])),
        [leaveTypes]
    )

    const myLeaves = useMemo(
        () => allLeaves
            .filter((leave) => leave.employeeId === user.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        [allLeaves, user.id]
    )

    const filteredLeaves = useMemo(
        () => statusFilter === 'All'
            ? myLeaves
            : myLeaves.filter((l) => l.status === statusFilter),
        [myLeaves, statusFilter]
    )

    const tabCounts = useMemo(() => {
        const counts: Record<StatusFilter, number> = { All: myLeaves.length, Pending: 0, Approved: 0, Rejected: 0 }
        for (const l of myLeaves) {
            if (l.status === 'Pending' || l.status === 'Approved' || l.status === 'Rejected') {
                counts[l.status]++
            }
        }
        return counts
    }, [myLeaves])

    const cancelMutation = useMutation({
        mutationFn: (id: string) => deleteAnnualLeave(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['annualLeaves'] })
        },
        onError: (err) => {
            setApiError(getApiErrorMessage(err, 'Failed to cancel leave request.'))
        },
    })

    async function handleCancel(leave: AnnualLeave) {
        const result = await SweetAlert.fire({
            title: 'Cancel Leave Request?',
            text: `Cancel your ${formatDate(leave.startDate)} – ${formatDate(leave.endDate)} leave request?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, cancel it',
            cancelButtonText: 'Keep it',
            confirmButtonColor: '#EF4444',
        })

        if (result.isConfirmed) {
            setApiError('')
            await cancelMutation.mutateAsync(leave.id)
        }
    }

    const formOpen = uiStore.isCreateDrawerOpen || viewLeave !== null

    return (
        <>
            <Stack spacing={0}>
                {/* Page-level tabs (outside the card, design style) */}
                <Box
                    sx={{
                        display: 'flex',
                        gap: '2px',
                        borderBottom: `2px solid ${C_BORDER}`,
                        mb: '20px',
                    }}
                >
                    {STATUS_TABS.map((tab) => {
                        const active = statusFilter === tab
                        const count = tabCounts[tab]
                        return (
                            <Box
                                key={tab}
                                component="button"
                                onClick={() => setStatusFilter(tab)}
                                sx={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 0.75,
                                    px: '18px',
                                    py: '10px',
                                    fontSize: 13,
                                    fontWeight: 500,
                                    color: active ? '#4F8EF7' : C_MUTED,
                                    background: 'none',
                                    border: 'none',
                                    borderBottom: active ? '2px solid #4F8EF7' : '2px solid transparent',
                                    mb: '-2px',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    transition: 'color 0.15s',
                                    '&:hover': { color: active ? '#4F8EF7' : C_HEADING },
                                }}
                            >
                                {tab}
                                {count > 0 && (
                                    <Box
                                        component="span"
                                        sx={{
                                            bgcolor: active ? '#EFF6FF' : '#F3F4F6',
                                            color: active ? '#4F8EF7' : C_MUTED,
                                            borderRadius: '10px',
                                            px: '7px',
                                            fontSize: 11,
                                            fontWeight: 600,
                                            lineHeight: '18px',
                                        }}
                                    >
                                        {count}
                                    </Box>
                                )}
                            </Box>
                        )
                    })}
                </Box>

                {apiError && (
                    <Alert severity="error" onClose={() => setApiError('')} sx={{ mb: 2 }}>
                        {apiError}
                    </Alert>
                )}

                {/* Card */}
                <Paper
                    elevation={0}
                    sx={{
                        bgcolor: '#fff',
                        border: `1px solid ${C_BORDER}`,
                        borderRadius: '10px',
                        overflow: 'hidden',
                    }}
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
                        }}
                    >
                        <Typography sx={{ fontSize: 14, fontWeight: 600, color: C_HEADING }}>
                            My Leave Requests
                        </Typography>
                        {!isAdminUser && (
                            <Button
                                variant="contained"
                                size="small"
                                startIcon={<AddIcon sx={{ fontSize: '14px !important' }} />}
                                onClick={() => uiStore.navigateToApplyLeave()}
                                sx={{
                                    bgcolor: '#4F8EF7',
                                    borderRadius: '6px',
                                    textTransform: 'none',
                                    fontWeight: 500,
                                    fontSize: 13,
                                    px: '12px',
                                    py: '5px',
                                    boxShadow: 'none',
                                    '&:hover': { bgcolor: '#3A7AE4', boxShadow: 'none' },
                                }}
                            >
                                New Request
                            </Button>
                        )}
                    </Box>

                    {/* Table */}
                    {isLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                            <CircularProgress size={26} />
                        </Box>
                    ) : filteredLeaves.length === 0 ? (
                        <Box sx={{ py: 6, textAlign: 'center' }}>
                            <Typography sx={{ color: C_MUTED, fontSize: 13 }}>
                                {statusFilter === 'All'
                                    ? 'You have no leave requests yet.'
                                    : `No ${statusFilter.toLowerCase()} leave requests.`}
                            </Typography>
                        </Box>
                    ) : (
                        <Box sx={{ overflowX: 'auto' }}>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={TH}>Leave Type</TableCell>
                                        <TableCell sx={TH}>Start Date</TableCell>
                                        <TableCell sx={TH}>End Date</TableCell>
                                        <TableCell sx={TH}>Days</TableCell>
                                        <TableCell sx={TH}>Reason</TableCell>
                                        <TableCell sx={TH}>Status</TableCell>
                                        <TableCell sx={TH}>Action</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredLeaves.map((leave) => {
                                        const typeName = leave.leaveTypeId != null
                                            ? (leaveTypeById.get(leave.leaveTypeId) ?? 'Annual Leave')
                                            : 'Annual Leave'
                                        const isPending = leave.status === 'Pending'

                                        return (
                                            <TableRow
                                                key={leave.id}
                                                sx={{ '&:last-child td': { border: 0 }, '&:hover td': { bgcolor: '#F9FAFB' } }}
                                            >
                                                <TableCell sx={TD}>{typeName}</TableCell>
                                                <TableCell sx={TD}>{formatDate(leave.startDate)}</TableCell>
                                                <TableCell sx={TD}>{formatDate(leave.endDate)}</TableCell>
                                                <TableCell sx={TD}>{leave.totalDays}</TableCell>
                                                <TableCell sx={{ ...TD, maxWidth: 200 }}>
                                                    <Typography
                                                        sx={{
                                                            fontSize: 13,
                                                            color: '#374151',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            maxWidth: 180,
                                                        }}
                                                        title={leave.reason}
                                                    >
                                                        {leave.reason || '—'}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell sx={TD}>
                                                    <StatusBadge status={leave.status} />
                                                </TableCell>
                                                <TableCell sx={TD}>
                                                    {isPending ? (
                                                        <Box
                                                            component="button"
                                                            onClick={() => void handleCancel(leave)}
                                                            disabled={cancelMutation.isPending}
                                                            sx={{
                                                                fontSize: 12,
                                                                fontWeight: 500,
                                                                color: C_MUTED,
                                                                background: 'transparent',
                                                                border: `1px solid ${C_BORDER}`,
                                                                borderRadius: '6px',
                                                                px: '12px',
                                                                py: '5px',
                                                                cursor: 'pointer',
                                                                fontFamily: 'inherit',
                                                                transition: 'background 0.15s',
                                                                '&:hover': { bgcolor: '#F4F5F7' },
                                                                '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
                                                            }}
                                                        >
                                                            Cancel
                                                        </Box>
                                                    ) : (
                                                        <Box
                                                            component="button"
                                                            onClick={() => setViewLeave(leave)}
                                                            sx={{
                                                                fontSize: 12,
                                                                fontWeight: 500,
                                                                color: C_MUTED,
                                                                background: 'transparent',
                                                                border: `1px solid ${C_BORDER}`,
                                                                borderRadius: '6px',
                                                                px: '12px',
                                                                py: '5px',
                                                                cursor: 'pointer',
                                                                fontFamily: 'inherit',
                                                                transition: 'background 0.15s',
                                                                '&:hover': { bgcolor: '#F4F5F7' },
                                                            }}
                                                        >
                                                            View
                                                        </Box>
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
            </Stack>

            <AnnualLeaveForm
                open={formOpen}
                onClose={() => {
                    uiStore.closeCreateDrawer()
                    setViewLeave(null)
                }}
                leave={viewLeave ?? undefined}
                isAdmin={isAdminUser}
            />
        </>
    )
})

export default MyLeavePage
