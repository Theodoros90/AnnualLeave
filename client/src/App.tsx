import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'
import { observer } from 'mobx-react-lite'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { AuthPage, DashboardHome, MyLeavePage, ApplyLeavePage, TeamLeavePage, TeamTimesheetPage, MyTimesheetPage } from './components'
import { API_ERROR_EVENT } from './lib/api/error-events'
import { apiBaseUrl } from './lib/api/client'
import { useStore } from './lib/mobx'
import type { MyLeaveSection } from './lib/mobx/uiStore'
import Sidebar from './components/layout/Sidebar'
import Topbar from './components/layout/Topbar'

function getSectionFromHash(hash: string): MyLeaveSection | null {
  if (hash === '#apply-for-leave') return 'apply'
  if (hash === '#my-requests') return 'requests'
  if (hash === '#leave-balance') return 'balance'
  if (hash === '#other-leaves') return 'other'
  if (hash === '#leave-history') return 'history'
  return null
}

function isTeamLeaveHash(hash: string) {
  return hash === '#team-leave' || hash === '#team-leave-approvals'
}

function getAdminSectionFromHash(hash: string) {
  if (hash === '#admin-settings') return 'leave-types' as const
  if (hash === '#admin-leave') return 'leave-types' as const
  if (hash === '#admin-leave-types') return 'leave-types' as const
  if (hash === '#admin-departments') return 'departments' as const
  if (hash === '#admin-users') return 'users' as const
  if (hash === '#admin-projects') return 'projects' as const
  return null
}

function getAuthViewFromHash(hash: string): 'login' | 'register' | 'forgot-password' | 'reset-password' {
  const [route] = hash.split('?')

  if (route === '#register') return 'register'
  if (route === '#forgot-password') return 'forgot-password'
  if (route === '#reset-password') return 'reset-password'

  return 'login'
}

