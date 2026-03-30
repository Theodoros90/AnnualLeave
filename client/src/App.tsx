import { useEffect, useState } from 'react'
import { observer } from 'mobx-react-lite'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { DashboardHome, LoginForm, Navbar, RegisterForm } from './components'
import { useStore } from './lib/mobx'

const App = observer(function App() {
  const { authStore } = useStore()
  const [authView, setAuthView] = useState<'login' | 'register'>('login')

  useEffect(() => {
    void authStore.hydrateUser()
  }, [authStore])

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
          <DashboardHome user={authStore.user} />
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
    </Box>
  )
})

export default App
