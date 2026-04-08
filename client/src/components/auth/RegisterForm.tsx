import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import type { SxProps, Theme } from '@mui/material/styles'
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { getDepartments } from '../../lib/api'
import { getApiErrorMessage } from '../../lib/api/error-utils'
import { useStore } from '../../lib/mobx'
import type { Department, RegisterRequest } from '../../lib/types'

const initialValues: RegisterRequest = {
    email: '',
    password: '',
    displayName: '',
    departmentId: 0,
}

const socialReturnUrl = encodeURIComponent(`${window.location.origin}/#dashboard`)
const googleLoginUrl = `https://localhost:5001/api/account/external-login/google?returnUrl=${socialReturnUrl}`
const githubLoginUrl = `https://localhost:5001/api/account/external-login/github?returnUrl=${socialReturnUrl}`

const socialButtonSx: SxProps<Theme> = {
    minHeight: 41,
    borderRadius: 2,
    justifyContent: 'flex-start',
    textTransform: 'none',
    fontWeight: 600,
    color: 'text.primary',
    borderColor: 'rgba(15, 23, 42, 0.12)',
    bgcolor: 'rgba(255, 255, 255, 0.78)',
    px: 1.25,
    transition: 'border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease',
    '& .MuiButton-startIcon': {
        marginRight: 1,
    },
    '&:hover': {
        borderColor: 'rgba(15, 23, 42, 0.18)',
        bgcolor: 'rgba(248, 250, 252, 0.96)',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
    },
    '&:focus-visible': {
        outline: 'none',
        boxShadow: '0 0 0 3px rgba(15,118,110,0.12)',
    },
}

const authInputSx: SxProps<Theme> = {
    '& .MuiInputLabel-root': {
        color: 'text.secondary',
        transition: 'color 0.18s ease',
    },
    '& .MuiInputLabel-root.Mui-focused': {
        color: 'primary.main',
    },
    '& .MuiInputLabel-root.Mui-error': {
        color: 'error.main',
    },
    '& .MuiInputLabel-root.MuiInputLabel-shrink': {
        transform: 'translate(14px, -8px) scale(0.75)',
    },
    '& .MuiOutlinedInput-root': {
        borderRadius: 2,
        bgcolor: 'rgba(248, 250, 252, 0.88)',
        transition: 'background-color 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
        '& fieldset': {
            borderColor: 'rgba(15, 23, 42, 0.12)',
        },
        '&:hover': {
            bgcolor: 'rgba(248, 250, 252, 0.96)',
        },
        '&:hover fieldset': {
            borderColor: 'rgba(15, 23, 42, 0.18)',
        },
        '&.Mui-focused': {
            bgcolor: '#fff',
            boxShadow: '0 0 0 3px rgba(15,118,110,0.10)',
        },
        '&.Mui-focused fieldset': {
            borderColor: 'primary.main',
            borderWidth: 1,
        },
        '&.Mui-error': {
            bgcolor: 'rgba(254, 242, 242, 0.7)',
        },
        '&.Mui-error fieldset': {
            borderColor: 'rgba(220, 38, 38, 0.45)',
        },
        '&.Mui-error.Mui-focused': {
            boxShadow: '0 0 0 3px rgba(220,38,38,0.08)',
        },
    },
}

const primaryButtonSx: SxProps<Theme> = {
    minHeight: 42,
    borderRadius: 2,
    py: 0.85,
    fontWeight: 700,
    boxShadow: 'none',
    transition: 'transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease',
    '&:hover': {
        boxShadow: '0 6px 16px rgba(15,118,110,0.18)',
        transform: 'translateY(-1px)',
    },
    '&:focus-visible': {
        outline: 'none',
        boxShadow: '0 0 0 3px rgba(15,118,110,0.14)',
    },
    '&.Mui-disabled': {
        color: 'rgba(255,255,255,0.82)',
        bgcolor: 'rgba(15,118,110,0.6)',
    },
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
    return getApiErrorMessage(error, 'Unable to create your account. Please review the form and try again.')
}

interface RegisterFormProps {
    onSwitch: () => void
}

