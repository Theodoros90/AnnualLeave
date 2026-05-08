import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { createAnnualLeave, getAnnualLeaves, getEmployeeProfiles, getLeaveTypes, uploadLeaveEvidence } from '../../lib/api'
import { getApiErrorMessage } from '../../lib/api/error-utils'
import { useStore } from '../../lib/mobx'
import type { UserInfo } from '../../lib/types'

const C_BORDER = '#E4E6EA'
const C_HEADING = '#1A1A2E'
const C_MUTED = '#6B7280'

const fieldSx = {
    border: '1px solid #D1D5DB',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: 13,
    color: C_HEADING,
    outline: 'none',
    width: '100%',
    background: '#fff',
    fontFamily: 'inherit',
    '&:focus': {
        borderColor: '#4F8EF7',
        boxShadow: '0 0 0 3px rgba(79,142,247,0.1)',
    },
    '&:disabled': {
        background: '#F9FAFB',
        color: C_MUTED,
        cursor: 'not-allowed',
    },
} as const

const labelSx = {
    fontSize: 12,
    fontWeight: 500,
    color: '#374151',
    display: 'block',
    marginBottom: '5px',
} as const

const ghostBtnSx = {
    px: '16px',
    py: '7px',
    fontSize: 13,
    fontWeight: 500,
    color: C_MUTED,
    background: 'transparent',
    border: `1px solid ${C_BORDER}`,
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
    '&:hover': { bgcolor: '#F4F5F7' },
    '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
} as const

function countWorkingDays(start: string, end: string): number {
    if (!start || !end) return 0
    const s = new Date(start)
    const e = new Date(end)
    if (e < s) return 0
    let count = 0
    const curr = new Date(s)
    while (curr <= e) {
        const day = curr.getDay()
        if (day !== 0 && day !== 6) count++
        curr.setDate(curr.getDate() + 1)
    }
    return count
}

