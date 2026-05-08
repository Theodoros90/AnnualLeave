import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SweetAlert } from '../ui'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import ProjectFormDialog from './ProjectFormDialog'
import {
    createProject,
    deleteProject,
    getDepartments,
    getProjects,
    updateProject,
} from '../../lib/api'
import { getApiErrorMessage } from '../../lib/api/error-utils'
import type { Project } from '../../lib/types'

const C_BORDER = '#E4E6EA'
const C_HEADING = '#1A1A2E'
const C_MUTED = '#6B7280'

const TH = {
    py: '10px',
    px: '14px',
    fontSize: 11,
    fontWeight: 600,
    color: C_MUTED,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    bgcolor: '#F9FAFB',
    borderBottom: `1px solid ${C_BORDER}`,
}

const TD = {
    py: '11px',
    px: '14px',
    fontSize: 13,
    color: '#374151',
    borderBottom: `1px solid #F3F4F6`,
}

function CodeBadge({ code }: { code: string }) {
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-block',
                bgcolor: '#EFF6FF',
                color: '#1D4ED8',
                borderRadius: '4px',
                px: 1,
                py: 0.25,
                fontSize: 11,
                fontWeight: 500,
            }}
        >
            {code}
        </Box>
    )
}

function DeptBadge({ name }: { name: string }) {
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-block',
                bgcolor: '#EFF6FF',
                color: '#1D4ED8',
                borderRadius: '4px',
                px: 1,
                py: 0.25,
                fontSize: 11,
                fontWeight: 500,
            }}
        >
            {name}
        </Box>
    )
}

function StatusBadge({ active }: { active: boolean }) {
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                px: 1.25,
                py: 0.35,
                borderRadius: '20px',
                fontSize: 11,
                fontWeight: 500,
                bgcolor: active ? '#D1FAE5' : '#F3F4F6',
                color: active ? '#065F46' : '#6B7280',
                whiteSpace: 'nowrap',
            }}
        >
            {active ? 'Active' : 'Inactive'}
        </Box>
    )
}

function getErrorMessage(error: unknown) {
    return getApiErrorMessage(error, 'Something went wrong. Please try again.')
}