const App = observer(function App() {
  const { authStore, uiStore } = useStore()
  const queryClient = useQueryClient()
  const [authView, setAuthView] = useState<'login' | 'register' | 'forgot-password' | 'reset-password'>(() => getAuthViewFromHash(window.location.hash))
  const [authNotice, setAuthNotice] = useState<{ severity: 'success' | 'info' | 'error'; message: string } | null>(null)
  const [apiErrorOpen, setApiErrorOpen] = useState(false)
  const [apiErrorMessage, setApiErrorMessage] = useState('')

  useEffect(() => {
    void authStore.hydrateUser()
  }, [authStore])

  useEffect(() => {
    if (authStore.user) {
      return
    }

    const syncAuthViewFromHash = () => {
      setAuthView(getAuthViewFromHash(window.location.hash))
    }

    syncAuthViewFromHash()
    window.addEventListener('hashchange', syncAuthViewFromHash)

    return () => {
      window.removeEventListener('hashchange', syncAuthViewFromHash)
    }
  }, [authStore.user])

  useEffect(() => {
    if (authStore.user) {
      return
    }

    const params = new URLSearchParams(window.location.search)
    const authStatus = params.get('authStatus')
    const authMessage = params.get('authMessage')?.trim()

    if (!authStatus && !authMessage) {
      return
    }

    setAuthNotice({
      severity: authStatus === 'error' ? 'error' : authStatus === 'info' ? 'info' : 'success',
      message: authMessage || 'Your account status has been updated. You can now continue.',
    })

    params.delete('authStatus')
    params.delete('authMessage')
    const query = params.toString()
    const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    window.history.replaceState({}, document.title, cleanUrl)
  }, [authStore.user])

  useEffect(() => {
    if (!authStore.user) {
      return
    }

    const syncFromHash = () => {
      if (window.location.hash === '#dashboard') {
        uiStore.navigateToDashboard()
        return
      }

      if (isTeamLeaveHash(window.location.hash)) {
        uiStore.navigateToTeamLeave()
        return
      }

      const adminSection = getAdminSectionFromHash(window.location.hash)

      if (adminSection) {
        uiStore.navigateToAdminSection(adminSection)
        return
      }

      const section = getSectionFromHash(window.location.hash)

      if (section) {
        const isAdminUser = authStore.user?.roles?.includes('Admin') ?? false

        if (section === 'apply' && isAdminUser) {
          uiStore.navigateToMyLeave('requests')
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#my-requests`)
          return
        }

        uiStore.navigateToMyLeave(section)
        return
      }

      uiStore.navigateToDashboard()
    }

    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)

    return () => {
      window.removeEventListener('hashchange', syncFromHash)
    }
  }, [authStore.user, uiStore])

  useEffect(() => {
    let lastMessage = ''
    let lastAt = 0

    const compactMessage = (message: string) => {
      const firstSentence = message.split('. ')[0]?.trim() ?? message.trim()
      const normalized = firstSentence.endsWith('.') ? firstSentence : `${firstSentence}.`
      return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized
    }

    const onApiError = (event: Event) => {
      const customEvent = event as CustomEvent<{ message?: string }>
      const message = customEvent.detail?.message?.trim()

      if (!message) {
        return
      }

      const compact = compactMessage(message)

      const now = Date.now()
      if (compact === lastMessage && now - lastAt < 2000) {
        return
      }

      lastMessage = compact
      lastAt = now
      setApiErrorMessage(compact)
      setApiErrorOpen(true)
    }

    window.addEventListener(API_ERROR_EVENT, onApiError as EventListener)
    return () => window.removeEventListener(API_ERROR_EVENT, onApiError as EventListener)
  }, [])

  useEffect(() => {
    if (!authStore.user) {
      return
    }

    const hubBaseUrl = apiBaseUrl.endsWith('/api') ? apiBaseUrl.slice(0, -4) : apiBaseUrl
    const connection = new HubConnectionBuilder()
      .withUrl(`${hubBaseUrl}/hubs/notifications`, { withCredentials: true })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build()

    connection.on('notificationsUpdated', () => {
      void queryClient.invalidateQueries({ queryKey: ['leaveStatusHistories'] })
      void queryClient.invalidateQueries({ queryKey: ['annualLeaves'] })
      void queryClient.invalidateQueries({ queryKey: ['teamAwayThisWeekCount'] })
    })

    void connection.start().catch(() => {
      // Keep polling as fallback if realtime connect fails.
    })

    return () => {
      connection.off('notificationsUpdated')
      void connection.stop()
    }
  }, [authStore.user, queryClient])

  const isAdminSettingsPage = Boolean(
    authStore.user
    && uiStore.currentPage === 'dashboard'
    && ['settings', 'leave', 'leave-types', 'departments', 'users', 'projects'].includes(uiStore.adminSection)
  )

  if (!authStore.hasCheckedAuth && authStore.isLoadingUser) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'background.default',
        }}
      >
        <Stack spacing={2} alignItems="center">
          <CircularProgress />
          <Typography color="text.secondary">Loading your workspace...</Typography>
        </Stack>
      </Box>
    )
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex' }}>
      {authStore.user && <Sidebar />}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {authStore.user && <Topbar />}
        {authStore.user ? (
          <Container
            component="main"
            maxWidth="lg"
            sx={{ pt: 3, pb: 4 }}
          >
            {uiStore.currentPage === 'my-leave' && <MyLeavePage user={authStore.user} />}
            {uiStore.currentPage === 'apply-leave' && <ApplyLeavePage user={authStore.user} />}
            {uiStore.currentPage === 'team-leave' && <TeamLeavePage user={authStore.user} />}
            {uiStore.currentPage === 'dashboard' && <DashboardHome user={authStore.user} />}
            {uiStore.currentPage === 'timesheets' && (
                authStore.user.roles.includes('Admin')
                    ? <TeamTimesheetPage user={authStore.user} />
                    : <MyTimesheetPage user={authStore.user} />
            )}
            {uiStore.currentPage === 'team-timesheets' && <TeamTimesheetPage user={authStore.user} />}
          </Container>
        ) : (
          <AuthPage
            authView={authView}
            authNotice={authNotice}
            onClearNotice={() => setAuthNotice(null)}
            onSwitchToLogin={() => { setAuthView('login'); window.location.hash = '#login' }}
            onSwitchToRegister={() => { setAuthView('register'); window.location.hash = '#register' }}
            onForgotPassword={() => { setAuthView('forgot-password'); window.location.hash = '#forgot-password' }}
            onBackToLogin={() => { setAuthView('login'); window.location.hash = '#login' }}
            onRequestNewLink={() => { setAuthView('forgot-password'); window.location.hash = '#forgot-password' }}
          />
        )}

        <Snackbar
          open={apiErrorOpen}
          autoHideDuration={4500}
          onClose={() => setApiErrorOpen(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert onClose={() => setApiErrorOpen(false)} severity="error" variant="filled" sx={{ width: '100%' }}>
            {apiErrorMessage}
          </Alert>
        </Snackbar>
      </Box>
    </Box>
  )
})

export default App
