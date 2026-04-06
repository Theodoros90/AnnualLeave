import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import type { SxProps, Theme } from '@mui/material/styles'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { getApiErrorMessage } from '../../lib/api/error-utils'
import { useStore } from '../../lib/mobx'
import type { LoginRequest } from '../../lib/types'

const initialValues: LoginRequest = {
    email: '',
    password: '',
    rememberMe: false,
}

const socialReturnUrl = encodeURIComponent(`${window.location.origin}/#dashboard`)
const googleLoginUrl = `https://localhost:5001/api/account/external-login/google?returnUrl=${socialReturnUrl}`
const githubLoginUrl = `https://localhost:5001/api/account/external-login/github?returnUrl=${socialReturnUrl}`

const socialButtonSx: SxProps<Theme> = {
    minHeight: 48,
    borderRadius: 2,
    justifyContent: 'flex-start',
    textTransform: 'none',
    fontWeight: 600,
}

function GoogleIcon() {
    return (
        <Box
            component="svg"
            viewBox="0 0 24 24"
            aria-hidden="true"
            sx={{ width: 20, height: 20 }}
        >
            <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-.8 2.3-1.7 3l2.8 2.2c1.7-1.5 2.6-3.8 2.6-6.5 0-.6-.1-1.1-.2-1.6H12Z" />
            <path fill="#34A853" d="M12 21c2.4 0 4.4-.8 5.9-2.1l-2.8-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.2-3.8l-2.9 2.2C5.4 19 8.4 21 12 21Z" />
            <path fill="#FBBC05" d="M6.8 13.8c-.2-.5-.3-1.1-.3-1.8s.1-1.2.3-1.8L3.9 8C3.3 9.2 3 10.6 3 12s.3 2.8.9 4l2.9-2.2Z" />
            <path fill="#4285F4" d="M12 6.4c1.3 0 2.5.5 3.5 1.4l2.6-2.6C16.4 3.7 14.4 3 12 3 8.4 3 5.4 5 3.9 8l2.9 2.2c.8-2.2 2.8-3.8 5.2-3.8Z" />
        </Box>
    )
}

function GitHubIcon() {
    return (
        <Box
            component="svg"
            viewBox="0 0 24 24"
            aria-hidden="true"
            sx={{ width: 20, height: 20 }}
        >
            <path
                fill="currentColor"
                d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.7.5.1.66-.22.66-.49 0-.24-.01-1.03-.01-1.87-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.05 1.53 1.05.9 1.57 2.35 1.12 2.92.86.09-.67.35-1.12.63-1.38-2.22-.26-4.55-1.14-4.55-5.08 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.27 2.75 1.05A9.32 9.32 0 0 1 12 6.84c.85 0 1.71.12 2.51.35 1.9-1.32 2.74-1.05 2.74-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.95-2.33 4.81-4.56 5.07.36.32.68.95.68 1.92 0 1.39-.01 2.5-.01 2.84 0 .27.17.6.67.49A10.25 10.25 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z"
            />
        </Box>
    )
}

function getErrorMessage(error: unknown) {
    return getApiErrorMessage(error, 'Unable to sign in. Please check your details and try again.')
}

interface LoginFormProps {
    onSwitch: () => void
    onForgotPassword: () => void
}

function LoginForm({ onSwitch, onForgotPassword }: LoginFormProps) {
    const { authStore } = useStore()
    const queryClient = useQueryClient()
    const [values, setValues] = useState<LoginRequest>(initialValues)

    const mutation = useMutation({
        mutationFn: authStore.signIn,
    })

    function handleChange(
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) {
        const { name, value } = event.target
        setValues((current) => ({ ...current, [name]: value }))
    }

    function handleRememberMeChange(event: React.ChangeEvent<HTMLInputElement>) {
        setValues((current) => ({ ...current, rememberMe: event.target.checked }))
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        mutation.reset()
        await mutation.mutateAsync(values)
        await queryClient.cancelQueries()
        queryClient.clear()
        window.location.hash = '#dashboard'
        window.location.reload()
        setValues(initialValues)
    }

    return (
        <Paper
            elevation={3}
            sx={{
                p: { xs: 4, md: 5 },
                borderRadius: 3,
                bgcolor: 'background.paper',
            }}
        >
            <Stack spacing={3} component="form" onSubmit={handleSubmit} noValidate>
                <Stack spacing={2} alignItems="center">
                    <Avatar
                        variant="rounded"
                        sx={{ width: 52, height: 52, bgcolor: 'primary.main', fontWeight: 700, fontSize: 18 }}
                    >
                        AL
                    </Avatar>
                    <Stack spacing={0.5} alignItems="center">
                        <Typography variant="h5" fontWeight={700}>
                            Welcome back
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Sign in to your Annual Leave account
                        </Typography>
                    </Stack>
                </Stack>

                <Divider />

                <Stack spacing={1.5}>
                    <Button
                        component="a"
                        href={googleLoginUrl}
                        variant="outlined"
                        fullWidth
                        startIcon={<GoogleIcon />}
                        sx={socialButtonSx}
                    >
                        Continue with Google
                    </Button>
                    <Button
                        component="a"
                        href={githubLoginUrl}
                        variant="outlined"
                        fullWidth
                        startIcon={<GitHubIcon />}
                        sx={socialButtonSx}
                    >
                        Continue with GitHub
                    </Button>
                </Stack>

                <Divider>or continue with email</Divider>

                <TextField
                    label="Email"
                    name="email"
                    type="email"
                    value={values.email}
                    onChange={handleChange}
                    autoComplete="email"
                    required
                    fullWidth
                />

                <TextField
                    label="Password"
                    name="password"
                    type="password"
                    value={values.password}
                    onChange={handleChange}
                    autoComplete="current-password"
                    required
                    fullWidth
                />

                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1}>
                    <FormControlLabel
                        control={<Checkbox checked={values.rememberMe} onChange={handleRememberMeChange} />}
                        label="Keep me signed in"
                    />
                    <Link component="button" type="button" variant="body2" onClick={onForgotPassword} underline="hover">
                        Forgot password?
                    </Link>
                </Stack>

                {mutation.isSuccess ? (
                    <Alert severity="success">Welcome back, {mutation.data.displayName}.</Alert>
                ) : null}

                {mutation.isError ? (
                    <Alert severity="error">{getErrorMessage(mutation.error)}</Alert>
                ) : null}

                <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    fullWidth
                    disabled={mutation.isPending}
                    startIcon={mutation.isPending ? <CircularProgress size={18} color="inherit" /> : null}
                    sx={{ minHeight: 48, borderRadius: 2 }}
                >
                    {mutation.isPending ? 'Signing in...' : 'Sign in'}
                </Button>

                <Box>
                    <Typography variant="caption" color="text.secondary">
                        Demo account: admin@annualleave.com / Pa$$w0rd
                    </Typography>
                </Box>

                <Typography variant="body2" align="center" color="text.secondary">
                    Don&apos;t have an account?{' '}
                    <Link component="button" type="button" variant="body2" onClick={onSwitch} underline="hover">
                        Register
                    </Link>
                </Typography>
            </Stack>
        </Paper>
    )
}

export default LoginForm