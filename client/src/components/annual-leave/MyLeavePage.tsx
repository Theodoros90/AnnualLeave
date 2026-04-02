import { useEffect, useState } from 'react'
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
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { getEmployeeProfiles, getLeaveStatusHistories } from '../../lib/api'
import { useStore } from '../../lib/mobx'
import type { MyLeaveSection } from '../../lib/mobx/uiStore'
import type { UserInfo } from '../../lib/types'
import AnnualLeaveList from './AnnualLeaveList'

const myLeaveTabs = [
    { key: 'requests', label: 'My Requests' },
    { key: 'balance', label: 'Leave Balance' },
    { key: 'history', label: 'History' },
] as const

const hashBySection: Record<MyLeaveSection, string> = {
    apply: '#apply-for-leave',
    requests: '#my-requests',
    balance: '#leave-balance',
    history: '#leave-history',
}

function sectionId(section: MyLeaveSection) {
    if (section === 'requests') return 'my-leave-requests'
    if (section === 'balance') return 'my-leave-balance'
    if (section === 'history') return 'my-leave-history'
    return 'my-leave-requests'
}

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

    const myProfile = profiles.find((p) => p.userId === user.id)
    const myBalance = myProfile?.leaveBalance ?? 0
    const myEntitlement = myProfile?.annualLeaveEntitlement ?? 0

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
                        Manage requests, apply for leave, track balance, and review status history.
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
                        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}>
                            <Stack spacing={0.5}>
                                <Typography variant="h6" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <SavingsIcon fontSize="small" />
                                    Leave Balance
                                </Typography>
                                <Typography color="text.secondary">Current year entitlement and available balance.</Typography>
                            </Stack>
                            <Stack direction="row" spacing={1}>
                                <Chip label={`Balance: ${myBalance} days`} color="primary" />
                                <Chip label={`Entitlement: ${myEntitlement} days`} variant="outlined" />
                            </Stack>
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
