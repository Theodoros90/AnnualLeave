import { observer } from 'mobx-react-lite'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { useStore } from '../../lib/mobx'

const navLinks = ['Dashboard', 'My Leave', 'Team Calendar']

const Navbar = observer(function Navbar() {
    const { authStore } = useStore()
    const roleLabel = authStore.user?.roles[0] ?? 'Guest'

    return (
        <AppBar position="sticky" color="transparent" elevation={0}>
            <Container maxWidth="lg">
                <Toolbar
                    disableGutters
                    sx={{
                        minHeight: 80,
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
                                sx={{
                                    px: 2,
                                    color: 'text.primary',
                                    fontWeight: 600,
                                    borderRadius: 999,
                                }}
                            >
                                {link}
                            </Button>
                        ))}
                    </Stack>

                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Chip
                            label={roleLabel}
                            color="secondary"
                            variant="outlined"
                            sx={{ display: { xs: 'none', sm: 'inline-flex' }, fontWeight: 600 }}
                        />
                        {authStore.isAuthenticated ? (
                            <Button variant="contained" disableElevation onClick={() => void authStore.signOut()}>
                                Sign out
                            </Button>
                        ) : (
                            <Button variant="contained" disableElevation>
                                Sign in
                            </Button>
                        )}
                    </Stack>
                </Toolbar>
            </Container>
        </AppBar>
    )
})

export default Navbar