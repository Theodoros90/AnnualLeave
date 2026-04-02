import { useEffect, useState } from 'react'
import { observer } from 'mobx-react-lite'
import Alert from '@mui/material/Alert'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { DashboardHome, LoginForm, MyLeavePage, Navbar, RegisterForm, TeamLeavePage } from './components'
import { API_ERROR_EVENT } from './lib/api/error-events'
import { useStore } from './lib/mobx'
import type { MyLeaveSection } from './lib/mobx/uiStore'

function getSectionFromHash(hash: string): MyLeaveSection | null {
  if (hash === '#apply-for-leave') return 'apply'
  if (hash === '#my-requests') return 'requests'
  if (hash === '#leave-balance') return 'balance'
  if (hash === '#leave-history') return 'history'
  return null
}

function isTeamLeaveHash(hash: string) {
  return hash === '#team-leave'
}

function getAdminSectionFromHash(hash: string) {
  if (hash === '#admin-leave') return 'leave' as const
  if (hash === '#admin-leave-types') return 'leave-types' as const
  if (hash === '#admin-departments') return 'departments' as const
  if (hash === '#admin-users') return 'users' as const
  return null
}

const App = observer(function App() {
  const { authStore, uiStore } = useStore()
  const [authView, setAuthView] = useState<'login' | 'register'>('login')
  const [apiErrorOpen, setApiErrorOpen] = useState(false)
  const [apiErrorMessage, setApiErrorMessage] = useState('')

  useEffect(() => {
    void authStore.hydrateUser()
  }, [authStore])

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
        uiStore.navigateToMyLeave(section)
      }
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
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {authStore.user && <Navbar />}

      {authStore.user ? (
        <Container component="main" maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
          {uiStore.currentPage === 'my-leave' && <MyLeavePage user={authStore.user} />}
          {uiStore.currentPage === 'team-leave' && <TeamLeavePage user={authStore.user} />}
          {uiStore.currentPage === 'dashboard' && <DashboardHome user={authStore.user} />}
        </Container>
      ) : (
        <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'grey.50' }}>
          {/* Auth header */}
          <AppBar position="static" color="transparent" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
            <Container maxWidth="lg">
              <Toolbar disableGutters sx={{ minHeight: 64 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Avatar
                    variant="rounded"
                    sx={{ width: 38, height: 38, bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700, fontSize: 15 }}
                  >
                    AL
                  </Avatar>
                  <Box>
                    <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
                      Annual Leave
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Leave planning &amp; approvals
                    </Typography>
                  </Box>
                </Stack>
              </Toolbar>
            </Container>
          </AppBar>

          {/* Centered form */}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              py: 6,
              px: 2,
              background: 'linear-gradient(135deg, rgba(15,118,110,0.06) 0%, rgba(180,83,9,0.06) 100%)',
            }}
          >
            <Box sx={{ width: '100%', maxWidth: 440 }}>
              {authView === 'login'
                ? <LoginForm onSwitch={() => setAuthView('register')} />
                : <RegisterForm onSwitch={() => setAuthView('login')} />
              }
            </Box>
          </Box>
        </Box>
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
  )
})

export default App
