import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { observer } from 'mobx-react-lite'
import CircleRoundedIcon from '@mui/icons-material/CircleRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { getLeaveStatusHistories } from '../../lib/api'
import { useStore } from '../../lib/mobx'

const employeeNavLinks = ['Dashboard', 'My Leave']

const managerNavLinks = ['Dashboard', 'My Leave', 'Team Leave']

const adminNavLinks = [
    'Dashboard',
    'Leave',
    'Departments',
    'Users',
]

function getRoleBasedNavLinks(roles: string[] | undefined) {
    if (!roles?.length) {
        return ['Dashboard']
    }

    if (roles.includes('Admin')) {
        return adminNavLinks
    }

    if (roles.includes('Manager')) {
        return managerNavLinks
    }

    return employeeNavLinks
}

const recentWindowDays = 7

function scrollToElementById(elementId: string) {
    const target = document.getElementById(elementId)

    if (!target) {
        return
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function formatChangedAt(changedAt: string) {
    const date = new Date(changedAt)

    if (Number.isNaN(date.getTime())) {
        return 'Recently'
    }

    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(date)
}

const Navbar = observer(function Navbar() {
    const { authStore, uiStore } = useStore()
    const isAdminUser = authStore.user?.roles?.includes('Admin') ?? false
    const navLinks = getRoleBasedNavLinks(authStore.user?.roles)
    const [notificationsAnchorEl, setNotificationsAnchorEl] = useState<null | HTMLElement>(null)
    const [profileAnchorEl, setProfileAnchorEl] = useState<null | HTMLElement>(null)
    const isNotificationsMenuOpen = Boolean(notificationsAnchorEl)
    const isProfileMenuOpen = Boolean(profileAnchorEl)

    const { data: statusHistories, isLoading: isLoadingNotifications } = useQuery({
        queryKey: ['leaveStatusHistories'],
        queryFn: getLeaveStatusHistories,
        enabled: authStore.isAuthenticated,
    })

    const sortedNotifications = (statusHistories ?? [])
        .slice()
        .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
        .slice(0, 6)

    const recentThreshold = Date.now() - recentWindowDays * 24 * 60 * 60 * 1000
    const unreadCount = sortedNotifications.filter((item) => new Date(item.changedAt).getTime() >= recentThreshold).length

    const displayName = authStore.user?.displayName ?? authStore.user?.userName ?? 'Guest'
    const initials = displayName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('')

    const handleOpenProfileMenu = (event: React.MouseEvent<HTMLElement>) => {
        setProfileAnchorEl(event.currentTarget)
    }

    const handleOpenNotificationsMenu = (event: React.MouseEvent<HTMLElement>) => {
        setNotificationsAnchorEl(event.currentTarget)
    }

    const handleCloseNotificationsMenu = () => {
        setNotificationsAnchorEl(null)
    }

    const handleCloseProfileMenu = () => {
        setProfileAnchorEl(null)
    }

    const handleApplyForLeave = () => {
        uiStore.navigateToMyLeave('apply')
        uiStore.openCreateDrawer()
    }

    const scrollToMyLeaveRequests = () => {
        window.setTimeout(() => {
            scrollToElementById('my-leave-requests')
        }, 100)
    }

    const handleMyRequestsClick = () => {
        uiStore.navigateToMyLeave('requests')
        scrollToMyLeaveRequests()
    }

    const handleDashboardClick = () => {
        uiStore.navigateToDashboard()
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#dashboard`)
    }

    const handleMyLeaveClick = () => {
        uiStore.navigateToMyLeave('requests')
        scrollToMyLeaveRequests()
    }

    const handleTeamLeaveClick = () => {
        uiStore.navigateToTeamLeave()
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#team-leave`)
    }

    const handleLeaveBalanceClick = () => {
        uiStore.navigateToMyLeave('balance')
    }

    const handleHistoryClick = () => {
        uiStore.navigateToMyLeave('history')
    }

    const handleAdminLeaveSectionClick = () => {
        uiStore.navigateToAdminSection('leave')
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#admin-leave`)
    }

    const handleAdminUsersSectionClick = () => {
        uiStore.navigateToAdminSection('users')
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#admin-users`)
    }

    const handleAdminDepartmentsSectionClick = () => {
        uiStore.navigateToAdminSection('departments')
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#admin-departments`)
    }

    const handleSignOut = async () => {
        handleCloseProfileMenu()
        await authStore.signOut()
        uiStore.resetAfterSignOut()
    }

    const isMyLeaveGroupLink = (link: string) =>
        ['My Leave', 'Apply for Leave', 'My Requests', 'Leave Balance', 'History'].includes(link)

    const isAdminLeaveLink = (link: string) =>
        ['Leave'].includes(link)

    const isAdminUsersLink = (link: string) =>
        ['Users'].includes(link)

    const isAdminDashboardLink = (link: string) =>
        [
            'Leave',
            'Departments',
            'Users',
        ].includes(link)

    const isLinkActive = (link: string) => {
        if (link === 'Dashboard') {
            if (isAdminUser) {
                return uiStore.currentPage === 'dashboard' && uiStore.adminSection === 'dashboard'
            }
            return uiStore.currentPage === 'dashboard'
        }

        if (isMyLeaveGroupLink(link)) {
            return uiStore.currentPage === 'my-leave'
        }

        if (link === 'Team Leave') {
            return uiStore.currentPage === 'team-leave'
        }

        if (link === 'Departments') {
            return uiStore.currentPage === 'dashboard' && uiStore.adminSection === 'departments'
        }

        if (isAdminUsersLink(link)) {
            return uiStore.currentPage === 'dashboard' && uiStore.adminSection === 'users'
        }

        if (isAdminLeaveLink(link)) {
            return uiStore.currentPage === 'dashboard' && (uiStore.adminSection === 'leave' || uiStore.adminSection === 'leave-types')
        }

        if (isAdminDashboardLink(link)) {
            return uiStore.currentPage === 'dashboard'
        }

        return false
    }

    const getNavLinkHandler = (link: string) => {
        if (link === 'Apply for Leave') return handleApplyForLeave
        if (link === 'My Requests') return handleMyRequestsClick
        if (link === 'Dashboard') return handleDashboardClick
        if (link === 'My Leave') return handleMyLeaveClick
        if (link === 'Team Leave') return handleTeamLeaveClick
        if (link === 'Leave Balance') return handleLeaveBalanceClick
        if (link === 'History') return handleHistoryClick
        if (link === 'Departments') return handleAdminDepartmentsSectionClick
        if (isAdminUsersLink(link)) return handleAdminUsersSectionClick
        if (isAdminLeaveLink(link)) return handleAdminLeaveSectionClick
        if (isAdminDashboardLink(link)) return handleDashboardClick
        return undefined
    }

    return (
        <AppBar
            position="sticky"
            color="transparent"
            elevation={0}
            sx={{
                backdropFilter: 'blur(8px)',
                backgroundColor: 'rgba(255, 255, 255, 0.82)',
                borderBottom: '1px solid',
                borderColor: 'rgba(15, 23, 42, 0.08)',
            }}
        >
            <Container maxWidth="lg" sx={{ px: { xs: 2, md: 3 } }}>
                <Toolbar
                    disableGutters
                    sx={{
                        minHeight: { xs: 72, md: 80 },
                        gap: 2,
                        justifyContent: 'space-between',
                    }}
                >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Avatar
                            variant="rounded"
                            sx={{
                                width: 44,
                                height: 44,
                                bgcolor: 'primary.main',
                                color: 'primary.contrastText',
                                fontWeight: 700,
                            }}
                        >
                            AL
                        </Avatar>

                        <Box>
                            <Typography variant="h6" component="div">
                                Annual Leave
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Leave planning and approvals
                            </Typography>
                        </Box>
                    </Stack>

                    <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{ display: { xs: 'none', md: 'flex' } }}
                    >
                        {navLinks.map((link) => (
                            <Button
                                key={link}
                                color="inherit"
                                onClick={getNavLinkHandler(link)}
                                sx={{
                                    px: 2,
                                    py: 0.8,
                                    color: isLinkActive(link) ? 'primary.dark' : 'text.primary',
                                    fontWeight: 600,
                                    fontSize: 14,
                                    textTransform: 'none',
                                    letterSpacing: 0,
                                    minWidth: 'auto',
                                    whiteSpace: 'nowrap',
                                    borderRadius: 999,
                                    border: '1px solid',
                                    borderColor: isLinkActive(link) ? 'rgba(15,118,110,0.25)' : 'transparent',
                                    bgcolor: isLinkActive(link)
                                        ? 'linear-gradient(135deg, rgba(15,118,110,0.18), rgba(20,83,45,0.08))'
                                        : 'transparent',
                                    '&:hover': {
                                        bgcolor: isLinkActive(link)
                                            ? 'linear-gradient(135deg, rgba(15,118,110,0.22), rgba(20,83,45,0.10))'
                                            : 'rgba(15, 23, 42, 0.04)',
                                    },
                                }}
                            >
                                {link}
                            </Button>
                        ))}
                    </Stack>

                    <Stack direction="row" spacing={1.5} alignItems="center">
                        {authStore.isAuthenticated ? (
                            <>
                                <Tooltip title="Notifications">
                                    <IconButton
                                        color="inherit"
                                        aria-label="notifications"
                                        onClick={handleOpenNotificationsMenu}
                                    >
                                        <Badge badgeContent={unreadCount} color="error">
                                            <NotificationsNoneRoundedIcon />
                                        </Badge>
                                    </IconButton>
                                </Tooltip>

                                <Menu
                                    anchorEl={notificationsAnchorEl}
                                    open={isNotificationsMenuOpen}
                                    onClose={handleCloseNotificationsMenu}
                                    transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                                    anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                                >
                                    <MenuItem disabled>
                                        <Typography variant="subtitle2" fontWeight={700}>
                                            Notifications
                                        </Typography>
                                    </MenuItem>
                                    <Divider />
                                    {isLoadingNotifications && (
                                        <MenuItem disabled>
                                            <ListItemText primary="Loading notifications..." />
                                        </MenuItem>
                                    )}
                                    {!isLoadingNotifications && sortedNotifications.length === 0 && (
                                        <MenuItem disabled>
                                            <ListItemText primary="No notifications yet" />
                                        </MenuItem>
                                    )}
                                    {!isLoadingNotifications &&
                                        sortedNotifications.map((item) => {
                                            const changedAt = new Date(item.changedAt).getTime()
                                            const isRecent = !Number.isNaN(changedAt) && changedAt >= recentThreshold

                                            return (
                                                <MenuItem key={item.id} onClick={handleCloseNotificationsMenu}>
                                                    <ListItemIcon>
                                                        <CircleRoundedIcon
                                                            sx={{ fontSize: 10, color: isRecent ? 'error.main' : 'divider' }}
                                                        />
                                                    </ListItemIcon>
                                                    <ListItemText
                                                        primary={`Status changed to ${item.newStatus}`}
                                                        secondary={`Updated ${formatChangedAt(item.changedAt)}`}
                                                    />
                                                </MenuItem>
                                            )
                                        })}
                                </Menu>

                                <Button
                                    variant="outlined"
                                    color="inherit"
                                    onClick={handleOpenProfileMenu}
                                    sx={{
                                        color: 'text.primary',
                                        borderColor: 'divider',
                                        borderRadius: 999,
                                        px: 1,
                                        py: 0.5,
                                        textTransform: 'none',
                                    }}
                                >
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Avatar sx={{ width: 32, height: 32, fontSize: 13 }}>{initials}</Avatar>
                                        <Typography
                                            variant="body2"
                                            fontWeight={600}
                                            sx={{ display: { xs: 'none', sm: 'inline' } }}
                                        >
                                            {displayName}
                                        </Typography>
                                    </Stack>
                                </Button>

                                <Menu
                                    anchorEl={profileAnchorEl}
                                    open={isProfileMenuOpen}
                                    onClose={handleCloseProfileMenu}
                                    transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                                    anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                                >
                                    <MenuItem disabled>
                                        <ListItemText
                                            primary={displayName}
                                            secondary={authStore.user?.email}
                                            slotProps={{
                                                primary: { fontWeight: 600 },
                                                secondary: { sx: { wordBreak: 'break-all' } },
                                            }}
                                        />
                                    </MenuItem>
                                    <Divider />
                                    <MenuItem onClick={() => void handleSignOut()}>
                                        <ListItemIcon>
                                            <LogoutRoundedIcon fontSize="small" />
                                        </ListItemIcon>
                                        Sign out
                                    </MenuItem>
                                </Menu>
                            </>
                        ) : (
                            <Button variant="contained" disableElevation>
                                Sign in
                            </Button>
                        )}
                    </Stack>
                </Toolbar>

                <Stack
                    direction="row"
                    spacing={0.75}
                    sx={{
                        display: { xs: 'flex', md: 'none' },
                        overflowX: 'auto',
                        pb: 1.25,
                        scrollbarWidth: 'none',
                        '&::-webkit-scrollbar': { display: 'none' },
                    }}
                >
                    {navLinks.map((link) => (
                        <Button
                            key={`mobile-${link}`}
                            onClick={getNavLinkHandler(link)}
                            sx={{
                                px: 1.5,
                                py: 0.55,
                                color: isLinkActive(link) ? 'primary.dark' : 'text.primary',
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: 13,
                                whiteSpace: 'nowrap',
                                borderRadius: 999,
                                border: '1px solid',
                                borderColor: isLinkActive(link) ? 'rgba(15,118,110,0.25)' : 'rgba(15, 23, 42, 0.08)',
                                bgcolor: isLinkActive(link)
                                    ? 'linear-gradient(135deg, rgba(15,118,110,0.18), rgba(20,83,45,0.08))'
                                    : 'rgba(255, 255, 255, 0.7)',
                            }}
                        >
                            {link}
                        </Button>
                    ))}
                </Stack>
            </Container>
        </AppBar>
    )
})

export default Navbar