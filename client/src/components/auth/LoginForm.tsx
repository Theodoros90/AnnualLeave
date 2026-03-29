import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { AxiosError } from 'axios'
import { useStore } from '../../lib/mobx'
import type { ApiErrorResponse, LoginRequest } from '../../lib/types'

const initialValues: LoginRequest = {
    email: '',
    password: '',
    rememberMe: false,
}

function getErrorMessage(error: unknown) {
    if (error instanceof AxiosError) {
        const apiError = error.response?.data as ApiErrorResponse | undefined

        if (apiError?.errors?.length) {
            return apiError.errors.join(' ')
        }

        if (apiError?.message) {
            return apiError.message
        }
    }

    return 'Unable to sign in. Please check your details and try again.'
}

function LoginForm() {
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
            elevation={0}
            sx={{
                p: { xs: 3, md: 4 },
                border: '1px solid',
                borderColor: 'rgba(15, 23, 42, 0.08)',
                bgcolor: 'background.paper',
            }}
        >
            <Stack spacing={3} component="form" onSubmit={handleSubmit} noValidate>
                <Stack spacing={1}>
                    <Typography variant="h5" component="h2">
                        Sign in
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Access your leave dashboard, requests, and approvals.
                    </Typography>
                </Stack>

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
                    disabled={mutation.isPending}
                    startIcon={mutation.isPending ? <CircularProgress size={18} color="inherit" /> : null}
                    sx={{ minHeight: 48 }}
                >
                    {mutation.isPending ? 'Signing in...' : 'Sign in'}
                </Button>

                <Box>
                    <Typography variant="caption" color="text.secondary">
                        Demo account: admin@annualleave.com / Pa$$w0rd
                    </Typography>
                </Box>
            </Stack>
        </Paper>
    )
}

export default LoginForm