function RegisterForm({ onSwitch }: RegisterFormProps) {
    const { authStore } = useStore()
    const [values, setValues] = useState<RegisterRequest>(initialValues)
    const [departmentError, setDepartmentError] = useState('')
    const [registeredEmail, setRegisteredEmail] = useState('')
    const [showPassword, setShowPassword] = useState(false)

    const { data: departments = [], isLoading: isLoadingDepartments, isError: isDepartmentsError } = useQuery({
        queryKey: ['departments'],
        queryFn: getDepartments,
    })

    const activeDepartments = departments.filter((department: Department) => department.isActive)

    const mutation = useMutation({
        mutationFn: authStore.signUp,
    })

    function handleChange(
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) {
        const { name, value } = event.target
        setValues((current) => ({
            ...current,
            [name]: name === 'departmentId' ? Number(value) : value,
        }))

        if (name === 'departmentId') {
            setDepartmentError('')
        }
    }

    function handleTogglePasswordVisibility() {
        setShowPassword((current) => !current)
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!values.departmentId) {
            setDepartmentError('Department is required.')
            return
        }

        mutation.reset()
        setRegisteredEmail('')

        const submittedEmail = values.email.trim()
        await mutation.mutateAsync(values)

        setRegisteredEmail(submittedEmail)
        setDepartmentError('')
        setValues(initialValues)
    }

    return (
        <Paper
            elevation={3}
            sx={{
                p: { xs: 3, md: 3.5 },
                borderRadius: 3,
                bgcolor: 'background.paper',
            }}
        >
            <Stack spacing={2.1} component="form" onSubmit={handleSubmit} noValidate aria-busy={mutation.isPending}>
                <Stack spacing={1.25} alignItems="center">
                    <Avatar
                        variant="rounded"
                        sx={{ width: 48, height: 48, bgcolor: 'primary.main', fontWeight: 700, fontSize: 17 }}
                    >
                        AL
                    </Avatar>
                    <Stack spacing={0.35} alignItems="center">
                        <Typography variant="h5" fontWeight={700} lineHeight={1.15}>
                            Create an account
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                            Join Annual Leave and manage your time off
                        </Typography>
                    </Stack>
                </Stack>

                <Divider />

                <Stack spacing={1}>
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

                <Divider
                    sx={{
                        color: 'text.secondary',
                        fontSize: 13,
                        '&::before, &::after': {
                            borderColor: 'rgba(15, 23, 42, 0.08)',
                        },
                    }}
                >
                    Or sign up with email
                </Divider>

                <Stack spacing={1}>
                    <TextField
                        label="Display name"
                        name="displayName"
                        value={values.displayName}
                        onChange={handleChange}
                        autoComplete="name"
                        required
                        fullWidth
                        margin="dense"
                        disabled={mutation.isPending}
                        sx={authInputSx}
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
                        margin="dense"
                        disabled={mutation.isPending}
                        sx={authInputSx}
                    />

                    <TextField
                        label="Password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        value={values.password}
                        onChange={handleChange}
                        autoComplete="new-password"
                        helperText="Use at least 6 characters."
                        required
                        fullWidth
                        margin="dense"
                        disabled={mutation.isPending}
                        sx={authInputSx}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        onClick={handleTogglePasswordVisibility}
                                        onMouseDown={(event) => event.preventDefault()}
                                        edge="end"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        aria-pressed={showPassword}
                                        size="small"
                                        sx={{
                                            color: 'text.secondary',
                                            '&:hover': {
                                                bgcolor: 'rgba(15, 23, 42, 0.04)',
                                            },
                                        }}
                                    >
                                        {showPassword ? (
                                            <VisibilityOffRoundedIcon fontSize="small" />
                                        ) : (
                                            <VisibilityRoundedIcon fontSize="small" />
                                        )}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />

                    <TextField
                        select
                        label="Department"
                        name="departmentId"
                        value={values.departmentId ? String(values.departmentId) : ''}
                        onChange={handleChange}
                        required
                        fullWidth
                        margin="dense"
                        disabled={mutation.isPending || isLoadingDepartments || activeDepartments.length === 0}
                        error={Boolean(departmentError)}
                        helperText={departmentError || (isLoadingDepartments ? 'Loading departments...' : 'Select your department.')}
                        sx={authInputSx}
                    >
                    {activeDepartments.map((department) => (
                        <MenuItem key={department.id} value={department.id}>
                            {department.name}
                        </MenuItem>
                    ))}
                </TextField>
                </Stack>

                {isDepartmentsError ? (
                    <Alert severity="error" variant="outlined" sx={{ borderRadius: 2, bgcolor: 'rgba(254, 242, 242, 0.82)' }}>
                        Unable to load departments. Please try again.
                    </Alert>
                ) : null}

                {mutation.isSuccess ? (
                    <Alert severity="success" variant="outlined" sx={{ borderRadius: 2, bgcolor: 'rgba(236, 253, 245, 0.8)' }}>
                        Account created successfully for <strong>{registeredEmail || 'your email address'}</strong>.
                        {' '}Please check your inbox, click the verification link, and then sign in.
                    </Alert>
                ) : null}

                {mutation.isError ? (
                    <Alert severity="error" variant="outlined" sx={{ borderRadius: 2, bgcolor: 'rgba(254, 242, 242, 0.82)' }}>
                        {getErrorMessage(mutation.error)}
                    </Alert>
                ) : null}

                <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    fullWidth
                    disabled={mutation.isPending || isLoadingDepartments || activeDepartments.length === 0}
                    startIcon={mutation.isPending ? <CircularProgress size={18} color="inherit" /> : null}
                    sx={primaryButtonSx}
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
                    <Link
                        component="button"
                        type="button"
                        variant="body2"
                        onClick={onSwitch}
                        underline="hover"
                        sx={{
                            fontWeight: 500,
                            textUnderlineOffset: '2px',
                            transition: 'color 0.18s ease',
                            '&:hover': {
                                color: 'primary.main',
                            },
                        }}
                    >
                        Sign in
                    </Link>
                </Typography>
            </Stack>
        </Paper>
    )
}

export default RegisterForm