function ApplyLeavePage({ user }: { user: UserInfo }) {
    const { uiStore } = useStore()
    const queryClient = useQueryClient()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [leaveTypeId, setLeaveTypeId] = useState(0)
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [reason, setReason] = useState('')
    const [evidenceFile, setEvidenceFile] = useState<File | null>(null)

    const { data: leaveTypes = [], isLoading: isLoadingTypes } = useQuery({
        queryKey: ['leaveTypes'],
        queryFn: getLeaveTypes,
    })

    const { data: profiles = [] } = useQuery({
        queryKey: ['employeeProfiles'],
        queryFn: getEmployeeProfiles,
    })

    const { data: allLeaves = [] } = useQuery({
        queryKey: ['annualLeaves'],
        queryFn: getAnnualLeaves,
    })

    const myProfile = profiles.find((p) => p.userId === user.id)
    const entitlement = myProfile?.annualLeaveEntitlement ?? 0

    const usedDays = useMemo(() => {
        const year = new Date().getFullYear()
        return allLeaves
            .filter((l) => l.employeeId === user.id && l.status === 'Approved' && new Date(l.startDate).getFullYear() === year)
            .reduce((sum, l) => sum + l.totalDays, 0)
    }, [allLeaves, user.id])

    const currentBalance = Math.max(0, entitlement - usedDays)
    const workingDays = countWorkingDays(startDate, endDate)
    const remainingAfter = Math.max(0, currentBalance - workingDays)
    const showBanner = workingDays > 0

    const uploadMutation = useMutation({
        mutationFn: (file: File) => uploadLeaveEvidence(file),
    })

    const submitMutation = useMutation({
        mutationFn: (evidenceUrl?: string) => createAnnualLeave({
            employeeId: user.id,
            leaveTypeId,
            startDate,
            endDate,
            reason,
            evidenceUrl,
        }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['annualLeaves'] })
            uiStore.navigateToMyLeave('requests')
        },
    })

    const isPending = uploadMutation.isPending || submitMutation.isPending
    const error = uploadMutation.error ?? submitMutation.error

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (leaveTypeId === 0 || !startDate || !endDate) return
        uploadMutation.reset()
        submitMutation.reset()

        let evidenceUrl: string | undefined
        if (evidenceFile) {
            const result = await uploadMutation.mutateAsync(evidenceFile)
            evidenceUrl = result.evidenceUrl
        }

        await submitMutation.mutateAsync(evidenceUrl)
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null
        setEvidenceFile(file)
        e.target.value = ''
    }

    function handleRemoveFile() {
        setEvidenceFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    return (
        <Box sx={{ maxWidth: 600 }}>
            <Paper
                elevation={0}
                sx={{ bgcolor: '#fff', border: `1px solid ${C_BORDER}`, borderRadius: '10px', overflow: 'hidden' }}
            >
                {/* Card head */}
                <Box sx={{ px: '18px', py: '14px', borderBottom: `1px solid ${C_BORDER}` }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 600, color: C_HEADING }}>
                        New Leave Request
                    </Typography>
                </Box>

                {/* Card body */}
                <Box
                    component="form"
                    onSubmit={(e: React.FormEvent) => void handleSubmit(e)}
                    noValidate
                    sx={{ p: '18px' }}
                >
                    {/* Row 1: Leave Type + Department */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', mb: '14px' }}>
                        <Box>
                            <Box component="label" sx={labelSx}>Leave Type</Box>
                            <Box
                                component="select"
                                value={leaveTypeId}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLeaveTypeId(Number(e.target.value))}
                                required
                                disabled={isLoadingTypes}
                                sx={fieldSx}
                            >
                                <option value={0} disabled>Select leave type</option>
                                {leaveTypes.map((lt) => (
                                    <option key={lt.id} value={lt.id}>{lt.name}</option>
                                ))}
                            </Box>
                        </Box>
                        <Box>
                            <Box component="label" sx={labelSx}>Department</Box>
                            <Box
                                component="input"
                                type="text"
                                value={user.departmentName ?? '—'}
                                disabled
                                sx={fieldSx}
                            />
                        </Box>
                    </Box>

                    {/* Row 2: Start Date + End Date */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', mb: '14px' }}>
                        <Box>
                            <Box component="label" sx={labelSx}>Start Date</Box>
                            <Box
                                component="input"
                                type="date"
                                value={startDate}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                    setStartDate(e.target.value)
                                    if (endDate && e.target.value > endDate) setEndDate(e.target.value)
                                }}
                                required
                                sx={fieldSx}
                            />
                        </Box>
                        <Box>
                            <Box component="label" sx={labelSx}>End Date</Box>
                            <Box
                                component="input"
                                type="date"
                                value={endDate}
                                min={startDate}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)}
                                required
                                sx={fieldSx}
                            />
                        </Box>
                    </Box>

                    {/* Info banner */}
                    {showBanner && (
                        <Box
                            sx={{
                                bgcolor: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                borderRadius: '6px',
                                px: '14px',
                                py: '10px',
                                mb: '14px',
                                fontSize: 13,
                                color: '#1D4ED8',
                            }}
                        >
                            📅{' '}
                            <Box component="strong">{workingDays} working {workingDays === 1 ? 'day' : 'days'}</Box>
                            {' '}will be deducted from your leave balance. Remaining after:{' '}
                            <Box component="strong">{remainingAfter} {remainingAfter === 1 ? 'day' : 'days'}</Box>
                        </Box>
                    )}

                    {/* Reason */}
                    <Box sx={{ mb: '14px' }}>
                        <Box component="label" sx={labelSx}>
                            Reason{' '}
                            <Box component="span" sx={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</Box>
                        </Box>
                        <Box
                            component="textarea"
                            value={reason}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
                            placeholder="Briefly describe the reason for your leave…"
                            rows={3}
                            sx={{ ...fieldSx, resize: 'vertical', minHeight: '70px' }}
                        />
                    </Box>

                    {/* Evidence upload */}
                    <Box sx={{ mb: '18px' }}>
                        <Box component="label" sx={labelSx}>
                            Supporting Document{' '}
                            <Box component="span" sx={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</Box>
                        </Box>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                            hidden
                            onChange={handleFileChange}
                        />

                        {evidenceFile ? (
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    px: '12px',
                                    py: '8px',
                                    border: `1px solid #BFDBFE`,
                                    borderRadius: '6px',
                                    bgcolor: '#EFF6FF',
                                }}
                            >
                                <Box sx={{ fontSize: 15, lineHeight: 1 }}>📎</Box>
                                <Typography sx={{ fontSize: 13, color: '#1D4ED8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {evidenceFile.name}
                                </Typography>
                                <Box
                                    component="button"
                                    type="button"
                                    onClick={handleRemoveFile}
                                    disabled={isPending}
                                    sx={{
                                        fontSize: 12,
                                        color: C_MUTED,
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontFamily: 'inherit',
                                        flexShrink: 0,
                                        '&:hover': { color: '#EF4444' },
                                        '&:disabled': { opacity: 0.5 },
                                    }}
                                >
                                    Remove
                                </Box>
                            </Box>
                        ) : (
                            <Box>
                                <Box
                                    component="button"
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isPending}
                                    sx={{ ...ghostBtnSx, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <Box component="span" sx={{ fontSize: 14, lineHeight: 1 }}>📎</Box>
                                    Attach File
                                </Box>
                                <Typography sx={{ fontSize: 11, color: C_MUTED, mt: '5px' }}>
                                    PDF, image, DOC or DOCX — max 10 MB
                                </Typography>
                            </Box>
                        )}
                    </Box>

                    {error && (
                        <Alert severity="error" sx={{ mb: 2, borderRadius: '6px' }}>
                            {getApiErrorMessage(error, 'Failed to submit leave request. Please try again.')}
                        </Alert>
                    )}

                    {/* Footer buttons */}
                    <Stack direction="row" spacing={1.25} justifyContent="flex-end">
                        <Box
                            component="button"
                            type="button"
                            onClick={() => uiStore.navigateToMyLeave('requests')}
                            disabled={isPending}
                            sx={ghostBtnSx}
                        >
                            Cancel
                        </Box>
                        <Box
                            component="button"
                            type="submit"
                            disabled={isPending || leaveTypeId === 0 || !startDate || !endDate}
                            sx={{
                                px: '16px',
                                py: '7px',
                                fontSize: 13,
                                fontWeight: 500,
                                color: '#fff',
                                bgcolor: '#4F8EF7',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'background 0.15s',
                                '&:hover:not(:disabled)': { bgcolor: '#3A7AE4' },
                                '&:disabled': { opacity: 0.7, cursor: 'not-allowed' },
                            }}
                        >
                            {isPending && <CircularProgress size={14} sx={{ color: '#fff' }} />}
                            {uploadMutation.isPending ? 'Uploading…' : submitMutation.isPending ? 'Submitting…' : 'Submit Request'}
                        </Box>
                    </Stack>
                </Box>
            </Paper>
        </Box>
    )
}

export default ApplyLeavePage
