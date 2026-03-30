import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { AxiosError } from 'axios'
import { useStore } from '../../lib/mobx'
import type { ApiErrorResponse, RegisterRequest } from '../../lib/types'

const initialValues: RegisterRequest = {
    email: '',
    password: '',
    displayName: '',
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

    return 'Unable to create your account. Please review the form and try again.'
}

interface RegisterFormProps {
    onSwitch: () => void
}

function RegisterForm({ onSwitch }: RegisterFormProps) {
    const { authStore } = useStore()
    const [values, setValues] = useState<RegisterRequest>(initialValues)

    const mutation = useMutation({
        mutationFn: authStore.signUp,
    })

    function handleChange(
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) {
        const { name, value } = event.target
        setValues((current) => ({ ...current, [name]: value }))
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
                            Create an account
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Join Annual Leave and manage your time off
                        </Typography>
                    </Stack>
                </Stack>

                <Divider />

                <TextField
                    label="Display name"
                    name="displayName"
                    value={values.displayName}
                    onChange={handleChange}
                    autoComplete="name"
                    required
                    fullWidth
                />

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
                    autoComplete="new-password"
                    helperText="Use at least 6 characters."
                    required
                    fullWidth
                />

                {mutation.isSuccess ? (
                    <Alert severity="success">Welcome, {mutation.data.displayName}.</Alert>
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
                    {mutation.isPending ? 'Creating account...' : 'Create account'}
                </Button>

                <Box>
                    <Typography variant="caption" color="text.secondary">
                        New accounts are registered with the Employee role by default.
                    </Typography>
                </Box>

                <Typography variant="body2" align="center" color="text.secondary">
                    Already have an account?{' '}
                    <Link component="button" type="button" variant="body2" onClick={onSwitch} underline="hover">
                        Sign in
                    </Link>
                </Typography>
            </Stack>
        </Paper>
    )
}

export default RegisterForm