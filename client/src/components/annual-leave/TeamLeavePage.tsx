import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { observer } from 'mobx-react-lite'
import Alert from '@mui/material/Alert'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { BarChart } from '@mui/x-charts/BarChart'
import { getAnnualLeaves, getDepartments, getEmployeeProfiles, getLeaveStatusHistories, getLeaveTypes } from '../../lib/api'
import type { AnnualLeave, UserInfo } from '../../lib/types'
import AnnualLeaveList from './AnnualLeaveList'

function formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-GB')
}

function matchesSearchTerm(searchTerm: string, ...values: Array<string | number | null | undefined>) {
    if (!searchTerm) {
        return true
    }

    return values.some((value) => String(value ?? '').toLowerCase().includes(searchTerm))
}

const TeamLeavePage = observer(function TeamLeavePage({ user }: { user: UserInfo }) {
    const [teamTab, setTeamTab] = useState(user.roles.includes('Manager') ? 1 : 0)

    useEffect(() => {
        const syncTeamTabFromHash = () => {
            if (window.location.hash === '#team-leave-approvals') {
                setTeamTab(1)
            }
        }

        syncTeamTabFromHash()
        window.addEventListener('hashchange', syncTeamTabFromHash)

        return () => {
            window.removeEventListener('hashchange', syncTeamTabFromHash)
        }
    }, [])

    const { data: profiles = [] } = useQuery({
        queryKey: ['employeeProfiles'],
        queryFn: getEmployeeProfiles,
    })

    const { data: departments = [] } = useQuery({
        queryKey: ['departments'],
        queryFn: getDepartments,
    })

    const { data: annualLeaves = [] } = useQuery({
        queryKey: ['annualLeaves'],
        queryFn: getAnnualLeaves,
    })

    const { data: leaveTypes = [] } = useQuery({
        queryKey: ['leaveTypes'],
        queryFn: getLeaveTypes,
    })

    const { data: histories = [], isLoading: isHistoryLoading, isError: isHistoryError } = useQuery({
        queryKey: ['leaveStatusHistories'],
        queryFn: getLeaveStatusHistories,
    })

    const isAdmin = user.roles.includes('Admin')
    const isManager = user.roles.includes('Manager')

    const myProfile = profiles.find((profile) => profile.userId === user.id)
    const myDepartmentId = myProfile?.departmentId
    const myDepartmentName = departments.find((department) => department.id === myDepartmentId)?.name
    const normalizedTeamSearch = ''

    const teamLeaves = useMemo(() => annualLeaves, [annualLeaves])

    const teamMemberIds = useMemo(
        () => new Set(teamLeaves.map((leave) => leave.employeeId)),
        [teamLeaves]
    )

    // `getEmployeeProfiles` is already filtered by the backend based on the signed-in user's scope.
    // Managers should be able to see their whole team's balances even before any leave requests exist.
    const teamProfiles = useMemo(
        () => (isAdmin || isManager)
            ? profiles.filter((profile) => profile.userId !== user.id)
            : profiles.filter((profile) => teamMemberIds.has(profile.userId)),
        [isAdmin, isManager, profiles, teamMemberIds, user.id]
    )

    const teamApprovalRequests = useMemo(
        () => teamLeaves.filter((leave) => leave.status === 'Pending'),
        [teamLeaves]
    )

    const leaveTypeNameById = useMemo(
        () => new Map(leaveTypes.map((leaveType) => [leaveType.id, leaveType.name])),
        [leaveTypes]
    )

    const teamOtherLeaves = useMemo(
        () => teamLeaves.filter((leave) => {
            if (leave.status !== 'Approved' || leave.leaveTypeId == null) {
                return false
            }

            const leaveTypeName = leaveTypeNameById.get(leave.leaveTypeId)?.trim().toLowerCase()
            return Boolean(leaveTypeName && !leaveTypeName.includes('annual'))
        }),
        [leaveTypeNameById, teamLeaves]
    )

    const annualLeaveById = useMemo(
        () => new Map(annualLeaves.map((leave) => [leave.id, leave])),
        [annualLeaves]
    )

    const teamHistoryItems = useMemo(
        () => histories.slice().sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()),
        [histories]
    )

    const filteredTeamLeaves = useMemo(
        () => teamLeaves.filter((leave) => {
            const leaveTypeName = leave.leaveTypeId != null
                ? (leaveTypeNameById.get(leave.leaveTypeId) ?? '')
                : ''

            return matchesSearchTerm(
                normalizedTeamSearch,
                leave.employeeName,
                leave.employeeId,
                leave.departmentName,
                leave.reason,
                leave.status,
                leaveTypeName,
                formatDate(leave.startDate),
                formatDate(leave.endDate),
                leave.totalDays
            )
        }),
        [leaveTypeNameById, normalizedTeamSearch, teamLeaves]
    )

    const filteredTeamApprovalRequests = useMemo(
        () => filteredTeamLeaves.filter((leave) => leave.status === 'Pending'),
        [filteredTeamLeaves]
    )

    const filteredTeamProfiles = useMemo(
        () => teamProfiles.filter((profile) => matchesSearchTerm(
            normalizedTeamSearch,
            profile.displayName,
            profile.leaveBalance,
            profile.annualLeaveEntitlement
        )),
        [normalizedTeamSearch, teamProfiles]
    )

    const filteredTeamOtherLeaves = useMemo(
        () => teamOtherLeaves.filter((leave) => {
            const leaveTypeName = leave.leaveTypeId != null
                ? (leaveTypeNameById.get(leave.leaveTypeId) ?? '')
                : ''

            return matchesSearchTerm(
                normalizedTeamSearch,
                leave.employeeName,
                leave.employeeId,
                leave.reason,
                leaveTypeName,
                formatDate(leave.startDate),
                formatDate(leave.endDate),
                leave.totalDays
            )
        }),
        [leaveTypeNameById, normalizedTeamSearch, teamOtherLeaves]
    )

    const filteredTeamOtherLeaveTypeSummary = useMemo(() => {
        const totals = new Map<string, number>()

        filteredTeamOtherLeaves.forEach((leave) => {
            if (leave.leaveTypeId == null) {
                return
            }

            const leaveTypeName = leaveTypeNameById.get(leave.leaveTypeId)
            if (!leaveTypeName) {
                return
            }

            totals.set(leaveTypeName, (totals.get(leaveTypeName) ?? 0) + leave.totalDays)
        })

        return Array.from(totals.entries())
            .map(([name, days]) => ({ name, days }))
            .sort((left, right) => right.days - left.days || left.name.localeCompare(right.name))
    }, [filteredTeamOtherLeaves, leaveTypeNameById])

    const filteredTeamOtherLeaveEmployeeSummary = useMemo(() => {
        const totals = new Map<string, { name: string; days: number; requests: number }>()

        filteredTeamOtherLeaves.forEach((leave) => {
            const current = totals.get(leave.employeeId) ?? {
                name: leave.employeeName || leave.employeeId,
                days: 0,
                requests: 0,
            }

            current.days += leave.totalDays
            current.requests += 1
            totals.set(leave.employeeId, current)
        })

        return Array.from(totals.values())
            .sort((left, right) => right.days - left.days || left.name.localeCompare(right.name))
    }, [filteredTeamOtherLeaves])

    const filteredTeamHistoryItems = useMemo(
        () => teamHistoryItems.filter((item) => matchesSearchTerm(
            normalizedTeamSearch,
            item.employeeName,
            item.employeeId,
            item.leaveTypeName,
            item.newStatus,
            item.changedByUserName,
            item.comment
        )),
        [normalizedTeamSearch, teamHistoryItems]
    )

    const topOtherLeaveEmployee = filteredTeamOtherLeaveEmployeeSummary[0]
    const otherLeaveChartLabels = filteredTeamOtherLeaveEmployeeSummary.map((item) => item.name)
    const otherLeaveChartDays = filteredTeamOtherLeaveEmployeeSummary.map((item) => item.days)
    const hasOtherLeaveChartData = otherLeaveChartDays.some((days) => days > 0)

    const teamLeaveFilter = useMemo(() => {
        const visibleLeaveIds = new Set(filteredTeamLeaves.map((leave) => leave.id))
        return (leave: AnnualLeave) => visibleLeaveIds.has(leave.id)
    }, [filteredTeamLeaves])

    const chartProfiles = useMemo(
        () => filteredTeamProfiles.slice().sort((a, b) => a.leaveBalance - b.leaveBalance),
        [filteredTeamProfiles]
    )

    const chartEmployeeNames = chartProfiles.map((profile) => profile.displayName)
    const chartBalanceDays = chartProfiles.map((profile) => profile.leaveBalance)
    const chartUsedDays = chartProfiles.map((profile) =>
        Math.max(0, profile.annualLeaveEntitlement - profile.leaveBalance)
    )

    const lowestBalanceProfile = chartProfiles[0]

    return (
        <Stack spacing={3}>
            <Paper
                elevation={0}
                sx={{
                    p: { xs: 3, md: 4 },
                    border: '1px solid',
                    borderColor: 'rgba(15, 23, 42, 0.08)',
                    background: 'linear-gradient(135deg, rgba(14,116,144,0.12), rgba(20,83,45,0.08))',
                }}
            >
                <Stack spacing={1}>
                    <Typography variant="h4" fontWeight={800}>
                        Team Leave
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Department leave requests, annual balances, and other leave activity for your team.
                    </Typography>
                    {myDepartmentName && (
                        <Typography variant="body2" color="text.secondary">
                            Department: {myDepartmentName}
                        </Typography>
                    )}
                </Stack>
            </Paper>

            <Stack spacing={2.5}>
                {!myDepartmentName && (
                    <Box>
                        <Alert severity="info">
                            Your profile has no assigned department. Showing approval requests based on your manager access.
                        </Alert>
                    </Box>
                )}


                <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, px: 1.5, overflow: 'visible' }}>
                    <Tabs
                        value={teamTab}
                        onChange={(_event, value: number) => setTeamTab(value)}
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{
                            overflow: 'visible',
                            '& .MuiTabs-scroller': { overflow: 'visible !important' },
                            '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, minHeight: 52, overflow: 'visible' },
                        }}
                    >
                        <Tab label="Team Calendar / Leave List" />
                        <Tab
                            label={
                                <Badge
                                    badgeContent={normalizedTeamSearch ? filteredTeamApprovalRequests.length : teamApprovalRequests.length}
                                    color="error"
                                    max={99}
                                    invisible={(normalizedTeamSearch ? filteredTeamApprovalRequests.length : teamApprovalRequests.length) === 0}
                                >
                                    <Box sx={{ pr: (normalizedTeamSearch ? filteredTeamApprovalRequests.length : teamApprovalRequests.length) > 0 ? 1.5 : 0 }}>Approvals</Box>
                                </Badge>
                            }
                        />
                        <Tab label="Team Annual Leave Balance" />
                        <Tab label="Team Other Leaves" />
                        <Tab label="Team History" />
                    </Tabs>
                </Paper>

                {teamTab === 0 && (
                    <AnnualLeaveList
                        user={user}
                        filterPredicate={teamLeaveFilter}
                        showCreateButton={false}
                        emptyMessage={normalizedTeamSearch ? 'No matching team leave requests found.' : 'No team leave requests found.'}
                    />
                )}

                {teamTab === 1 && (
                    <Stack spacing={2}>
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                            <Typography variant="h6" fontWeight={800}>
                                Approval Requests
                            </Typography>
                            <Chip
                                label={`${filteredTeamApprovalRequests.length} pending`}
                                color={filteredTeamApprovalRequests.length > 0 ? 'warning' : 'default'}
                                variant={filteredTeamApprovalRequests.length > 0 ? 'filled' : 'outlined'}
                                size="small"
                                sx={filteredTeamApprovalRequests.length > 0 ? { fontWeight: 700, fontSize: '0.8rem' } : {}}
                            />
                        </Stack>

                        {filteredTeamApprovalRequests.length > 0 && (
                            <Alert
                                severity="warning"
                                sx={{ fontWeight: 600 }}
                            >
                                {filteredTeamApprovalRequests.length === 1
                                    ? '1 leave request is awaiting your approval.'
                                    : `${filteredTeamApprovalRequests.length} leave requests are awaiting your approval.`}
                            </Alert>
                        )}

                        <AnnualLeaveList
                            user={user}
                            filterPredicate={(leave) => teamLeaveFilter(leave) && leave.status === 'Pending'}
                            showCreateButton={false}
                            emptyMessage={normalizedTeamSearch ? 'No matching pending approval requests.' : 'No pending approval requests.'}
                        />
                    </Stack>
                )}

                {teamTab === 2 && (
                    <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
                        <Stack spacing={1.5}>
                            {filteredTeamProfiles.length === 0 ? (
                                <Alert severity="info">{normalizedTeamSearch ? 'No matching team annual balance data found.' : 'No team balance data available.'}</Alert>
                            ) : (
                                <>
                                    {(isAdmin || isManager) && (
                                        <Paper
                                            elevation={0}
                                            sx={{
                                                p: 2,
                                                border: '1px solid',
                                                borderColor: 'rgba(15, 23, 42, 0.12)',
                                                borderRadius: 2,
                                            }}
                                        >
                                            <Stack spacing={1}>
                                                <Stack
                                                    direction={{ xs: 'column', sm: 'row' }}
                                                    justifyContent="space-between"
                                                    alignItems={{ sm: 'center' }}
                                                    spacing={1}
                                                >
                                                    <Typography variant="subtitle1" fontWeight={800}>
                                                        Team Annual Leave Balance Overview
                                                    </Typography>
                                                    {lowestBalanceProfile && (
                                                        <Chip
                                                            size="small"
                                                            color="warning"
                                                            variant="outlined"
                                                            label={`Lowest annual balance: ${lowestBalanceProfile.displayName} (${lowestBalanceProfile.leaveBalance} days)`}
                                                        />
                                                    )}
                                                </Stack>
                                                <BarChart
                                                    height={260}
                                                    xAxis={[{ scaleType: 'band', data: chartEmployeeNames }]}
                                                    series={[
                                                        { data: chartBalanceDays, label: 'Annual balance days', color: '#0f766e' },
                                                        { data: chartUsedDays, label: 'Annual used days', color: '#d97706' },
                                                    ]}
                                                    margin={{ left: 48, right: 16, top: 12, bottom: 36 }}
                                                />
                                            </Stack>
                                        </Paper>
                                    )}

                                    {filteredTeamProfiles.map((profile) => (
                                        <Box
                                            key={profile.id}
                                            sx={{
                                                py: 1.2,
                                                px: 1.5,
                                                borderRadius: 1.5,
                                                border: '1px solid',
                                                borderColor: 'divider',
                                            }}
                                        >
                                            <Stack
                                                direction={{ xs: 'column', sm: 'row' }}
                                                justifyContent="space-between"
                                                alignItems={{ sm: 'center' }}
                                                spacing={1}
                                            >
                                                <Typography fontWeight={700}>
                                                    {profile.displayName}
                                                </Typography>
                                                <Stack direction="row" spacing={1}>
                                                    <Chip label={`Annual balance: ${profile.leaveBalance} days`} color="primary" size="small" />
                                                    <Chip
                                                        label={`Annual entitlement: ${profile.annualLeaveEntitlement} days`}
                                                        variant="outlined"
                                                        size="small"
                                                    />
                                                </Stack>
                                            </Stack>
                                        </Box>
                                    ))}
                                </>
                            )}
                        </Stack>
                    </Paper>
                )}

                {teamTab === 3 && (
                    <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
                        <Stack spacing={2.5}>
                            <Stack spacing={0.5}>
                                <Typography variant="h6" fontWeight={800}>
                                    Team Other Leaves
                                </Typography>
                                <Typography color="text.secondary">
                                    This section shows approved non-annual leave for each team member, separate from annual leave balance.
                                </Typography>
                                <Alert severity="info" sx={{ mt: 0.5 }}>
                                    Use this view to quickly see <strong>who has taken other leave</strong>, how many days were used, and which leave types were used most.
                                </Alert>
                            </Stack>

                            {filteredTeamOtherLeaves.length === 0 ? (
                                <Alert severity="info">{normalizedTeamSearch ? 'No matching approved team other leave requests found.' : 'No approved team other leave requests yet.'}</Alert>
                            ) : (
                                <>
                                    <Stack spacing={1}>
                                        <Typography variant="body2" fontWeight={700}>
                                            At a glance by employee
                                        </Typography>
                                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
                                            {filteredTeamOtherLeaveEmployeeSummary.map((member) => (
                                                <Paper
                                                    key={member.name}
                                                    elevation={0}
                                                    sx={{
                                                        flex: '1 1 220px',
                                                        minWidth: { xs: '100%', md: 220 },
                                                        p: 2,
                                                        borderRadius: 2,
                                                        border: '1px solid',
                                                        borderColor: 'rgba(124, 58, 237, 0.18)',
                                                        backgroundColor: 'rgba(124, 58, 237, 0.05)',
                                                    }}
                                                >
                                                    <Stack spacing={0.75}>
                                                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                                                            <Typography variant="caption" color="text.secondary" fontWeight={700}>
                                                                {member.name}
                                                            </Typography>
                                                            {topOtherLeaveEmployee?.name === member.name && (
                                                                <Chip size="small" color="secondary" variant="outlined" label="Highest total" />
                                                            )}
                                                        </Stack>
                                                        <Typography variant="h5" fontWeight={800}>
                                                            {member.days} day{member.days === 1 ? '' : 's'}
                                                        </Typography>
                                                        <Typography variant="body2" color="text.secondary">
                                                            Total taken as other leave
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {member.requests} approved request{member.requests === 1 ? '' : 's'}
                                                        </Typography>
                                                    </Stack>
                                                </Paper>
                                            ))}
                                        </Stack>
                                    </Stack>

                                    <Paper
                                        elevation={0}
                                        sx={{
                                            p: 2,
                                            borderRadius: 2,
                                            border: '1px solid',
                                            borderColor: 'rgba(124, 58, 237, 0.18)',
                                            background: 'linear-gradient(135deg, rgba(124,58,237,0.05), rgba(15,118,110,0.04))',
                                        }}
                                    >
                                        <Stack spacing={1.5}>
                                            <Stack
                                                direction={{ xs: 'column', sm: 'row' }}
                                                justifyContent="space-between"
                                                alignItems={{ sm: 'center' }}
                                                spacing={1}
                                            >
                                                <Typography variant="subtitle1" fontWeight={800}>
                                                    Who has taken the most other leave?
                                                </Typography>
                                                {topOtherLeaveEmployee && (
                                                    <Chip
                                                        size="small"
                                                        color="secondary"
                                                        variant="outlined"
                                                        label={`Highest user total: ${topOtherLeaveEmployee.name} (${topOtherLeaveEmployee.days} days)`}
                                                    />
                                                )}
                                            </Stack>

                                            {hasOtherLeaveChartData ? (
                                                <BarChart
                                                    height={260}
                                                    xAxis={[{ scaleType: 'band', data: otherLeaveChartLabels }]}
                                                    series={[
                                                        { data: otherLeaveChartDays, label: 'Days taken', color: '#7c3aed' },
                                                    ]}
                                                    margin={{ left: 48, right: 16, top: 12, bottom: 36 }}
                                                />
                                            ) : (
                                                <Alert severity="info">No other leave chart data available.</Alert>
                                            )}

                                            <Box>
                                                <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>
                                                    Leave type totals across the team
                                                </Typography>
                                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                                    {filteredTeamOtherLeaveTypeSummary.map((item) => (
                                                        <Chip
                                                            key={item.name}
                                                            size="small"
                                                            variant="outlined"
                                                            color="secondary"
                                                            label={`${item.name}: ${item.days} day${item.days === 1 ? '' : 's'}`}
                                                        />
                                                    ))}
                                                </Stack>
                                            </Box>
                                        </Stack>
                                    </Paper>

                                    <Stack spacing={1.2}>
                                        <Typography variant="body2" fontWeight={700}>
                                            Approved other leave requests by employee
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Each card below shows the employee, leave type, dates, reason, and total days.
                                        </Typography>
                                        {filteredTeamOtherLeaves.map((leave) => {
                                            const leaveTypeName = leave.leaveTypeId != null
                                                ? (leaveTypeNameById.get(leave.leaveTypeId) ?? 'Other Leave')
                                                : 'Other Leave'

                                            return (
                                                <Box
                                                    key={leave.id}
                                                    sx={{
                                                        py: 1.4,
                                                        px: 1.8,
                                                        borderRadius: 1.5,
                                                        border: '1px solid',
                                                        borderColor: 'divider',
                                                        backgroundColor: 'rgba(124, 58, 237, 0.04)',
                                                    }}
                                                >
                                                    <Stack
                                                        direction={{ xs: 'column', sm: 'row' }}
                                                        justifyContent="space-between"
                                                        alignItems={{ sm: 'center' }}
                                                        spacing={1}
                                                    >
                                                        <Stack spacing={0.35}>
                                                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                                                <Typography fontWeight={700}>{leave.employeeName || leave.employeeId}</Typography>
                                                                <Chip size="small" color="secondary" variant="outlined" label={leaveTypeName} />
                                                            </Stack>
                                                            <Typography variant="body2" color="text.secondary">
                                                                {formatDate(leave.startDate)} - {formatDate(leave.endDate)}
                                                            </Typography>
                                                            {leave.reason && (
                                                                <Typography variant="body2" color="text.secondary">
                                                                    Reason: {leave.reason}
                                                                </Typography>
                                                            )}
                                                        </Stack>
                                                        <Chip
                                                            size="small"
                                                            color="secondary"
                                                            label={`${leave.totalDays} day${leave.totalDays === 1 ? '' : 's'}`}
                                                        />
                                                    </Stack>
                                                </Box>
                                            )
                                        })}
                                    </Stack>
                                </>
                            )}
                        </Stack>
                    </Paper>
                )}

                {teamTab === 4 && (
                    <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
                        {isHistoryLoading && <Alert severity="info">Loading team history...</Alert>}
                        {isHistoryError && <Alert severity="error">Failed to load team history.</Alert>}

                        {!isHistoryLoading && !isHistoryError && filteredTeamHistoryItems.length === 0 && (
                            <Alert severity="info">{normalizedTeamSearch ? 'No matching history entries found.' : 'No history entries found.'}</Alert>
                        )}

                        {!isHistoryLoading && !isHistoryError && filteredTeamHistoryItems.length > 0 && (
                            <Stack spacing={1.2}>
                                {filteredTeamHistoryItems.slice(0, 20).map((item) => {
                                    const leave = annualLeaveById.get(item.annualLeaveId)
                                    const isApproved = item.newStatus === 'Approved'
                                    const isRejected = item.newStatus === 'Rejected'
                                    const isCancelled = item.newStatus === 'Cancelled'
                                    const accentColor = isApproved
                                        ? 'success.main'
                                        : isRejected
                                            ? 'error.main'
                                            : isCancelled
                                                ? 'grey.500'
                                                : 'warning.main'
                                    const isSelfAction = item.employeeId === item.changedByUserId

                                    return (
                                        <Box
                                            key={item.id}
                                            sx={{
                                                py: 1.4,
                                                px: 1.8,
                                                borderRadius: 1.5,
                                                border: '1px solid',
                                                borderColor: 'divider',
                                                borderLeft: '4px solid',
                                                borderLeftColor: accentColor,
                                            }}
                                        >
                                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                                                <Chip
                                                    label={item.newStatus}
                                                    size="small"
                                                    color={isApproved ? 'success' : isRejected ? 'error' : isCancelled ? 'default' : 'warning'}
                                                    sx={{ fontWeight: 700 }}
                                                />
                                                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                                    {new Date(item.changedAt).toLocaleString()}
                                                </Typography>
                                            </Stack>

                                            <Stack spacing={0.3} sx={{ mt: 1 }}>
                                                <Typography variant="body2">
                                                    <Typography component="span" variant="body2" color="text.secondary">Requested by: </Typography>
                                                    <Typography component="span" variant="body2" fontWeight={700}>
                                                        {item.employeeName || item.employeeId}
                                                    </Typography>
                                                </Typography>

                                                {item.leaveTypeName && (
                                                    <Typography variant="body2">
                                                        <Typography component="span" variant="body2" color="text.secondary">Leave type: </Typography>
                                                        <Typography component="span" variant="body2" fontWeight={700}>
                                                            {item.leaveTypeName}
                                                        </Typography>
                                                    </Typography>
                                                )}

                                                {!isSelfAction && (
                                                    <Typography variant="body2">
                                                        <Typography component="span" variant="body2" color="text.secondary">
                                                            {isApproved ? 'Approved by: ' : isRejected ? 'Rejected by: ' : 'Changed by: '}
                                                        </Typography>
                                                        <Typography component="span" variant="body2" fontWeight={700}>
                                                            {item.changedByUserName || item.changedByUserId}
                                                        </Typography>
                                                    </Typography>
                                                )}

                                                {leave && (
                                                    <Typography variant="body2">
                                                        <Typography component="span" variant="body2" color="text.secondary">Leave dates: </Typography>
                                                        <Typography component="span" variant="body2" fontWeight={600}>
                                                            {formatDate(leave.startDate)} - {formatDate(leave.endDate)} ({leave.totalDays} {leave.totalDays === 1 ? 'day' : 'days'})
                                                        </Typography>
                                                    </Typography>
                                                )}

                                                {item.comment && (
                                                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                        "{item.comment}"
                                                    </Typography>
                                                )}
                                            </Stack>
                                        </Box>
                                    )
                                })}
                            </Stack>
                        )}
                    </Paper>
                )}
            </Stack>
        </Stack>
    )
})

export default TeamLeavePage
