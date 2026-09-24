import { useState, useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { AppDialog, AppDialogTitle, AppDialogContent, AppDialogActions, cancelBtnSx, saveBtnSx } from '../ui'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { AttachFile as AttachFileIcon, CalendarMonth as CalendarMonthIcon, OpenInNew as OpenInNewIcon } from '@mui/icons-material'
import Box from '@mui/material/Box'
import { createAnnualLeave, editAnnualLeave, getChildLeaveEntitlements, getLeaveTypes, getAdminUsers, getTeammates, uploadCoverageHandover, uploadLeaveEvidence } from '../../lib/api'
import { autoApproves } from '../../lib/approval-stage'
import { COVERAGE_NOTE_MAX_LENGTH, isCoverageRequired } from '../../lib/coverage'
import { isLeaveTypeOffered } from '../../lib/parental-leave'
import { attachmentRequirement, isAttachmentBlockingSubmit, isAttachmentMissing, isAttachmentOffered } from '../../lib/attachment-policy'
import { maxConsecutiveError, noticeError } from '../../lib/leave-limits'
import { collapseToHalfDay, durationLabel, isHalfDayOffered } from '../../lib/half-day'
import { resolveFileUrl } from '../../lib/api/file-url'
import { getApiErrorMessage } from '../../lib/api/error-utils'
import { useStore } from '../../lib/mobx'
import { softBg } from '../../lib/theme-tokens'
import { buildAnnualLeaveSchema, type AnnualLeaveFormValues } from '../../lib/validation/leave'
import ChildLeavePicker from './ChildLeavePicker'
import type { AnnualLeave, CreateAnnualLeaveRequest, EditAnnualLeaveRequest, LeaveStatusHistory } from '../../lib/types'

function getErrorMessage(error: unknown) {
    return getApiErrorMessage(error, 'Something went wrong. Please try again.')
}

function toInputDate(dateStr: string) {
    return dateStr ? dateStr.substring(0, 10) : ''
}

interface AnnualLeaveFormProps {
    open: boolean
    onClose: () => void
    /** Pass an existing leave to edit; omit for create */
    leave?: AnnualLeave
    /** When true, an "Assign to Employee" dropdown is shown so admin can create on behalf of a user */
    isAdmin?: boolean
    /** When true, the form is rendered in view-only mode (no edits, no submit) */
    readOnly?: boolean
    /** Optional manager/admin feedback to show in read-only mode (e.g. rejection reason) */
    statusFeedback?: LeaveStatusHistory
}

function AnnualLeaveForm({ open, onClose, leave, isAdmin = false, readOnly = false, statusFeedback }: AnnualLeaveFormProps) {
    const isEdit = !!leave && !readOnly
    const queryClient = useQueryClient()
    const { authStore } = useStore()

    const [evidenceUrl, setEvidenceUrl] = useState(leave?.evidenceUrl ?? '')
    const [evidenceFile, setEvidenceFile] = useState<File | null>(null)
    /* The handover document for the delegate: the path already on the request,
       and a file staged this session to replace it. Uploaded to its own endpoint —
       the delegate may read it back, and must not thereby be able to read the
       evidence beside it. */
    const [coverageAttachmentUrl, setCoverageAttachmentUrl] = useState(leave?.coverageAttachmentUrl ?? '')
    const [handoverFile, setHandoverFile] = useState<File | null>(null)
    // Whether the child picker currently has no real choice to offer (query
    // failed, no children on file, or none eligible). Reset below whenever it
    // isn't the thing actually shown, so it never lingers from a prior type or
    // employee and blocks a submit it has nothing to do with.
    const [childPickerBlocked, setChildPickerBlocked] = useState(false)

    const requireEmployee = isAdmin && !isEdit

    const { data: leaveTypes, isLoading: isLoadingLeaveTypes } = useQuery({
        queryKey: ['leaveTypes'],
        queryFn: getLeaveTypes,
    })

    /* Which leave types measure their entitlement per child — paternity leave, in
       practice. The schema needs them to know when childId is required, and the
       schema has to exist before useForm does, so this is derived from the type
       list rather than from the form's own selected value. */
    const perChildLeaveTypeIds = useMemo(
        () => (leaveTypes ?? []).filter((leaveType) => leaveType.perChildEntitlement).map((leaveType) => leaveType.id),
        [leaveTypes],
    )

    /* Whether this dialog is filing the signed-in user's own request. Declared
       here, ahead of the schema, because whose request it is decides whether cover
       is mandatory; see also the leave-type filter below, which uses it too. */
    const filesOwnRequest = leave
        ? leave.employeeId === authStore.user?.id
        : !isAdmin

    /* Cover is mandatory for an Employee or a Manager — CoverageRule reads the
       *employee's* stored role, so it depends on whose leave this is. Own request:
       the signed-in user's roles. An admin filing on behalf: the dropdown offers
       Employees and Managers only, so whoever is picked needs one (and the schema
       already refuses a submit with nobody picked). An admin editing somebody
       else's request: the leave carries no role, so the mirror stays quiet and the
       server answers — a mirror may under-refuse, it must never over-refuse. */
    const requireDelegate = filesOwnRequest
        ? isCoverageRequired(authStore.user?.roles)
        : requireEmployee

    const schema = useMemo(
        () => buildAnnualLeaveSchema(requireEmployee, perChildLeaveTypeIds, requireDelegate),
        [requireEmployee, perChildLeaveTypeIds, requireDelegate],
    )

    const buildDefaults = (): AnnualLeaveFormValues => ({
        employeeId: '',
        delegateId: leave?.delegateId ?? '',
        coverageNote: leave?.coverageNote ?? '',
        childId: leave?.childId ?? '',
        startDate: leave ? toInputDate(leave.startDate) : '',
        endDate: leave ? toInputDate(leave.endDate) : '',
        /* Carried through from the request being edited. This dialog is a full
           replace — it posts every field it holds — so defaulting to 'Full' here
           would turn an admin's correction to the reason into a promotion from half
           a day to a whole one, taking another half day off the balance with
           nothing on screen having said so. */
        duration: leave?.duration ?? 'Full',
        leaveTypeId: leave?.leaveTypeId ?? 0,
        reason: leave?.reason ?? '',
    })

    const { control, handleSubmit, reset, watch, setValue } = useForm<AnnualLeaveFormValues>({
        resolver: zodResolver(schema),
        defaultValues: buildDefaults(),
    })

    const watchedLeaveTypeId = watch('leaveTypeId')
    const watchedEmployeeId = watch('employeeId')
    const watchedDelegateId = watch('delegateId')
    const watchedStartDate = watch('startDate')
    const watchedEndDate = watch('endDate')
    const watchedDuration = watch('duration')

    const requiresChild = perChildLeaveTypeIds.includes(watchedLeaveTypeId)
    // The configured cut-off age for the selected type, so the picker never quotes
    // an invented one. 0 while the type list is still loading, which is also what
    // the server reports when nothing carries a per-child entitlement.
    const childEligibleUntilAge = (leaveTypes ?? []).find((lt) => lt.id === watchedLeaveTypeId)?.childEligibleUntilAge ?? 0

    /* The attachment policy, enforced by AttachmentPolicyRule on the server at
       *approval* rather than filing — for every caller, an admin included. A
       pending request may be saved without a document (that is the edit an
       employee makes to attach one dated after they had to file), so Save is
       disabled only where saving would approve, or leave approved, an undocumented
       request: a type that approves itself, or an edit of an approved request.
       Leaving Save enabled there would only turn it into a failed round trip. */
    const selectedLeaveType = (leaveTypes ?? []).find((lt) => lt.id === watchedLeaveTypeId)
    const attachmentRule = attachmentRequirement(selectedLeaveType)
    const attachmentMissing = isAttachmentMissing(
        selectedLeaveType,
        !!evidenceFile || !!evidenceUrl.trim(),
    )
    const attachmentBlocking = isAttachmentBlockingSubmit(
        selectedLeaveType,
        !!evidenceFile || !!evidenceUrl.trim(),
        isEdit ? leave?.status === 'Approved' : autoApproves(selectedLeaveType),
    )
    /* A type set to "No attachment needed" gets no upload at all. Evidence the
       request already carries is the exception: this dialog is the only place to
       open it, and a policy moved to None afterwards must not hide the document
       somebody actually filed. A file staged in this session is not that — see
       the reset below. */
    const attachmentOffered = isAttachmentOffered(selectedLeaveType, !!evidenceUrl.trim())

    // Mirrors HalfDayRule.Check, which refuses a half day on a type that offers
    // none — so the buttons go rather than failing on the round trip.
    const halfDayOffered = isHalfDayOffered(selectedLeaveType)

    /* The leave type's notice period, mirroring NoticePeriodRule.Check — and only
       when the start date actually moves, exactly as EditAnnualLeave does it.
       Notice is the one limit with a clock in it: a request filed properly in
       advance drifts towards its own start date every day it sits there, so
       checking it on every edit would strand a request nobody is trying to bring
       forward — the reason could not be corrected the morning before a trip. */
    const startDateMoved = !isEdit || watchedStartDate !== (leave?.startDate?.slice(0, 10) ?? '')
    const noticeBreach = startDateMoved ? noticeError(selectedLeaveType, watchedStartDate) : null

    // On the admin create path, no employee is chosen yet means no ledger to
    // load — showing the picker anyway would fetch the signed-in admin's own
    // children instead of placeholder text explaining why there's nothing yet.
    const awaitingEmployeeSelection = requireEmployee && !watchedEmployeeId

    // The blocked flag only describes the picker that is actually on screen.
    // Whenever it isn't shown (type doesn't need a child, or we're waiting on
    // an employee pick), clear it so a stale "blocked" from a previous type or
    // employee can't disable a submit it no longer applies to.
    useEffect(() => {
        if (!requiresChild || awaitingEmployeeSelection) {
            setChildPickerBlocked(false)
        }
    }, [requiresChild, awaitingEmployeeSelection])

    /**
     * Weekday count for the caption under the child picker. Public holidays are
     * NOT excluded — the client has no holiday list — so this can read one or two
     * days high near a holiday. The server's figure is the one that counts, and it
     * only ever comes out lower, so the caption never over-promises what is left.
     */
    const requestedDays = useMemo(() => {
        if (!watchedStartDate || !watchedEndDate) return null
        const start = new Date(watchedStartDate)
        const end = new Date(watchedEndDate)
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null

        let count = 0
        for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
            const day = date.getDay()
            if (day !== 0 && day !== 6) count++
        }
        return count
    }, [watchedStartDate, watchedEndDate])

    /* The length limit is advisory here, not blocking, and that is the difference
       from ApplyLeavePage, which blocks on it. `requestedDays` excludes weekends
       but NOT public holidays — this dialog has no holiday list — so it reads high
       near one. Blocking on a figure that only errs upwards would refuse requests
       MaxConsecutiveRule would have allowed, which is the one direction a mirror
       must never fail in. So it warns, and the server makes the call. */
    const lengthWarning = maxConsecutiveError(selectedLeaveType, requestedDays ?? 0)

    const { data: adminUsers, isLoading: isLoadingUsers } = useQuery({
        queryKey: ['adminUsers'],
        queryFn: getAdminUsers,
        enabled: isAdmin && !isEdit,
    })

    /* `filesOwnRequest` (declared above the schema) is also the only case the
       gender + eligible-child rule applies to. An admin creating on behalf of
       someone, or editing someone else's request, sees every type: their own
       gender and children say nothing about the employee the request is for, and
       filtering on them would hide the very type they were asked to file. The
       server still has the last word either way. */

    /* Whose colleagues the coverage picker offers: the employee the leave is for.
       Somebody else's list is asked for by id, which the server honours for an
       System Administrator only. */
    const coverageSubjectId = leave
        ? leave.employeeId
        : requireEmployee ? watchedEmployeeId : authStore.user?.id
    const coverageForSomeoneElse = !!coverageSubjectId && coverageSubjectId !== authStore.user?.id
    const { data: teammates = [] } = useQuery({
        queryKey: ['teammates', coverageForSomeoneElse ? coverageSubjectId : 'me'],
        queryFn: () => getTeammates(coverageForSomeoneElse ? coverageSubjectId : undefined),
        enabled: !readOnly && !!coverageSubjectId,
    })

    /* The request's current delegate stays on the list even when the teammates
       query does not return them — moved department, or the list has not landed
       yet — so the select never opens on a blank. */
    const delegateOptions = useMemo(() => {
        const options = teammates.map((t) => ({ userId: t.userId, label: t.jobTitle ? `${t.displayName} · ${t.jobTitle}` : t.displayName }))
        if (leave?.delegateId && !options.some((o) => o.userId === leave.delegateId)) {
            options.unshift({ userId: leave.delegateId, label: leave.delegateName || 'Current delegate' })
        }
        return options
    }, [teammates, leave?.delegateId, leave?.delegateName])

    /* Same query key the child picker uses for the signed-in user, so the two
       share one request. Skipped entirely when the rule does not apply. */
    const { data: ownEntitlements } = useQuery({
        queryKey: ['childLeaveEntitlements', 'me'],
        queryFn: () => getChildLeaveEntitlements(),
        enabled: filesOwnRequest,
    })
    const hasEligibleChild = (ownEntitlements?.eligibleChildCount ?? 0) > 0

    const offeredLeaveTypes = useMemo(() => {
        const all = leaveTypes ?? []
        if (!filesOwnRequest) return all

        const offered = all.filter(
            (leaveType) => isLeaveTypeOffered(
                leaveType, authStore.user?.gender, hasEligibleChild, authStore.user?.employmentStartDate,
            ),
        )

        /* An existing request keeps its own type on the list even when the rule
           would no longer offer it — a child who has since aged out, say. Dropping
           it would leave the select showing nothing at all, and re-filing under a
           type the employee did not choose is not this dialog's decision to make. */
        const current = leave && all.find((leaveType) => leaveType.id === leave.leaveTypeId)
        return current && !offered.includes(current) ? [...offered, current] : offered
    }, [leaveTypes, filesOwnRequest, authStore.user?.gender, authStore.user?.employmentStartDate, hasEligibleChild, leave])

    /* Whose request this is, when it isn't the signed-in user's own — an admin
       filing or editing on someone else's behalf. Wording only: the picker's
       "add your children" advice is nonsense to an admin, who has no screen for
       another employee's children. Not derived from the picker's employeeId, which
       is also set when a user opens their own request. */
    const onBehalfOfName = leave
        ? (leave.employeeId !== authStore.user?.id ? leave.employeeName : undefined)
        : requireEmployee
            ? (adminUsers ?? []).find((u) => u.id === watchedEmployeeId)?.displayName
            : undefined

    // Sync form state on open (populate from leave) and on close (reset).
    useEffect(() => {
        reset(buildDefaults())
        setEvidenceUrl(leave?.evidenceUrl ?? '')
        setEvidenceFile(null)
        setCoverageAttachmentUrl(leave?.coverageAttachmentUrl ?? '')
        setHandoverFile(null)
        setChildPickerBlocked(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, leave?.id])

    /* A delegate belongs to the employee's department, so picking a different
       employee invalidates whoever was chosen for the previous one. */
    useEffect(() => {
        if (requireEmployee) setValue('delegateId', '', { shouldValidate: false })
    }, [requireEmployee, watchedEmployeeId, setValue])

    /* Switching to a type that asks for no document takes the upload off the
       dialog, and a file left staged behind it would still upload on Save with
       nothing on screen to say so. */
    useEffect(() => {
        if (!attachmentOffered) setEvidenceFile(null)
    }, [attachmentOffered])

    /* The same trap one control over: a half day left selected behind a toggle that
       is no longer on screen would post a duration the server refuses, with nothing
       visible to explain why. */
    useEffect(() => {
        /* Guarded on the type being resolved, not on halfDayOffered alone. The type
           list arrives a tick after the dialog opens, and until it does every type
           reads as "no half days" — so an unguarded reset would wipe the duration
           off a half day being edited before anybody had touched anything. */
        if (selectedLeaveType && !halfDayOffered) setValue('duration', 'Full', { shouldValidate: true })

    }, [selectedLeaveType, halfDayOffered, setValue])

    /* A half day covers exactly one date, here as much as on the apply page. Run on
       the duration rather than in the button handler so it also catches a date typed
       into the End Date field after the half day was chosen. */
    useEffect(() => {
        const collapsed = collapseToHalfDay(watchedStartDate, watchedEndDate, watchedDuration)
        if (collapsed.endDate !== watchedEndDate) {
            setValue('endDate', collapsed.endDate, { shouldValidate: true })
        }
    }, [watchedDuration, watchedStartDate, watchedEndDate, setValue])

    const createMutation = useMutation({
        mutationFn: (req: CreateAnnualLeaveRequest) => createAnnualLeave(req),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['annualLeaves'] })
            onClose()
        },
    })

    const editMutation = useMutation({
        mutationFn: (req: EditAnnualLeaveRequest) => editAnnualLeave(req),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['annualLeaves'] })
            onClose()
        },
    })

    const uploadEvidenceMutation = useMutation({
        mutationFn: (file: File) => uploadLeaveEvidence(file),
    })

    const uploadHandoverMutation = useMutation({
        mutationFn: (file: File) => uploadCoverageHandover(file),
    })

    const isPending = createMutation.isPending || editMutation.isPending || uploadEvidenceMutation.isPending || uploadHandoverMutation.isPending
    const error = createMutation.error ?? editMutation.error ?? uploadEvidenceMutation.error ?? uploadHandoverMutation.error
    const dialogTitle = readOnly
        ? 'Leave Request Details'
        : isEdit ? 'Edit Leave Request' : isAdmin ? 'Assign Leave to User' : 'New Leave Request'
    const dialogDescription = readOnly
        ? 'View details (read only).'
        : isEdit
            ? 'Update dates, leave type, and notes.'
            : isAdmin
                ? 'Select an employee and create a leave request on their behalf.'
                : 'Fill in details and submit your leave request.'
    const submitLabel = isPending ? 'Saving...' : isEdit ? 'Save Changes' : isAdmin ? 'Assign Leave' : 'Submit Request'

    const dateFieldSx = {
        '& .MuiInputBase-root': {
            borderRadius: 2,
            backgroundColor: 'rgba(15, 23, 42, 0.02)',
        },
        '& input[type="date"]': {
            fontWeight: 600,
        },
        '& input[type="date"]::-webkit-calendar-picker-indicator': {
            cursor: 'pointer',
            opacity: 0.8,
            filter: 'saturate(1.2)',
        },
    }

    // Validated submit (react-hook-form blocks this when the zod schema fails,
    // so the existing API calls only fire on valid input).
    const onValid = async (values: AnnualLeaveFormValues) => {
        try {
            let nextEvidenceUrl = evidenceUrl.trim() || undefined

            if (evidenceFile) {
                const uploadResult = await uploadEvidenceMutation.mutateAsync(evidenceFile)
                nextEvidenceUrl = uploadResult.evidenceUrl
                setEvidenceUrl(uploadResult.evidenceUrl)
            }

            /* The handover goes to the delegate, so with nobody nominated the server
               drops both fields — no point uploading a file it will not keep. */
            const delegateId = values.delegateId.trim() || undefined
            let nextCoverageAttachmentUrl = delegateId ? coverageAttachmentUrl.trim() || undefined : undefined
            if (delegateId && handoverFile) {
                const uploadResult = await uploadHandoverMutation.mutateAsync(handoverFile)
                nextCoverageAttachmentUrl = uploadResult.coverageAttachmentUrl
                setCoverageAttachmentUrl(uploadResult.coverageAttachmentUrl)
            }
            const coverage = {
                delegateId,
                coverageNote: delegateId ? values.coverageNote.trim() || undefined : undefined,
                coverageAttachmentUrl: nextCoverageAttachmentUrl,
            }

            if (isEdit && leave) {
                await editMutation.mutateAsync({
                    id: leave.id,
                    startDate: values.startDate,
                    endDate: values.endDate,
                    duration: values.duration,
                    leaveTypeId: values.leaveTypeId,
                    // Sent only for a per-child type. The server clears it for any
                    // other type regardless, so there is no point handing it a
                    // stale id to discard.
                    childId: requiresChild ? values.childId : undefined,
                    reason: values.reason,
                    evidenceUrl: nextEvidenceUrl,
                    ...coverage,
                })
            } else {
                await createMutation.mutateAsync({
                    startDate: values.startDate,
                    endDate: values.endDate,
                    duration: values.duration,
                    leaveTypeId: values.leaveTypeId,
                    childId: requiresChild ? values.childId : undefined,
                    reason: values.reason,
                    evidenceUrl: nextEvidenceUrl,
                    ...coverage,
                    employeeId: isAdmin ? values.employeeId : (authStore.user?.id ?? ''),
                })
            }
        } catch {
            // Mutation state already exposes the API error to the form.
        }
    }

    return (
        <AppDialog open={open} onClose={onClose} maxWidth="sm">
            <AppDialogTitle>
                {dialogTitle}
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 400, fontSize: 13 }}>
                    {dialogDescription}
                </Typography>
            </AppDialogTitle>

            <AppDialogContent>
                <Stack spacing={3} component="form" id="leave-form" onSubmit={handleSubmit(onValid)} noValidate sx={{ pt: 1 }}>
                    {readOnly && leave && (() => {
                        const status = leave.status
                        const isRejected = status === 'Rejected'
                        const isApproved = status === 'Approved'
                        const isCancelled = status === 'Cancelled'
                        const bg = isRejected ? softBg('error') : isApproved ? softBg('success') : 'action.hover'
                        const fg = isRejected ? 'error.dark' : isApproved ? 'success.dark' : 'text.secondary'
                        const accent = isRejected ? 'error.main' : isApproved ? 'success.main' : 'text.disabled'
                        const label = isRejected
                            ? (statusFeedback?.comment ? 'Rejection reason' : 'Rejected')
                            : isApproved
                                ? (statusFeedback?.comment ? 'Approval note' : 'Approved')
                                : isCancelled
                                    ? 'Cancelled'
                                    : 'Status'
                        return (
                            <Box sx={{
                                p: '10px 14px', bgcolor: bg, color: fg,
                                borderLeft: '3px solid', borderLeftColor: accent,
                                borderRadius: '6px',
                            }}>
                                <Box sx={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mb: '4px' }}>
                                    {label}
                                </Box>
                                {statusFeedback?.comment ? (
                                    <Box sx={{ fontSize: 13, lineHeight: 1.5 }}>
                                        <Box component="strong">{statusFeedback.changedByUserName}:</Box>{' '}
                                        "{statusFeedback.comment}"
                                    </Box>
                                ) : (
                                    <Box sx={{ fontSize: 13, lineHeight: 1.5 }}>
                                        {isRejected
                                            ? 'No reason was provided.'
                                            : isApproved
                                                ? 'Your request has been approved.'
                                                : isCancelled
                                                    ? 'This request was cancelled.'
                                                    : status}
                                    </Box>
                                )}
                            </Box>
                        )
                    })()}
                    {isAdmin && !isEdit && (
                        <Controller
                            name="employeeId"
                            control={control}
                            render={({ field, fieldState }) => (
                                <TextField
                                    {...field}
                                    label="Assign to Employee"
                                    select
                                    fullWidth
                                    disabled={isLoadingUsers}
                                    error={!!fieldState.error}
                                    helperText={fieldState.error?.message ?? 'Required'}
                                >
                                    <MenuItem value="" disabled>
                                        Select employee
                                    </MenuItem>
                                    {(adminUsers ?? [])
                                        .filter((u) => u.roles.includes('Employee') || u.roles.includes('Manager'))
                                        .map((u) => (
                                            <MenuItem key={u.id} value={u.id}>
                                                {u.displayName} ({u.email})
                                            </MenuItem>
                                        ))}
                                </TextField>
                            )}
                        />
                    )}
                    {/* Whole days or half of one. Absent for a type the admin has
                        switched half days off for, and in read-only mode, where the
                        duration is already spelled out beside the dates. */}
                    {halfDayOffered && !readOnly && (
                        <Controller
                            name="duration"
                            control={control}
                            render={({ field }) => (
                                <Box sx={{ display: 'flex', gap: '4px', p: '3px', bgcolor: 'action.hover', borderRadius: '8px', width: 'fit-content' }}>
                                    {(['Full', 'HalfDayMorning', 'HalfDayAfternoon'] as const).map((option) => (
                                        <Button
                                            key={option}
                                            size="small"
                                            disableElevation
                                            aria-pressed={field.value === option}
                                            variant={field.value === option ? 'contained' : 'text'}
                                            onClick={() => field.onChange(option)}
                                            sx={{ textTransform: 'none', fontSize: 13, fontWeight: 600, borderRadius: '6px', px: 1.5 }}
                                        >
                                            {durationLabel(option)}
                                        </Button>
                                    ))}
                                </Box>
                            )}
                        />
                    )}
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        {readOnly ? (
                            <TextField
                                label="Start Date"
                                type="date"
                                value={leave ? toInputDate(leave.startDate) : ''}
                                fullWidth
                                disabled
                                InputLabelProps={{ shrink: true }}
                                helperText=" "
                                InputProps={{
                                    readOnly: true,
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <CalendarMonthIcon fontSize="small" color="action" />
                                        </InputAdornment>
                                    ),
                                }}
                                sx={dateFieldSx}
                            />
                        ) : (
                            <Controller
                                name="startDate"
                                control={control}
                                render={({ field, fieldState }) => (
                                    <TextField
                                        {...field}
                                        label="Start Date"
                                        type="date"
                                        required
                                        fullWidth
                                        InputLabelProps={{ shrink: true }}
                                        error={!!fieldState.error}
                                        helperText={fieldState.error?.message ?? 'Select start of leave'}
                                        InputProps={{
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    <CalendarMonthIcon fontSize="small" color="action" />
                                                </InputAdornment>
                                            ),
                                        }}
                                        sx={dateFieldSx}
                                    />
                                )}
                            />
                        )}
                        {readOnly ? (
                            <TextField
                                label="End Date"
                                type="date"
                                value={leave ? toInputDate(leave.endDate) : ''}
                                fullWidth
                                disabled
                                InputLabelProps={{ shrink: true }}
                                helperText=" "
                                InputProps={{
                                    readOnly: true,
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <CalendarMonthIcon fontSize="small" color="action" />
                                        </InputAdornment>
                                    ),
                                }}
                                sx={dateFieldSx}
                            />
                        ) : (
                            <Controller
                                name="endDate"
                                control={control}
                                render={({ field, fieldState }) => (
                                    <TextField
                                        {...field}
                                        label="End Date"
                                        type="date"
                                        required
                                        fullWidth
                                        InputLabelProps={{ shrink: true }}
                                        inputProps={{ min: watchedStartDate }}
                                        error={!!fieldState.error}
                                        helperText={fieldState.error?.message ?? 'Select end of leave'}
                                        InputProps={{
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    <CalendarMonthIcon fontSize="small" color="action" />
                                                </InputAdornment>
                                            ),
                                        }}
                                        sx={dateFieldSx}
                                    />
                                )}
                            />
                        )}
                    </Stack>
                    {readOnly ? (
                        <TextField
                            label="Leave Type"
                            value={leaveTypes?.find((lt) => lt.id === (leave?.leaveTypeId ?? 0))?.name ?? ''}
                            fullWidth
                            disabled
                            helperText=" "
                            InputProps={{ readOnly: true }}
                        />
                    ) : (
                        <Controller
                            name="leaveTypeId"
                            control={control}
                            render={({ field, fieldState }) => (
                                <TextField
                                    label="Leave Type"
                                    select
                                    value={field.value}
                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                    onBlur={field.onBlur}
                                    inputRef={field.ref}
                                    required
                                    fullWidth
                                    disabled={isLoadingLeaveTypes}
                                    error={!!fieldState.error}
                                    helperText={fieldState.error?.message ?? 'Required'}
                                >
                                    <MenuItem value={0} disabled>
                                        Select leave type
                                    </MenuItem>
                                    {offeredLeaveTypes.map((leaveType) => (
                                        <MenuItem key={leaveType.id} value={leaveType.id}>
                                            {leaveType.name}
                                        </MenuItem>
                                    ))}
                                </TextField>
                            )}
                        />
                    )}

                    {/* Only for a type whose budget is per child. The server clears
                        childId for every other type, so a stale selection cannot
                        survive a change of leave type. */}
                    {requiresChild && !readOnly && (
                        awaitingEmployeeSelection ? (
                            <Alert severity="info">
                                Select an employee first to choose the child this leave is for.
                            </Alert>
                        ) : (
                            <Controller
                                name="childId"
                                control={control}
                                render={({ field, fieldState }) => (
                                    <ChildLeavePicker
                                        value={field.value}
                                        onChange={field.onChange}
                                        // Editing someone else's request: the ledger to load is
                                        // theirs, not the signed-in admin/manager's own — see
                                        // Fix 1. On create, it follows whichever employee the
                                        // admin has picked so far.
                                        employeeId={leave?.employeeId ?? (requireEmployee ? (watchedEmployeeId || undefined) : undefined)}
                                        childEligibleUntilAge={childEligibleUntilAge}
                                leaveTypeId={perChildLeaveTypeIds.includes(watchedLeaveTypeId) ? watchedLeaveTypeId : undefined}
                                        onBehalfOfName={onBehalfOfName}
                                        requestedDays={requestedDays}
                                        error={fieldState.error?.message}
                                        onBlockedChange={setChildPickerBlocked}
                                    />
                                )}
                            />
                        )
                    )}

                    {readOnly && !!leave?.childName && (
                        <TextField
                            label="Child"
                            value={leave.childName}
                            fullWidth
                            disabled
                            InputProps={{ readOnly: true }}
                            helperText=" "
                        />
                    )}
                    {(() => {
                        if (readOnly) {
                            const trimmed = (leave?.reason ?? '').trim()
                            const isPlaceholderOnly = trimmed === '' || /^[-_‐-―−.·•]+$/.test(trimmed)
                            if (isPlaceholderOnly) return null
                            return (
                                <TextField
                                    label="Reason"
                                    value={leave?.reason ?? ''}
                                    multiline
                                    rows={3}
                                    fullWidth
                                    disabled
                                    InputProps={{ readOnly: true }}
                                    helperText=" "
                                />
                            )
                        }
                        return (
                            <Controller
                                name="reason"
                                control={control}
                                render={({ field, fieldState }) => (
                                    <TextField
                                        {...field}
                                        label="Reason"
                                        multiline
                                        rows={3}
                                        required
                                        fullWidth
                                        error={!!fieldState.error}
                                        helperText={fieldState.error?.message ?? 'Required'}
                                        placeholder="Add a short reason for this request"
                                    />
                                )}
                            />
                        )
                    })()}

                    {/* Coverage. Mandatory for an Employee or a Manager (CoverageRule,
                        mirrored by lib/coverage.ts), with a handover note and document
                        that go to the delegate alone once the leave is approved. */}
                    {readOnly ? (
                        <>
                            {!!leave?.delegateName && (
                                <TextField
                                    label="Covered by"
                                    value={leave.delegateName}
                                    fullWidth
                                    disabled
                                    InputProps={{ readOnly: true }}
                                    helperText=" "
                                />
                            )}
                            {!!leave?.coverageNote && (
                                <TextField
                                    label="Handover note"
                                    value={leave.coverageNote}
                                    multiline
                                    rows={3}
                                    fullWidth
                                    disabled
                                    InputProps={{ readOnly: true }}
                                    helperText=" "
                                />
                            )}
                            {!!leave?.coverageAttachmentUrl && (
                                <Button
                                    size="small"
                                    href={resolveFileUrl(leave.coverageAttachmentUrl) ?? leave.coverageAttachmentUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    endIcon={<OpenInNewIcon fontSize="inherit" />}
                                    sx={{ alignSelf: 'flex-start', px: 0, textTransform: 'none' }}
                                >
                                    View handover document
                                </Button>
                            )}
                        </>
                    ) : (
                        <Stack spacing={2}>
                            <Controller
                                name="delegateId"
                                control={control}
                                render={({ field, fieldState }) => (
                                    <TextField
                                        label="Covered by"
                                        select
                                        value={field.value}
                                        onChange={(e) => field.onChange(e.target.value)}
                                        onBlur={field.onBlur}
                                        inputRef={field.ref}
                                        required={requireDelegate}
                                        fullWidth
                                        disabled={awaitingEmployeeSelection}
                                        error={!!fieldState.error}
                                        helperText={
                                            fieldState.error?.message
                                                ?? (awaitingEmployeeSelection
                                                    ? 'Select an employee first.'
                                                    : requireDelegate
                                                        ? 'Required. They are emailed once the leave is approved.'
                                                        : 'Optional. They are emailed once the leave is approved.')
                                        }
                                    >
                                        <MenuItem value="">
                                            {requireDelegate ? 'Choose a colleague' : 'Nobody'}
                                        </MenuItem>
                                        {delegateOptions.map((option) => (
                                            <MenuItem key={option.userId} value={option.userId}>
                                                {option.label}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                )}
                            />

                            {/* Only with somebody to hand over to — the server drops
                                both for a request that names no delegate. */}
                            {!!watchedDelegateId && (
                                <>
                                    <Controller
                                        name="coverageNote"
                                        control={control}
                                        render={({ field, fieldState }) => (
                                            <TextField
                                                {...field}
                                                label="Handover note"
                                                multiline
                                                rows={3}
                                                fullWidth
                                                inputProps={{ maxLength: COVERAGE_NOTE_MAX_LENGTH }}
                                                error={!!fieldState.error}
                                                helperText={fieldState.error?.message ?? 'Optional. Sent to the delegate only, not to the approver or the team.'}
                                                placeholder="Open tasks, who to call, where things are."
                                            />
                                        )}
                                    />
                                    <Stack spacing={0.75}>
                                        <Button component="label" variant="outlined" startIcon={<AttachFileIcon />} disabled={isPending} sx={{ alignSelf: 'flex-start' }}>
                                            {handoverFile ? 'Change handover document' : coverageAttachmentUrl ? 'Replace handover document' : 'Attach handover document'}
                                            <input
                                                hidden
                                                type="file"
                                                data-testid="handover-file-input"
                                                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                                                onChange={(event) => {
                                                    const selectedFile = event.target.files?.[0] ?? null
                                                    setHandoverFile(selectedFile)
                                                }}
                                            />
                                        </Button>
                                        {handoverFile ? (
                                            <Typography variant="body2" color="text.secondary">
                                                Selected file: {handoverFile.name}
                                            </Typography>
                                        ) : coverageAttachmentUrl ? (
                                            <Button
                                                size="small"
                                                href={resolveFileUrl(coverageAttachmentUrl) ?? coverageAttachmentUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                endIcon={<OpenInNewIcon fontSize="inherit" />}
                                                sx={{ alignSelf: 'flex-start', px: 0, textTransform: 'none' }}
                                            >
                                                View current handover document
                                            </Button>
                                        ) : null}
                                        <Typography variant="caption" color="text.secondary">
                                            Optional: PDF, Word, Excel, JPG, or PNG up to 10 MB, attached to the email the delegate gets.
                                        </Typography>
                                    </Stack>
                                </>
                            )}
                        </Stack>
                    )}

                    {/* Evidence. Off the dialog entirely for a type set to "No
                        attachment needed", unless the request already carries a
                        document — see isAttachmentOffered. */}
                    {attachmentOffered && (
                        <Stack spacing={0.75}>
                            {!readOnly && (
                                <Button component="label" variant="outlined" startIcon={<AttachFileIcon />} disabled={isPending} sx={{ alignSelf: 'flex-start' }}>
                                    {evidenceFile ? 'Change evidence file' : evidenceUrl ? 'Replace evidence file' : 'Upload evidence'}
                                    <input
                                        hidden
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                        onChange={(event) => {
                                            const selectedFile = event.target.files?.[0] ?? null
                                            setEvidenceFile(selectedFile)
                                        }}
                                    />
                                </Button>
                            )}

                            {evidenceFile ? (
                                <Typography variant="body2" color="text.secondary">
                                    Selected file: {evidenceFile.name}
                                </Typography>
                            ) : evidenceUrl ? (
                                <Button
                                    size="small"
                                    // Reached only when evidenceUrl is non-empty, so the
                                    // resolver cannot return undefined here.
                                    href={resolveFileUrl(evidenceUrl) ?? evidenceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    endIcon={<OpenInNewIcon fontSize="inherit" />}
                                    sx={{ alignSelf: 'flex-start', px: 0, textTransform: 'none' }}
                                >
                                    {readOnly ? 'View evidence' : 'View current evidence'}
                                </Button>
                            ) : readOnly ? (
                                <Typography variant="body2" color="text.disabled">
                                    No evidence attached.
                                </Typography>
                            ) : null}

                            {!readOnly && (
                                <Typography
                                    variant="caption"
                                    color={attachmentBlocking ? 'error' : attachmentMissing ? 'warning.dark' : 'text.secondary'}
                                >
                                    {attachmentRule === 'required'
                                        ? attachmentBlocking
                                            ? 'Required: upload PDF, image, DOC, or DOCX evidence (max 10 MB).'
                                            : 'Required before approval: upload PDF, image, DOC, or DOCX evidence (max 10 MB). The request can be saved without it and approved once it is attached.'
                                        : attachmentRule === 'encouraged'
                                            ? 'Recommended: upload PDF, image, DOC, or DOCX evidence (max 10 MB).'
                                            /* Only reachable for a request that carries evidence under a type
                                               since set to "No attachment needed" — anything else hides this
                                               whole block, so "Optional" would be describing a form nobody sees. */
                                            : 'This leave type no longer asks for a document. The one already attached is kept.'}
                                </Typography>
                            )}
                        </Stack>
                    )}

                    {!readOnly && noticeBreach ? <Alert severity="error">{noticeBreach}</Alert> : null}
                    {/* Advisory, not a blocker — see `lengthWarning` above. */}
                    {!readOnly && !noticeBreach && lengthWarning
                        ? <Alert severity="warning">{lengthWarning}</Alert>
                        : null}

                    {error ? <Alert severity="error">{getErrorMessage(error)}</Alert> : null}
                </Stack>
            </AppDialogContent>

            <AppDialogActions>
                <Button variant="outlined" sx={cancelBtnSx} onClick={onClose} disabled={isPending}>
                    {readOnly ? 'Close' : 'Cancel'}
                </Button>
                {!readOnly && (
                    <Button
                        type="submit"
                        form="leave-form"
                        variant="contained"
                        sx={saveBtnSx}
                        disabled={isPending || isLoadingLeaveTypes || childPickerBlocked || attachmentBlocking || !!noticeBreach}
                        startIcon={isPending ? <CircularProgress size={16} color="inherit" /> : null}
                    >
                        {submitLabel}
                    </Button>
                )}
            </AppDialogActions>
        </AppDialog>
    )
}

export default AnnualLeaveForm
