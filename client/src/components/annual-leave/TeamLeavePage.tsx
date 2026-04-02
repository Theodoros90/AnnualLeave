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
import { getAnnualLeaves, getDepartments, getEmployeeProfiles, getLeaveStatusHistories } from '../../lib/api'
import type { AnnualLeave, UserInfo } from '../../lib/types'
import AnnualLeaveList from './AnnualLeaveList'

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

    const { data: histories = [], isLoading: isHistoryLoading, isError: isHistoryError } = useQuery({
        queryKey: ['leaveStatusHistories'],
        queryFn: getLeaveStatusHistories,
    })

    const isAdmin = user.roles.includes('Admin')

    const myProfile = profiles.find((profile) => profile.userId === user.id)
    const myDepartmentId = myProfile?.departmentId
    const myDepartmentName = departments.find((department) => department.id === myDepartmentId)?.name

    const teamLeaves = useMemo(() => annualLeaves, [annualLeaves])

    const teamMemberIds = useMemo(
        () => new Set(teamLeaves.map((leave) => leave.employeeId)),
        [teamLeaves]
    )

    // Admins see all employee profiles regardless of whether they have leave requests.
    // Managers only see profiles of people who have submitted leaves (existing behaviour).
    const teamProfiles = useMemo(
        () => isAdmin
            ? profiles.filter((profile) => profile.userId !== user.id)
            : profiles.filter((profile) => teamMemberIds.has(profile.userId)),
        [isAdmin, profiles, teamMemberIds, user.id]
    )

    const teamApprovalRequests = useMemo(
        () => teamLeaves.filter((leave) => leave.status === 'Pending'),
        [teamLeaves]
    )

    const teamEmployeeNameById = useMemo(() => {
        const map = new Map<string, string>()

        teamLeaves.forEach((leave) => {
            if (!map.has(leave.employeeId)) {
                map.set(leave.employeeId, leave.employeeName)
            }
        })

        return map
    }, [teamLeaves])

    const teamHistoryItems = useMemo(
        () => histories.slice().sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()),
        [histories]
    )

    const teamLeaveFilter = useMemo(() => {
        const visibleLeaveIds = new Set(teamLeaves.map((leave) => leave.id))
        return (leave: AnnualLeave) => visibleLeaveIds.has(leave.id)
    }, [teamLeaves])

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
                        Department leave requests for your team.
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
                                    badgeContent={teamApprovalRequests.length}
                                    color="error"
                                    max={99}
                                    invisible={teamApprovalRequests.length === 0}
                                >
                                    <Box sx={{ pr: teamApprovalRequests.length > 0 ? 1.5 : 0 }}>Approvals</Box>
                                </Badge>
                            }
                        />
                        <Tab label="Team Balances" />
                        <Tab label="Team History" />
                    </Tabs>
                </Paper>

                {teamTab === 0 && (
                    <AnnualLeaveList
                        user={user}
                        filterPredicate={teamLeaveFilter}
                        showCreateButton={false}
                        emptyMessage="No team leave requests found."
                    />
                )}

                {teamTab === 1 && (
                    <Stack spacing={2}>
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                            <Typography variant="h6" fontWeight={800}>
                                Approval Requests
                            </Typography>
                            <Chip
                                label={`${teamApprovalRequests.length} pending`}
                                color={teamApprovalRequests.length > 0 ? 'warning' : 'default'}
                                variant={teamApprovalRequests.length > 0 ? 'filled' : 'outlined'}
                                size="small"
                                sx={teamApprovalRequests.length > 0 ? { fontWeight: 700, fontSize: '0.8rem' } : {}}
                            />
                        </Stack>

                        {teamApprovalRequests.length > 0 && (
                            <Alert
                                severity="warning"
                                sx={{ fontWeight: 600 }}
                            >
                                {teamApprovalRequests.length === 1
                                    ? '1 leave request is awaiting your approval.'
                                    : `${teamApprovalRequests.length} leave requests are awaiting your approval.`}
                            </Alert>
                        )}

                        <AnnualLeaveList
                            user={user}
                            filterPredicate={(leave) => teamLeaveFilter(leave) && leave.status === 'Pending'}
                            showCreateButton={false}
                            emptyMessage="No pending approval requests."
                        />
                    </Stack>
                )}

                {teamTab === 2 && (
                    <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
                        <Stack spacing={1.25}>
                            {teamProfiles.length === 0 ? (
                                <Alert severity="info">No team balance data available.</Alert>
                            ) : (
                                teamProfiles.map((profile) => (
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
                                                <Chip label={`Balance: ${profile.leaveBalance} days`} color="primary" size="small" />
                                                <Chip
                                                    label={`Entitlement: ${profile.annualLeaveEntitlement} days`}
                                                    variant="outlined"
                                                    size="small"
                                                />
                                            </Stack>
                                        </Stack>
                                    </Box>
                                ))
                            )}
                        </Stack>
                    </Paper>
                )}

                {teamTab === 3 && (
                    <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
                        {isHistoryLoading && <Alert severity="info">Loading team history...</Alert>}
                        {isHistoryError && <Alert severity="error">Failed to load team history.</Alert>}

                        {!isHistoryLoading && !isHistoryError && teamHistoryItems.length === 0 && (
                            <Alert severity="info">No history entries found.</Alert>
                        )}

                        {!isHistoryLoading && !isHistoryError && teamHistoryItems.length > 0 && (
                            <Stack spacing={1.2}>
                                {teamHistoryItems.slice(0, 20).map((item) => {
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

export default TeamLeavePage
