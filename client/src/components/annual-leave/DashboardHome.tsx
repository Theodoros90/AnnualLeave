import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { UserInfo } from '../../lib/types'

type DashboardHomeProps = {
    user: UserInfo
}

const summaryCards = [
    {
        title: 'Available balance',
        value: '18 days',
        description: 'Current annual leave balance ready to request.',
    },
    {
        title: 'Pending approvals',
        value: '2 requests',
        description: 'Requests waiting for manager review.',
    },
    {
        title: 'Team away this week',
        value: '4 people',
        description: 'Shared visibility for near-term scheduling.',
    },
]

function DashboardHome({ user }: DashboardHomeProps) {
    return (
        <Stack spacing={4}>
            <Paper
                elevation={0}
                sx={{
                    p: { xs: 4, md: 5 },
                    border: '1px solid',
                    borderColor: 'rgba(15, 23, 42, 0.08)',
                    background:
                        'linear-gradient(135deg, rgba(15,118,110,0.12), rgba(180,83,9,0.08))',
                }}
            >
                <Stack spacing={2}>
                    <Chip label={user.roles.join(', ')} color="secondary" sx={{ alignSelf: 'flex-start' }} />
                    <Stack spacing={1}>
                        <Typography variant="h3" component="h1">
                            Welcome back, {user.displayName}
                        </Typography>
                        <Typography variant="body1" color="text.secondary">
                            Your account is authenticated with the API cookie. From here you can review
                            leave requests, track balances, and manage approvals.
                        </Typography>
                    </Stack>
                </Stack>
            </Paper>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} useFlexGap flexWrap="wrap">
                {summaryCards.map((card) => (
                    <Paper
                        key={card.title}
                        elevation={0}
                        sx={{
                            flex: '1 1 240px',
                            p: 3,
                            border: '1px solid',
                            borderColor: 'rgba(15, 23, 42, 0.08)',
                        }}
                    >
                        <Stack spacing={1}>
                            <Typography variant="overline" color="text.secondary">
                                {card.title}
                            </Typography>
                            <Typography variant="h5">{card.value}</Typography>
                            <Typography variant="body2" color="text.secondary">
                                {card.description}
                            </Typography>
                        </Stack>
                    </Paper>
                ))}
            </Stack>
        </Stack>
    )
}

export default DashboardHome