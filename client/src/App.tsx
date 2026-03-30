import { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { DashboardHome, LoginForm, Navbar, RegisterForm } from './components'
import { useStore } from './lib/mobx'

const App = observer(function App() {
  const { authStore, uiStore } = useStore()

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
      <Navbar />

      <Container component="main" maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        {authStore.user ? (
          <DashboardHome user={authStore.user} />
        ) : (
          <Box
            sx={{
              display: 'grid',
              gap: 4,
              alignItems: 'start',
              gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.2fr) minmax(360px, 420px)' },
            }}
          >
            <Paper
              elevation={0}
              sx={{
                p: { xs: 4, md: 6 },
                border: '1px solid',
                borderColor: 'rgba(15, 23, 42, 0.08)',
                background:
                  'linear-gradient(135deg, rgba(15,118,110,0.08), rgba(180,83,9,0.08))',
              }}
            >
              <Stack spacing={3} alignItems="flex-start">
                <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                  <Chip label="Material UI ready" color="primary" />
                  <Chip label="React Query ready" variant="outlined" color="secondary" />
                  <Chip
                    label={uiStore.isCreateDrawerOpen ? 'MobX state active' : 'MobX ready'}
                    variant="outlined"
                  />
                </Stack>

                <Stack spacing={1.5}>
                  <Typography variant="h3" component="h1">
                    Manage leave without email chains
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    Centralize requests, approval steps, and team visibility in one
                    workspace built for the Annual Leave app.
                  </Typography>
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <Button
                    variant="contained"
                    size="large"
                    onClick={() => uiStore.toggleCreateDrawer()}
                  >
                    Create Leave Request
                  </Button>
                  <Button variant="outlined" size="large" color="secondary">
                    View Leave History
                  </Button>
                </Stack>

                <Divider flexItem />

                <Stack spacing={2} sx={{ width: '100%' }}>
                  <Typography variant="overline" color="text.secondary">
                    What this starter already includes
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap flexWrap="wrap">
                    <Paper elevation={0} sx={{ p: 2.5, flex: '1 1 180px', bgcolor: 'rgba(255,255,255,0.72)' }}>
                      <Typography variant="subtitle1">Secure HTTPS dev flow</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Vite runs locally with HTTPS and is ready to talk to the API.
                      </Typography>
                    </Paper>
                    <Paper elevation={0} sx={{ p: 2.5, flex: '1 1 180px', bgcolor: 'rgba(255,255,255,0.72)' }}>
                      <Typography variant="subtitle1">Typed API foundation</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Axios, shared types, and React Query are already wired in.
                      </Typography>
                    </Paper>
                  </Stack>
                </Stack>

                {uiStore.isCreateDrawerOpen ? (
                  <Paper
                    elevation={0}
                    sx={{
                      width: '100%',
                      p: 3,
                      bgcolor: 'background.paper',
                      border: '1px solid',
                      borderColor: 'rgba(15, 23, 42, 0.08)',
                    }}
                  >
                    <Stack spacing={1.5}>
                      <Typography variant="h6">Create request panel</Typography>
                      <Typography variant="body2" color="text.secondary">
                        This panel is controlled by MobX and is ready for form state or UI-only
                        interactions.
                      </Typography>
                    </Stack>
                  </Paper>
                ) : null}
              </Stack>
            </Paper>

            <Stack spacing={3}>
              <LoginForm />
              <RegisterForm />
            </Stack>
          </Box>
        )}
      </Container>
    </Box>
  )
})

export default App
