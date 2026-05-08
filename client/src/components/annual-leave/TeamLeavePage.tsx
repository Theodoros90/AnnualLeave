import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { observer } from 'mobx-react-lite'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { getAnnualLeaves, getLeaveTypes, updateLeaveStatus } from '../../lib/api'
import type { AnnualLeave, AnnualLeaveStatus, UserInfo } from '../../lib/types'

const C_BORDER = '#E4E6EA'
const C_HEADING = '#1A1A2E'
const C_MUTED = '#6B7280'

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
    Pending:   { bg: '#FEF3C7', color: '#92400E' },
    Approved:  { bg: '#D1FAE5', color: '#065F46' },
    Rejected:  { bg: '#FEE2E2', color: '#991B1B' },
    Cancelled: { bg: '#F3F4F6', color: '#6B7280' },
}

function StatusBadge({ status }: { status: string }) {
    const s = STATUS_COLORS[status] ?? { bg: '#F3F4F6', color: '#6B7280' }
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
            }}
        >
            {status}
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

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <Stack direction="row" spacing={1} alignItems="flex-start">
            <Typography sx={{ fontSize: 12, color: C_MUTED, fontWeight: 500, minWidth: 110, pt: 0.15 }}>{label}</Typography>
            <Box sx={{ fontSize: 13, color: '#374151', flex: 1 }}>{value}</Box>
        </Stack>
    )
}

