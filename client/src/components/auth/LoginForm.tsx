import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
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

function getErrorMessage(error: unknown) {
    return getApiErrorMessage(error, 'Unable to sign in. Please check your details and try again.')
}

interface LoginFormProps {
    onSwitch: () => void
}

function LoginForm({ onSwitch }: LoginFormProps) {
    const { authStore } = useStore()
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

                <FormControlLabel
                    control={<Checkbox checked={values.rememberMe} onChange={handleRememberMeChange} />}
                    label="Keep me signed in"
                />

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