import { useQuery } from '@tanstack/react-query'
import { observer } from 'mobx-react-lite'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import {
    BarChart as BarChartIcon,
    CorporateFare as CorporateFareIcon,
    PendingActions as PendingActionsIcon,
    Group as GroupIcon,
    ArrowForwardIos as ArrowForwardIosIcon,
    EventAvailable as EventAvailableIcon,
} from '@mui/icons-material'
import { getAdminUsers, getAnnualLeaves, getDepartments, getEmployeeProfiles, getLeaveTypes, getTeamAwayThisWeekCount } from '../../lib/api'
import { useStore } from '../../lib/mobx'
import { AdminUsersPanel, DepartmentsPanel, LeaveTypesPanel } from '..'
import type { UserInfo } from '../../lib/types'

type DashboardHomeProps = {
    user: UserInfo
}

type StatCard = {
    icon: React.ReactNode
    title: string
    value: string
    subtitle: string
    color: 'primary' | 'secondary' | 'success' | 'warning' | 'error'
    onClick?: () => void
}

const colorConfig: Record<string, { bg: string; iconColor: string; hoverBorder: string; hoverShadow: string }> = {
    primary: { bg: 'rgba(15,118,110,0.1)', iconColor: '#0f766e', hoverBorder: '#0f766e', hoverShadow: 'rgba(15,118,110,0.18)' },
    secondary: { bg: 'rgba(124,58,237,0.1)', iconColor: '#7c3aed', hoverBorder: '#7c3aed', hoverShadow: 'rgba(124,58,237,0.18)' },
    success: { bg: 'rgba(22,163,74,0.1)', iconColor: '#16a34a', hoverBorder: '#16a34a', hoverShadow: 'rgba(22,163,74,0.18)' },
    warning: { bg: 'rgba(217,119,6,0.1)', iconColor: '#d97706', hoverBorder: '#d97706', hoverShadow: 'rgba(217,119,6,0.18)' },
    error: { bg: 'rgba(220,38,38,0.1)', iconColor: '#dc2626', hoverBorder: '#dc2626', hoverShadow: 'rgba(220,38,38,0.18)' },
}

