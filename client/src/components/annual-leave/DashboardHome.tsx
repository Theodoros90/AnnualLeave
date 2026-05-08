import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { observer } from 'mobx-react-lite'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import {
    getAdminUsers, getAnnualLeaves, getDepartments,
    getEmployeeProfiles, getLeaveTypes, getTimesheets, updateLeaveStatus,
} from '../../lib/api'
import { useStore } from '../../lib/mobx'
import { AdminUsersPanel, DepartmentsPanel, LeaveTypesPanel, ProjectsPanel } from '..'
import type { UserInfo } from '../../lib/types'

// ── Design tokens ────────────────────────────────────────────────────────────
const C_BORDER = '#E4E6EA'
const C_HEADING = '#1A1A2E'
const C_MUTED = '#6B7280'
const C_BODY = '#374151'
const C_TH_BG = '#F9FAFB'

const BADGE: Record<string, { bg: string; color: string }> = {
    Pending:     { bg: '#FEF3C7', color: '#92400E' },
    Approved:    { bg: '#D1FAE5', color: '#065F46' },
    Rejected:    { bg: '#FEE2E2', color: '#991B1B' },
    Cancelled:   { bg: '#F3F4F6', color: '#6B7280' },
    Draft:       { bg: '#EFF6FF', color: '#1D4ED8' },
    Submitted:   { bg: '#FEF3C7', color: '#92400E' },
    Resubmitted: { bg: '#F3E8FF', color: '#6D28D9' },
}

const TH_SX = {
    fontSize: 11, fontWeight: 600, color: C_MUTED,
    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
    bgcolor: C_TH_BG, borderBottom: `1px solid ${C_BORDER}`, py: 1.25, px: 1.75,
} as const

const TD_SX = {
    fontSize: 13, color: C_BODY,
    borderBottom: '1px solid #F3F4F6', py: 1.4, px: 1.75, verticalAlign: 'middle' as const,
} as const

// ── Small reusable components ────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
    const cfg = BADGE[status] ?? { bg: '#F3F4F6', color: '#6B7280' }
    return (
        <Box component="span" sx={{
            display: 'inline-flex', alignItems: 'center',
            px: 1.1, py: 0.4, borderRadius: '20px',
            fontSize: 11, fontWeight: 500,
            bgcolor: cfg.bg, color: cfg.color, whiteSpace: 'nowrap',
        }}>
            {status}
        </Box>
    )
}

function StatCard({ label, value, sub, topColor }: { label: string; value: string | number; sub: string; topColor: string }) {
    return (
        <Box sx={{
            bgcolor: '#fff', borderRadius: '10px', p: '18px 20px',
            border: `1px solid ${C_BORDER}`, borderTop: `3px solid ${topColor}`,
            flex: 1, minWidth: 0,
        }}>
            <Typography sx={{ fontSize: 12, color: C_MUTED, mb: 1 }}>{label}</Typography>
            <Typography sx={{ fontSize: 26, fontWeight: 700, color: C_HEADING, lineHeight: 1 }}>{value}</Typography>
            <Typography sx={{ fontSize: 11, color: C_MUTED, mt: 0.5 }}>{sub}</Typography>
        </Box>
    )
}

