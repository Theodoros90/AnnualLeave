import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { resetPassword } from '../../lib/api'
import { getApiErrorMessage } from '../../lib/api/error-utils'
import type { ResetPasswordRequest } from '../../lib/types'

function getErrorMessage(error: unknown) {
    return getApiErrorMessage(error, 'Unable to reset your password. Please request a new link and try again.')
}

interface ResetPasswordFormProps {
    onBackToLogin: () => void
    onRequestNewLink: () => void
}

function ResetPasswordForm({ onBackToLogin, onRequestNewLink }: ResetPasswordFormProps) {
    const searchParams = useMemo(() => new URLSearchParams(window.location.search), [])
    const initialEmail = searchParams.get('email') ?? ''
    const initialToken = searchParams.get('token') ?? ''

    const [values, setValues] = useState<ResetPasswordRequest>({
        email: initialEmail,
        token: initialToken,
        newPassword: '',
        confirmPassword: '',
    })

    const hasValidLink = Boolean(values.email && values.token)

    const mutation = useMutation({
        mutationFn: resetPassword,
        onSuccess: () => {
            window.history.replaceState({}, document.title, `${window.location.pathname}#login`)
        },
    })

    function handleChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
        const { name, value } = event.target
        setValues((current) => ({ ...current, [name]: value }))
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (!hasValidLink) {
            return
        }

        mutation.reset()
        await mutation.mutateAsync({
            ...values,
            email: values.email.trim(),
            token: values.token.trim(),
        })
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
                            Choose a new password
                        </Typography>
                        <Typography variant="body2" color="text.secondary" align="center">
                            Set a new password for your verified Annual Leave account.
                        </Typography>
                    </Stack>
                </Stack>

                <Divider />

                {!hasValidLink ? (
                    <Alert severity="error">
                        This password reset link is incomplete or expired. Please request a new reset email.
                    </Alert>
                ) : null}

                {mutation.isSuccess ? (
                    <Alert severity="success">
                        Your password has been reset successfully. You can now sign in with your new password.
                    </Alert>
                ) : null}

                {mutation.isError ? (
                    <Alert severity="error">{getErrorMessage(mutation.error)}</Alert>
                ) : null}

                <TextField
                    label="Email"
                    name="email"
                    type="email"
                    value={values.email}
                    onChange={handleChange}
                    autoComplete="email"
                    required
                    fullWidth
                    disabled={mutation.isSuccess}
                />

                <TextField
                    label="New password"
                    name="newPassword"
                    type="password"
                    value={values.newPassword}
                    onChange={handleChange}
                    autoComplete="new-password"
                    helperText="Use at least 6 characters."
                    required
                    fullWidth
                    disabled={!hasValidLink || mutation.isSuccess}
                />

                <TextField
                    label="Confirm new password"
                    name="confirmPassword"
                    type="password"
                    value={values.confirmPassword}
                    onChange={handleChange}
                    autoComplete="new-password"
                    required
                    fullWidth
                    disabled={!hasValidLink || mutation.isSuccess}
                />

                <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    fullWidth
                    disabled={mutation.isPending || !hasValidLink || mutation.isSuccess}
                    startIcon={mutation.isPending ? <CircularProgress size={18} color="inherit" /> : null}
                    sx={{ minHeight: 48, borderRadius: 2 }}
                >
                    {mutation.isPending ? 'Resetting password...' : 'Reset password'}
                </Button>

                <Typography variant="body2" align="center" color="text.secondary">
                    {mutation.isSuccess ? 'Ready to continue?' : 'Need another link?'}{' '}
                    <Link
                        component="button"
                        type="button"
                        variant="body2"
                        onClick={mutation.isSuccess ? onBackToLogin : onRequestNewLink}
                        underline="hover"
                    >
                        {mutation.isSuccess ? 'Go to sign in' : 'Request a new reset email'}
                    </Link>
                </Typography>
            </Stack>
        </Paper>
    )
}

export default ResetPasswordForm