const DashboardHome = observer(function DashboardHome({ user }: DashboardHomeProps) {
    const { uiStore } = useStore()
    const isAdmin = user.roles.includes('Admin')
    const isManager = user.roles.includes('Manager')
    const isEmployee = user.roles.includes('Employee')

    const { data: profiles = [] } = useQuery({
        queryKey: ['employeeProfiles'],
        queryFn: getEmployeeProfiles,
    })

    const { data: annualLeaves = [] } = useQuery({
        queryKey: ['annualLeaves'],
        queryFn: getAnnualLeaves,
        enabled: isEmployee || isManager || isAdmin,
    })

    const { data: leaveTypes = [] } = useQuery({
        queryKey: ['leaveTypes'],
        queryFn: getLeaveTypes,
        enabled: isEmployee || isManager || isAdmin,
    })

    const { data: awayThisWeekCount = 0 } = useQuery({
        queryKey: ['teamAwayThisWeekCount'],
        queryFn: getTeamAwayThisWeekCount,
        enabled: isEmployee || isManager || isAdmin,
    })

    const { data: departments = [] } = useQuery({
        queryKey: ['departments'],
        queryFn: getDepartments,
        enabled: isAdmin,
    })

    const { data: adminUsers = [] } = useQuery({
        queryKey: ['adminUsers'],
        queryFn: getAdminUsers,
        enabled: isAdmin,
    })

    const myProfile = profiles.find((p) => p.userId === user.id)
    const myEntitlement = myProfile?.annualLeaveEntitlement ?? 22
    const currentYear = new Date().getFullYear()
    const leaveTypeNameById = new Map(leaveTypes.map((leaveType) => [leaveType.id, leaveType.name]))

    const myApprovedAnnualLeavesThisYear = annualLeaves.filter((leave) => {
        if (leave.employeeId !== user.id || leave.status !== 'Approved') {
            return false
        }

        if (new Date(leave.startDate).getFullYear() !== currentYear) {
            return false
        }

        if (leave.leaveTypeId == null) {
            return true
        }

        const leaveTypeName = leaveTypeNameById.get(leave.leaveTypeId)?.trim().toLowerCase()
        return !leaveTypeName || leaveTypeName.includes('annual')
    })

    const myAnnualUsedDaysThisYear = myApprovedAnnualLeavesThisYear.reduce((total, leave) => total + leave.totalDays, 0)
    const myBalance = Math.max(0, myEntitlement - myAnnualUsedDaysThisYear)

    const myOtherApprovedLeaves = annualLeaves.filter((leave) => {
        if (leave.employeeId !== user.id || leave.status !== 'Approved' || leave.leaveTypeId == null) {
            return false
        }

        if (new Date(leave.startDate).getFullYear() !== currentYear) {
            return false
        }

        const leaveTypeName = leaveTypeNameById.get(leave.leaveTypeId)?.trim().toLowerCase()
        return Boolean(leaveTypeName && !leaveTypeName.includes('annual'))
    })
    const myOtherLeaveDays = myOtherApprovedLeaves.reduce((total, leave) => total + leave.totalDays, 0)
    const myOtherLeaveRequests = myOtherApprovedLeaves.length
    const pendingApprovalsCount = annualLeaves.filter((leave) => leave.status === 'Pending').length
    const totalEmployeesCount = adminUsers.filter(
        (adminUser) => adminUser.roles.includes('Employee') || adminUser.roles.includes('Manager')
    ).length
    const totalDepartmentsCount = departments.length

    const statCards: StatCard[] = []

    if (!isAdmin) {
        statCards.push({
            icon: <BarChartIcon sx={{ fontSize: 28 }} />,
            title: 'Your Balance',
            value: `${myBalance} days`,
            subtitle: `Annual leave available in ${currentYear}`,
            color: 'primary',
            onClick: () => {
                uiStore.navigateToMyLeave('balance')
                window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#leave-balance`)
            },
        })
    }

    if (isEmployee || isManager || isAdmin) {
        statCards.push({
            icon: <EventAvailableIcon sx={{ fontSize: 28 }} />,
            title: 'Other Leaves',
            value: `${myOtherLeaveDays} day${myOtherLeaveDays === 1 ? '' : 's'}`,
            subtitle: myOtherLeaveRequests > 0
                ? `${myOtherLeaveRequests} approved request${myOtherLeaveRequests === 1 ? '' : 's'} this year`
                : 'No approved non-annual leave yet',
            color: 'secondary',
            onClick: () => {
                uiStore.navigateToMyLeave('other')
                window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#other-leaves`)
            },
        })
    }

    if (isManager || isAdmin) {
        statCards.push({
            icon: <PendingActionsIcon sx={{ fontSize: 28 }} />,
            title: 'Pending Approvals',
            value: `${pendingApprovalsCount} request${pendingApprovalsCount === 1 ? '' : 's'}`,
            subtitle: 'Awaiting your review',
            color: 'warning',
            onClick: () => {
                uiStore.navigateToTeamLeave()
                window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#team-leave`)
            },
        })
    }

    if (isAdmin) {
        statCards.push({
            icon: <GroupIcon sx={{ fontSize: 28 }} />,
            title: 'Total Employees',
            value: `${totalEmployeesCount}`,
            subtitle: 'Employees and managers',
            color: 'success',
            onClick: () => {
                uiStore.navigateToAdminSection('users')
                window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#admin-users`)
            },
        })

        statCards.push({
            icon: <CorporateFareIcon sx={{ fontSize: 28 }} />,
            title: 'Departments',
            value: `${totalDepartmentsCount}`,
            subtitle: 'Configured departments',
            color: 'secondary',
            onClick: () => {
                uiStore.navigateToAdminSection('departments')
                window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#admin-departments`)
            },
        })
    }

    if (isEmployee || isManager || isAdmin) {
        statCards.push({
            icon: <GroupIcon sx={{ fontSize: 28 }} />,
            title: 'Team Away',
            value: `${awayThisWeekCount} ${awayThisWeekCount === 1 ? 'person' : 'people'}`,
            subtitle: 'This week',
            color: 'secondary',
        })
    }

    const handleOpenMyLeave = () => {
        uiStore.navigateToMyLeave('requests')
    }

    const handleOpenOtherLeaves = () => {
        uiStore.navigateToMyLeave('other')
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#other-leaves`)
    }

    const handleSettingsLeaveTypes = () => {
        uiStore.navigateToAdminSection('leave-types')
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#admin-leave-types`)
    }

    const handleSettingsDepartments = () => {
        uiStore.navigateToAdminSection('departments')
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#admin-departments`)
    }

    const handleSettingsUsers = () => {
        uiStore.navigateToAdminSection('users')
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#admin-users`)
    }

    const settingsTabValue =
        uiStore.adminSection === 'leave-types' ? 0
            : uiStore.adminSection === 'departments' ? 1
                : uiStore.adminSection === 'users' ? 2
                    : false

    const settingsLinks = (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, px: 1.5 }}>
            <Tabs
                value={settingsTabValue}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, minHeight: 52 } }}
            >
                <Tab label="Leave Types" onClick={handleSettingsLeaveTypes} />
                <Tab label="Departments" onClick={handleSettingsDepartments} />
                <Tab label="Users" onClick={handleSettingsUsers} />
            </Tabs>
        </Paper>
    )

    const settingsHeader = (
        <Stack spacing={0.35}>
            <Typography variant="h5" fontWeight={800}>Settings</Typography>
            <Typography variant="body2" color="text.secondary">
                Manage leave types, departments, and users from one place.
            </Typography>
        </Stack>
    )

    const dashboardOverview = (
        <Stack spacing={4} id="dashboard-section">
            <Paper
                elevation={0}
                sx={{
                    p: { xs: 1.85, md: 2.2 },
                    border: '1px solid',
                    borderColor: 'rgba(15, 23, 42, 0.08)',
                    borderRadius: 2.5,
                    background: 'linear-gradient(135deg, rgba(15,118,110,0.12), rgba(180,83,9,0.08))',
                }}
            >
                <Stack spacing={0.7}>
                    <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        alignItems={{ xs: 'flex-start', sm: 'center' }}
                        justifyContent="space-between"
                        columnGap={1.3}
                        rowGap={0.45}
                        flexWrap="wrap"
                    >
                        <Stack spacing={0.18} sx={{ minWidth: 0, flex: '1 1 0' }}>
                            <Typography
                                variant="h3"
                                component="h1"
                                sx={{ fontSize: { xs: '1.5rem', md: '1.76rem' }, lineHeight: 1.03, letterSpacing: '-0.015em' }}
                            >
                                Welcome back, {user.displayName}
                            </Typography>
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                fontWeight={500}
                                sx={{ lineHeight: 1.08, letterSpacing: '0.01em' }}
                            >
                                {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                            </Typography>
                            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.22, maxWidth: '62ch' }}>
                                {isAdmin && 'You have administrator access to the system.'}
                                {isManager && !isAdmin && 'Manage your team\'s leave requests and approvals.'}
                                {isEmployee && !isManager && 'Submit and track your annual leave requests.'}
                            </Typography>
                        </Stack>
                        <Chip
                            label={user.roles.join(', ')}
                            color="secondary"
                            variant="outlined"
                            sx={{
                                height: 28,
                                alignSelf: { xs: 'flex-start', sm: 'center' },
                                bgcolor: 'rgba(255,255,255,0.58)',
                                borderColor: 'rgba(124,58,237,0.22)',
                                '& .MuiChip-label': {
                                    px: 1.2,
                                    fontWeight: 600,
                                },
                            }}
                        />
                    </Stack>
                </Stack>
            </Paper>

            <Grid container spacing={2}>
                {statCards.map((card) => {
                    const cfg = colorConfig[card.color]
                    return (
                        <Grid key={card.title} size={{ xs: 12, sm: 6, md: 3 }}>
                            <Card
                                elevation={0}
                                onClick={card.onClick}
                                sx={{
                                    border: '1px solid rgba(15, 23, 42, 0.08)',
                                    borderLeft: `3px solid ${cfg.iconColor}`,
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    transition: 'box-shadow 0.18s, border-color 0.18s',
                                    ...(card.onClick && {
                                        cursor: 'pointer',
                                        '&:hover': {
                                            boxShadow: `0 4px 20px 0 ${cfg.hoverShadow}`,
                                            borderColor: cfg.hoverBorder,
                                        },
                                    }),
                                }}
                            >
                                <CardContent>
                                    <Stack spacing={1.5}>
                                        <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                                            <Box
                                                sx={{
                                                    width: 44,
                                                    height: 44,
                                                    borderRadius: 1.5,
                                                    bgcolor: cfg.bg,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: cfg.iconColor,
                                                }}
                                            >
                                                {card.icon}
                                            </Box>
                                            {card.onClick && (
                                                <ArrowForwardIosIcon sx={{ fontSize: 13, color: 'text.disabled', mt: 0.5 }} />
                                            )}
                                        </Stack>
                                        <Stack spacing={0.45}>
                                            <Typography
                                                variant="body2"
                                                color="text.secondary"
                                                sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}
                                            >
                                                {card.title}
                                            </Typography>
                                            <Typography
                                                variant="h5"
                                                fontWeight={800}
                                                sx={{ lineHeight: 1.08, letterSpacing: '-0.01em', color: 'text.primary' }}
                                            >
                                                {card.value}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                                                {card.subtitle}
                                            </Typography>
                                        </Stack>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid>
                    )
                })}
            </Grid>

            {!isAdmin && (
                <Paper
                    elevation={0}
                    sx={{
                        p: { xs: 2, md: 2.15 },
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 2,
                    }}
                >
                    <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        spacing={{ xs: 1.1, md: 1.5 }}
                        alignItems={{ xs: 'stretch', md: 'center' }}
                        justifyContent="space-between"
                    >
                        <Stack direction="row" spacing={1.1} alignItems="center" sx={{ minWidth: 0, flex: '1 1 auto' }}>
                            <Box
                                sx={{
                                    width: 38,
                                    height: 38,
                                    borderRadius: 1.5,
                                    bgcolor: 'rgba(15,118,110,0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#0f766e',
                                    flexShrink: 0,
                                }}
                            >
                                <EventAvailableIcon sx={{ fontSize: 20 }} />
                            </Box>
                            <Stack spacing={0.1} sx={{ minWidth: 0 }}>
                                <Typography variant="h6" fontWeight={700} lineHeight={1.15}>
                                    My Leave Hub
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                                    Requests, annual balance, other leaves &amp; history
                                </Typography>
                            </Stack>
                        </Stack>
                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={0.8}
                            flexWrap="wrap"
                            useFlexGap
                            sx={{ justifyContent: { md: 'flex-end' }, alignItems: { sm: 'center' } }}
                        >
                            <Button
                                variant="contained"
                                onClick={handleOpenMyLeave}
                                sx={{ textTransform: 'none', fontWeight: 700, px: 1.6, py: 0.72 }}
                            >
                                Open My Leave
                            </Button>
                            <Button
                                variant="outlined"
                                onClick={handleOpenOtherLeaves}
                                sx={{ textTransform: 'none', fontWeight: 600, borderColor: 'rgba(15, 23, 42, 0.14)', py: 0.72 }}
                            >
                                View Other Leaves
                            </Button>
                        </Stack>
                    </Stack>
                </Paper>
            )}
        </Stack>
    )

    if (!isAdmin) {
        return dashboardOverview
    }

    if (uiStore.adminSection === 'settings' || uiStore.adminSection === 'leave') {
        uiStore.navigateToAdminSection('leave-types')
        return null
    }

    if (uiStore.adminSection === 'users') {
        return (
            <Stack spacing={1.75}>
                {settingsHeader}
                {settingsLinks}
                <AdminUsersPanel />
            </Stack>
        )
    }

    if (uiStore.adminSection === 'leave-types') {
        return (
            <Stack spacing={1.75}>
                {settingsHeader}
                {settingsLinks}
                <LeaveTypesPanel />
            </Stack>
        )
    }

    if (uiStore.adminSection === 'departments') {
        return (
            <Stack spacing={1.75}>
                {settingsHeader}
                {settingsLinks}
                <DepartmentsPanel />
            </Stack>
        )
    }

    return dashboardOverview
})

export default DashboardHome