function ProjectsPanel() {
    const queryClient = useQueryClient()
    const [createOpen, setCreateOpen] = useState(false)
    const [editProject, setEditProject] = useState<Project | null>(null)

    const { data: projects = [], isLoading, isError, error } = useQuery({
        queryKey: ['projects'],
        queryFn: getProjects,
    })

    const { data: departments = [] } = useQuery({
        queryKey: ['departments'],
        queryFn: getDepartments,
    })

    const deptById = useMemo(
        () => new Map(departments.map((d) => [d.id, d.name])),
        [departments]
    )

    const createMutation = useMutation({
        mutationFn: createProject,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['projects'] })
            setCreateOpen(false)
        },
    })

    const updateMutation = useMutation({
        mutationFn: updateProject,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['projects'] })
            setEditProject(null)
        },
    })

    const deleteMutation = useMutation({
        mutationFn: deleteProject,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['projects'] })
        },
    })

    const sorted = useMemo(
        () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
        [projects]
    )

    return (
        <Stack spacing={2}>
            <Paper
                elevation={0}
                sx={{ bgcolor: '#fff', border: `1px solid ${C_BORDER}`, borderRadius: '10px', overflow: 'hidden' }}
            >
                {/* Card header */}
                <Box
                    sx={{
                        px: '18px',
                        py: '14px',
                        borderBottom: `1px solid ${C_BORDER}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 2,
                    }}
                >
                    <Typography sx={{ fontSize: 14, fontWeight: 600, color: C_HEADING }}>Projects</Typography>
                    <Button
                        variant="contained"
                        size="small"
                        onClick={() => setCreateOpen(true)}
                        sx={{
                            fontSize: 12,
                            py: '5px',
                            px: 1.5,
                            bgcolor: '#4F8EF7',
                            '&:hover': { bgcolor: '#3A7AE4' },
                            textTransform: 'none',
                            boxShadow: 'none',
                        }}
                    >
                        + New Project
                    </Button>
                </Box>

                {/* States */}
                {isLoading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                        <CircularProgress size={24} />
                    </Box>
                )}
                {isError && (
                    <Box sx={{ p: 2 }}>
                        <Alert severity="error">{getErrorMessage(error)}</Alert>
                    </Box>
                )}
                {deleteMutation.isError && (
                    <Box sx={{ px: 2, pb: 1 }}>
                        <Alert severity="error">{getErrorMessage(deleteMutation.error)}</Alert>
                    </Box>
                )}
                {!isLoading && !isError && sorted.length === 0 && (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                        <Typography sx={{ fontSize: 13, color: '#9CA3AF' }}>No projects found.</Typography>
                    </Box>
                )}

                {/* Table */}
                {!isLoading && !isError && sorted.length > 0 && (
                    <Box sx={{ overflowX: 'auto' }}>
                        <Table sx={{ width: '100%', borderCollapse: 'collapse' }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={TH}>Name</TableCell>
                                    <TableCell sx={TH}>Code</TableCell>
                                    <TableCell sx={TH}>Department</TableCell>
                                    <TableCell sx={TH}>Status</TableCell>
                                    <TableCell sx={TH}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sorted.map((project) => {
                                    const deptName = project.departmentId ? deptById.get(project.departmentId) : null
                                    return (
                                        <TableRow
                                            key={project.id}
                                            sx={{ '&:last-child td': { borderBottom: 'none' }, '&:hover td': { bgcolor: '#F9FAFB' } }}
                                        >
                                            <TableCell sx={TD}><strong>{project.name}</strong></TableCell>
                                            <TableCell sx={TD}><CodeBadge code={project.code} /></TableCell>
                                            <TableCell sx={{ ...TD, color: deptName ? '#374151' : C_MUTED }}>
                                                {deptName ? <DeptBadge name={deptName} /> : 'Cross-dept'}
                                            </TableCell>
                                            <TableCell sx={TD}><StatusBadge active={project.isActive} /></TableCell>
                                            <TableCell sx={TD}>
                                                <Stack direction="row" spacing={0.75}>
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        onClick={() => setEditProject(project)}
                                                        sx={{
                                                            fontSize: 12,
                                                            py: '5px',
                                                            px: 1.5,
                                                            minWidth: 'unset',
                                                            color: C_MUTED,
                                                            borderColor: C_BORDER,
                                                            textTransform: 'none',
                                                            '&:hover': { bgcolor: '#F4F5F7', borderColor: C_BORDER },
                                                        }}
                                                    >
                                                        Edit
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        disabled={deleteMutation.isPending}
                                                        onClick={async () => {
                                                            const result = await SweetAlert.fire({
                                                                title: `Delete "${project.name}"?`,
                                                                text: 'This will also delete all related timesheet entries.',
                                                                icon: 'warning',
                                                                showCancelButton: true,
                                                                confirmButtonText: 'Yes, delete',
                                                                cancelButtonText: 'Cancel',
                                                                reverseButtons: true,
                                                            })
                                                            if (result.isConfirmed) deleteMutation.mutate(project.id)
                                                        }}
                                                        sx={{
                                                            fontSize: 12,
                                                            py: '5px',
                                                            px: 1.5,
                                                            minWidth: 'unset',
                                                            color: '#FF4D4F',
                                                            borderColor: '#FECACA',
                                                            textTransform: 'none',
                                                            '&:hover': { bgcolor: '#FFF5F5', borderColor: '#FECACA' },
                                                        }}
                                                    >
                                                        Delete
                                                    </Button>
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </Box>
                )}
            </Paper>

            <ProjectFormDialog
                open={createOpen}
                title="New Project"
                isPending={createMutation.isPending}
                error={createMutation.error}
                onClose={() => setCreateOpen(false)}
                onSubmit={(payload) => createMutation.mutate(payload)}
            />

            <ProjectFormDialog
                open={!!editProject}
                title="Edit Project"
                initial={editProject ?? undefined}
                isPending={updateMutation.isPending}
                error={updateMutation.error}
                onClose={() => setEditProject(null)}
                onSubmit={(payload) => editProject && updateMutation.mutate({ ...payload, id: editProject.id })}
            />
        </Stack>
    )
}

export default ProjectsPanel
