import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
    createTimesheet,
    createTimesheetEntry,
    deleteTimesheetEntry,
    getProjects,
    getTimesheet,
    getTimesheets,
    submitTimesheet,
} from '../../lib/api'
import type { TimesheetEntry, TimesheetStatus, UserInfo } from '../../lib/types'
import type { Timesheet } from '../../lib/types/timesheet'

const C_BORDER = '#E4E6EA'
const C_HEADING = '#1A1A2E'
const C_MUTED = '#6B7280'

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
    Draft:       { bg: '#EFF6FF', color: '#1D4ED8' },
    Submitted:   { bg: '#FEF3C7', color: '#92400E' },
    Approved:    { bg: '#D1FAE5', color: '#065F46' },
    Rejected:    { bg: '#FEE2E2', color: '#991B1B' },
    Resubmitted: { bg: '#F3E8FF', color: '#6D28D9' },
}

function StatusBadge({ status }: { status: string }) {
    const s = STATUS_COLORS[status] ?? { bg: '#F3F4F6', color: '#6B7280' }
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
                bgcolor: s.bg,
                color: s.color,
                whiteSpace: 'nowrap',
            }}
        >
            {status}
        </Box>
    )
}

function formatPeriod(start: string, end: string) {
    const s = new Date(start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    const e = new Date(end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    return `${s} – ${e}`
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

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

type StatusTab = 'all' | 'Draft' | 'Submitted' | 'Approved' | 'Rejected'

const STATUS_TABS: { value: StatusTab; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'Draft', label: 'Draft' },
    { value: 'Submitted', label: 'Submitted' },
    { value: 'Approved', label: 'Approved' },
    { value: 'Rejected', label: 'Rejected' },
]

interface NewEntryForm {
    projectId: string
    date: string
    hoursWorked: string
    notes: string
}

const EMPTY_ENTRY: NewEntryForm = { projectId: '', date: '', hoursWorked: '', notes: '' }

export default function MyTimesheetPage({ user }: { user: UserInfo }) {
    const queryClient = useQueryClient()

    // List page state
    const [statusTab, setStatusTab] = useState<StatusTab>('all')

    // New timesheet dialog
    const [newOpen, setNewOpen] = useState(false)
    const [newStart, setNewStart] = useState('')
    const [newEnd, setNewEnd] = useState('')
    const [newError, setNewError] = useState('')

    // Edit/View dialog
    const [editTs, setEditTs] = useState<Timesheet | null>(null)

    // New entry form state
    const [entryForm, setEntryForm] = useState<NewEntryForm>(EMPTY_ENTRY)
    const [entryError, setEntryError] = useState('')
    const [addingEntry, setAddingEntry] = useState(false)

    // Queries
    const { data: timesheets = [], isLoading } = useQuery({
        queryKey: ['timesheets'],
        queryFn: getTimesheets,
    })

    const { data: tsDetail, isLoading: isDetailLoading } = useQuery({
        queryKey: ['timesheet', editTs?.id],
        queryFn: () => getTimesheet(editTs!.id),
        enabled: !!editTs?.id,
    })

    const { data: projects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: getProjects,
    })

    const activeProjects = projects.filter((p) => p.isActive)

    // Derived
    const filtered = timesheets
        .filter((t) => statusTab === 'all' || t.status === (statusTab as TimesheetStatus))
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const entries = (tsDetail?.entries as TimesheetEntry[] | undefined) ?? []
    const isEditable = editTs?.status === 'Draft' || editTs?.status === 'Rejected'

    // Mutations
    const createMutation = useMutation({
        mutationFn: (data: { periodStart: string; periodEnd: string }) => createTimesheet(data),
        onSuccess: async (ts) => {
            await queryClient.invalidateQueries({ queryKey: ['timesheets'] })
            setNewOpen(false)
            setNewStart('')
            setNewEnd('')
            setNewError('')
            setEditTs(ts)
        },
        onError: () => {
            setNewError('Failed to create timesheet. Please try again.')
        },
    })

    const submitMutation = useMutation({
        mutationFn: (id: string) => submitTimesheet(id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['timesheets'] })
            setEditTs(null)
        },
    })

    const addEntryMutation = useMutation({
        mutationFn: (entry: Omit<TimesheetEntry, 'id'>) =>
            createTimesheetEntry(editTs!.id, entry),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['timesheet', editTs?.id] })
            await queryClient.invalidateQueries({ queryKey: ['timesheets'] })
            setEntryForm(EMPTY_ENTRY)
            setEntryError('')
            setAddingEntry(false)
        },
        onError: () => {
            setEntryError('Failed to add entry. Please try again.')
            setAddingEntry(false)
        },
    })

    const deleteEntryMutation = useMutation({
        mutationFn: ({ timesheetId, entryId }: { timesheetId: string; entryId: string }) =>
            deleteTimesheetEntry(timesheetId, entryId),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['timesheet', editTs?.id] })
            await queryClient.invalidateQueries({ queryKey: ['timesheets'] })
        },
    })

    // Handlers
    const handleCreateSubmit = () => {
        if (!newStart) { setNewError('Period start is required.'); return }
        if (!newEnd) { setNewError('Period end is required.'); return }
        if (newEnd < newStart) { setNewError('Period end must be after period start.'); return }
        setNewError('')
        createMutation.mutate({ periodStart: newStart, periodEnd: newEnd })
    }

    const handleAddEntry = () => {
        if (!entryForm.projectId) { setEntryError('Please select a project.'); return }
        if (!entryForm.date) { setEntryError('Please select a date.'); return }
        const hours = parseFloat(entryForm.hoursWorked)
        if (isNaN(hours) || hours < 0.5 || hours > 24) { setEntryError('Hours must be between 0.5 and 24.'); return }
        setEntryError('')
        setAddingEntry(true)
        addEntryMutation.mutate({
            timesheetId: editTs!.id,
            projectId: Number(entryForm.projectId),
            date: entryForm.date,
            hoursWorked: hours,
            notes: entryForm.notes || null,
        })
    }

    const handleOpenEdit = (ts: Timesheet) => {
        setEditTs(ts)
        setEntryForm(EMPTY_ENTRY)
        setEntryError('')
    }

    const handleCloseEdit = () => {
        setEditTs(null)
        setEntryForm(EMPTY_ENTRY)
        setEntryError('')
    }

    return (
        <Stack spacing={2.5}>
            {/* Header row */}
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography sx={{ fontSize: 20, fontWeight: 700, color: C_HEADING }}>
                    My Timesheets
                </Typography>
                <Button
                    variant="contained"
                    onClick={() => { setNewOpen(true); setNewError('') }}
                    sx={{
                        fontSize: 13,
                        fontWeight: 600,
                        textTransform: 'none',
                        bgcolor: '#4F8EF7',
                        '&:hover': { bgcolor: '#3A7CE0' },
                        boxShadow: 'none',
                        borderRadius: '8px',
                        px: 2,
                        py: 1,
                    }}
                >
                    + New Timesheet
                </Button>
            </Stack>

            {/* Status tabs */}
            <Box sx={{ borderBottom: `2px solid ${C_BORDER}`, mb: -1 }}>
                <Tabs
                    value={statusTab}
                    onChange={(_e, v: StatusTab) => setStatusTab(v)}
                    TabIndicatorProps={{ style: { backgroundColor: '#4F8EF7', height: 2 } }}
                    sx={{
                        minHeight: 44,
                        '& .MuiTab-root': {
                            textTransform: 'none',
                            fontWeight: 500,
                            fontSize: 13,
                            color: C_MUTED,
                            minHeight: 44,
                            py: 0,
                            px: 2.25,
                        },
                        '& .Mui-selected': { color: '#4F8EF7 !important' },
                    }}
                >
                    {STATUS_TABS.map((t) => <Tab key={t.value} value={t.value} label={t.label} />)}
                </Tabs>
            </Box>

            {/* Table */}
            <Paper
                elevation={0}
                sx={{ bgcolor: '#fff', border: `1px solid ${C_BORDER}`, borderRadius: '10px', overflow: 'hidden' }}
            >
                {isLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                        <CircularProgress size={24} />
                    </Box>
                ) : filtered.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                        <Typography sx={{ fontSize: 13, color: '#9CA3AF' }}>No timesheets found.</Typography>
                    </Box>
                ) : (
                    <Box sx={{ overflowX: 'auto' }}>
                        <Table sx={{ width: '100%', borderCollapse: 'collapse' }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={TH}>Period</TableCell>
                                    <TableCell sx={TH}>Total Hours</TableCell>
                                    <TableCell sx={TH}>Status</TableCell>
                                    <TableCell sx={TH}>Submitted</TableCell>
                                    <TableCell sx={TH}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filtered.map((ts) => {
                                    const editable = ts.status === 'Draft' || ts.status === 'Rejected'
                                    return (
                                        <TableRow
                                            key={ts.id}
                                            sx={{ '&:last-child td': { borderBottom: 'none' }, '&:hover td': { bgcolor: '#F9FAFB' } }}
                                        >
                                            <TableCell sx={TD}>{formatPeriod(ts.periodStart, ts.periodEnd)}</TableCell>
                                            <TableCell sx={TD}>{Number(ts.totalHours).toFixed(1)} hrs</TableCell>
                                            <TableCell sx={TD}><StatusBadge status={ts.status} /></TableCell>
                                            <TableCell sx={{ ...TD, color: C_MUTED }}>
                                                {ts.submittedAt ? formatDate(ts.submittedAt) : '—'}
                                            </TableCell>
                                            <TableCell sx={TD}>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={() => handleOpenEdit(ts)}
                                                    sx={{
                                                        fontSize: 12,
                                                        py: '5px',
                                                        px: 1.5,
                                                        minWidth: 'unset',
                                                        color: editable ? '#4F8EF7' : '#6B7280',
                                                        borderColor: editable ? '#4F8EF7' : C_BORDER,
                                                        textTransform: 'none',
                                                        '&:hover': {
                                                            bgcolor: editable ? '#EFF6FF' : '#F4F5F7',
                                                            borderColor: editable ? '#4F8EF7' : C_BORDER,
                                                        },
                                                    }}
                                                >
                                                    {editable ? 'Edit' : 'View'}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </Box>
                )}
            </Paper>

            {/* New Timesheet Dialog */}
            <Dialog open={newOpen} onClose={() => setNewOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontSize: 16, fontWeight: 700, color: C_HEADING }}>
                    New Timesheet
                </DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <TextField
                            label="Period Start"
                            type="date"
                            value={newStart}
                            onChange={(e) => { setNewStart(e.target.value); setNewError('') }}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                            size="small"
                        />
                        <TextField
                            label="Period End"
                            type="date"
                            value={newEnd}
                            onChange={(e) => { setNewEnd(e.target.value); setNewError('') }}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                            size="small"
                        />
                        {newError && (
                            <Typography sx={{ fontSize: 12, color: '#991B1B' }}>{newError}</Typography>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
                    <Button
                        variant="outlined"
                        onClick={() => { setNewOpen(false); setNewStart(''); setNewEnd(''); setNewError('') }}
                        disabled={createMutation.isPending}
                        sx={{ textTransform: 'none', borderColor: C_BORDER, color: C_MUTED }}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleCreateSubmit}
                        disabled={createMutation.isPending}
                        startIcon={createMutation.isPending ? <CircularProgress size={14} color="inherit" /> : null}
                        sx={{
                            textTransform: 'none',
                            bgcolor: '#4F8EF7',
                            '&:hover': { bgcolor: '#3A7CE0' },
                            boxShadow: 'none',
                        }}
                    >
                        {createMutation.isPending ? 'Creating...' : 'Create'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Edit / View Timesheet Dialog */}
            <Dialog
                open={!!editTs}
                onClose={handleCloseEdit}
                maxWidth="md"
                fullWidth
                PaperProps={{ sx: { borderRadius: '12px' } }}
            >
                {editTs && (
                    <>
                        <DialogTitle sx={{ pb: 1 }}>
                            <Stack direction="row" alignItems="center" spacing={1.5}>
                                <Typography sx={{ fontSize: 15, fontWeight: 700, color: C_HEADING }}>
                                    {formatPeriod(editTs.periodStart, editTs.periodEnd)}
                                </Typography>
                                <StatusBadge status={editTs.status} />
                            </Stack>
                        </DialogTitle>

                        <Divider />

                        <DialogContent sx={{ pt: 2 }}>
                            {isDetailLoading ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                    <CircularProgress size={24} />
                                </Box>
                            ) : (
                                <Stack spacing={2}>
                                    {/* Entries table */}
                                    <Box sx={{ border: `1px solid ${C_BORDER}`, borderRadius: '8px', overflow: 'hidden' }}>
                                        <Table sx={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell sx={TH}>Project</TableCell>
                                                    <TableCell sx={TH}>Date</TableCell>
                                                    <TableCell sx={TH}>Hours</TableCell>
                                                    <TableCell sx={TH}>Notes</TableCell>
                                                    {isEditable && <TableCell sx={TH}>Actions</TableCell>}
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {entries.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell
                                                            colSpan={isEditable ? 5 : 4}
                                                            sx={{ ...TD, textAlign: 'center', color: '#9CA3AF', py: 3 }}
                                                        >
                                                            No entries yet.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    entries.map((entry) => {
                                                        const projectName = activeProjects.find((p) => p.id === entry.projectId)?.name
                                                            ?? entry.project?.name
                                                            ?? `Project #${entry.projectId}`
                                                        return (
                                                            <TableRow
                                                                key={entry.id}
                                                                sx={{ '&:last-child td': { borderBottom: 'none' }, '&:hover td': { bgcolor: '#F9FAFB' } }}
                                                            >
                                                                <TableCell sx={TD}>{projectName}</TableCell>
                                                                <TableCell sx={TD}>{formatDate(entry.date)}</TableCell>
                                                                <TableCell sx={TD}>{Number(entry.hoursWorked).toFixed(1)}</TableCell>
                                                                <TableCell sx={{ ...TD, color: C_MUTED }}>{entry.notes ?? '—'}</TableCell>
                                                                {isEditable && (
                                                                    <TableCell sx={TD}>
                                                                        <Button
                                                                            size="small"
                                                                            variant="outlined"
                                                                            disabled={deleteEntryMutation.isPending}
                                                                            onClick={() =>
                                                                                deleteEntryMutation.mutate({
                                                                                    timesheetId: editTs.id,
                                                                                    entryId: entry.id,
                                                                                })
                                                                            }
                                                                            sx={{
                                                                                fontSize: 12,
                                                                                py: '4px',
                                                                                px: 1.25,
                                                                                minWidth: 'unset',
                                                                                color: '#991B1B',
                                                                                borderColor: '#FCA5A5',
                                                                                textTransform: 'none',
                                                                                '&:hover': { bgcolor: '#FEE2E2', borderColor: '#FCA5A5' },
                                                                            }}
                                                                        >
                                                                            Delete
                                                                        </Button>
                                                                    </TableCell>
                                                                )}
                                                            </TableRow>
                                                        )
                                                    })
                                                )}
                                            </TableBody>
                                        </Table>
                                    </Box>

                                    {/* Total hours summary */}
                                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: C_HEADING }}>
                                            Total:{' '}
                                            <span style={{ color: '#4F8EF7' }}>
                                                {entries.reduce((sum, e) => sum + Number(e.hoursWorked), 0).toFixed(1)} hrs
                                            </span>
                                        </Typography>
                                    </Box>

                                    {/* Add Entry form (only if editable) */}
                                    {isEditable && (
                                        <>
                                            <Divider />
                                            <Typography sx={{ fontSize: 13, fontWeight: 600, color: C_HEADING }}>
                                                Add Entry
                                            </Typography>
                                            <Stack direction="row" spacing={1.5} alignItems="flex-start" flexWrap="wrap">
                                                <Select
                                                    size="small"
                                                    displayEmpty
                                                    value={entryForm.projectId}
                                                    onChange={(e) => setEntryForm((f) => ({ ...f, projectId: e.target.value }))}
                                                    sx={{
                                                        fontSize: 13,
                                                        minWidth: 180,
                                                        '& .MuiSelect-select': { py: '8px' },
                                                        '& fieldset': { borderColor: '#D1D5DB', borderRadius: '6px' },
                                                    }}
                                                >
                                                    <MenuItem value="" disabled>
                                                        <em style={{ color: C_MUTED }}>Select project</em>
                                                    </MenuItem>
                                                    {activeProjects.map((p) => (
                                                        <MenuItem key={p.id} value={String(p.id)}>{p.name}</MenuItem>
                                                    ))}
                                                </Select>

                                                <TextField
                                                    size="small"
                                                    type="date"
                                                    label="Date"
                                                    value={entryForm.date}
                                                    onChange={(e) => setEntryForm((f) => ({ ...f, date: e.target.value }))}
                                                    InputLabelProps={{ shrink: true }}
                                                    sx={{ width: 155, '& .MuiInputBase-input': { fontSize: 13 } }}
                                                />

                                                <TextField
                                                    size="small"
                                                    type="number"
                                                    label="Hours"
                                                    value={entryForm.hoursWorked}
                                                    onChange={(e) => setEntryForm((f) => ({ ...f, hoursWorked: e.target.value }))}
                                                    inputProps={{ step: 0.5, min: 0.5, max: 24 }}
                                                    sx={{ width: 90, '& .MuiInputBase-input': { fontSize: 13 } }}
                                                />

                                                <TextField
                                                    size="small"
                                                    label="Notes"
                                                    value={entryForm.notes}
                                                    onChange={(e) => setEntryForm((f) => ({ ...f, notes: e.target.value }))}
                                                    sx={{ flex: 1, minWidth: 120, '& .MuiInputBase-input': { fontSize: 13 } }}
                                                />

                                                <Button
                                                    variant="contained"
                                                    onClick={handleAddEntry}
                                                    disabled={addingEntry || addEntryMutation.isPending}
                                                    startIcon={(addingEntry || addEntryMutation.isPending) ? <CircularProgress size={14} color="inherit" /> : null}
                                                    sx={{
                                                        textTransform: 'none',
                                                        fontSize: 13,
                                                        bgcolor: '#4F8EF7',
                                                        '&:hover': { bgcolor: '#3A7CE0' },
                                                        boxShadow: 'none',
                                                        py: '8px',
                                                        px: 2,
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    Add
                                                </Button>
                                            </Stack>
                                            {entryError && (
                                                <Typography sx={{ fontSize: 12, color: '#991B1B' }}>{entryError}</Typography>
                                            )}
                                        </>
                                    )}
                                </Stack>
                            )}
                        </DialogContent>

                        <Divider />

                        <DialogActions sx={{ px: 3, py: 1.5, gap: 1 }}>
                            <Button
                                variant="outlined"
                                onClick={handleCloseEdit}
                                sx={{ textTransform: 'none', borderColor: C_BORDER, color: C_MUTED }}
                            >
                                Close
                            </Button>
                            {isEditable && (
                                <Button
                                    variant="contained"
                                    disabled={submitMutation.isPending || entries.length === 0}
                                    onClick={() => submitMutation.mutate(editTs.id)}
                                    startIcon={submitMutation.isPending ? <CircularProgress size={14} color="inherit" /> : null}
                                    sx={{
                                        textTransform: 'none',
                                        bgcolor: '#22C47A',
                                        '&:hover': { bgcolor: '#18A867' },
                                        boxShadow: 'none',
                                    }}
                                >
                                    {submitMutation.isPending
                                        ? 'Submitting...'
                                        : editTs.status === 'Rejected'
                                            ? 'Resubmit'
                                            : 'Submit Timesheet'}
                                </Button>
                            )}
                        </DialogActions>
                    </>
                )}
            </Dialog>
        </Stack>
    )
}