function CardWrap({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <Box sx={{ bgcolor: '#fff', borderRadius: '10px', border: `1px solid ${C_BORDER}`, overflow: 'hidden' }}>
            <Box sx={{
                px: 2.25, py: 1.75, borderBottom: `1px solid ${C_BORDER}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: C_HEADING }}>{title}</Typography>
                {action}
            </Box>
            {children}
        </Box>
    )
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
    return (
        <TableRow>
            <TableCell colSpan={cols} sx={{ py: 4.5, textAlign: 'center', color: C_MUTED, fontSize: 13, borderBottom: 0 }}>
                {text}
            </TableCell>
        </TableRow>
    )
}

function ViewAllBtn({ onClick }: { onClick: () => void }) {
    return (
        <Button size="small" variant="outlined" onClick={onClick} sx={{
            fontSize: 12, textTransform: 'none',
            borderColor: C_BORDER, color: '#4F8EF7',
            '&:hover': { borderColor: '#4F8EF7' },
        }}>
            View All
        </Button>
    )
}

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatPeriod(s: string, e: string) {
    const a = new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    const b = new Date(e).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    return s === e ? a : `${a} – ${b}`
}

// ── Main component ───────────────────────────────────────────────────────────
const DashboardHome = observer(function DashboardHome({ user }: { user: UserInfo }) {
    const { uiStore } = useStore()
    const queryClient = useQueryClient()

    const isAdmin = user.roles.includes('Admin')
    const isManager = user.roles.includes('Manager')
    const now = new Date()
    const currentYear = now.getFullYear()
    const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

    // Queries
    const { data: profiles = [] } = useQuery({ queryKey: ['employeeProfiles'], queryFn: getEmployeeProfiles })
    const { data: annualLeaves = [] } = useQuery({ queryKey: ['annualLeaves'], queryFn: getAnnualLeaves })
    const { data: leaveTypes = [] } = useQuery({ queryKey: ['leaveTypes'], queryFn: getLeaveTypes })
    const { data: timesheets = [] } = useQuery({ queryKey: ['timesheets'], queryFn: getTimesheets })
    const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: getDepartments, enabled: isAdmin })
    const { data: adminUsers = [] } = useQuery({ queryKey: ['adminUsers'], queryFn: getAdminUsers, enabled: isAdmin })

    // Leave status mutations
    const approveMutation = useMutation({
        mutationFn: (id: string) => updateLeaveStatus(id, 'Approved'),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['annualLeaves'] }),
    })
    const rejectMutation = useMutation({
        mutationFn: (id: string) => updateLeaveStatus(id, 'Rejected'),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['annualLeaves'] }),
    })
    const isMutating = approveMutation.isPending || rejectMutation.isPending

    // Derived data
    const myProfile = useMemo(() => profiles.find(p => p.userId === user.id), [profiles, user.id])
    const leaveTypeById = useMemo(() => new Map(leaveTypes.map(lt => [lt.id, lt.name])), [leaveTypes])
    const rawEntitlement = myProfile?.annualLeaveEntitlement ?? 0
    const myEntitlement = rawEntitlement > 0 ? rawEntitlement : 20

    // Employee-specific
    const myLeaves = useMemo(() =>
        annualLeaves
            .filter(l => l.employeeId === user.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5),
        [annualLeaves, user.id])

    const myPendingCount = useMemo(() =>
        annualLeaves.filter(l => l.employeeId === user.id && l.status === 'Pending').length,
        [annualLeaves, user.id])

    // Calculate balance from actual approved leaves so it's always accurate
    const myApprovedDaysThisYear = useMemo(() =>
        annualLeaves
            .filter(l => l.employeeId === user.id && l.status === 'Approved' && new Date(l.startDate).getFullYear() === currentYear)
            .reduce((s, l) => s + l.totalDays, 0),
        [annualLeaves, user.id, currentYear])

    const myBalance = Math.max(0, myEntitlement - myApprovedDaysThisYear)
    const usedPct = myEntitlement > 0 ? Math.min(100, Math.round((myApprovedDaysThisYear / myEntitlement) * 100)) : 0
    const balanceBarColor = usedPct < 50 ? '#4F8EF7' : usedPct < 75 ? '#F59E0B' : '#FF4D4F'

    const myTimesheets = useMemo(() =>
        timesheets
            .filter(t => t.employeeId === user.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 4),
        [timesheets, user.id])

    const mySubmittedThisMonth = useMemo(() =>
        timesheets.filter(t =>
            t.employeeId === user.id && t.submittedAt &&
            new Date(t.submittedAt).getMonth() === now.getMonth() &&
            new Date(t.submittedAt).getFullYear() === currentYear
        ).length,
        [timesheets, user.id, now.getMonth(), currentYear])

    // Manager/Admin-specific
    const pendingLeaves = useMemo(() =>
        annualLeaves
            .filter(l => l.status === 'Pending' && l.employeeId !== user.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        [annualLeaves, user.id])

    const pendingTimesheets = useMemo(() =>
        timesheets
            .filter(t => (t.status === 'Submitted' || t.status === 'Resubmitted') && t.employeeId !== user.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        [timesheets, user.id])

    const teamSize = useMemo(() => profiles.filter(p => p.userId !== user.id).length, [profiles, user.id])

    const teamLeaveOverview = useMemo(() => {
        const approvedByUser = new Map<string, number>()
        annualLeaves
            .filter(l => l.status === 'Approved' && new Date(l.startDate).getFullYear() === currentYear)
            .forEach(l => {
                approvedByUser.set(l.employeeId, (approvedByUser.get(l.employeeId) ?? 0) + l.totalDays)
            })
        return profiles
            .filter(p => p.userId !== user.id)
            .map(p => {
                const usedDays = approvedByUser.get(p.userId) ?? 0
                const entitlement = p.annualLeaveEntitlement > 0 ? p.annualLeaveEntitlement : 20
                const pct = entitlement > 0 ? Math.min(100, Math.round((usedDays / entitlement) * 100)) : 0
                return { userId: p.userId, displayName: p.displayName, usedDays, entitlement, pct }
            })
            .sort((a, b) => a.displayName.localeCompare(b.displayName))
    }, [profiles, annualLeaves, user.id, currentYear])
    const totalUsers = useMemo(() =>
        adminUsers.filter(u => u.roles.includes('Employee') || u.roles.includes('Manager')).length,
        [adminUsers])

    // Admin: pending leaves grouped by department name
    const leaveByDept = useMemo(() => {
        const counts = new Map<string, number>()
        annualLeaves.filter(l => l.status === 'Pending').forEach(l => {
            const dept = l.departmentName || 'Unknown'
            counts.set(dept, (counts.get(dept) ?? 0) + 1)
        })
        if (counts.size === 0) return []
        const max = Math.max(...Array.from(counts.values()))
        return Array.from(counts.entries())
            .map(([name, count]) => ({ name, count, pct: Math.round((count / max) * 100) }))
            .sort((a, b) => b.count - a.count)
    }, [annualLeaves])

    // ── Admin section routing ────────────────────────────────────────────────
    const adminSection = uiStore.adminSection
    if (isAdmin && adminSection === 'users') return <AdminUsersPanel />
    if (isAdmin && adminSection === 'departments') return <DepartmentsPanel />
    if (isAdmin && (adminSection === 'leave-types' || adminSection === 'leave' || adminSection === 'settings')) return <LeaveTypesPanel />
    if (isAdmin && adminSection === 'projects') return <ProjectsPanel />

    // ── Employee dashboard ───────────────────────────────────────────────────
    if (!isAdmin && !isManager) {
        return (
            <Stack spacing={3}>
                <Stack direction="row" spacing={2}>
                    <StatCard label="📅 Leave Balance"      value={myBalance}              sub={`of ${myEntitlement} days remaining`} topColor="#4F8EF7" />
                    <StatCard label="⏳ Pending Requests"   value={myPendingCount}          sub="awaiting approval"                    topColor="#F59E0B" />
                    <StatCard label="✅ Approved This Year" value={myApprovedDaysThisYear}  sub="days taken"                           topColor="#22C47A" />
                    <StatCard label="🕐 Timesheets"         value={mySubmittedThisMonth}    sub="submitted this month"                 topColor="#4F8EF7" />
                </Stack>

                <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 8 }}>
                        <CardWrap title="Recent Leave Requests" action={<ViewAllBtn onClick={() => uiStore.navigateToMyLeave('requests')} />}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={TH_SX}>Type</TableCell>
                                        <TableCell sx={TH_SX}>Dates</TableCell>
                                        <TableCell sx={TH_SX}>Days</TableCell>
                                        <TableCell sx={TH_SX}>Status</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {myLeaves.length === 0
                                        ? <EmptyRow cols={4} text="No leave requests yet" />
                                        : myLeaves.map(l => (
                                            <TableRow key={l.id} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                                                <TableCell sx={TD_SX}>{l.leaveTypeId ? (leaveTypeById.get(l.leaveTypeId) ?? 'Annual') : 'Annual'}</TableCell>
                                                <TableCell sx={TD_SX}>{formatPeriod(l.startDate, l.endDate)}</TableCell>
                                                <TableCell sx={TD_SX}>{l.totalDays}</TableCell>
                                                <TableCell sx={TD_SX}><StatusBadge status={l.status} /></TableCell>
                                            </TableRow>
                                        ))
                                    }
                                </TableBody>
                            </Table>
                        </CardWrap>
                    </Grid>

                    <Grid size={{ xs: 12, md: 4 }}>
                        <CardWrap title="Leave Balance">
                            <Box sx={{ p: 2.25 }}>
                                <Stack direction="row" justifyContent="space-between" sx={{ fontSize: 12, color: C_MUTED, mb: 0.75 }}>
                                    <span>Annual Leave</span>
                                    <span>{myApprovedDaysThisYear} / {myEntitlement} days used</span>
                                </Stack>
                                <Box sx={{ height: 8, bgcolor: '#E4E6EA', borderRadius: 1, overflow: 'hidden', mb: 2.5 }}>
                                    <Box sx={{ height: '100%', width: `${usedPct}%`, bgcolor: balanceBarColor, borderRadius: 1 }} />
                                </Box>
                                <Button
                                    fullWidth variant="contained"
                                    onClick={() => uiStore.navigateToMyLeave('apply')}
                                    sx={{ textTransform: 'none', fontWeight: 600, bgcolor: '#4F8EF7', '&:hover': { bgcolor: '#3A7AE4' } }}
                                >
                                    + Apply for Leave
                                </Button>
                            </Box>
                        </CardWrap>
                    </Grid>
                </Grid>

                <CardWrap title="Recent Timesheets" action={<ViewAllBtn onClick={() => uiStore.navigateToTimesheets()} />}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={TH_SX}>Period</TableCell>
                                <TableCell sx={TH_SX}>Total Hours</TableCell>
                                <TableCell sx={TH_SX}>Status</TableCell>
                                <TableCell sx={TH_SX}>Submitted</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {myTimesheets.length === 0
                                ? <EmptyRow cols={4} text="No timesheets yet" />
                                : myTimesheets.map(t => (
                                    <TableRow key={t.id} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                                        <TableCell sx={TD_SX}>{formatPeriod(t.periodStart, t.periodEnd)}</TableCell>
                                        <TableCell sx={TD_SX}>{t.totalHours} hrs</TableCell>
                                        <TableCell sx={TD_SX}><StatusBadge status={t.status} /></TableCell>
                                        <TableCell sx={TD_SX}>{t.submittedAt ? formatDate(t.submittedAt) : '—'}</TableCell>
                                    </TableRow>
                                ))
                            }
                        </TableBody>
                    </Table>
                </CardWrap>
            </Stack>
        )
    }

    // ── Manager dashboard ────────────────────────────────────────────────────
    if (isManager && !isAdmin) {
        return (
            <Stack spacing={3}>
                <Stack direction="row" spacing={2}>
                    <StatCard label="⏳ Pending Leave"        value={pendingLeaves.length}     sub="awaiting your approval" topColor="#F59E0B" />
                    <StatCard label="📋 Pending Timesheets"   value={pendingTimesheets.length}  sub="awaiting your review"   topColor="#F59E0B" />
                    <StatCard label="👥 Team Size"            value={teamSize}                  sub="in your scope"          topColor="#4F8EF7" />
                    <StatCard label="📅 My Leave Balance"     value={myBalance}                 sub={`of ${myEntitlement} days remaining`} topColor="#22C47A" />
                </Stack>

                <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <CardWrap title="Pending Leave Approvals" action={<ViewAllBtn onClick={() => uiStore.navigateToTeamLeave()} />}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={TH_SX}>Employee</TableCell>
                                        <TableCell sx={TH_SX}>Type</TableCell>
                                        <TableCell sx={TH_SX}>Dates</TableCell>
                                        <TableCell sx={TH_SX}>Days</TableCell>
                                        <TableCell sx={TH_SX}>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {pendingLeaves.length === 0
                                        ? <EmptyRow cols={5} text="No pending requests" />
                                        : pendingLeaves.slice(0, 4).map(l => (
                                            <TableRow key={l.id} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                                                <TableCell sx={TD_SX}><strong>{l.employeeName}</strong></TableCell>
                                                <TableCell sx={TD_SX}>{l.leaveTypeId ? (leaveTypeById.get(l.leaveTypeId) ?? 'Annual') : 'Annual'}</TableCell>
                                                <TableCell sx={TD_SX}>{formatPeriod(l.startDate, l.endDate)}</TableCell>
                                                <TableCell sx={TD_SX}>{l.totalDays}</TableCell>
                                                <TableCell sx={TD_SX}>
                                                    <Stack direction="row" spacing={0.75}>
                                                        <Button size="small" disabled={isMutating} onClick={() => approveMutation.mutate(l.id)}
                                                            sx={{ fontSize: 12, textTransform: 'none', bgcolor: '#22C47A', color: '#fff', fontWeight: 500, px: 1.25, py: 0.4, minWidth: 0, '&:hover': { bgcolor: '#18A867' }, '&:disabled': { bgcolor: '#E4E6EA', color: C_MUTED } }}>
                                                            Approve
                                                        </Button>
                                                        <Button size="small" disabled={isMutating} onClick={() => rejectMutation.mutate(l.id)}
                                                            sx={{ fontSize: 12, textTransform: 'none', bgcolor: '#FF4D4F', color: '#fff', fontWeight: 500, px: 1.25, py: 0.4, minWidth: 0, '&:hover': { bgcolor: '#E03C3E' }, '&:disabled': { bgcolor: '#E4E6EA', color: C_MUTED } }}>
                                                            Reject
                                                        </Button>
                                                    </Stack>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    }
                                </TableBody>
                            </Table>
                        </CardWrap>
                    </Grid>

                    <Grid size={{ xs: 12, md: 6 }}>
                        <CardWrap title="Pending Timesheet Approvals" action={<ViewAllBtn onClick={() => uiStore.navigateToTimesheets()} />}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={TH_SX}>Employee</TableCell>
                                        <TableCell sx={TH_SX}>Period</TableCell>
                                        <TableCell sx={TH_SX}>Hours</TableCell>
                                        <TableCell sx={TH_SX}>Status</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {pendingTimesheets.length === 0
                                        ? <EmptyRow cols={4} text="No pending timesheets" />
                                        : pendingTimesheets.slice(0, 4).map(t => (
                                            <TableRow key={t.id} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                                                <TableCell sx={TD_SX}><strong>{t.employeeName}</strong></TableCell>
                                                <TableCell sx={TD_SX}>{formatPeriod(t.periodStart, t.periodEnd)}</TableCell>
                                                <TableCell sx={TD_SX}>{t.totalHours} hrs</TableCell>
                                                <TableCell sx={TD_SX}><StatusBadge status={t.status} /></TableCell>
                                            </TableRow>
                                        ))
                                    }
                                </TableBody>
                            </Table>
                        </CardWrap>
                    </Grid>
                </Grid>

                <CardWrap title={`Team Leave Overview — ${monthLabel}`}>
                    <Box sx={{ p: 2.25 }}>
                        {teamLeaveOverview.length === 0
                            ? <Typography sx={{ textAlign: 'center', py: 3, color: C_MUTED, fontSize: 13 }}>No team members found</Typography>
                            : teamLeaveOverview.map(m => (
                                <Box key={m.userId} sx={{ mb: 2, '&:last-child': { mb: 0 } }}>
                                    <Stack direction="row" justifyContent="space-between" sx={{ fontSize: 12, mb: 0.75 }}>
                                        <span style={{ color: C_HEADING, fontWeight: 500 }}>{m.displayName}</span>
                                        <span style={{ color: C_MUTED }}>{m.usedDays} / {m.entitlement} days used</span>
                                    </Stack>
                                    <Box sx={{ height: 6, bgcolor: '#E4E6EA', borderRadius: 0.75, overflow: 'hidden' }}>
                                        <Box sx={{ height: '100%', width: `${m.pct}%`, bgcolor: '#4F8EF7', borderRadius: 0.75 }} />
                                    </Box>
                                </Box>
                            ))
                        }
                    </Box>
                </CardWrap>
            </Stack>
        )
    }

    // ── Admin dashboard ──────────────────────────────────────────────────────
    const activeDepts = departments.filter(d => d.isActive)
    return (
        <Stack spacing={3}>
            <Stack direction="row" spacing={2}>
                <StatCard label="⏳ Pending Leave"      value={pendingLeaves.length}     sub="across all departments"             topColor="#F59E0B" />
                <StatCard label="📋 Pending Timesheets" value={pendingTimesheets.length}  sub="across all departments"             topColor="#F59E0B" />
                <StatCard label="👤 Total Users"        value={totalUsers}                sub={`across ${activeDepts.length} departments`} topColor="#4F8EF7" />
                <StatCard label="🏢 Departments"        value={activeDepts.length}         sub="active"                             topColor="#22C47A" />
            </Stack>

            <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 7 }}>
                    <CardWrap title="Pending Leave by Department">
                        <Box sx={{ p: 2.25 }}>
                            {leaveByDept.length === 0
                                ? <Typography sx={{ textAlign: 'center', py: 3, color: C_MUTED, fontSize: 13 }}>No pending leave requests</Typography>
                                : leaveByDept.map(d => (
                                    <Box key={d.name} sx={{ mb: 2 }}>
                                        <Stack direction="row" justifyContent="space-between" sx={{ fontSize: 12, color: C_MUTED, mb: 0.75 }}>
                                            <span>{d.name}</span>
                                            <span>{d.count} pending</span>
                                        </Stack>
                                        <Box sx={{ height: 6, bgcolor: '#E4E6EA', borderRadius: 0.75, overflow: 'hidden' }}>
                                            <Box sx={{ height: '100%', width: `${d.pct}%`, bgcolor: '#4F8EF7', borderRadius: 0.75 }} />
                                        </Box>
                                    </Box>
                                ))
                            }
                        </Box>
                    </CardWrap>
                </Grid>

                <Grid size={{ xs: 12, md: 5 }}>
                    <CardWrap title="Quick Actions">
                        <Box sx={{ p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                            <Button fullWidth variant="contained" onClick={() => uiStore.navigateToAdminSection('users')}
                                sx={{ textTransform: 'none', justifyContent: 'flex-start', bgcolor: '#4F8EF7', '&:hover': { bgcolor: '#3A7AE4' } }}>
                                👤  Manage Users
                            </Button>
                            <Button fullWidth variant="outlined" onClick={() => uiStore.navigateToAdminSection('departments')}
                                sx={{ textTransform: 'none', justifyContent: 'flex-start', borderColor: C_BORDER, color: C_HEADING, '&:hover': { borderColor: '#4F8EF7' } }}>
                                🏢  Manage Departments
                            </Button>
                            <Button fullWidth variant="outlined" onClick={() => uiStore.navigateToAdminSection('leave-types')}
                                sx={{ textTransform: 'none', justifyContent: 'flex-start', borderColor: C_BORDER, color: C_HEADING, '&:hover': { borderColor: '#4F8EF7' } }}>
                                🏷️  Manage Leave Types
                            </Button>
                            <Button fullWidth variant="outlined" onClick={() => uiStore.navigateToAdminSection('projects')}
                                sx={{ textTransform: 'none', justifyContent: 'flex-start', borderColor: C_BORDER, color: C_HEADING, '&:hover': { borderColor: '#4F8EF7' } }}>
                                📁  Manage Projects
                            </Button>
                            <Button fullWidth variant="outlined" onClick={() => uiStore.navigateToTeamLeave()}
                                sx={{ textTransform: 'none', justifyContent: 'flex-start', borderColor: C_BORDER, color: C_HEADING, '&:hover': { borderColor: '#4F8EF7' } }}>
                                📅  View All Leave
                            </Button>
                        </Box>
                    </CardWrap>
                </Grid>
            </Grid>
        </Stack>
    )
})

export default DashboardHome
