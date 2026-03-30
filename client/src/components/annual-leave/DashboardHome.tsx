import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import {
    BarChart as BarChartIcon,
    Assignment as AssignmentIcon,
    PendingActions as PendingActionsIcon,
    Group as GroupIcon,
    ManageAccounts as ManageAccountsIcon,
    CorporateFare as CorporateFareIcon,
} from '@mui/icons-material'
import { getEmployeeProfiles } from '../../lib/api'
import { AdminUsersPanel, DepartmentsPanel } from '..'
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
}

function DashboardHome({ user }: DashboardHomeProps) {
    const isAdmin = user.roles.includes('Admin')
    const isManager = user.roles.includes('Manager')
    const isEmployee = user.roles.includes('Employee')
    const [adminTab, setAdminTab] = useState(0)

    const { data: profiles = [] } = useQuery({
        queryKey: ['employeeProfiles'],
        queryFn: getEmployeeProfiles,
    })

    const myProfile = profiles.find((p) => p.userId === user.id)
    const myBalance = myProfile?.leaveBalance ?? 22

    const getStatCards = (): StatCard[] => {
        const cards: StatCard[] = [
            {
                icon: <BarChartIcon sx={{ fontSize: 28 }} />,
                title: 'Your Balance',
                value: `${myBalance} days`,
                subtitle: 'Annual leave available',
                color: 'primary',
            },
        ]

        if (isManager || isAdmin) {
            cards.push({
                icon: <PendingActionsIcon sx={{ fontSize: 28 }} />,
                title: 'Pending Approvals',
                value: '3 requests',
                subtitle: 'Awaiting your review',
                color: 'warning',
            })
        }

        if (isAdmin) {
            cards.push({
                icon: <GroupIcon sx={{ fontSize: 28 }} />,
                title: 'Total Employees',
                value: '24',
                subtitle: 'Active users in system',
                color: 'success',
            })
        }

        if (isManager) {
            cards.push({
                icon: <GroupIcon sx={{ fontSize: 28 }} />,
                title: 'Team Away',
                value: '4 people',
                subtitle: 'This week',
                color: 'secondary',
            })
        }

        return cards
    }

    const statCards = getStatCards()

    return (
        <Stack spacing={4}>
            {/* Header Section */}
            <Paper
                elevation={0}
                sx={{
                    p: { xs: 3, md: 4 },
                    border: '1px solid',
                    borderColor: 'rgba(15, 23, 42, 0.08)',
                    background:
                        'linear-gradient(135deg, rgba(15,118,110,0.12), rgba(180,83,9,0.08))',
                }}
            >
                <Stack spacing={2}>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap">
                        <Stack spacing={1}>
                            <Typography variant="h3" component="h1">
                                Welcome back, {user.displayName}
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

            {/* Stats Cards */}
            <Grid container spacing={2}>
                {statCards.map((card) => (
                    <Grid key={card.title} xs={12} sm={6} md={3}>
                        <Card
                            elevation={0}
                            sx={{
                                border: '1px solid',
                                borderColor: 'rgba(15, 23, 42, 0.08)',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                            }}
                        >
                            <CardContent>
                                <Stack spacing={1.5}>
                                    <Box
                                        sx={{
                                            width: 44,
                                            height: 44,
                                            borderRadius: 1.5,
                                            bgcolor: `${card.color}.lighter`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: `${card.color}.main`,
                                        }}
                                    >
                                        {card.icon}
                                    </Box>
                                    <Stack spacing={0.5}>
                                        <Typography variant="overline" color="text.secondary" sx={{ fontSize: 11 }}>
                                            {card.title}
                                        </Typography>
                                        <Typography variant="h5">{card.value}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {card.subtitle}
                                        </Typography>
                                    </Stack>
                                </Stack>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            <Divider />

            {/* Admin tab nav */}
            {isAdmin ? (
                <Stack spacing={3}>
                    <Tabs
                        value={adminTab}
                        onChange={(_e, val: number) => setAdminTab(val)}
                        sx={{
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                            '& .MuiTab-root': { fontWeight: 600, textTransform: 'none', fontSize: 15, minHeight: 48 },
                        }}
                    >
                        <Tab icon={<AssignmentIcon sx={{ fontSize: 19 }} />} iconPosition="start" label="All Leave Requests" />
                        <Tab icon={<ManageAccountsIcon sx={{ fontSize: 19 }} />} iconPosition="start" label="User Management" />
                        <Tab icon={<CorporateFareIcon sx={{ fontSize: 19 }} />} iconPosition="start" label="Departments" />
                    </Tabs>

                    {adminTab === 0 && <AnnualLeaveList user={user} />}
                    {adminTab === 1 && <AdminUsersPanel />}
                    {adminTab === 2 && <DepartmentsPanel />}
                </Stack>
            ) : (
                <Stack spacing={2}>
                    <Typography variant="h6" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AssignmentIcon />
                        {isManager ? 'Team Leave Requests' : 'Your Leave Requests'}
                    </Typography>
                    <AnnualLeaveList user={user} />
                </Stack>
            )}
        </Stack>
    )
}

export default DashboardHome