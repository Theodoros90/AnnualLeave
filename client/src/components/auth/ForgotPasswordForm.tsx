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
import { forgotPassword } from '../../lib/api'
import { getApiErrorMessage } from '../../lib/api/error-utils'
import type { ForgotPasswordRequest } from '../../lib/types'

const initialValues: ForgotPasswordRequest = {
    email: '',
}

function getErrorMessage(error: unknown) {
    return getApiErrorMessage(error, 'We could not send a password reset link. Please try again.')
}

interface ForgotPasswordFormProps {
    onBackToLogin: () => void
}

function ForgotPasswordForm({ onBackToLogin }: ForgotPasswordFormProps) {
    const [values, setValues] = useState<ForgotPasswordRequest>(initialValues)
    const [submittedEmail, setSubmittedEmail] = useState('')

    const mutation = useMutation({
        mutationFn: forgotPassword,
    })

    function handleChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
        const { name, value } = event.target
        setValues((current) => ({ ...current, [name]: value }))
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        mutation.reset()

        const email = values.email.trim()
        await mutation.mutateAsync({ email })
        setSubmittedEmail(email)
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
                            Reset your password
                        </Typography>
                        <Typography variant="body2" color="text.secondary" align="center">
                            Enter your verified email address and we&apos;ll send you a secure reset link.
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

                {mutation.isSuccess ? (
                    <Alert severity="success">
                        If <strong>{submittedEmail || 'that email address'}</strong> is registered and verified, a password reset link has been sent.
                    </Alert>
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
                    {mutation.isPending ? 'Sending reset link...' : 'Send reset link'}
                </Button>

                <Box>
                    <Typography variant="caption" color="text.secondary">
                        For security, we only send reset links to verified email addresses.
                    </Typography>
                </Box>

                <Typography variant="body2" align="center" color="text.secondary">
                    Remembered your password?{' '}
                    <Link component="button" type="button" variant="body2" onClick={onBackToLogin} underline="hover">
                        Back to sign in
                    </Link>
                </Typography>
            </Stack>
        </Paper>
    )
}

export default ForgotPasswordForm
