import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { observer } from 'mobx-react-lite'
import AssignmentIcon from '@mui/icons-material/Assignment'
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded'
import HistoryIcon from '@mui/icons-material/History'
import SavingsIcon from '@mui/icons-material/Savings'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { BarChart } from '@mui/x-charts/BarChart'
import { getAnnualLeaves, getEmployeeProfiles, getLeaveStatusHistories, getLeaveTypes } from '../../lib/api'
import { useStore } from '../../lib/mobx'
import type { MyLeaveSection } from '../../lib/mobx/uiStore'
import type { UserInfo } from '../../lib/types'
import AnnualLeaveList from './AnnualLeaveList'

const myLeaveTabs = [
    { key: 'requests', label: 'My Requests' },
    { key: 'balance', label: 'Annual Leave Balance' },
    { key: 'other', label: 'Other Leaves' },
    { key: 'history', label: 'History' },
] as const

const hashBySection: Record<MyLeaveSection, string> = {
    apply: '#apply-for-leave',
    requests: '#my-requests',
    balance: '#leave-balance',
    other: '#other-leaves',
    history: '#leave-history',
}

function sectionId(section: MyLeaveSection) {
    if (section === 'requests') return 'my-leave-requests'
    if (section === 'balance') return 'my-leave-balance'
    if (section === 'other') return 'my-other-leaves'
    if (section === 'history') return 'my-leave-history'
    return 'my-leave-requests'
}

function formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-GB')
}

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const MyLeavePage = observer(function MyLeavePage({ user }: { user: UserInfo }) {
    const { uiStore } = useStore()
    const [selectedHistoryYear, setSelectedHistoryYear] = useState<number | 'all'>(new Date().getFullYear())

    const { data: profiles = [] } = useQuery({
        queryKey: ['employeeProfiles'],
        queryFn: getEmployeeProfiles,
    })

    const { data: histories = [], isLoading: isHistoryLoading, isError: isHistoryError } = useQuery({
        queryKey: ['leaveStatusHistories'],
        queryFn: getLeaveStatusHistories,
    })

    const { data: annualLeaves = [] } = useQuery({
        queryKey: ['annualLeaves'],
        queryFn: getAnnualLeaves,
    })

    const { data: leaveTypes = [] } = useQuery({
        queryKey: ['leaveTypes'],
        queryFn: getLeaveTypes,
    })

    const annualLeaveById = useMemo(
        () => new Map(annualLeaves.map((leave) => [leave.id, leave])),
        [annualLeaves]
    )
    const leaveTypeNameById = useMemo(
        () => new Map(leaveTypes.map((leaveType) => [leaveType.id, leaveType.name])),
        [leaveTypes]
    )

    const myProfile = profiles.find((p) => p.userId === user.id)
    const myBalance = myProfile?.leaveBalance ?? 0
    const myEntitlement = myProfile?.annualLeaveEntitlement ?? 0
    const currentYear = new Date().getFullYear()
    const usedDays = Math.max(0, myEntitlement - myBalance)
    const effectiveEntitlement = Math.max(0, myEntitlement)
    const usedPercentage = effectiveEntitlement > 0
        ? Math.min(100, (usedDays / effectiveEntitlement) * 100)
        : 0

    const approvedLeavesThisYear = useMemo(
        () => annualLeaves.filter((leave) => {
            if (leave.employeeId !== user.id || leave.status !== 'Approved') {
                return false
            }

            return new Date(leave.startDate).getFullYear() === currentYear
        }),
        [annualLeaves, currentYear, user.id]
    )

    const annualUsedLeavesThisYear = useMemo(
        () => approvedLeavesThisYear.filter((leave) => {
            if (leave.leaveTypeId == null) {
                return true
            }

            const leaveTypeName = leaveTypeNameById.get(leave.leaveTypeId)?.trim().toLowerCase()
            return !leaveTypeName || leaveTypeName.includes('annual')
        }),
        [approvedLeavesThisYear, leaveTypeNameById]
    )

    const otherApprovedLeavesThisYear = useMemo(
        () => approvedLeavesThisYear.filter((leave) => {
            if (leave.leaveTypeId == null) {
                return false
            }

            const leaveTypeName = leaveTypeNameById.get(leave.leaveTypeId)?.trim().toLowerCase()
            return Boolean(leaveTypeName && !leaveTypeName.includes('annual'))
        }),
        [approvedLeavesThisYear, leaveTypeNameById]
    )

    const otherLeaveSummary = useMemo(() => {
        const breakdown = new Map<string, number>()

        otherApprovedLeavesThisYear.forEach((leave) => {
            if (leave.leaveTypeId == null) {
                return
            }

            const leaveTypeName = leaveTypeNameById.get(leave.leaveTypeId)
            if (!leaveTypeName) {
                return
            }

            breakdown.set(leaveTypeName, (breakdown.get(leaveTypeName) ?? 0) + leave.totalDays)
        })

        const items = Array.from(breakdown.entries())
            .map(([name, days]) => ({ name, days }))
            .sort((left, right) => right.days - left.days || left.name.localeCompare(right.name))

        return {
            items,
            totalDays: items.reduce((sum, item) => sum + item.days, 0),
        }
    }, [otherApprovedLeavesThisYear, leaveTypeNameById])

    const otherLeaveRequestCount = otherApprovedLeavesThisYear.length
    const topOtherLeaveType = otherLeaveSummary.items[0] ?? null
    const otherLeaveChartLabels = otherLeaveSummary.items.map((item) => item.name)
    const otherLeaveChartDays = otherLeaveSummary.items.map((item) => item.days)
    const hasOtherLeaveChartData = otherLeaveChartDays.some((days) => days > 0)

    const monthlyUsedDays = useMemo(() => {
        const monthly = Array.from({ length: 12 }, () => 0)

        annualUsedLeavesThisYear.forEach((leave) => {
            const leaveDate = new Date(leave.startDate)
            const monthIndex = leaveDate.getMonth()
            if (monthIndex < 0 || monthIndex > 11) {
                return
            }

            monthly[monthIndex] += leave.totalDays
        })

        return monthly
    }, [annualUsedLeavesThisYear])

    const hasMonthlyTrendData = monthlyUsedDays.some((days) => days > 0)

    const historyItems = histories
        .slice()
        .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())

    const historyAvailableYears = Array.from(
        new Set(historyItems.map((item) => new Date(item.changedAt).getFullYear()))
    )
        .sort()
        .reverse()

    const filteredHistoryItems = selectedHistoryYear === 'all'
        ? historyItems
        : historyItems.filter((item) => new Date(item.changedAt).getFullYear() === selectedHistoryYear)

    useEffect(() => {
        if (uiStore.myLeaveSection === 'apply') {
            uiStore.openCreateDrawer()
        }

        const nextHash = hashBySection[uiStore.myLeaveSection]

        if (window.location.hash !== nextHash) {
            window.location.hash = nextHash
        }

        const target = document.getElementById(sectionId(uiStore.myLeaveSection))

        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
    }, [uiStore, uiStore.myLeaveSection])

    const selectedTab = myLeaveTabs.findIndex((tab) => tab.key === uiStore.myLeaveSection)
    const showRequestsSection = uiStore.myLeaveSection === 'requests' || uiStore.myLeaveSection === 'apply'
    const showBalanceSection = uiStore.myLeaveSection === 'balance'
    const showOtherLeavesSection = uiStore.myLeaveSection === 'other'
    const showHistorySection = uiStore.myLeaveSection === 'history'

    return (
        <Stack spacing={3}>
            <Paper
                elevation={0}
                sx={{
                    p: { xs: 3, md: 4 },
                    border: '1px solid',
                    borderColor: 'rgba(15, 23, 42, 0.08)',
                    background: 'linear-gradient(135deg, rgba(15,118,110,0.12), rgba(180,83,9,0.08))',
                }}
            >
                <Stack spacing={1}>
                    <Typography variant="h4" fontWeight={800}>
                        My Leave
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Manage requests, review annual balance, check other leaves, and follow status history.
                    </Typography>
                </Stack>
            </Paper>

            <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, px: 1.5 }}>
                <Tabs
                    value={selectedTab < 0 ? 0 : selectedTab}
                    onChange={(_event, nextIndex: number) => {
                        const next = myLeaveTabs[nextIndex]

                        if (!next) {
                            return
                        }

                        const nextHash = hashBySection[next.key]

                        if (window.location.hash === nextHash) {
                            return
                        }

                        window.location.hash = nextHash
                    }}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{ '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, minHeight: 52 } }}
                >
                    {myLeaveTabs.map((tab) => (
                        <Tab key={tab.key} label={tab.label} />
                    ))}
                </Tabs>
            </Paper>

            <Stack spacing={3}>
                {showRequestsSection && (
                    <Box id="my-leave-requests">
                        <Typography variant="h6" fontWeight={800} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AssignmentIcon fontSize="small" />
                            My Requests
                        </Typography>
                        <AnnualLeaveList
                            user={user}
                            filterPredicate={(leave) => leave.employeeId === user.id}
                            emptyMessage="You have not submitted any leave requests yet."
                        />
                    </Box>
                )}

                {showBalanceSection && (
                    <Paper id="my-leave-balance" elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
                        <Stack spacing={2.5}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}>
                                <Stack spacing={0.5}>
                                    <Typography variant="h6" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <SavingsIcon fontSize="small" />
                                        Annual Leave Balance
                                    </Typography>
                                    <Typography color="text.secondary">Current year annual entitlement and remaining balance.</Typography>
                                </Stack>
                                <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap justifyContent={{ xs: 'flex-start', sm: 'flex-end' }}>
                                    <Box
                                        sx={{
                                            width: 90,
                                            height: 90,
                                            borderRadius: '50%',
                                            border: '2px solid',
                                            borderColor: '#0f766e',
                                            backgroundColor: 'rgba(15,118,110,0.08)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Typography variant="h6" fontWeight={800} lineHeight={1}>{myBalance}</Typography>
                                        <Typography variant="caption" color="text.secondary" fontWeight={700}>Balance</Typography>
                                    </Box>
                                    <Box
                                        sx={{
                                            width: 90,
                                            height: 90,
                                            borderRadius: '50%',
                                            border: '2px solid',
                                            borderColor: '#d97706',
                                            backgroundColor: 'rgba(217,119,6,0.08)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Typography variant="h6" fontWeight={800} lineHeight={1}>{usedDays}</Typography>
                                        <Typography variant="caption" color="text.secondary" fontWeight={700}>Annual Used</Typography>
                                    </Box>
                                    <Box
                                        sx={{
                                            width: 90,
                                            height: 90,
                                            borderRadius: '50%',
                                            border: '2px solid',
                                            borderColor: 'rgba(15, 23, 42, 0.25)',
                                            backgroundColor: 'rgba(15, 23, 42, 0.04)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Typography variant="h6" fontWeight={800} lineHeight={1}>{myEntitlement}</Typography>
                                        <Typography variant="caption" color="text.secondary" fontWeight={700}>Total</Typography>
                                    </Box>
                                </Stack>
                            </Stack>

                            <Paper
                                elevation={0}
                                sx={{
                                    p: 2,
                                    borderRadius: 2,
                                    border: '1px solid',
                                    borderColor: 'rgba(15, 23, 42, 0.12)',
                                    background: 'linear-gradient(135deg, rgba(15,118,110,0.06), rgba(180,83,9,0.05))',
                                }}
                            >
                                <Stack spacing={2}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Typography variant="body2" fontWeight={700}>Used Days</Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {usedDays} / {myEntitlement} days ({usedPercentage.toFixed(0)}%)
                                        </Typography>
                                    </Stack>
                                    <LinearProgress
                                        variant="determinate"
                                        value={usedPercentage}
                                        color="warning"
                                        sx={{ height: 10, borderRadius: 999 }}
                                    />

                                    <Box
                                        sx={{
                                            borderTop: '1px solid',
                                            borderTopColor: 'rgba(15, 23, 42, 0.12)',
                                            pt: 1.5,
                                        }}
                                    >
                                        <Stack spacing={1.25}>
                                            <Typography variant="body2" fontWeight={700}>
                                                Annual Leave Used Per Month ({currentYear})
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                Shows approved annual leave days only (actual used balance).
                                            </Typography>

                                            {hasMonthlyTrendData ? (
                                                <BarChart
                                                    height={230}
                                                    xAxis={[{ scaleType: 'band', data: monthLabels }]}
                                                    series={[
                                                        { data: monthlyUsedDays, label: 'Annual used days', color: '#0f766e' },
                                                    ]}
                                                    sx={{ width: '100%' }}
                                                />
                                            ) : (
                                                <Alert severity="info">No annual leave activity yet for {currentYear}.</Alert>
                                            )}
                                        </Stack>
                                    </Box>
                                </Stack>
                            </Paper>
                        </Stack>
                    </Paper>
                )}

                {showOtherLeavesSection && (
                    <Paper id="my-other-leaves" elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
                        <Stack spacing={2.5}>
                            <Stack spacing={0.75}>
                                <Typography variant="h6" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <AssignmentIcon fontSize="small" />
                                    Other Leaves
                                </Typography>
                                <Typography color="text.secondary">
                                    Approved non-annual leave requests are shown here separately from your annual leave balance.
                                </Typography>
                            </Stack>

                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                                <Paper
                                    elevation={0}
                                    sx={{
                                        flex: 1,
                                        p: 2,
                                        borderRadius: 2,
                                        border: '1px solid',
                                        borderColor: 'rgba(124, 58, 237, 0.18)',
                                        backgroundColor: 'rgba(124, 58, 237, 0.05)',
                                    }}
                                >
                                    <Typography variant="caption" color="text.secondary" fontWeight={700}>
                                        Total other leave days
                                    </Typography>
                                    <Typography variant="h5" fontWeight={800} sx={{ mt: 0.5 }}>
                                        {otherLeaveSummary.totalDays}
                                    </Typography>
                                </Paper>
                                <Paper
                                    elevation={0}
                                    sx={{
                                        flex: 1,
                                        p: 2,
                                        borderRadius: 2,
                                        border: '1px solid',
                                        borderColor: 'rgba(15, 118, 110, 0.18)',
                                        backgroundColor: 'rgba(15, 118, 110, 0.05)',
                                    }}
                                >
                                    <Typography variant="caption" color="text.secondary" fontWeight={700}>
                                        Approved requests
                                    </Typography>
                                    <Typography variant="h5" fontWeight={800} sx={{ mt: 0.5 }}>
                                        {otherLeaveRequestCount}
                                    </Typography>
                                </Paper>
                                <Paper
                                    elevation={0}
                                    sx={{
                                        flex: 1.3,
                                        p: 2,
                                        borderRadius: 2,
                                        border: '1px solid',
                                        borderColor: 'rgba(217, 119, 6, 0.18)',
                                        backgroundColor: 'rgba(217, 119, 6, 0.05)',
                                    }}
                                >
                                    <Typography variant="caption" color="text.secondary" fontWeight={700}>
                                        Most used leave type
                                    </Typography>
                                    <Typography variant="body1" fontWeight={800} sx={{ mt: 0.5 }}>
                                        {topOtherLeaveType?.name ?? 'No activity yet'}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {topOtherLeaveType ? `${topOtherLeaveType.days} day${topOtherLeaveType.days === 1 ? '' : 's'}` : 'No approved requests yet'}
                                    </Typography>
                                </Paper>
                            </Stack>

                            {otherApprovedLeavesThisYear.length === 0 ? (
                                <Alert severity="info">No other approved leave requests yet for {currentYear}.</Alert>
                            ) : (
                                <>
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
                                            <Typography variant="body2" fontWeight={700}>
                                                Other Leave Days by Type ({currentYear})
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                Quick overview of approved non-annual leave usage.
                                            </Typography>

                                            {hasOtherLeaveChartData ? (
                                                <BarChart
                                                    height={220}
                                                    xAxis={[{ scaleType: 'band', data: otherLeaveChartLabels }]}
                                                    series={[
                                                        { data: otherLeaveChartDays, label: 'Other leave days', color: '#7c3aed' },
                                                    ]}
                                                    sx={{ width: '100%' }}
                                                />
                                            ) : (
                                                <Alert severity="info">No visual data available yet for {currentYear}.</Alert>
                                            )}

                                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                                {otherLeaveSummary.items.map((item) => (
                                                    <Chip
                                                        key={item.name}
                                                        size="small"
                                                        variant="outlined"
                                                        color="secondary"
                                                        label={`${item.name}: ${item.days} day${item.days === 1 ? '' : 's'}`}
                                                    />
                                                ))}
                                            </Stack>
                                        </Stack>
                                    </Paper>

                                    <Stack spacing={1.2}>
                                        <Typography variant="body2" fontWeight={700}>
                                            Approved other leave requests
                                        </Typography>
                                        {otherApprovedLeavesThisYear.map((leave) => {
                                            const leaveTypeName = leave.leaveTypeId != null
                                                ? (leaveTypeNameById.get(leave.leaveTypeId) ?? 'Other Leave')
                                                : 'Other Leave'

                                            return (
                                                <Paper
                                                    key={leave.id}
                                                    elevation={0}
                                                    sx={{
                                                        p: 2,
                                                        borderRadius: 2,
                                                        border: '1px solid',
                                                        borderColor: 'rgba(15, 23, 42, 0.12)',
                                                        backgroundColor: 'rgba(124, 58, 237, 0.04)',
                                                    }}
                                                >
                                                    <Stack
                                                        direction={{ xs: 'column', sm: 'row' }}
                                                        spacing={1.5}
                                                        justifyContent="space-between"
                                                        alignItems={{ sm: 'center' }}
                                                    >
                                                        <Stack spacing={0.75}>
                                                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                                                <Typography fontWeight={700}>{leaveTypeName}</Typography>
                                                                <Chip size="small" color="success" variant="outlined" label="Approved" />
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
                                                </Paper>
                                            )
                                        })}
                                    </Stack>
                                </>
                            )}
                        </Stack>
                    </Paper>
                )}

                {showHistorySection && (
                    <Paper id="my-leave-history" elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="h6" fontWeight={800} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <HistoryIcon fontSize="small" />
                            History
                        </Typography>

                        {!isHistoryLoading && !isHistoryError && (
                            <Box
                                sx={{
                                    display: 'flex',
                                    flexDirection: { xs: 'column', sm: 'row' },
                                    alignItems: { xs: 'stretch', sm: 'center' },
                                    justifyContent: 'space-between',
                                    gap: 1.5,
                                    mb: 2,
                                    px: 1.5,
                                    py: 1.25,
                                    borderRadius: 2,
                                    border: '1px solid',
                                    borderColor: 'rgba(15, 23, 42, 0.12)',
                                    background: 'linear-gradient(135deg, rgba(15,118,110,0.08), rgba(180,83,9,0.06))',
                                }}
                            >
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <FilterListRoundedIcon fontSize="small" color="action" />
                                    <Typography variant="body2" fontWeight={700}>
                                        Filter by year
                                    </Typography>
                                </Stack>

                                <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                                    <FormControl size="small" sx={{ minWidth: 160 }}>
                                        <Select
                                            value={selectedHistoryYear}
                                            onChange={(e) => {
                                                const value = e.target.value
                                                setSelectedHistoryYear(value === 'all' ? 'all' : Number(value))
                                            }}
                                            sx={{
                                                borderRadius: 999,
                                                backgroundColor: 'rgba(255,255,255,0.85)',
                                                '& .MuiSelect-select': { fontWeight: 700 },
                                            }}
                                        >
                                            <MenuItem value="all">ALL Years</MenuItem>
                                            {historyAvailableYears.map((year) => (
                                                <MenuItem key={year} value={year}>
                                                    {year}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    <Chip
                                        size="small"
                                        variant="outlined"
                                        color="primary"
                                        label={`${filteredHistoryItems.length} entr${filteredHistoryItems.length === 1 ? 'y' : 'ies'}`}
                                    />
                                </Stack>
                            </Box>
                        )}

                        {isHistoryLoading && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                                <CircularProgress size={26} />
                            </Box>
                        )}

                        {isHistoryError && <Alert severity="error">Failed to load leave history.</Alert>}

                        {!isHistoryLoading && !isHistoryError && filteredHistoryItems.length === 0 && (
                            <Alert severity="info">No history entries yet.</Alert>
                        )}

                        {!isHistoryLoading && !isHistoryError && filteredHistoryItems.length > 0 && (
                            <Stack spacing={1.2}>
                                {filteredHistoryItems.slice(0, 12).map((item) => {
                                    const isApproved = item.newStatus === 'Approved'
                                    const isRejected = item.newStatus === 'Rejected'
                                    const isCancelled = item.newStatus === 'Cancelled'
                                    const leave = annualLeaveById.get(item.annualLeaveId)
                                    const accentColor = isApproved
                                        ? 'success.main'
                                        : isRejected
                                            ? 'error.main'
                                            : isCancelled
                                                ? 'grey.500'
                                                : 'warning.main'

                                    const statusLabel = isApproved
                                        ? 'Approved'
                                        : isRejected
                                            ? 'Rejected'
                                            : isCancelled
                                                ? 'Cancelled'
                                                : item.newStatus

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
                                                    label={statusLabel}
                                                    size="small"
                                                    color={isApproved ? 'success' : isRejected ? 'error' : isCancelled ? 'default' : 'warning'}
                                                    sx={{ fontWeight: 700 }}
                                                />
                                                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                                    {new Date(item.changedAt).toLocaleString()}
                                                </Typography>
                                            </Stack>

                                            <Stack spacing={0.3} sx={{ mt: 1 }}>
                                                {item.leaveTypeName && (
                                                    <Typography variant="body2">
                                                        <Typography component="span" variant="body2" color="text.secondary">Leave type: </Typography>
                                                        <Typography component="span" variant="body2" fontWeight={700}>
                                                            {item.leaveTypeName}
                                                        </Typography>
                                                    </Typography>
                                                )}

                                                {leave && (
                                                    <Typography variant="body2">
                                                        <Typography component="span" variant="body2" color="text.secondary">Leave dates: </Typography>
                                                        <Typography component="span" variant="body2" fontWeight={700}>
                                                            {formatDate(leave.startDate)} - {formatDate(leave.endDate)} ({leave.totalDays} {leave.totalDays === 1 ? 'day' : 'days'})
                                                        </Typography>
                                                    </Typography>
                                                )}

                                                <Typography variant="body2">
                                                    <Typography component="span" variant="body2" color="text.secondary">Requested by: </Typography>
                                                    <Typography component="span" variant="body2" fontWeight={700}>
                                                        {item.employeeName || item.employeeId}
                                                    </Typography>
                                                </Typography>

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

export default MyLeavePage
