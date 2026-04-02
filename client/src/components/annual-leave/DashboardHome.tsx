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
import { getAdminUsers, getAnnualLeaves, getDepartments, getEmployeeProfiles, getTeamAwayThisWeekCount } from '../../lib/api'
import { useStore } from '../../lib/mobx'
import { AdminUsersPanel, DepartmentsPanel, LeaveTypesPanel } from '..'
import type { UserInfo } from '../../lib/types'
import AnnualLeaveList from './AnnualLeaveList'

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
        enabled: isManager || isAdmin,
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
    const myBalance = myProfile?.leaveBalance ?? 22
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
            subtitle: 'Annual leave available',
            color: 'primary',
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

    const handleApplyLeave = () => {
        uiStore.navigateToMyLeave('apply')
        uiStore.openCreateDrawer()
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

    const dashboardOverview = (
        <Stack spacing={4} id="dashboard-section">
            <Paper
                elevation={0}
                sx={{
                    p: { xs: 3, md: 4 },
                    border: '1px solid',
                    borderColor: 'rgba(15, 23, 42, 0.08)',
                    background: 'linear-gradient(135deg, rgba(15,118,110,0.12), rgba(180,83,9,0.08))',
                }}
            >
                <Stack spacing={2}>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap">
                        <Stack spacing={1}>
                            <Typography variant="h3" component="h1">
                                Welcome back, {user.displayName}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" fontWeight={500}>
                                {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                            </Typography>
                            <Typography variant="body1" color="text.secondary">
                                {isAdmin && 'You have administrator access to the system.'}
                                {isManager && !isAdmin && 'Manage your team\'s leave requests and approvals.'}
                                {isEmployee && !isManager && 'Submit and track your annual leave requests.'}
                            </Typography>
                        </Stack>
                        <Chip
                            label={user.roles.join(', ')}
                            color="secondary"
                            variant="outlined"
                            sx={{ height: 32 }}
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
                                        <Stack spacing={0.5}>
                                            <Typography variant="overline" color="text.secondary" sx={{ fontSize: 11 }}>
                                                {card.title}
                                            </Typography>
                                            <Typography variant="h5" fontWeight={700}>{card.value}</Typography>
                                            <Typography variant="caption" color="text.secondary">
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
                <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                    <Stack spacing={2.5}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <Box
                                sx={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 1.5,
                                    bgcolor: 'rgba(15,118,110,0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#0f766e',
                                    flexShrink: 0,
                                }}
                            >
                                <EventAvailableIcon sx={{ fontSize: 24 }} />
                            </Box>
                            <Stack spacing={0}>
                                <Typography variant="h6" fontWeight={700} lineHeight={1.3}>
                                    My Leave Hub
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Requests, balances &amp; history
                                </Typography>
                            </Stack>
                        </Stack>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                            <Button variant="contained" onClick={handleOpenMyLeave} sx={{ textTransform: 'none', fontWeight: 600 }}>
                                Open My Leave
                            </Button>
                            <Button variant="outlined" onClick={handleApplyLeave} sx={{ textTransform: 'none', fontWeight: 600 }}>
                                Apply for Leave
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
            <Stack spacing={2.5}>
                <Typography variant="h5" fontWeight={800}>Settings</Typography>
                {settingsLinks}
                <AdminUsersPanel />
            </Stack>
        )
    }

    if (uiStore.adminSection === 'leave-types') {
        return (
            <Stack spacing={2.5}>
                <Typography variant="h5" fontWeight={800}>Settings</Typography>
                {settingsLinks}
                <LeaveTypesPanel />
            </Stack>
        )
    }

    if (uiStore.adminSection === 'departments') {
        return (
            <Stack spacing={2.5}>
                <Typography variant="h5" fontWeight={800}>Settings</Typography>
                {settingsLinks}
                <DepartmentsPanel />
            </Stack>
        )
    }

    return dashboardOverview
})

export default DashboardHome