async function downloadEvidence(url: string) {
    try {
        const resp = await fetch(url)
        if (!resp.ok) throw new Error('fetch failed')
        const blob = await resp.blob()
        const objectUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = objectUrl
        a.download = url.split('/').pop()?.split('?')[0] || 'evidence-file'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch {
        window.open(url, '_blank')
    }
}

type StatusTab = 'all' | 'pending' | 'approved' | 'rejected'

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

const TeamLeavePage = observer(function TeamLeavePage({ user }: { user: UserInfo }) {
    const isAdmin = user.roles.includes('Admin')
    const isManager = user.roles.includes('Manager')
    const queryClient = useQueryClient()

    const defaultTab: StatusTab = isManager && !isAdmin ? 'pending' : 'all'
    const [statusTab, setStatusTab] = useState<StatusTab>(defaultTab)
    const [deptFilter, setDeptFilter] = useState('all')
    const [actionTarget, setActionTarget] = useState<string | null>(null)
    const [viewLeave, setViewLeave] = useState<AnnualLeave | null>(null)

    useEffect(() => {
        const sync = () => {
            if (window.location.hash === '#team-leave-approvals') {
                setStatusTab('pending')
            } else if (window.location.hash === '#team-leave') {
                setStatusTab(defaultTab)
            }
        }
        sync()
        window.addEventListener('hashchange', sync)
        return () => window.removeEventListener('hashchange', sync)
    }, [defaultTab])

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

    const departments = useMemo(
        () => Array.from(new Set(allLeaves.map((l) => l.departmentName).filter(Boolean))).sort(),
        [allLeaves]
    )

    const approveMutation = useMutation({
        mutationFn: (id: string) => updateLeaveStatus(id, 'Approved'),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['annualLeaves'] }),
        onSettled: () => setActionTarget(null),
    })

    const rejectMutation = useMutation({
        mutationFn: (id: string) => updateLeaveStatus(id, 'Rejected'),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['annualLeaves'] }),
        onSettled: () => setActionTarget(null),
    })

    const filtered = useMemo(() => {
        let leaves = allLeaves
        if (deptFilter !== 'all') leaves = leaves.filter((l) => l.departmentName === deptFilter)
        if (statusTab !== 'all') {
            const s = (statusTab.charAt(0).toUpperCase() + statusTab.slice(1)) as AnnualLeaveStatus
            leaves = leaves.filter((l) => l.status === s)
        }
        return leaves.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }, [allLeaves, deptFilter, statusTab])

    const pendingCount = useMemo(() => allLeaves.filter((l) => l.status === 'Pending').length, [allLeaves])

    const managerTabs: { value: StatusTab; label: string }[] = [
        { value: 'pending', label: pendingCount > 0 ? `Pending (${pendingCount})` : 'Pending' },
        { value: 'approved', label: 'Approved' },
        { value: 'all', label: 'All' },
    ]
    const adminTabs: { value: StatusTab; label: string }[] = [
        { value: 'all', label: 'All' },
        { value: 'pending', label: pendingCount > 0 ? `Pending (${pendingCount})` : 'Pending' },
        { value: 'approved', label: 'Approved' },
        { value: 'rejected', label: 'Rejected' },
    ]
    const tabs = isAdmin ? adminTabs : managerTabs

    return (
        <Stack spacing={2.5}>
            {/* Status tabs */}
            <Box sx={{ borderBottom: `2px solid ${C_BORDER}`, mb: -1 }}>
                <Tabs
                    value={statusTab}
                    onChange={(_e, v: StatusTab) => setStatusTab(v)}
                    TabIndicatorProps={{ style: { backgroundColor: '#4F8EF7', height: 2 } }}
                    sx={{
                        minHeight: 44,
                        '& .MuiTab-root': {
                            textTransform: 'none',
                            fontWeight: 500,
                            fontSize: 13,
                            color: C_MUTED,
                            minHeight: 44,
                            py: 0,
                            px: 2.25,
                        },
                        '& .Mui-selected': { color: '#4F8EF7 !important' },
                    }}
                >
                    {tabs.map((t) => <Tab key={t.value} value={t.value} label={t.label} />)}
                </Tabs>
            </Box>

            {/* Table card */}
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
                    <Typography sx={{ fontSize: 14, fontWeight: 600, color: C_HEADING }}>
                        {isAdmin ? 'All Leave Requests' : 'Team Leave Requests'}
                    </Typography>

                    {isAdmin && departments.length > 0 && (
                        <Select
                            size="small"
                            value={deptFilter}
                            onChange={(e) => setDeptFilter(e.target.value)}
                            sx={{
                                fontSize: 12,
                                '& .MuiSelect-select': { py: '5px', px: '10px' },
                                '& fieldset': { borderColor: '#D1D5DB', borderRadius: '6px' },
                            }}
                        >
                            <MenuItem value="all">All Departments</MenuItem>
                            {departments.map((d) => (
                                <MenuItem key={d} value={d}>{d}</MenuItem>
                            ))}
                        </Select>
                    )}
                </Box>

                {/* Content */}
                {isLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                        <CircularProgress size={24} />
                    </Box>
                ) : filtered.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                        <Typography sx={{ fontSize: 13, color: '#9CA3AF' }}>No leave requests found.</Typography>
                    </Box>
                ) : (
                    <Box sx={{ overflowX: 'auto' }}>
                        <Table sx={{ width: '100%', borderCollapse: 'collapse' }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={TH}>Employee</TableCell>
                                    {isAdmin && <TableCell sx={TH}>Dept</TableCell>}
                                    <TableCell sx={TH}>Leave Type</TableCell>
                                    <TableCell sx={TH}>Start</TableCell>
                                    <TableCell sx={TH}>End</TableCell>
                                    <TableCell sx={TH}>Days</TableCell>
                                    <TableCell sx={TH}>Status</TableCell>
                                    <TableCell sx={TH}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filtered.map((leave) => {
                                    const isPending = leave.status === 'Pending'
                                    const isWorking = actionTarget === leave.id
                                    const leaveTypeName = leave.leaveTypeId != null
                                        ? (leaveTypeById.get(leave.leaveTypeId) ?? 'Annual Leave')
                                        : 'Annual Leave'

                                    return (
                                        <TableRow key={leave.id} sx={{ '&:last-child td': { borderBottom: 'none' }, '&:hover td': { bgcolor: '#F9FAFB' } }}>
                                            <TableCell sx={TD}><strong>{leave.employeeName}</strong></TableCell>
                                            {isAdmin && (
                                                <TableCell sx={TD}>
                                                    <DeptBadge dept={leave.departmentName} />
                                                </TableCell>
                                            )}
                                            <TableCell sx={TD}>{leaveTypeName}</TableCell>
                                            <TableCell sx={TD}>{formatDate(leave.startDate)}</TableCell>
                                            <TableCell sx={TD}>{formatDate(leave.endDate)}</TableCell>
                                            <TableCell sx={TD}>{leave.totalDays}</TableCell>
                                            <TableCell sx={TD}>
                                                <StatusBadge status={leave.status} />
                                            </TableCell>
                                            <TableCell sx={TD}>
                                                {isPending ? (
                                                    <Stack direction="row" spacing={0.75}>
                                                        <Button
                                                            size="small"
                                                            variant="contained"
                                                            disabled={isWorking}
                                                            onClick={() => {
                                                                setActionTarget(leave.id)
                                                                approveMutation.mutate(leave.id)
                                                            }}
                                                            sx={{
                                                                fontSize: 12,
                                                                py: '5px',
                                                                px: 1.5,
                                                                minWidth: 'unset',
                                                                bgcolor: '#22C47A',
                                                                '&:hover': { bgcolor: '#18A867' },
                                                                textTransform: 'none',
                                                                boxShadow: 'none',
                                                            }}
                                                        >
                                                            {isWorking && approveMutation.isPending ? '…' : 'Approve'}
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            variant="contained"
                                                            disabled={isWorking}
                                                            onClick={() => {
                                                                setActionTarget(leave.id)
                                                                rejectMutation.mutate(leave.id)
                                                            }}
                                                            sx={{
                                                                fontSize: 12,
                                                                py: '5px',
                                                                px: 1.5,
                                                                minWidth: 'unset',
                                                                bgcolor: '#FF4D4F',
                                                                '&:hover': { bgcolor: '#E03C3E' },
                                                                textTransform: 'none',
                                                                boxShadow: 'none',
                                                            }}
                                                        >
                                                            {isWorking && rejectMutation.isPending ? '…' : 'Reject'}
                                                        </Button>
                                                    </Stack>
                                                ) : (
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        onClick={() => setViewLeave(leave)}
                                                        sx={{
                                                            fontSize: 12,
                                                            py: '5px',
                                                            px: 1.5,
                                                            minWidth: 'unset',
                                                            color: '#6B7280',
                                                            borderColor: C_BORDER,
                                                            textTransform: 'none',
                                                            '&:hover': { bgcolor: '#F4F5F7', borderColor: C_BORDER },
                                                        }}
                                                    >
                                                        View
                                                    </Button>
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
            {/* Leave detail dialog */}
            <Dialog open={viewLeave !== null} onClose={() => setViewLeave(null)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontSize: 15, fontWeight: 600, color: C_HEADING, pb: 1 }}>
                    Leave Request Details
                </DialogTitle>
                <DialogContent sx={{ px: 3, py: 2 }}>
                    {viewLeave && (
                        <Stack spacing={1.5}>
                            <DetailRow label="Employee" value={viewLeave.employeeName} />
                            {isAdmin && <DetailRow label="Department" value={viewLeave.departmentName} />}
                            <DetailRow
                                label="Leave Type"
                                value={viewLeave.leaveTypeId != null ? (leaveTypeById.get(viewLeave.leaveTypeId) ?? 'Annual Leave') : 'Annual Leave'}
                            />
                            <Divider sx={{ my: 0.5 }} />
                            <DetailRow label="Start Date" value={formatDate(viewLeave.startDate)} />
                            <DetailRow label="End Date" value={formatDate(viewLeave.endDate)} />
                            <DetailRow label="Total Days" value={`${viewLeave.totalDays} working day${viewLeave.totalDays !== 1 ? 's' : ''}`} />
                            <Divider sx={{ my: 0.5 }} />
                            <DetailRow label="Status" value={<StatusBadge status={viewLeave.status} />} />
                            {viewLeave.reason && <DetailRow label="Reason" value={viewLeave.reason} />}
                            {viewLeave.evidenceUrl && viewLeave.evidenceUrl.trim() !== '' && (
                                <DetailRow
                                    label="Evidence"
                                    value={
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            onClick={() => downloadEvidence(viewLeave.evidenceUrl!)}
                                            sx={{
                                                fontSize: 12, textTransform: 'none',
                                                borderColor: '#4F8EF7', color: '#4F8EF7',
                                                py: '3px', px: 1.25,
                                                '&:hover': { bgcolor: '#EFF6FF', borderColor: '#4F8EF7' },
                                            }}
                                        >
                                            Download File
                                        </Button>
                                    }
                                />
                            )}
                            <DetailRow label="Submitted" value={formatDate(viewLeave.createdAt)} />
                            {viewLeave.approvedAt && (
                                <DetailRow label="Actioned" value={formatDate(viewLeave.approvedAt)} />
                            )}
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 1.75, gap: 1 }}>
                    <Button
                        size="small"
                        onClick={() => setViewLeave(null)}
                        sx={{ textTransform: 'none', color: C_MUTED }}
                    >
                        Close
                    </Button>
                    {viewLeave && viewLeave.status !== 'Cancelled' && viewLeave.status !== 'Approved' && (
                        <Button
                            size="small"
                            variant="contained"
                            disabled={approveMutation.isPending}
                            onClick={() => {
                                setActionTarget(viewLeave.id)
                                approveMutation.mutate(viewLeave.id)
                                setViewLeave(null)
                            }}
                            sx={{ textTransform: 'none', bgcolor: '#22C47A', '&:hover': { bgcolor: '#18A867' }, boxShadow: 'none' }}
                        >
                            Approve
                        </Button>
                    )}
                    {viewLeave && viewLeave.status !== 'Cancelled' && viewLeave.status !== 'Rejected' && (
                        <Button
                            size="small"
                            variant="contained"
                            disabled={rejectMutation.isPending}
                            onClick={() => {
                                setActionTarget(viewLeave.id)
                                rejectMutation.mutate(viewLeave.id)
                                setViewLeave(null)
                            }}
                            sx={{ textTransform: 'none', bgcolor: '#FF4D4F', '&:hover': { bgcolor: '#E03C3E' }, boxShadow: 'none' }}
                        >
                            Reject
                        </Button>
                    )}
                </DialogActions>
            </Dialog>
        </Stack>
    )
})

export default TeamLeavePage
