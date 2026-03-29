import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
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

function RegisterForm() {
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
                        Create account
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Register a new viewer account and launch directly into the dashboard.
                    </Typography>
                </Stack>

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
                    variant="outlined"
                    size="large"
                    color="secondary"
                    disabled={mutation.isPending}
                    startIcon={mutation.isPending ? <CircularProgress size={18} color="inherit" /> : null}
                    sx={{ minHeight: 48 }}
                >
                    {mutation.isPending ? 'Creating account...' : 'Register'}
                </Button>

                <Box>
                    <Typography variant="caption" color="text.secondary">
                        New accounts are registered with the Viewer role by default.
                    </Typography>
                </Box>
            </Stack>
        </Paper>
    )
}

export default RegisterForm