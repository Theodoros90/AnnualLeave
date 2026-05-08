import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { observer } from 'mobx-react-lite'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
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
import { approveTimesheet, getDepartments, getTimesheets, rejectTimesheet } from '../../lib/api'
import type { TimesheetStatus, UserInfo } from '../../lib/types'

const C_BORDER = '#E4E6EA'
const C_HEADING = '#1A1A2E'
const C_MUTED = '#6B7280'

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
    Draft:       { bg: '#EFF6FF', color: '#1D4ED8' },
    Submitted:   { bg: '#FEF3C7', color: '#92400E' },
    Approved:    { bg: '#D1FAE5', color: '#065F46' },
    Rejected:    { bg: '#FEE2E2', color: '#991B1B' },
    Resubmitted: { bg: '#F3E8FF', color: '#6D28D9' },
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

function formatPeriod(start: string, end: string) {
    const s = new Date(start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    const e = new Date(end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    return `${s} – ${e}`
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

const TeamTimesheetPage = observer(function TeamTimesheetPage({ user }: { user: UserInfo }) {
    const isAdmin = user.roles.includes('Admin')
    const isManager = user.roles.includes('Manager')
    const queryClient = useQueryClient()

    const [statusTab, setStatusTab] = useState<StatusTab>('pending')
    const [deptFilter, setDeptFilter] = useState('all')
    const [actionTarget, setActionTarget] = useState<string | null>(null)

    const { data: timesheets = [], isLoading } = useQuery({
        queryKey: ['timesheets'],
        queryFn: getTimesheets,
    })

    const { data: departments = [] } = useQuery({
        queryKey: ['departments'],
        queryFn: getDepartments,
        enabled: isAdmin,
    })

    const deptById = useMemo(
        () => new Map(departments.map((d) => [d.id, d.name])),
        [departments]
    )

    const approveMutation = useMutation({
        mutationFn: (id: string) => approveTimesheet(id),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['timesheets'] }),
        onSettled: () => setActionTarget(null),
    })

    const rejectMutation = useMutation({
        mutationFn: (id: string) => rejectTimesheet(id),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['timesheets'] }),
        onSettled: () => setActionTarget(null),
    })

    const needsAction = (status: TimesheetStatus) => status === 'Submitted' || status === 'Resubmitted'

    const filtered = useMemo(() => {
        let list = timesheets
        if (isAdmin && deptFilter !== 'all') {
            const deptId = departments.find((d) => d.name === deptFilter)?.id
            if (deptId != null) list = list.filter((t) => t.departmentId === deptId)
        }
        if (statusTab === 'pending') list = list.filter((t) => needsAction(t.status))
        else if (statusTab === 'approved') list = list.filter((t) => t.status === 'Approved')
        else if (statusTab === 'rejected') list = list.filter((t) => t.status === 'Rejected')
        return list.slice().sort((a, b) => {
            const aDate = a.submittedAt ?? a.createdAt
            const bDate = b.submittedAt ?? b.createdAt
            return new Date(bDate).getTime() - new Date(aDate).getTime()
        })
    }, [timesheets, statusTab, deptFilter, departments, isAdmin])

    const pendingCount = useMemo(() => timesheets.filter((t) => needsAction(t.status)).length, [timesheets])

    const managerTabs: { value: StatusTab; label: string }[] = [
        { value: 'pending', label: pendingCount > 0 ? `Pending (${pendingCount})` : 'Pending' },
        { value: 'approved', label: 'Approved' },
        { value: 'rejected', label: 'Rejected' },
        { value: 'all', label: 'All' },
    ]
    const adminTabs: { value: StatusTab; label: string }[] = [
        { value: 'all', label: 'All' },
        { value: 'pending', label: pendingCount > 0 ? `Pending (${pendingCount})` : 'Pending' },
        { value: 'approved', label: 'Approved' },
        { value: 'rejected', label: 'Rejected' },
    ]
    const tabs = isAdmin ? adminTabs : managerTabs

    const deptNames = useMemo(
        () => Array.from(new Set(departments.map((d) => d.name))).sort(),
        [departments]
    )

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
                        {isAdmin ? 'All Timesheets' : 'Team Timesheets'}
                    </Typography>

                    {isAdmin && deptNames.length > 0 && (
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
                            {deptNames.map((d) => (
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
                        <Typography sx={{ fontSize: 13, color: '#9CA3AF' }}>No timesheets found.</Typography>
                    </Box>
                ) : (
                    <Box sx={{ overflowX: 'auto' }}>
                        <Table sx={{ width: '100%', borderCollapse: 'collapse' }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={TH}>Employee</TableCell>
                                    {isAdmin && <TableCell sx={TH}>Dept</TableCell>}
                                    <TableCell sx={TH}>Period</TableCell>
                                    <TableCell sx={TH}>Hours</TableCell>
                                    <TableCell sx={TH}>Status</TableCell>
                                    <TableCell sx={TH}>Submitted</TableCell>
                                    <TableCell sx={TH}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filtered.map((ts) => {
                                    const isPending = needsAction(ts.status)
                                    const isWorking = actionTarget === ts.id
                                    const deptName = deptById.get(ts.departmentId) ?? '—'

                                    return (
                                        <TableRow
                                            key={ts.id}
                                            sx={{ '&:last-child td': { borderBottom: 'none' }, '&:hover td': { bgcolor: '#F9FAFB' } }}
                                        >
                                            <TableCell sx={TD}><strong>{ts.employeeName}</strong></TableCell>
                                            {isAdmin && (
                                                <TableCell sx={TD}>
                                                    {deptName !== '—' ? <DeptBadge dept={deptName} /> : <span style={{ color: C_MUTED }}>—</span>}
                                                </TableCell>
                                            )}
                                            <TableCell sx={TD}>{formatPeriod(ts.periodStart, ts.periodEnd)}</TableCell>
                                            <TableCell sx={TD}>{Number(ts.totalHours).toFixed(1)} hrs</TableCell>
                                            <TableCell sx={TD}>
                                                <StatusBadge status={ts.status} />
                                            </TableCell>
                                            <TableCell sx={{ ...TD, color: C_MUTED }}>
                                                {ts.submittedAt
                                                    ? new Date(ts.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                                                    : '—'}
                                            </TableCell>
                                            <TableCell sx={TD}>
                                                {isPending && (isAdmin || isManager) ? (
                                                    <Stack direction="row" spacing={0.75}>
                                                        <Button
                                                            size="small"
                                                            variant="contained"
                                                            disabled={isWorking}
                                                            onClick={() => {
                                                                setActionTarget(ts.id)
                                                                approveMutation.mutate(ts.id)
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
                                                                setActionTarget(ts.id)
                                                                rejectMutation.mutate(ts.id)
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
        </Stack>
    )
})

export default TeamTimesheetPage
