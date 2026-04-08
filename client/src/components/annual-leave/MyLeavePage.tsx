import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { observer } from 'mobx-react-lite'
import AssignmentIcon from '@mui/icons-material/Assignment'
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
    { key: 'requests', label: 'Requests' },
    { key: 'balance', label: 'Balance' },
    { key: 'other', label: 'Other Leave' },
    { key: 'history', label: 'History' },
] as const

const hashBySection: Record<MyLeaveSection, string> = {
    apply: '#apply-for-leave',
    requests: '#my-requests',
    balance: '#leave-balance',
    other: '#other-leaves',
    history: '#leave-history',
}

function formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-GB')
}

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const MyLeavePage = observer(function MyLeavePage({ user }: { user: UserInfo }) {
    const { uiStore } = useStore()
    const isAdminUser = user.roles.includes('Admin')
    const currentYear = new Date().getFullYear()
    const [selectedYear, setSelectedYear] = useState<number | 'all'>(currentYear)
    const [historyStatusFilter, setHistoryStatusFilter] = useState('all')
    const [historyTypeFilter, setHistoryTypeFilter] = useState('all')
    const [historySortOrder, setHistorySortOrder] = useState<'newest' | 'oldest'>('newest')

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
    const myEntitlement = myProfile?.annualLeaveEntitlement ?? 0
    const myLeaves = useMemo(
        () => annualLeaves.filter((leave) => leave.employeeId === user.id),
        [annualLeaves, user.id]
    )
    const selectedYearLabel = selectedYear === 'all' ? 'All Years' : String(selectedYear)

    const myLeavesForSelectedYear = useMemo(
        () => selectedYear === 'all'
            ? myLeaves
            : myLeaves.filter((leave) => new Date(leave.startDate).getFullYear() === selectedYear),
        [myLeaves, selectedYear]
    )

    const approvedLeavesForSelectedYear = useMemo(
        () => myLeavesForSelectedYear.filter((leave) => leave.status === 'Approved'),
        [myLeavesForSelectedYear]
    )

    const otherApprovedLeavesForSelectedYear = useMemo(
        () => approvedLeavesForSelectedYear.filter((leave) => {
            if (leave.leaveTypeId == null) {
                return false
            }

            const leaveTypeName = leaveTypeNameById.get(leave.leaveTypeId)?.trim().toLowerCase()
            return Boolean(leaveTypeName && !leaveTypeName.includes('annual'))
        }),
        [approvedLeavesForSelectedYear, leaveTypeNameById]
    )

    const otherLeaveSummary = useMemo(() => {
        const breakdown = new Map<string, number>()

        otherApprovedLeavesForSelectedYear.forEach((leave) => {
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
    }, [otherApprovedLeavesForSelectedYear, leaveTypeNameById])

    const otherLeaveRequestCount = otherApprovedLeavesForSelectedYear.length
    const topOtherLeaveType = otherLeaveSummary.items[0] ?? null
    const configuredOtherLeaveTypeNames = Array.from(
        new Set(
            leaveTypes
                .map((leaveType) => leaveType.name?.trim())
                .filter((name): name is string => Boolean(name && !name.toLowerCase().includes('annual')))
        )
    )
    const otherLeaveDaysByName = new Map(otherLeaveSummary.items.map((item) => [item.name, item.days]))
    const otherLeaveChartLabels = configuredOtherLeaveTypeNames.length > 0
        ? configuredOtherLeaveTypeNames
        : otherLeaveSummary.items.map((item) => item.name)
    const otherLeaveChartDays = otherLeaveChartLabels.map((name) => otherLeaveDaysByName.get(name) ?? 0)
    const hasOtherLeaveChartData = otherLeaveChartDays.some((days) => days > 0)

    const balanceYear = selectedYear === 'all' ? currentYear : selectedYear
    const balanceYearLabel = String(balanceYear)
    const annualUsedLeavesForBalanceYear = useMemo(
        () => myLeaves.filter((leave) => {
            if (leave.status !== 'Approved') {
                return false
            }

            if (new Date(leave.startDate).getFullYear() !== balanceYear) {
                return false
            }

            if (leave.leaveTypeId == null) {
                return true
            }

            const leaveTypeName = leaveTypeNameById.get(leave.leaveTypeId)?.trim().toLowerCase()
            return !leaveTypeName || leaveTypeName.includes('annual')
        }),
        [balanceYear, leaveTypeNameById, myLeaves]
    )

    const usedDays = annualUsedLeavesForBalanceYear.reduce((sum, leave) => sum + leave.totalDays, 0)
    const effectiveEntitlement = Math.max(0, myEntitlement)
    const balanceForSelectedYear = Math.max(0, effectiveEntitlement - usedDays)
    const usedPercentage = effectiveEntitlement > 0
        ? Math.min(100, (usedDays / effectiveEntitlement) * 100)
        : 0

    const monthlyUsedDays = useMemo(() => {
        const monthly = Array.from({ length: 12 }, () => 0)

        annualUsedLeavesForBalanceYear.forEach((leave) => {
            const leaveDate = new Date(leave.startDate)
            const monthIndex = leaveDate.getMonth()
            if (monthIndex < 0 || monthIndex > 11) {
                return
            }

            monthly[monthIndex] += leave.totalDays
        })

        return monthly
    }, [annualUsedLeavesForBalanceYear])

    const hasMonthlyTrendData = monthlyUsedDays.some((days) => days > 0)

    const historyItems = useMemo(
        () => histories.filter((item) => item.employeeId === user.id),
        [histories, user.id]
    )

    const availableHistoryStatuses = useMemo(
        () => Array.from(new Set(historyItems.map((item) => item.newStatus))).sort((left, right) => left.localeCompare(right)),
        [historyItems]
    )

    const availableHistoryLeaveTypes = useMemo(
        () => Array.from(new Set(historyItems.map((item) => {
            if (item.leaveTypeName?.trim()) {
                return item.leaveTypeName.trim()
            }

            const leave = annualLeaveById.get(item.annualLeaveId)
            if (leave?.leaveTypeId != null) {
                return leaveTypeNameById.get(leave.leaveTypeId) ?? 'Annual Leave'
            }

            return 'Annual Leave'
        }))).sort((left, right) => left.localeCompare(right)),
        [annualLeaveById, historyItems, leaveTypeNameById]
    )

    const filteredHistoryItems = useMemo(() => {
        const filteredItems = historyItems.filter((item) => {
            if (selectedYear !== 'all' && new Date(item.changedAt).getFullYear() !== selectedYear) {
                return false
            }

            if (historyStatusFilter !== 'all' && item.newStatus !== historyStatusFilter) {
                return false
            }

            const leaveTypeLabel = item.leaveTypeName?.trim()
                || (() => {
                    const leave = annualLeaveById.get(item.annualLeaveId)
                    if (leave?.leaveTypeId != null) {
                        return leaveTypeNameById.get(leave.leaveTypeId) ?? 'Annual Leave'
                    }

                    return 'Annual Leave'
                })()

            if (historyTypeFilter !== 'all' && leaveTypeLabel !== historyTypeFilter) {
                return false
            }

            return true
        })

        return filteredItems.sort((left, right) => historySortOrder === 'oldest'
            ? new Date(left.changedAt).getTime() - new Date(right.changedAt).getTime()
            : new Date(right.changedAt).getTime() - new Date(left.changedAt).getTime())
    }, [annualLeaveById, historyItems, historySortOrder, historyStatusFilter, historyTypeFilter, leaveTypeNameById, selectedYear])

    const hasActiveHistoryFilters = historyStatusFilter !== 'all' || historyTypeFilter !== 'all'

    const availableYears = useMemo(
        () => Array.from(
            new Set([
                currentYear,
                ...myLeaves.map((leave) => new Date(leave.startDate).getFullYear()),
                ...historyItems.map((item) => new Date(item.changedAt).getFullYear()),
            ])
        )
            .sort()
            .reverse(),
        [currentYear, historyItems, myLeaves]
    )

    const filterSummaryLabel = uiStore.myLeaveSection === 'history'
        ? `History: ${filteredHistoryItems.length} entr${filteredHistoryItems.length === 1 ? 'y' : 'ies'}`
        : uiStore.myLeaveSection === 'other'
            ? `Other leave: ${otherLeaveRequestCount} request${otherLeaveRequestCount === 1 ? '' : 's'}`
            : uiStore.myLeaveSection === 'balance'
                ? `Used in ${balanceYearLabel}: ${usedDays} day${usedDays === 1 ? '' : 's'}`
                : `Requests shown: ${myLeavesForSelectedYear.length}`

    useEffect(() => {
        if (uiStore.myLeaveSection === 'apply') {
            if (isAdminUser) {
                uiStore.navigateToMyLeave('requests')
                return
            }

            uiStore.openCreateDrawer()
        }

        const nextHash = hashBySection[uiStore.myLeaveSection]

        if (window.location.hash !== nextHash) {
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`)
            window.dispatchEvent(new HashChangeEvent('hashchange'))
        }
    }, [isAdminUser, uiStore, uiStore.myLeaveSection])

    const selectedTab = myLeaveTabs.findIndex((tab) => tab.key === uiStore.myLeaveSection)
    const showRequestsSection = uiStore.myLeaveSection === 'requests' || uiStore.myLeaveSection === 'apply'
    const showBalanceSection = uiStore.myLeaveSection === 'balance'
    const showOtherLeavesSection = uiStore.myLeaveSection === 'other'
    const showHistorySection = uiStore.myLeaveSection === 'history'
    const isCompactBalanceView = showBalanceSection

    const sectionPaperSx = {
        p: { xs: 2, md: 2.25 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'rgba(15, 23, 42, 0.08)',
        backgroundColor: 'rgba(255,255,255,0.98)',
        boxShadow: '0 8px 22px rgba(15, 23, 42, 0.04)',
    } as const

    const insetPaperSx = {
        p: { xs: 1.5, sm: 1.75 },
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'rgba(15, 23, 42, 0.08)',
    } as const

    const balanceStatCardSx = {
        minWidth: { xs: 88, sm: 94 },
        px: 1,
        py: 0.8,
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 0.2,
        flexShrink: 0,
    } as const

    return (
        <Stack spacing={isCompactBalanceView ? 1.5 : 2.5}>
            <Paper
                elevation={0}
                sx={{
                    px: { xs: isCompactBalanceView ? 1.55 : 1.85, md: isCompactBalanceView ? 2 : 2.35 },
                    py: { xs: isCompactBalanceView ? 0.95 : 1.35, md: isCompactBalanceView ? 1.15 : 1.55 },
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: 'rgba(15, 23, 42, 0.08)',
                    background: 'linear-gradient(135deg, rgba(248,250,252,0.96), rgba(240,253,250,0.92))',
                    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.04)',
                }}
            >
                <Stack spacing={isCompactBalanceView ? 0.95 : 1.15}>
                    <Stack
                        direction={{ xs: 'column', lg: 'row' }}
                        justifyContent="space-between"
                        alignItems={{ lg: 'center' }}
                        spacing={1.1}
                    >
                        <Stack spacing={0.2}>
                            <Typography variant="overline" sx={{ letterSpacing: 1.1, color: '#0f766e', fontWeight: 800, lineHeight: 1.1 }}>
                                Leave hub
                            </Typography>
                            <Typography variant="h4" fontWeight={800} sx={{ lineHeight: 1.1 }}>
                                My Leave
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Manage requests, balances, and leave history in one place.
                            </Typography>
                        </Stack>

                        <Stack spacing={0.75} alignItems={{ lg: 'flex-end' }}>
                            <Stack
                                direction={{ xs: 'column', xl: 'row' }}
                                spacing={0.75}
                                alignItems={{ xs: 'stretch', xl: 'center' }}
                                justifyContent="flex-end"
                                flexWrap="wrap"
                                useFlexGap
                            >
                                <Stack
                                    direction="row"
                                    spacing={0.9}
                                    alignItems="center"
                                    flexWrap="wrap"
                                    useFlexGap
                                    sx={{
                                        px: 0.5,
                                        py: 0.35,
                                        borderRadius: 999,
                                        backgroundColor: 'rgba(255,255,255,0.52)',
                                    }}
                                >
                                    <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap" useFlexGap>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                                            Show:
                                        </Typography>
                                        <Stack direction="row" spacing={0.45} alignItems="center">
                                            <Chip
                                                size="small"
                                                label="This year"
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
                                    </Stack>

                                    <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap" useFlexGap>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                                            Year:
                                        </Typography>
                                        <FormControl size="small" sx={{ minWidth: 118 }}>
                                            <Select
                                                value={selectedYear === 'all' ? currentYear : selectedYear}
                                                disabled={selectedYear === 'all'}
                                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                                sx={{
                                                    borderRadius: 999,
                                                    backgroundColor: 'rgba(255,255,255,0.94)',
                                                    '& .MuiSelect-select': {
                                                        fontWeight: 700,
                                                        py: 0.8,
                                                    },
                                                }}
                                            >
                                                {availableYears.map((year) => (
                                                    <MenuItem key={year} value={year}>
                                                        {year}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Stack>
                                </Stack>

                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{
                                        ml: { xl: 0.4 },
                                        px: 0,
                                        fontWeight: 500,
                                        whiteSpace: 'nowrap',
                                        alignSelf: 'center',
                                        opacity: 0.72,
                                        lineHeight: 1.2,
                                    }}
                                >
                                    {filterSummaryLabel}
                                </Typography>
                            </Stack>
                        </Stack>
                    </Stack>

                    <Box
                        sx={{
                            pt: isCompactBalanceView ? 0.2 : 0.35,
                            borderTop: '1px solid',
                            borderTopColor: 'rgba(15, 23, 42, 0.08)',
                        }}
                    >
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

                                window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`)
                                window.dispatchEvent(new HashChangeEvent('hashchange'))
                            }}
                            variant="scrollable"
                            scrollButtons="auto"
                            sx={{
                                minHeight: 'auto',
                                p: 0.25,
                                borderRadius: 999,
                                backgroundColor: 'rgba(15, 23, 42, 0.03)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                '& .MuiTabs-flexContainer': {
                                    gap: 0.35,
                                },
                                '& .MuiTabs-indicator': { display: 'none' },
                                '& .MuiTab-root': {
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.92rem',
                                    minHeight: 36,
                                    borderRadius: 999,
                                    color: 'rgba(15, 23, 42, 0.68)',
                                    px: 1.3,
                                    py: 0.55,
                                    alignItems: 'center',
                                    transition: 'all 0.18s ease',
                                },
                                '& .MuiTab-root:hover': {
                                    backgroundColor: 'rgba(15,118,110,0.06)',
                                    color: 'text.primary',
                                },
                                '& .Mui-selected': {
                                    color: '#0f766e !important',
                                    backgroundColor: 'rgba(255,255,255,0.96)',
                                    boxShadow: '0 1px 6px rgba(15, 23, 42, 0.06)',
                                    border: '1px solid rgba(15,118,110,0.14)',
                                },
                            }}
                        >
                            {myLeaveTabs.map((tab) => (
                                <Tab key={tab.key} label={tab.label} />
                            ))}
                        </Tabs>
                    </Box>
                </Stack>
            </Paper>

            <Stack spacing={isCompactBalanceView ? 1.35 : 2.5}>
                {showRequestsSection && (
                    <Paper id="my-leave-requests" elevation={0} sx={sectionPaperSx}>
                        <AnnualLeaveList
                            user={user}
                            filterPredicate={(leave) => leave.employeeId === user.id}
                            emptyMessage={selectedYear === 'all'
                                ? 'You have not submitted any leave requests yet.'
                                : `No leave requests found for ${selectedYearLabel}.`}
                            selectedYear={selectedYear}
                            showYearFilter={false}
                            showCreateButton={false}
                        />
                    </Paper>
                )}

                {showBalanceSection && (
                    <Paper id="my-leave-balance" elevation={0} sx={{ ...sectionPaperSx, p: { xs: 1.8, md: 2 } }}>
                        <Stack spacing={1.7}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.1}>
                                <Stack spacing={0.5}>
                                    <Typography variant="h6" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <SavingsIcon fontSize="small" />
                                        Annual Leave Balance
                                    </Typography>
                                    <Typography color="text.secondary">
                                        {selectedYear === 'all'
                                            ? `Annual leave balance is tracked per year, so this section is showing ${balanceYearLabel}.`
                                            : `Annual entitlement and remaining balance for ${balanceYearLabel}.`}
                                    </Typography>
                                </Stack>
                                <Stack
                                    direction="row"
                                    spacing={0.6}
                                    flexWrap="wrap"
                                    useFlexGap
                                    alignItems="center"
                                    justifyContent={{ xs: 'flex-start', sm: 'flex-end' }}
                                    sx={{
                                        alignSelf: { xs: 'flex-start', sm: 'center' },
                                    }}
                                >
                                    <Box
                                        sx={{
                                            ...balanceStatCardSx,
                                            border: '1px solid',
                                            borderColor: 'rgba(15,118,110,0.2)',
                                            backgroundColor: 'rgba(15,118,110,0.08)',
                                        }}
                                    >
                                        <Typography variant="h6" fontWeight={800} lineHeight={1} sx={{ fontSize: { xs: '1.02rem', sm: '1.08rem' } }}>
                                            {balanceForSelectedYear}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ lineHeight: 1.15 }}>
                                            Balance
                                        </Typography>
                                    </Box>
                                    <Box
                                        sx={{
                                            ...balanceStatCardSx,
                                            border: '1px solid',
                                            borderColor: 'rgba(217,119,6,0.24)',
                                            backgroundColor: 'rgba(217,119,6,0.08)',
                                        }}
                                    >
                                        <Typography variant="h6" fontWeight={800} lineHeight={1} sx={{ fontSize: { xs: '1.02rem', sm: '1.08rem' } }}>
                                            {usedDays}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ lineHeight: 1.15 }}>
                                            Annual Used
                                        </Typography>
                                    </Box>
                                    <Box
                                        sx={{
                                            ...balanceStatCardSx,
                                            border: '1px solid',
                                            borderColor: 'rgba(15, 23, 42, 0.12)',
                                            backgroundColor: 'rgba(15, 23, 42, 0.04)',
                                        }}
                                    >
                                        <Typography variant="h6" fontWeight={800} lineHeight={1} sx={{ fontSize: { xs: '1.02rem', sm: '1.08rem' } }}>
                                            {myEntitlement}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ lineHeight: 1.15 }}>
                                            Total
                                        </Typography>
                                    </Box>
                                </Stack>
                            </Stack>

                            <Paper
                                elevation={0}
                                sx={{
                                    ...insetPaperSx,
                                    py: { xs: 1.25, sm: 1.4 },
                                    background: 'linear-gradient(135deg, rgba(15,118,110,0.06), rgba(180,83,9,0.05))',
                                }}
                            >
                                <Stack spacing={1}>
                                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={0.35}>
                                        <Stack spacing={0.12}>
                                            <Typography variant="body2" fontWeight={700}>Annual leave usage</Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                You’ve used {usedDays} day{usedDays === 1 ? '' : 's'} and have {balanceForSelectedYear} remaining.
                                            </Typography>
                                        </Stack>
                                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                                            {usedDays} of {myEntitlement} days ({usedPercentage.toFixed(0)}%)
                                        </Typography>
                                    </Stack>
                                    <LinearProgress
                                        variant="determinate"
                                        value={usedPercentage}
                                        color="warning"
                                        sx={{ height: 8, borderRadius: 999 }}
                                    />

                                    <Box
                                        sx={{
                                            borderTop: '1px solid',
                                            borderTopColor: 'rgba(15, 23, 42, 0.12)',
                                            pt: 0.95,
                                        }}
                                    >
                                        <Stack spacing={0.7}>
                                            <Stack
                                                direction={{ xs: 'column', sm: 'row' }}
                                                justifyContent="space-between"
                                                alignItems={{ xs: 'flex-start', sm: 'center' }}
                                                spacing={0.35}
                                            >
                                                <Typography variant="body2" fontWeight={700}>
                                                    Annual Leave Used Per Month ({balanceYearLabel})
                                                </Typography>
                                                <Stack direction="row" spacing={0.6} alignItems="center">
                                                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#0f766e' }} />
                                                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                                        Used days
                                                    </Typography>
                                                </Stack>
                                            </Stack>
                                            <Typography variant="caption" color="text.secondary">
                                                Shows approved annual leave days only.
                                            </Typography>

                                            {hasMonthlyTrendData ? (
                                                <BarChart
                                                    height={190}
                                                    xAxis={[{ scaleType: 'band', data: monthLabels }]}
                                                    series={[
                                                        { data: monthlyUsedDays, color: '#0f766e' },
                                                    ]}
                                                    sx={{ width: '100%', mt: -0.2 }}
                                                />
                                            ) : (
                                                <Alert severity="info">No annual leave activity yet for {balanceYearLabel}.</Alert>
                                            )}
                                        </Stack>
                                    </Box>
                                </Stack>
                            </Paper>
                        </Stack>
                    </Paper>
                )}

                {showOtherLeavesSection && (
                    <Paper id="my-other-leaves" elevation={0} sx={{ ...sectionPaperSx, p: { xs: 1.8, md: 2 } }}>
                        <Stack spacing={1.8}>
                            <Stack spacing={0.55}>
                                <Typography variant="h6" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <AssignmentIcon fontSize="small" />
                                    Other Leaves
                                </Typography>
                                <Typography color="text.secondary">
                                    Approved non-annual leave requests are shown here separately from your annual leave balance.
                                </Typography>
                            </Stack>

                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                                <Paper
                                    elevation={0}
                                    sx={{
                                        ...insetPaperSx,
                                        p: { xs: 1.25, sm: 1.4 },
                                        flex: 1,
                                        borderColor: 'rgba(124, 58, 237, 0.18)',
                                        backgroundColor: 'rgba(124, 58, 237, 0.05)',
                                    }}
                                >
                                    <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ lineHeight: 1.15 }}>
                                        Total other leave days
                                    </Typography>
                                    <Typography variant="h5" fontWeight={800} sx={{ mt: 0.35, lineHeight: 1.05 }}>
                                        {otherLeaveSummary.totalDays}
                                    </Typography>
                                </Paper>
                                <Paper
                                    elevation={0}
                                    sx={{
                                        ...insetPaperSx,
                                        p: { xs: 1.25, sm: 1.4 },
                                        flex: 1,
                                        borderColor: 'rgba(15, 118, 110, 0.18)',
                                        backgroundColor: 'rgba(15, 118, 110, 0.05)',
                                    }}
                                >
                                    <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ lineHeight: 1.15 }}>
                                        Approved requests
                                    </Typography>
                                    <Typography variant="h5" fontWeight={800} sx={{ mt: 0.35, lineHeight: 1.05 }}>
                                        {otherLeaveRequestCount}
                                    </Typography>
                                </Paper>
                                <Paper
                                    elevation={0}
                                    sx={{
                                        ...insetPaperSx,
                                        p: { xs: 1.25, sm: 1.4 },
                                        flex: 1.3,
                                        borderColor: 'rgba(217, 119, 6, 0.18)',
                                        backgroundColor: 'rgba(217, 119, 6, 0.05)',
                                    }}
                                >
                                    <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ lineHeight: 1.15 }}>
                                        Most used leave type
                                    </Typography>
                                    <Typography variant="body1" fontWeight={800} sx={{ mt: 0.35, lineHeight: 1.15 }}>
                                        {topOtherLeaveType?.name ?? 'No activity yet'}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                                        {topOtherLeaveType ? `${topOtherLeaveType.days} day${topOtherLeaveType.days === 1 ? '' : 's'}` : 'No approved requests yet'}
                                    </Typography>
                                </Paper>
                            </Stack>

                            {otherApprovedLeavesForSelectedYear.length === 0 ? (
                                <Alert severity="info">No other approved leave requests yet for {selectedYearLabel}.</Alert>
                            ) : (
                                <>
                                    <Paper
                                        elevation={0}
                                        sx={{
                                            ...insetPaperSx,
                                            p: { xs: 1.3, sm: 1.45 },
                                            borderColor: 'rgba(124, 58, 237, 0.14)',
                                            background: 'linear-gradient(135deg, rgba(124,58,237,0.035), rgba(15,118,110,0.03))',
                                        }}
                                    >
                                        <Stack spacing={0.85}>
                                            <Stack
                                                direction={{ xs: 'column', sm: 'row' }}
                                                justifyContent="space-between"
                                                alignItems={{ xs: 'flex-start', sm: 'center' }}
                                                spacing={0.35}
                                            >
                                                <Typography variant="body2" fontWeight={700}>
                                                    Other Leave Days by Type ({selectedYearLabel})
                                                </Typography>
                                                <Stack direction="row" spacing={0.6} alignItems="center">
                                                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#8b7ae6' }} />
                                                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                                        Approved days
                                                    </Typography>
                                                </Stack>
                                            </Stack>
                                            <Typography variant="caption" color="text.secondary">
                                                Shows approved non-annual leave usage across all configured leave types.
                                            </Typography>

                                            {hasOtherLeaveChartData ? (
                                                <BarChart
                                                    height={198}
                                                    xAxis={[{ scaleType: 'band', data: otherLeaveChartLabels }]}
                                                    series={[
                                                        { data: otherLeaveChartDays, color: '#8b7ae6' },
                                                    ]}
                                                    sx={{ width: '100%', mt: -0.2 }}
                                                />
                                            ) : (
                                                <Alert severity="info">No visual data available yet for {selectedYearLabel}.</Alert>
                                            )}

                                        </Stack>
                                    </Paper>

                                    <Stack spacing={1}>
                                        <Typography variant="body2" fontWeight={700}>
                                            Approved other leave requests
                                        </Typography>
                                        {otherApprovedLeavesForSelectedYear.map((leave) => {
                                            const leaveTypeName = leave.leaveTypeId != null
                                                ? (leaveTypeNameById.get(leave.leaveTypeId) ?? 'Other Leave')
                                                : 'Other Leave'

                                            return (
                                                <Paper
                                                    key={leave.id}
                                                    elevation={0}
                                                    sx={{
                                                        ...insetPaperSx,
                                                        p: 1.4,
                                                        backgroundColor: 'rgba(124, 58, 237, 0.04)',
                                                    }}
                                                >
                                                    <Stack
                                                        direction={{ xs: 'column', sm: 'row' }}
                                                        spacing={1.2}
                                                        justifyContent="space-between"
                                                        alignItems={{ xs: 'flex-start', sm: 'center' }}
                                                    >
                                                        <Stack spacing={0.7} sx={{ minWidth: 0, flex: 1 }}>
                                                            <Stack direction="row" spacing={0.9} alignItems="center" flexWrap="wrap" useFlexGap>
                                                                <Typography fontWeight={700}>{leaveTypeName}</Typography>
                                                                <Chip size="small" color="success" variant="outlined" label="Approved" />
                                                            </Stack>
                                                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                                                                {formatDate(leave.startDate)} - {formatDate(leave.endDate)}
                                                            </Typography>
                                                            {leave.reason && (
                                                                <Box
                                                                    sx={{
                                                                        mt: 0.2,
                                                                        px: 0.9,
                                                                        py: 0.65,
                                                                        borderRadius: 1.5,
                                                                        backgroundColor: 'rgba(255, 255, 255, 0.56)',
                                                                        border: '1px solid rgba(15, 23, 42, 0.06)',
                                                                    }}
                                                                >
                                                                    <Typography
                                                                        variant="caption"
                                                                        color="text.secondary"
                                                                        sx={{ display: 'block', fontWeight: 700, mb: 0.15, lineHeight: 1.2 }}
                                                                    >
                                                                        Reason
                                                                    </Typography>
                                                                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                                                                        {leave.reason}
                                                                    </Typography>
                                                                </Box>
                                                            )}
                                                        </Stack>
                                                        <Chip
                                                            size="small"
                                                            color="secondary"
                                                            sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, fontWeight: 600 }}
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
                    <Paper id="my-leave-history" elevation={0} sx={sectionPaperSx}>
                        <Typography variant="h6" fontWeight={800} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <HistoryIcon fontSize="small" />
                            History
                        </Typography>

                        {isHistoryLoading && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                                <CircularProgress size={26} />
                            </Box>
                        )}

                        {isHistoryError && <Alert severity="error">Failed to load leave history.</Alert>}

                        {!isHistoryLoading && !isHistoryError && historyItems.length > 0 && (
                            <Stack
                                direction={{ xs: 'column', md: 'row' }}
                                spacing={1}
                                useFlexGap
                                sx={{ mb: 1.5 }}
                            >
                                <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 150 } }}>
                                    <Select
                                        value={historyStatusFilter}
                                        onChange={(event) => setHistoryStatusFilter(String(event.target.value))}
                                        sx={{ borderRadius: 999, backgroundColor: 'rgba(248,250,252,0.9)' }}
                                    >
                                        <MenuItem value="all">All statuses</MenuItem>
                                        {availableHistoryStatuses.map((status) => (
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
                                        {availableHistoryLeaveTypes.map((leaveType) => (
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

                        {!isHistoryLoading && !isHistoryError && filteredHistoryItems.length === 0 && (
                            <Alert severity="info">
                                {hasActiveHistoryFilters
                                    ? 'No history entries match the selected filters.'
                                    : selectedYear === 'all'
                                        ? 'No history entries yet.'
                                        : `No history entries found for ${selectedYearLabel}.`}
                            </Alert>
                        )}

                        {!isHistoryLoading && !isHistoryError && filteredHistoryItems.length > 0 && (
                            <Stack spacing={1.5}>
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
                                                py: 1.15,
                                                px: 1.35,
                                                borderRadius: 2,
                                                border: '1px solid',
                                                borderColor: 'rgba(15, 23, 42, 0.08)',
                                                borderLeft: '2px solid',
                                                borderLeftColor: accentColor,
                                                backgroundColor: 'rgba(248,250,252,0.72)',
                                            }}
                                        >
                                            <Stack spacing={0.85}>
                                                <Stack
                                                    direction={{ xs: 'column', sm: 'row' }}
                                                    justifyContent="space-between"
                                                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                                                    spacing={0.65}
                                                >
                                                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                                                        <Chip
                                                            label={statusLabel}
                                                            size="small"
                                                            color={isApproved ? 'success' : isRejected ? 'error' : isCancelled ? 'default' : 'warning'}
                                                            sx={{ fontWeight: 700 }}
                                                        />
                                                        {item.leaveTypeName && (
                                                            <Typography variant="body2" fontWeight={700}>
                                                                {item.leaveTypeName}
                                                            </Typography>
                                                        )}
                                                    </Stack>
                                                    <Typography
                                                        variant="caption"
                                                        color="text.secondary"
                                                        sx={{
                                                            whiteSpace: 'nowrap',
                                                            opacity: 0.78,
                                                            lineHeight: 1.2,
                                                            alignSelf: { xs: 'flex-start', sm: 'center' },
                                                        }}
                                                    >
                                                        {new Date(item.changedAt).toLocaleString()}
                                                    </Typography>
                                                </Stack>

                                                {leave && (
                                                    <Stack
                                                        direction={{ xs: 'column', sm: 'row' }}
                                                        spacing={0.75}
                                                        alignItems={{ xs: 'flex-start', sm: 'center' }}
                                                        justifyContent="space-between"
                                                        useFlexGap
                                                    >
                                                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                            {formatDate(leave.startDate)} - {formatDate(leave.endDate)}
                                                        </Typography>
                                                        <Chip
                                                            size="small"
                                                            variant="outlined"
                                                            color="default"
                                                            label={`${leave.totalDays} ${leave.totalDays === 1 ? 'day' : 'days'}`}
                                                            sx={{ fontWeight: 600 }}
                                                        />
                                                    </Stack>
                                                )}

                                                <Stack
                                                    direction={{ xs: 'column', sm: 'row' }}
                                                    spacing={{ xs: 0.2, sm: 1.1 }}
                                                    flexWrap="wrap"
                                                    useFlexGap
                                                >
                                                    <Typography variant="caption" color="text.secondary">
                                                        By{' '}
                                                        <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                            {item.employeeName || item.employeeId}
                                                        </Box>
                                                    </Typography>

                                                    {!isSelfAction && (
                                                        <Typography variant="caption" color="text.secondary">
                                                            {isApproved ? 'Approved · ' : isRejected ? 'Rejected · ' : 'Updated · '}
                                                            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                                {item.changedByUserName || item.changedByUserId}
                                                            </Box>
                                                        </Typography>
                                                    )}
                                                </Stack>

                                                {item.comment && (
                                                    <Box
                                                        sx={{
                                                            mt: 0.1,
                                                            px: 0.9,
                                                            py: 0.65,
                                                            borderRadius: 1.5,
                                                            backgroundColor: 'rgba(248, 250, 252, 0.92)',
                                                            border: '1px solid rgba(15, 23, 42, 0.05)',
                                                        }}
                                                    >
                                                        <Typography
                                                            variant="caption"
                                                            color="text.secondary"
                                                            sx={{ display: 'block', fontWeight: 700, mb: 0.15, lineHeight: 1.2, opacity: 0.78 }}
                                                        >
                                                            System note
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45, opacity: 0.92 }}>
                                                            {item.comment}
                                                        </Typography>
                                                    </Box>
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
