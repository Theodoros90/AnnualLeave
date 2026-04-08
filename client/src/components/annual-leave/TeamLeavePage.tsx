import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { observer } from 'mobx-react-lite'
import AssignmentIcon from '@mui/icons-material/Assignment'
import HistoryIcon from '@mui/icons-material/History'
import SavingsIcon from '@mui/icons-material/Savings'
import Alert from '@mui/material/Alert'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import FormControl from '@mui/material/FormControl'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
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
    const currentYear = new Date().getFullYear()
    const [teamTab, setTeamTab] = useState(user.roles.includes('Manager') ? 1 : 0)
    const [selectedYear, setSelectedYear] = useState<number | 'all'>(currentYear)
    const [historyStatusFilter, setHistoryStatusFilter] = useState('all')
    const [historyTypeFilter, setHistoryTypeFilter] = useState('all')
    const [historySortOrder, setHistorySortOrder] = useState<'newest' | 'oldest'>('newest')

    useEffect(() => {
        const syncTeamTabFromHash = () => {
            if (window.location.hash === '#team-leave-approvals') {
                setTeamTab(1)
                return
            }

            if (window.location.hash === '#team-leave') {
                setTeamTab(0)
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
    const selectedYearLabel = selectedYear === 'all' ? 'All Years' : String(selectedYear)
    const balanceYear = selectedYear === 'all' ? currentYear : selectedYear
    const balanceYearLabel = String(balanceYear)

    const teamLeavesForSelectedYear = useMemo(
        () => selectedYear === 'all'
            ? teamLeaves
            : teamLeaves.filter((leave) => new Date(leave.startDate).getFullYear() === selectedYear),
        [selectedYear, teamLeaves]
    )

    const availableYears = useMemo(
        () => Array.from(
            new Set([
                currentYear,
                ...teamLeaves.map((leave) => new Date(leave.startDate).getFullYear()),
                ...histories.map((item) => new Date(item.changedAt).getFullYear()),
            ])
        )
            .sort()
            .reverse(),
        [currentYear, histories, teamLeaves]
    )

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
        () => teamLeavesForSelectedYear.filter((leave) => leave.status === 'Pending'),
        [teamLeavesForSelectedYear]
    )

    const leaveTypeNameById = useMemo(
        () => new Map(leaveTypes.map((leaveType) => [leaveType.id, leaveType.name])),
        [leaveTypes]
    )

    const teamOtherLeaves = useMemo(
        () => teamLeavesForSelectedYear.filter((leave) => {
            if (leave.status !== 'Approved' || leave.leaveTypeId == null) {
                return false
            }

            const leaveTypeName = leaveTypeNameById.get(leave.leaveTypeId)?.trim().toLowerCase()
            return Boolean(leaveTypeName && !leaveTypeName.includes('annual'))
        }),
        [leaveTypeNameById, teamLeavesForSelectedYear]
    )

    const annualLeaveById = useMemo(
        () => new Map(annualLeaves.map((leave) => [leave.id, leave])),
        [annualLeaves]
    )

    const teamHistoryItems = useMemo(
        () => selectedYear === 'all'
            ? histories
            : histories.filter((item) => new Date(item.changedAt).getFullYear() === selectedYear),
        [histories, selectedYear]
    )

    const availableTeamHistoryStatuses = useMemo(
        () => Array.from(new Set(teamHistoryItems.map((item) => item.newStatus))).sort((left, right) => left.localeCompare(right)),
        [teamHistoryItems]
    )

    const availableTeamHistoryLeaveTypes = useMemo(
        () => Array.from(new Set(teamHistoryItems.map((item) => {
            if (item.leaveTypeName?.trim()) {
                return item.leaveTypeName.trim()
            }

            const leave = annualLeaveById.get(item.annualLeaveId)
            if (leave?.leaveTypeId != null) {
                return leaveTypeNameById.get(leave.leaveTypeId) ?? 'Annual Leave'
            }

            return 'Annual Leave'
        }))).sort((left, right) => left.localeCompare(right)),
        [annualLeaveById, leaveTypeNameById, teamHistoryItems]
    )

    const filteredTeamLeaves = useMemo(
        () => teamLeavesForSelectedYear.filter((leave) => {
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
        [leaveTypeNameById, normalizedTeamSearch, teamLeavesForSelectedYear]
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

    const filteredTeamHistoryItems = useMemo(() => {
        const filteredItems = teamHistoryItems.filter((item) => {
            const leaveTypeLabel = item.leaveTypeName?.trim()
                || (() => {
                    const leave = annualLeaveById.get(item.annualLeaveId)
                    if (leave?.leaveTypeId != null) {
                        return leaveTypeNameById.get(leave.leaveTypeId) ?? 'Annual Leave'
                    }

                    return 'Annual Leave'
                })()

            if (historyStatusFilter !== 'all' && item.newStatus !== historyStatusFilter) {
                return false
            }

            if (historyTypeFilter !== 'all' && leaveTypeLabel !== historyTypeFilter) {
                return false
            }

            return matchesSearchTerm(
                normalizedTeamSearch,
                item.employeeName,
                item.employeeId,
                leaveTypeLabel,
                item.newStatus,
                item.changedByUserName,
                item.comment
            )
        })

        return filteredItems.sort((left, right) => historySortOrder === 'oldest'
            ? new Date(left.changedAt).getTime() - new Date(right.changedAt).getTime()
            : new Date(right.changedAt).getTime() - new Date(left.changedAt).getTime())
    }, [annualLeaveById, historySortOrder, historyStatusFilter, historyTypeFilter, leaveTypeNameById, normalizedTeamSearch, teamHistoryItems])

    const hasActiveHistoryFilters = historyStatusFilter !== 'all' || historyTypeFilter !== 'all'

    const topOtherLeaveEmployee = filteredTeamOtherLeaveEmployeeSummary[0]
    const otherLeaveChartLabels = filteredTeamOtherLeaveEmployeeSummary.map((item) => item.name)
    const otherLeaveChartDays = filteredTeamOtherLeaveEmployeeSummary.map((item) => item.days)
    const hasOtherLeaveChartData = otherLeaveChartDays.some((days) => days > 0)

    const teamLeaveFilter = useMemo(() => {
        const visibleLeaveIds = new Set(filteredTeamLeaves.map((leave) => leave.id))
        return (leave: AnnualLeave) => visibleLeaveIds.has(leave.id)
    }, [filteredTeamLeaves])

    const annualUsedDaysByProfileForBalanceYear = useMemo(() => {
        const totals = new Map<string, number>()

        teamLeaves.forEach((leave) => {
            if (leave.status !== 'Approved') {
                return
            }

            if (new Date(leave.startDate).getFullYear() !== balanceYear) {
                return
            }

            if (leave.leaveTypeId == null) {
                totals.set(leave.employeeId, (totals.get(leave.employeeId) ?? 0) + leave.totalDays)
                return
            }

            const leaveTypeName = leaveTypeNameById.get(leave.leaveTypeId)?.trim().toLowerCase()
            if (!leaveTypeName || leaveTypeName.includes('annual')) {
                totals.set(leave.employeeId, (totals.get(leave.employeeId) ?? 0) + leave.totalDays)
            }
        })

        return totals
    }, [balanceYear, leaveTypeNameById, teamLeaves])

    const filteredTeamProfilesWithYearlyBalance = useMemo(
        () => filteredTeamProfiles.map((profile) => {
            const usedDaysForYear = annualUsedDaysByProfileForBalanceYear.get(profile.userId) ?? 0
            return {
                ...profile,
                leaveBalanceForYear: Math.max(0, profile.annualLeaveEntitlement - usedDaysForYear),
                usedDaysForYear,
            }
        }),
        [annualUsedDaysByProfileForBalanceYear, filteredTeamProfiles]
    )

    const chartProfiles = useMemo(
        () => filteredTeamProfilesWithYearlyBalance
            .slice()
            .sort((left, right) => left.leaveBalanceForYear - right.leaveBalanceForYear || left.displayName.localeCompare(right.displayName)),
        [filteredTeamProfilesWithYearlyBalance]
    )

    const chartEmployeeNames = chartProfiles.map((profile) => profile.displayName)
    const chartBalanceDays = chartProfiles.map((profile) => profile.leaveBalanceForYear)
    const chartUsedDays = chartProfiles.map((profile) => profile.usedDaysForYear)

    const lowestBalanceProfile = chartProfiles[0]

    const filterSummaryLabel = teamTab === 4
        ? `History: ${filteredTeamHistoryItems.length} entr${filteredTeamHistoryItems.length === 1 ? 'y' : 'ies'}`
        : teamTab === 3
            ? `Other leave: ${filteredTeamOtherLeaves.length} request${filteredTeamOtherLeaves.length === 1 ? '' : 's'}`
            : teamTab === 2
                ? `Balance view: ${filteredTeamProfilesWithYearlyBalance.length} member${filteredTeamProfilesWithYearlyBalance.length === 1 ? '' : 's'}`
                : teamTab === 1
                    ? `Approvals pending: ${filteredTeamApprovalRequests.length}`
                    : `Request: ${filteredTeamLeaves.length}`

    const sectionPaperSx = {
        p: { xs: 2, md: 2.25 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'rgba(15, 23, 42, 0.08)',
        backgroundColor: 'rgba(255,255,255,0.98)',
        boxShadow: '0 8px 22px rgba(15, 23, 42, 0.04)',
    } as const

    return (
        <Stack spacing={3}>
            <Paper
                elevation={0}
                sx={{
                    p: { xs: 2.5, md: 3 },
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: 'rgba(15, 23, 42, 0.08)',
                    background: 'linear-gradient(135deg, rgba(248,250,252,0.96), rgba(240,253,250,0.92))',
                    boxShadow: '0 12px 30px rgba(15, 23, 42, 0.05)',
                }}
            >
                <Stack spacing={2}>
                    <Stack
                        direction={{ xs: 'column', xl: 'row' }}
                        justifyContent="space-between"
                        alignItems={{ xl: 'center' }}
                        spacing={2}
                    >
                        <Stack spacing={0.5}>
                            <Typography variant="overline" sx={{ letterSpacing: 1.2, color: '#0f766e', fontWeight: 800 }}>
                                Team hub
                            </Typography>
                            <Typography variant="h4" fontWeight={800}>
                                Team Leave
                            </Typography>
                            <Typography variant="body1" color="text.secondary">
                                Requests, approvals, balance, other leave, and history for your team.
                            </Typography>
                            {myDepartmentName && (
                                <Typography variant="body2" color="text.secondary">
                                    Department: {myDepartmentName}
                                </Typography>
                            )}
                        </Stack>

                        <Stack spacing={1.25} alignItems={{ xl: 'flex-end' }}>
                            <Stack
                                direction={{ xs: 'column', lg: 'row' }}
                                spacing={1}
                                alignItems={{ xs: 'stretch', lg: 'center' }}
                                justifyContent="flex-end"
                                flexWrap="wrap"
                                useFlexGap
                            >
                                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                                        Scope:
                                    </Typography>
                                    <Chip
                                        size="small"
                                        label="Selected year"
                                        color={selectedYear !== 'all' ? 'primary' : 'default'}
                                        variant={selectedYear !== 'all' ? 'filled' : 'outlined'}
                                        onClick={() => setSelectedYear(currentYear)}
                                        clickable
                                    />
                                    <Chip
                                        size="small"
                                        label="All years"
                                        color={selectedYear === 'all' ? 'primary' : 'default'}
                                        variant={selectedYear === 'all' ? 'filled' : 'outlined'}
                                        onClick={() => setSelectedYear('all')}
                                        clickable
                                    />
                                </Stack>

                                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                                        Year:
                                    </Typography>
                                    <FormControl size="small" sx={{ minWidth: 140 }}>
                                        <Select
                                            value={selectedYear}
                                            onChange={(e) => {
                                                const value = e.target.value
                                                setSelectedYear(value === 'all' ? 'all' : Number(value))
                                            }}
                                            sx={{
                                                borderRadius: 999,
                                                backgroundColor: 'rgba(255,255,255,0.88)',
                                                '& .MuiSelect-select': { fontWeight: 700 },
                                            }}
                                        >
                                            <MenuItem value="all">All years</MenuItem>
                                            {availableYears.map((year) => (
                                                <MenuItem key={year} value={year}>
                                                    {year}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Stack>

                                <Chip size="small" variant="outlined" color="primary" label={filterSummaryLabel} />
                            </Stack>
                        </Stack>
                    </Stack>

                    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, px: 1.25, overflow: 'visible', backgroundColor: 'rgba(255,255,255,0.72)' }}>
                        <Tabs
                            value={teamTab}
                            onChange={(_event, value: number) => setTeamTab(value)}
                            variant="scrollable"
                            scrollButtons="auto"
                            sx={{
                                minHeight: 52,
                                overflow: 'visible',
                                '& .MuiTabs-scroller': { overflow: 'visible !important' },
                                '& .MuiTabs-indicator': { display: 'none' },
                                '& .MuiTab-root': {
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    minHeight: 44,
                                    borderRadius: 999,
                                    color: 'text.secondary',
                                    mr: 0.5,
                                    px: 1.75,
                                    overflow: 'visible',
                                    transition: 'all 0.2s ease',
                                },
                                '& .MuiTab-root:hover': {
                                    backgroundColor: 'rgba(15,118,110,0.06)',
                                    color: 'text.primary',
                                },
                                '& .Mui-selected': {
                                    color: '#0f766e !important',
                                    backgroundColor: 'rgba(15,118,110,0.12)',
                                },
                            }}
                        >
                            <Tab label="Request" />
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
                            <Tab label="Balance" />
                            <Tab label="Other Leave" />
                            <Tab label="History" />
                        </Tabs>
                    </Paper>
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

                {teamTab === 0 && (
                    <Paper id="team-leave-list" elevation={0} sx={sectionPaperSx}>
                        <AnnualLeaveList
                            user={user}
                            title="Request"
                            filterPredicate={teamLeaveFilter}
                            showCreateButton={isAdmin}
                            createButtonLabel="Assign Leave to User"
                            isAdmin={isAdmin}
                            showYearFilter={false}
                            selectedYear={selectedYear}
                            yearOptions={availableYears}
                            emptyMessage={normalizedTeamSearch ? 'No matching team leave requests found.' : 'No team leave requests found.'}
                        />
                    </Paper>
                )}

                {teamTab === 1 && (
                    <Paper id="team-leave-approvals" elevation={0} sx={sectionPaperSx}>
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
                                showYearFilter={false}
                                selectedYear={selectedYear}
                                yearOptions={availableYears}
                                emptyMessage={normalizedTeamSearch ? 'No matching pending approval requests.' : 'No pending approval requests.'}
                            />
                        </Stack>
                    </Paper>
                )}

                {teamTab === 2 && (
                    <Paper
                        elevation={0}
                        sx={sectionPaperSx}
                    >
                        <Stack spacing={2.5}>
                            <Stack spacing={0.5}>
                                <Typography variant="h6" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <SavingsIcon fontSize="small" />
                                    Team Annual Leave Balance
                                </Typography>
                                <Typography color="text.secondary">
                                    Annual entitlement, used days, and remaining balance for {balanceYearLabel}.
                                </Typography>
                            </Stack>

                            {filteredTeamProfilesWithYearlyBalance.length === 0 ? (
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
                                                background: 'linear-gradient(135deg, rgba(15,118,110,0.06), rgba(217,119,6,0.05))',
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
                                                        Team Balance Overview ({balanceYearLabel})
                                                    </Typography>
                                                    {lowestBalanceProfile && (
                                                        <Chip
                                                            size="small"
                                                            color="warning"
                                                            variant="outlined"
                                                            label={`Lowest balance: ${lowestBalanceProfile.displayName} (${lowestBalanceProfile.leaveBalanceForYear} days)`}
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

                                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
                                        {filteredTeamProfilesWithYearlyBalance.map((profile) => (
                                            <Paper
                                                key={profile.id}
                                                elevation={0}
                                                sx={{
                                                    flex: '1 1 240px',
                                                    minWidth: { xs: '100%', md: 240 },
                                                    p: 2,
                                                    borderRadius: 2,
                                                    border: '1px solid',
                                                    borderColor: 'rgba(15, 118, 110, 0.16)',
                                                    background: 'linear-gradient(135deg, rgba(15,118,110,0.04), rgba(255,255,255,0.92))',
                                                }}
                                            >
                                                <Stack spacing={1}>
                                                    <Typography fontWeight={700}>
                                                        {profile.displayName}
                                                    </Typography>
                                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                                        <Chip label={`Annual balance: ${profile.leaveBalanceForYear} days`} color="primary" size="small" />
                                                        <Chip label={`Used in ${balanceYearLabel}: ${profile.usedDaysForYear} days`} color="warning" variant="outlined" size="small" />
                                                        <Chip
                                                            label={`Annual entitlement: ${profile.annualLeaveEntitlement} days`}
                                                            variant="outlined"
                                                            size="small"
                                                        />
                                                    </Stack>
                                                </Stack>
                                            </Paper>
                                        ))}
                                    </Stack>
                                </>
                            )}
                        </Stack>
                    </Paper>
                )}

                {teamTab === 3 && (
                    <Paper
                        elevation={0}
                        sx={sectionPaperSx}
                    >
                        <Stack spacing={2.5}>
                            <Stack spacing={0.5}>
                                <Typography variant="h6" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <AssignmentIcon fontSize="small" />
                                    Team Other Leaves
                                </Typography>
                                <Typography color="text.secondary">
                                    This section shows approved non-annual leave for each team member in {selectedYearLabel}, separate from annual leave balance.
                                </Typography>
                                <Alert severity="info" sx={{ mt: 0.5 }}>
                                    Use this view to quickly see <strong>who has taken other leave</strong>, how many days were used, and which leave types were used most.
                                </Alert>
                            </Stack>

                            {filteredTeamOtherLeaves.length === 0 ? (
                                <Alert severity="info">{normalizedTeamSearch ? 'No matching approved team other leave requests found.' : `No approved team other leave requests found for ${selectedYearLabel}.`}</Alert>
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
                    <Paper
                        elevation={0}
                        sx={sectionPaperSx}
                    >
                        <Stack spacing={2}>
                            <Stack spacing={0.5}>
                                <Typography variant="h6" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <HistoryIcon fontSize="small" />
                                    Team History
                                </Typography>
                                <Typography color="text.secondary">
                                    Recent approval and status activity for your team in {selectedYearLabel}.
                                </Typography>
                            </Stack>

                            {isHistoryLoading && <Alert severity="info">Loading team history...</Alert>}
                            {isHistoryError && <Alert severity="error">Failed to load team history.</Alert>}

                            {!isHistoryLoading && !isHistoryError && teamHistoryItems.length > 0 && (
                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} useFlexGap>
                                    <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 150 } }}>
                                        <Select
                                            value={historyStatusFilter}
                                            onChange={(event) => setHistoryStatusFilter(String(event.target.value))}
                                            sx={{ borderRadius: 999, backgroundColor: 'rgba(248,250,252,0.9)' }}
                                        >
                                            <MenuItem value="all">All statuses</MenuItem>
                                            {availableTeamHistoryStatuses.map((status) => (
                                                <MenuItem key={status} value={status}>{status}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>

                                    <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 160 } }}>
                                        <Select
                                            value={historyTypeFilter}
                                            onChange={(event) => setHistoryTypeFilter(String(event.target.value))}
                                            sx={{ borderRadius: 999, backgroundColor: 'rgba(248,250,252,0.9)' }}
                                        >
                                            <MenuItem value="all">All leave types</MenuItem>
                                            {availableTeamHistoryLeaveTypes.map((leaveType) => (
                                                <MenuItem key={leaveType} value={leaveType}>{leaveType}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>

                                    <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 145 } }}>
                                        <Select
                                            value={historySortOrder}
                                            onChange={(event) => setHistorySortOrder(event.target.value as 'newest' | 'oldest')}
                                            sx={{ borderRadius: 999, backgroundColor: 'rgba(248,250,252,0.9)' }}
                                        >
                                            <MenuItem value="newest">Newest first</MenuItem>
                                            <MenuItem value="oldest">Oldest first</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Stack>
                            )}

                            {!isHistoryLoading && !isHistoryError && filteredTeamHistoryItems.length === 0 && (
                                <Alert severity="info">
                                    {normalizedTeamSearch
                                        ? 'No matching history entries found.'
                                        : hasActiveHistoryFilters
                                            ? 'No team history entries match the selected filters.'
                                            : `No history entries found for ${selectedYearLabel}.`}
                                </Alert>
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
                                                    backgroundColor: 'rgba(248, 250, 252, 0.95)',
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
                        </Stack>
                    </Paper>
                )}
            </Stack>
        </Stack>
    )
})

export default TeamLeavePage
