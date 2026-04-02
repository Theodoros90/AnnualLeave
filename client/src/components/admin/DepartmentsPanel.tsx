import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
    createDepartment,
    deleteDepartment,
    getDepartments,
    updateDepartment,
    type UpsertDepartmentRequest,
} from '../../lib/api'
import { getApiErrorMessage } from '../../lib/api/error-utils'
import type { Department } from '../../lib/types'

function getErrorMessage(error: unknown) {
    return getApiErrorMessage(error, 'Something went wrong. Please try again.')
}

function DepartmentsPanel() {
    const queryClient = useQueryClient()
    const [createOpen, setCreateOpen] = useState(false)
    const [editDept, setEditDept] = useState<Department | null>(null)

    const { data: departments = [], isLoading, isError, error } = useQuery({
        queryKey: ['departments'],
        queryFn: getDepartments,
    })

    const createMutation = useMutation({
        mutationFn: createDepartment,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['departments'] })
            setCreateOpen(false)
        },
    })

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: UpsertDepartmentRequest }) =>
            updateDepartment(id, payload),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['departments'] })
            setEditDept(null)
        },
    })

    const deleteMutation = useMutation({
        mutationFn: deleteDepartment,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['departments'] })
        },
    })

    return (
        <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1.5}>
                <Stack spacing={0.5}>
                    <Typography variant="h6" fontWeight={800}>Departments</Typography>
                    <Typography variant="body2" color="text.secondary">Create and maintain organizational departments.</Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Chip label={`${departments.length} departments`} size="small" variant="outlined" />
                    <Button variant="contained" sx={{ textTransform: 'none', borderRadius: 999, px: 2.25 }} onClick={() => setCreateOpen(true)}>
                        Add Department
                    </Button>
                </Stack>
            </Stack>

            {isLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                    <CircularProgress />
                </Box>
            )}

            {isError && <Alert severity="error">{getErrorMessage(error)}</Alert>}

            {!isLoading && !isError && departments.length === 0 && (
                <Paper elevation={0} sx={{ p: 3, border: '1px dashed', borderColor: 'divider' }}>
                    <Typography color="text.secondary">No departments found.</Typography>
                </Paper>
            )}

            {!isLoading && !isError && departments.map((dept) => (
                <Paper
                    key={dept.id}
                    elevation={0}
                    sx={{
                        p: 2.5,
                        border: '1px solid',
                        borderColor: 'divider',
                        borderLeft: '4px solid',
                        borderLeftColor: dept.isActive ? 'rgba(56,142,60,0.6)' : 'rgba(100,116,139,0.6)',
                        transition: 'border-color 0.15s, box-shadow 0.15s',
                        '&:hover': { borderColor: 'rgba(15,118,110,0.35)', boxShadow: '0 8px 20px rgba(15,23,42,0.06)' },
                    }}
                >
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1}>
                        <Box>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Typography fontWeight={700}>{dept.name}</Typography>
                                <Chip label={dept.code} size="small" variant="outlined" />
                                <Chip
                                    label={dept.isActive ? 'Active' : 'Inactive'}
                                    size="small"
                                    color={dept.isActive ? 'success' : 'default'}
                                />
                            </Stack>
                            <Typography variant="caption" color="text.secondary">
                                Created {new Date(dept.createdAt).toLocaleDateString()}
                            </Typography>
                        </Box>
                        <Stack direction="row" spacing={1}>
                            <Button size="small" variant="outlined" sx={{ textTransform: 'none' }} onClick={() => setEditDept(dept)}>
                                Edit
                            </Button>
                            <Button
                                size="small"
                                color="error"
                                variant="outlined"
                                sx={{ textTransform: 'none' }}
                                disabled={deleteMutation.isPending}
                                onClick={() => {
                                    if (window.confirm(`Delete department "${dept.name}"? This will fail if users are assigned to it.`)) {
                                        deleteMutation.mutate(dept.id)
                                    }
                                }}
                            >
                                Delete
                            </Button>
                        </Stack>
                    </Stack>
                </Paper>
            ))}

            {deleteMutation.isError && (
                <Alert severity="error">{getErrorMessage(deleteMutation.error)}</Alert>
            )}

            <DepartmentFormDialog
                open={createOpen}
                title="Add Department"
                isPending={createMutation.isPending}
                error={createMutation.error}
                onClose={() => setCreateOpen(false)}
                onSubmit={(payload) => createMutation.mutate(payload)}
            />

            <DepartmentFormDialog
                open={!!editDept}
                title="Edit Department"
                initial={editDept ?? undefined}
                isPending={updateMutation.isPending}
                error={updateMutation.error}
                onClose={() => setEditDept(null)}
                onSubmit={(payload) => editDept && updateMutation.mutate({ id: editDept.id, payload })}
            />
        </Stack>
    )
}

function DepartmentFormDialog(props: {
    open: boolean
    title: string
    initial?: Department
    isPending: boolean
    error: Error | null
    onClose: () => void
    onSubmit: (payload: UpsertDepartmentRequest) => void
}) {
    const [name, setName] = useState('')
    const [code, setCode] = useState('')
    const [isActive, setIsActive] = useState(true)

    useEffect(() => {
        if (props.open) {
            setName(props.initial?.name ?? '')
            setCode(props.initial?.code ?? '')
            setIsActive(props.initial?.isActive ?? true)
        }
    }, [props.open, props.initial])

    const handleSubmit = () => {
        props.onSubmit({ name: name.trim(), code: code.trim(), isActive })
    }

    return (
        <Dialog open={props.open} onClose={props.onClose} maxWidth="xs" fullWidth>
            <DialogTitle>{props.title}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <TextField
                        label="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        fullWidth
                        required
                    />
                    <TextField
                        label="Code"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        fullWidth
                        required
                        inputProps={{ maxLength: 10 }}
                        helperText="Short uppercase code e.g. ENG, HR"
                    />
                    <FormControlLabel
                        control={
                            <Switch
                                checked={isActive}
                                onChange={(e) => setIsActive(e.target.checked)}
                            />
                        }
                        label="Active"
                    />
                    {props.error != null && <Alert severity="error">{getErrorMessage(props.error)}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={props.onClose} disabled={props.isPending}>Cancel</Button>
                <Button
                    variant="contained"
                    disabled={props.isPending || !name.trim() || !code.trim()}
                    onClick={handleSubmit}
                >
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default DepartmentsPanel
