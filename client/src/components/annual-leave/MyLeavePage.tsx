import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { observer } from 'mobx-react-lite'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { currentYearEntitlement, describePerChildTotals, ordinal } from '../../lib/leave-allowance'
import { resolveFileUrl } from '../../lib/api/file-url'
import { iconForLeaveType } from './leave-icons'
import {
    deleteAnnualLeave,
    getAnnualLeaves,
    getAppSettings,
    getEmployeeProfiles,
    getLeaveStatusHistories,
    getLeaveTypes,
} from '../../lib/api'
import { getApiErrorMessage } from '../../lib/api/error-utils'
import { isAwaitingDocument } from '../../lib/attachment-policy'
import { useOfferedLeaveTypes, type PerChildLedger } from '../../lib/hooks'
import { buildLeaveBalanceRows } from '../../lib/leave-balance-rows'
import { useStore } from '../../lib/mobx'
import type { AnnualLeave, AnnualLeaveStatus, ChildLeaveEntitlement, LeaveStatusHistory, UserInfo } from '../../lib/types'
import AnnualLeaveForm from './AnnualLeaveForm'
import { SweetAlert } from '../ui'
import { softBg, type SxColor } from '../../lib/theme-tokens'

type StatusFilter = 'All' | 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'

const STATUS_TABS: StatusFilter[] = ['All', 'Pending', 'Approved', 'Rejected', 'Cancelled']


const TYPE_PALETTE: Record<string, { bg: SxColor; fill: string }> = {
    annual:      { bg: softBg('info'), fill: 'primary.main' },
    sick:        { bg: softBg('error'), fill: 'error.main' },
    personal:    { bg: softBg('primary'), fill: 'primary.main' },
    bereavement: { bg: 'action.hover', fill: 'text.secondary' },
    unpaid:      { bg: 'divider', fill: 'text.disabled' },
    maternity:   { bg: softBg('secondary'), fill: 'secondary.main' },
    other:       { bg: 'divider', fill: 'text.disabled' },
}

const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

function leaveTypeKey(name?: string | null): keyof typeof TYPE_PALETTE {
    const n = (name ?? '').toLowerCase()
    if (n.includes('annual') || n.includes('vacation')) return 'annual'
    if (n.includes('sick')) return 'sick'
    if (n.includes('personal')) return 'personal'
    if (n.includes('bereavement')) return 'bereavement'
    if (n.includes('unpaid')) return 'unpaid'
    if (n.includes('maternity') || n.includes('paternity') || n.includes('parental')) return 'maternity'
    return 'other'
}

function formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Formatted in UTC, unlike `formatDate` above. A date-only value parses as UTC
 * midnight, so rendering it in local time anywhere west of UTC shows the day
 * before — which, on a child's last eligible date, reads as a day less
 * eligibility than the server will actually approve. `formatDate` stays local
 * because what it formats are timestamps.
 */
function formatDateUtc(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
    })
}

function plural(count: number, one: string, many: string) {
    return `${count} ${count === 1 ? one : many}`
}

function daysBetween(a: Date, b: Date) {
    return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

function nextWorkingDay(iso: string) {
    if (!iso) return '—'
    const d = new Date(iso)
    d.setDate(d.getDate() + 1)
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

const MyLeavePage = observer(function MyLeavePage({ user }: { user: UserInfo }) {
    const { uiStore } = useStore()
    const queryClient = useQueryClient()
    const isAdminUser = user.roles.includes('Admin')

    const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
    const [viewLeave, setViewLeave] = useState<AnnualLeave | null>(null)
    /* A pending request is editable from here — the API always allowed the
       employee to edit their own pending request, but the row offered only
       Cancel. It matters because of the attachment rule: a required document is
       checked at approval, not filing, so an employee whose papers are dated the
       day of service files first and attaches them from this row afterwards. */
    const [editLeave, setEditLeave] = useState<AnnualLeave | null>(null)
    const [apiError, setApiError] = useState('')

    const { data: allLeaves = [], isLoading } = useQuery({ queryKey: ['annualLeaves'], queryFn: getAnnualLeaves })
    const { data: leaveTypes = [] } = useQuery({ queryKey: ['leaveTypes'], queryFn: getLeaveTypes })
    const { data: profiles = [] } = useQuery({ queryKey: ['employeeProfiles'], queryFn: getEmployeeProfiles })
    const { data: settings } = useQuery({ queryKey: ['appSettings'], queryFn: getAppSettings })
    const { data: histories = [] } = useQuery({ queryKey: ['leaveStatusHistories'], queryFn: getLeaveStatusHistories })
    const leaveTypeById = useMemo(
        () => new Map(leaveTypes.map((lt) => [lt.id, lt])),
        [leaveTypes]
    )

    /* Which types this employee is offered, and the per-child ledger behind the
       two that keep one — the same hook the employee dashboard's balance card
       uses, so the two panels cannot disagree. */
    const { offeredLeaveTypes, ledgerByTypeId, perChildLedgers } = useOfferedLeaveTypes(
        leaveTypes, user.gender, user.employmentStartDate,
    )

    const latestStatusComment = useMemo(() => {
        const map = new Map<string, LeaveStatusHistory>()
        for (const h of histories) {
            if (!h.comment) continue
            const prev = map.get(h.annualLeaveId)
            if (!prev || new Date(h.changedAt) > new Date(prev.changedAt)) {
                map.set(h.annualLeaveId, h)
            }
        }
        return map
    }, [histories])

    const myLeaves = useMemo(
        () => allLeaves
            .filter((l) => l.employeeId === user.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        [allLeaves, user.id]
    )

    const filteredLeaves = useMemo(
        () => statusFilter === 'All' ? myLeaves : myLeaves.filter((l) => l.status === statusFilter),
        [myLeaves, statusFilter]
    )

    const tabCounts = useMemo(() => {
        const c: Record<StatusFilter, number> = { All: myLeaves.length, Pending: 0, Approved: 0, Rejected: 0, Cancelled: 0 }
        for (const l of myLeaves) {
            if (l.status in c) c[l.status as StatusFilter]++
        }
        return c
    }, [myLeaves])

    const myProfile = profiles.find((p) => p.userId === user.id)
    // This year's figure, pro-rated by the server for a mid-year joiner when the
    // balance type asks for it — what the API will actually approve up to.
    const entitlement = currentYearEntitlement(myProfile)

    const currentYear = new Date().getFullYear()
    const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

    const approvedThisYear = useMemo(
        () => myLeaves.filter((l) => l.status === 'Approved' && new Date(l.startDate).getFullYear() === currentYear),
        [myLeaves, currentYear]
    )

    /* Two figures, not one. "Days remaining" is annual leave, so it deducts only
       what comes out of the pooled budget the API enforces — a sick day is not an
       annual-leave day. The tile beside it says "across all types" and so counts
       all of them: sick days, personal days and paternity leave are days the
       employee was away, however they are budgeted. Sharing the first figure made
       the second quietly under-report every absence of a type that is tracked
       separately. A leave whose type no longer resolves counts towards both, which
       is the safer way for it to be wrong. */
    const daysUsedAgainstBalance = useMemo(() => {
        return approvedThisYear.reduce((sum, l) => {
            const lt = l.leaveTypeId != null ? leaveTypeById.get(l.leaveTypeId) : undefined
            return sum + (lt?.affectsBalance === false ? 0 : l.totalDays)
        }, 0)
    }, [approvedThisYear, leaveTypeById])

    const daysTakenThisYear = useMemo(
        () => approvedThisYear.reduce((sum, l) => sum + l.totalDays, 0),
        [approvedThisYear]
    )

    const remainingAnnual = Math.max(0, entitlement - daysUsedAgainstBalance)

    // Days until year-end (based on configured leave year start month if any)
    const yearEndDays = useMemo(() => {
        const startMonth = (settings?.leaveYearStartMonth ?? 1) - 1
        const now = today
        const startYear = now.getMonth() >= startMonth ? now.getFullYear() : now.getFullYear() - 1
        const lyEnd = new Date(startYear + 1, startMonth, 0)
        return Math.max(0, daysBetween(now, lyEnd))
    }, [settings, today])

    // Per-type breakdown for the balance panel. Both ledgers are quoted here; see
    // buildLeaveBalanceRows for which type is measured against which.
    const balanceByType = useMemo(
        () => buildLeaveBalanceRows({
            leaveTypes: offeredLeaveTypes,
            approvedThisYear,
            entitlement,
            ledgerByTypeId,
            firstYear: { employmentStartDate: myProfile?.employmentStartDate, leaveYearStartMonth: settings?.leaveYearStartMonth ?? 1 },
        }),
        [offeredLeaveTypes, approvedThisYear, entitlement, ledgerByTypeId, myProfile?.employmentStartDate, settings?.leaveYearStartMonth],
    )

    // Year usage timeline — aggregate working-day count per month (current calendar year)
    const yearUsage = useMemo(() => {
        const buckets: { total: number; dominant: keyof typeof TYPE_PALETTE | null; perType: Map<string, number> }[] =
            Array.from({ length: 12 }, () => ({ total: 0, dominant: null, perType: new Map() }))

        for (const l of myLeaves) {
            if (l.status !== 'Approved' && l.status !== 'Pending') continue
            const s = new Date(l.startDate)
            const e = new Date(l.endDate)
            const lt = l.leaveTypeId != null ? leaveTypeById.get(l.leaveTypeId) : undefined
            const key = leaveTypeKey(lt?.name)
            for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
                if (d.getFullYear() !== currentYear) continue
                const dow = d.getDay()
                if (dow === 0 || dow === 6) continue
                const m = d.getMonth()
                buckets[m].total++
                buckets[m].perType.set(key, (buckets[m].perType.get(key) ?? 0) + 1)
            }
        }

        for (const b of buckets) {
            if (b.total === 0) continue
            let max = -1
            for (const [k, v] of b.perType) {
                if (v > max) { max = v; b.dominant = k as keyof typeof TYPE_PALETTE }
            }
        }
        return buckets
    }, [myLeaves, leaveTypeById, currentYear])

    const totalYearDays = yearUsage.reduce((a, b) => a + b.total, 0)
    const activeYearMonths = yearUsage.filter((b) => b.total > 0).length

    // Group requests for sections
    const pendingLeaves = myLeaves.filter((l) => l.status === 'Pending')
    const approvedUpcoming = myLeaves
        .filter((l) => l.status === 'Approved' && new Date(l.startDate) > today)
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    const pastLeaves = myLeaves.filter((l) => !pendingLeaves.includes(l) && !approvedUpcoming.includes(l))

    // The hero "upcoming" card picks the next pending or approved with a near start date
    const nextLeave: AnnualLeave | null = useMemo(() => {
        const candidates = [...pendingLeaves, ...approvedUpcoming]
            .filter((l) => new Date(l.startDate) >= today)
            .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
        return candidates[0] ?? null
    }, [pendingLeaves, approvedUpcoming, today])

    const cancelMutation = useMutation({
        mutationFn: (id: string) => deleteAnnualLeave(id),
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['annualLeaves'] }) },
        onError: (err) => { setApiError(getApiErrorMessage(err, 'Failed to cancel leave request.')) },
    })

    async function handleCancel(leave: AnnualLeave) {
        const result = await SweetAlert.fire({
            title: 'Cancel Leave Request?',
            text: `Cancel your ${formatDate(leave.startDate)} – ${formatDate(leave.endDate)} leave request?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, cancel it',
            cancelButtonText: 'Keep it',
            confirmButtonColor: '#EF4444',
        })
        if (result.isConfirmed) {
            setApiError('')
            await cancelMutation.mutateAsync(leave.id)
        }
    }

    const formOpen = uiStore.isCreateDrawerOpen

    // ── Rendering helpers ───────────────────────────────────────────────

    const visibleLeaves =
        statusFilter === 'All'
            ? { pending: pendingLeaves, upcoming: approvedUpcoming, past: pastLeaves }
            : { pending: [], upcoming: [], past: filteredLeaves }

    const totalVisible = visibleLeaves.pending.length + visibleLeaves.upcoming.length + visibleLeaves.past.length

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress size={28} />
            </Box>
        )
    }

    return (
        <>
            {apiError && (
                <Alert severity="error" onClose={() => setApiError('')} sx={{ mb: 2 }}>
                    {apiError}
                </Alert>
            )}

            {/* Mini stats */}
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
                gap: '12px', mb: '14px',
            }}>
                <MiniStat label="🌴 Days remaining" value={String(remainingAnnual)} valueColor={'primary.main'}
                          sub={`of ${entitlement} annual leave`} />
                <MiniStat label="⏳ Pending" value={String(tabCounts.Pending)} valueColor="#F59E0B"
                          sub={`request${tabCounts.Pending === 1 ? '' : 's'} awaiting approval`} />
                <MiniStat label={`✓ Taken in ${currentYear}`} value={String(daysTakenThisYear)} valueColor="#22C47A"
                          sub="days · across all types" />
                <MiniStat label="📅 Until year-end" value={String(yearEndDays)}
                          sub="days left to book" />
            </Box>

            {/* Hero */}
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '2fr 3fr' },
                gap: '14px', mb: '14px',
            }}>
                {nextLeave
                    ? <UpcomingCard leave={nextLeave} leaveTypeName={nextLeave.leaveTypeId != null ? leaveTypeById.get(nextLeave.leaveTypeId)?.name : undefined} today={today} />
                    : <EmptyUpcoming onApply={() => uiStore.navigateToApplyLeave()} />}

                <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '12px', p: '18px 20px' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: '14px' }}>
                        <Box sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary' }}>My Leave Balance</Box>
                        <Box sx={{ fontSize: 11, color: 'text.secondary' }}>{currentYear}</Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {balanceByType.length === 0
                            ? <Box sx={{ fontSize: 12, color: 'text.secondary' }}>No active leave types.</Box>
                            : balanceByType.map((b) => (
                                <BalanceRow key={b.id} name={b.name} used={b.used} total={b.total}
                                            remaining={b.remaining} tracked={b.tracked} />
                            ))}
                    </Box>
                </Box>
            </Box>

            {/* A card per per-child ledger the employee is offered — paternity leave,
                in practice, but maternity leave too where it is configured per child.
                One card each rather than one card: the two types configure different
                weeks and different cut-off ages, so their figures cannot be merged.
                Nothing renders without children on file to describe. */}
            {perChildLedgers.map((entry) => (
                <PerChildLeaveCard key={entry.type.id} type={entry.type} ledger={entry.ledger} />
            ))}

            {/* Year usage timeline */}
            <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '12px', p: '18px 20px', mb: '14px' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <Box sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary' }}>
                        {currentYear} leave activity ·{' '}
                        <Box component="strong" sx={{ color: 'primary.main', fontSize: 15 }}>{totalYearDays} days</Box>
                        {' '}used so far
                    </Box>
                    {activeYearMonths >= 2 && (
                        <Box sx={{ display: 'flex', gap: '12px', fontSize: 11, color: 'text.secondary' }}>
                            <LegendSwatch color={TYPE_PALETTE.annual.fill} label="Annual" />
                            <LegendSwatch color={TYPE_PALETTE.sick.fill} label="Sick" />
                            <LegendSwatch color={TYPE_PALETTE.personal.fill} label="Personal" />
                            <LegendSwatch color="#F4F5F7" label="None" bordered />
                        </Box>
                    )}
                </Box>
                {activeYearMonths < 2 ? (
                    <Box sx={{ fontSize: 12, color: 'text.secondary', textAlign: 'center', py: '18px' }}>
                        No activity yet this year.
                    </Box>
                ) : (
                    <>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '30px repeat(12, 1fr)', gap: '4px', alignItems: 'center' }}>
                            <Box sx={{ fontSize: 10, color: 'text.secondary', fontWeight: 500, textAlign: 'right', pr: '4px' }}>Days</Box>
                            {yearUsage.map((b, i) => {
                                const isCurrent = i === today.getMonth()
                                const isFuture = i > today.getMonth()
                                const palette = b.dominant ? TYPE_PALETTE[b.dominant] : null
                                return (
                                    <Box
                                        key={i}
                                        title={`${MONTH_INITIALS[i]}: ${b.total > 0 ? `${b.total} day${b.total === 1 ? '' : 's'}` : 'no leave'}`}
                                        sx={{
                                            height: 28,
                                            bgcolor: palette ? palette.fill : 'action.hover',
                                            color: palette ? '#fff' : 'transparent',
                                            borderRadius: '4px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 10, fontWeight: 600,
                                            opacity: isFuture ? 0.55 : 1,
                                            boxShadow: isCurrent ? `inset 0 0 0 2px ${'text.primary'}` : 'none',
                                        }}
                                    >
                                        {b.total > 0 ? b.total : ''}
                                    </Box>
                                )
                            })}
                        </Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '30px repeat(12, 1fr)', gap: '4px', mt: '6px' }}>
                            <Box />
                            {MONTH_INITIALS.map((m, i) => (
                                <Box key={i} sx={{
                                    fontSize: 10, color: i === today.getMonth() ? 'text.primary' : 'text.disabled',
                                    textAlign: 'center', fontWeight: i === today.getMonth() ? 700 : 500,
                                }}>{m}</Box>
                            ))}
                        </Box>
                    </>
                )}
            </Box>

            {/* Tabs + Apply */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: '18px', mx: '4px', mb: '10px' }}>
                <Box sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary' }}>All requests</Box>
                {!isAdminUser && (
                    <Box
                        component="button"
                        onClick={() => uiStore.navigateToApplyLeave()}
                        sx={{
                            bgcolor: 'primary.main', color: '#fff', border: 'none', borderRadius: '6px',
                            px: '14px', py: '6px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                            fontFamily: 'inherit', transition: 'background 0.15s',
                            '&:hover': { bgcolor: 'primary.dark' },
                        }}
                    >
                        + Apply for leave
                    </Box>
                )}
            </Box>

            <Box sx={{ display: 'flex', gap: '2px', mb: '14px', borderBottom: '1px solid', borderColor: 'divider', px: '2px' }}>
                {STATUS_TABS.map((tab) => {
                    const active = statusFilter === tab
                    const count = tabCounts[tab]
                    return (
                        <Box
                            key={tab}
                            component="button"
                            onClick={() => setStatusFilter(tab)}
                            sx={{
                                p: '9px 16px', fontSize: 13, color: active ? 'primary.main' : 'text.secondary',
                                cursor: 'pointer', borderBottom: active ? `2px solid ${'primary.main'}` : '2px solid transparent',
                                mb: '-1px', display: 'flex', alignItems: 'center', gap: '6px',
                                background: 'none', border: 'none', fontFamily: 'inherit',
                                fontWeight: active ? 600 : 500,
                                '&:hover': { color: active ? 'primary.main' : 'text.primary' },
                            }}
                        >
                            {tab}
                            <Box component="span" sx={{
                                bgcolor: active ? softBg('primary') : 'action.hover',
                                color: active ? 'primary.main' : 'text.secondary',
                                fontSize: 10, fontWeight: 600,
                                px: '7px', borderRadius: '10px',
                            }}>{count}</Box>
                        </Box>
                    )
                })}
            </Box>

            {totalVisible === 0 ? (
                <Box sx={{
                    bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '10px',
                    py: 6, textAlign: 'center', color: 'text.secondary', fontSize: 13,
                }}>
                    {statusFilter === 'All'
                        ? 'You have no leave requests yet.'
                        : `No ${statusFilter.toLowerCase()} leave requests.`}
                </Box>
            ) : (
                <>
                    {visibleLeaves.pending.length > 0 && (
                        <>
                            <SectionHeader title="⏳ Awaiting decision" />
                            {visibleLeaves.pending.map((l) => (
                                <LeaveCard
                                    key={l.id}
                                    leave={l}
                                    leaveTypeName={l.leaveTypeId != null ? leaveTypeById.get(l.leaveTypeId)?.name : undefined}
                                    today={today}
                                    feedback={latestStatusComment.get(l.id)}
                                    awaitingDocument={isAwaitingDocument(
                                        l.leaveTypeId != null ? leaveTypeById.get(l.leaveTypeId) : undefined,
                                        l.evidenceUrl,
                                    )}
                                    onEdit={() => setEditLeave(l)}
                                    onCancel={() => void handleCancel(l)}
                                    onView={() => setViewLeave(l)}
                                />
                            ))}
                        </>
                    )}
                    {visibleLeaves.upcoming.length > 0 && (
                        <>
                            <SectionHeader title="✓ Approved & upcoming" />
                            {visibleLeaves.upcoming.map((l) => (
                                <LeaveCard
                                    key={l.id}
                                    leave={l}
                                    leaveTypeName={l.leaveTypeId != null ? leaveTypeById.get(l.leaveTypeId)?.name : undefined}
                                    today={today}
                                    feedback={latestStatusComment.get(l.id)}
                                    onView={() => setViewLeave(l)}
                                />
                            ))}
                        </>
                    )}
                    {visibleLeaves.past.length > 0 && (
                        <>
                            <SectionHeader title={statusFilter === 'All' ? 'Past requests' : statusFilter} />
                            {visibleLeaves.past.map((l) => (
                                <LeaveCard
                                    key={l.id}
                                    leave={l}
                                    leaveTypeName={l.leaveTypeId != null ? leaveTypeById.get(l.leaveTypeId)?.name : undefined}
                                    today={today}
                                    feedback={latestStatusComment.get(l.id)}
                                    onView={() => setViewLeave(l)}
                                />
                            ))}
                        </>
                    )}
                </>
            )}

            <AnnualLeaveForm
                open={formOpen}
                onClose={() => uiStore.closeCreateDrawer()}
                isAdmin={isAdminUser}
            />

            {/* The employee's own request, so never the admin variant: the type
                list is filtered by the employee's own eligibility, as on the
                apply page. */}
            <AnnualLeaveForm
                open={editLeave !== null}
                leave={editLeave ?? undefined}
                onClose={() => setEditLeave(null)}
            />

            <LeaveDetailsDialog
                leave={viewLeave}
                leaveTypeName={viewLeave?.leaveTypeId != null ? leaveTypeById.get(viewLeave.leaveTypeId)?.name : undefined}
                feedback={viewLeave ? latestStatusComment.get(viewLeave.id) : undefined}
                onClose={() => setViewLeave(null)}
            />
        </>
    )
})

/* ───────────────────────── subcomponents ───────────────────────── */

function MiniStat({ label, value, sub, valueColor }: {
    label: string; value: string; sub: string; valueColor?: string
}) {
    return (
        <Box sx={{
            bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '10px', p: '14px 16px',
        }}>
            <Box sx={{ fontSize: 11, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', mb: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {label}
            </Box>
            <Box sx={{ fontSize: 22, fontWeight: 700, color: valueColor ?? 'text.primary', lineHeight: 1 }}>{value}</Box>
            <Box sx={{ fontSize: 11, color: 'text.secondary', mt: '4px' }}>{sub}</Box>
        </Box>
    )
}

function UpcomingCard({ leave, leaveTypeName, today }: {
    leave: AnnualLeave; leaveTypeName?: string; today: Date
}) {
    const start = new Date(leave.startDate)
    start.setHours(0, 0, 0, 0)
    const until = daysBetween(today, start)
    const isPending = leave.status === 'Pending'
    const countdown = until === 0 ? 'Today' : until === 1 ? 'Tomorrow' : `In ${until} days`
    const sameDay = leave.startDate.slice(0, 10) === leave.endDate.slice(0, 10)
    const datesStr = sameDay
        ? formatDate(leave.startDate)
        : `${formatDate(leave.startDate)} → ${formatDate(leave.endDate)}`

    return (
        <Box sx={{
            background: 'linear-gradient(135deg, #4F8EF7 0%, #3A7AE4 100%)',
            color: '#fff', borderRadius: '12px', p: '20px 22px',
            position: 'relative', overflow: 'hidden',
            '&::before': {
                content: '"🌴"', position: 'absolute', right: -10, bottom: -20,
                fontSize: 120, opacity: 0.15, transform: 'rotate(-12deg)',
            },
        }}>
            <Box sx={{ fontSize: 11, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.08em', mb: '8px' }}>
                {isPending ? '⏳ Next request' : '✓ Next time off'}
            </Box>
            <Box sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.15, mb: '6px' }}>{datesStr}</Box>
            <Box sx={{ fontSize: 13, opacity: 0.95, mb: '14px' }}>
                {leave.totalDays} {leave.totalDays === 1 ? 'day' : 'days'} of {(leaveTypeName ?? 'leave').toLowerCase()}
            </Box>
            <Box sx={{
                display: 'inline-block', bgcolor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)',
                px: '14px', py: '6px', borderRadius: '16px', fontSize: 12, fontWeight: 600, mb: '14px',
            }}>
                {countdown}
            </Box>
            <Box sx={{ display: 'flex', gap: '18px', fontSize: 12, flexWrap: 'wrap' }}>
                <MetaItem label="Status" value={isPending ? 'Awaiting approval' : 'Confirmed'} />
                <MetaItem label="Back at work" value={nextWorkingDay(leave.endDate)} />
                {leave.evidenceUrl && <MetaItem label="Documents" value="📎 1" />}
            </Box>
        </Box>
    )
}

function MetaItem({ label, value }: { label: string; value: string }) {
    return (
        <Box>
            <Box sx={{ opacity: 0.8, fontSize: 11 }}>{label}</Box>
            <Box sx={{ fontWeight: 600, mt: '2px' }}>{value}</Box>
        </Box>
    )
}

function EmptyUpcoming({ onApply }: { onApply: () => void }) {
    return (
        <Box sx={{
            bgcolor: 'action.hover', color: 'text.secondary', border: '1px dashed', borderColor: 'divider',
            borderRadius: '12px', p: '24px', textAlign: 'center',
        }}>
            <Box sx={{ fontSize: 28, mb: '8px' }}>🏖️</Box>
            <Box sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary', mb: '4px' }}>No upcoming leave</Box>
            <Box sx={{ fontSize: 12, mb: '12px' }}>You haven't booked any time off yet. Take a break — you deserve it!</Box>
            <Box
                component="button"
                onClick={onApply}
                sx={{
                    bgcolor: 'primary.main', color: '#fff', border: 'none', borderRadius: '6px',
                    px: '14px', py: '6px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                    '&:hover': { bgcolor: 'primary.dark' },
                }}
            >
                + Apply for leave
            </Box>
        </Box>
    )
}

/**
 * One row of the balance panel. `tracked` is whether the type has an entitlement
 * to count down at all — the pooled one, or a per-child ledger — which the caller
 * decides, because the two are measured differently and only the caller knows
 * which applies. A row that tracks nothing reports days taken and greys its bar.
 */
function BalanceRow({ name, used, total, remaining, tracked }: {
    name: string; used: number; total: number; remaining: number; tracked: boolean
}) {
    const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
    const fillColor = !tracked ? 'text.disabled' : pct >= 90 ? 'error.main' : pct >= 70 ? 'warning.main' : 'success.main'
    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: '10px', alignItems: 'center' }}>
            <Box sx={{ fontSize: 18 }}>{iconForLeaveType(name)}</Box>
            <Box>
                <Box sx={{ fontSize: 12, fontWeight: 500, color: 'text.primary' }}>{name}</Box>
                <Box sx={{ height: 5, bgcolor: 'action.hover', borderRadius: '3px', mt: '5px', overflow: 'hidden' }}>
                    <Box sx={{ height: '100%', borderRadius: '3px', bgcolor: fillColor, width: `${pct}%` }} />
                </Box>
            </Box>
            <Box sx={{ fontSize: 13, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', textAlign: 'right', minWidth: 50 }}>
                {tracked && total > 0 ? (
                    <>
                        <Box component="strong" sx={{ fontSize: 14, color: 'text.primary', fontWeight: 700 }}>{remaining}</Box>
                        /{total}
                    </>
                ) : (
                    <Box component="strong" sx={{ fontSize: 14, color: 'text.primary', fontWeight: 700 }}>{used}</Box>
                )}
            </Box>
        </Box>
    )
}

/**
 * The per-child ledger for one leave type, broken down a child at a time.
 *
 * Deliberately shaped like the pooled `BalanceRow` above — same grid, same bar,
 * same remaining-over-total on the right — because the two panels describe the
 * same thing for the same employee and sit one above the other. What they cannot
 * share is the arithmetic: every figure here belongs to one child, and the two
 * ledgers are disjoint (see CLAUDE.md, "There are two leave ledgers").
 *
 * Landmarked with an accessible name so the card can be reached as a whole, by a
 * screen reader and by tests, rather than through whatever text happens to sit
 * inside it.
 */
function PerChildLeaveCard({ type, ledger }: PerChildLedger) {
    /* Every child carries the configured entitlement, an aged-out one included —
       only their *remaining* figures are zeroed — so any child can describe the
       policy. An eligible one is preferred purely so the sentence matches the
       rows the reader is most likely to be looking at. */
    const reference = ledger.children.find((child) => child.isEligible) ?? ledger.children[0]

    /* The policy as the server resolved it — weeks for the 1st child, the 2nd and
       the 3rd onwards — so the sentence can say "22 weeks for the 1st and 2nd
       child · 26 from the 3rd" even for an employee with one child. An API
       predating those figures sends none, and the reference child's own total
       is then the only thing to quote. */
    const policy = ledger.totalWeeksFirstChild
        ? {
            first: ledger.totalWeeksFirstChild,
            second: ledger.totalWeeksSecondChild || ledger.totalWeeksFirstChild,
            third: ledger.totalWeeksThirdChildOnwards || ledger.totalWeeksSecondChild || ledger.totalWeeksFirstChild,
        }
        : undefined
    // Worth labelling each row "1st child", "2nd child" only when the label
    // changes what that row is entitled to.
    const totalsDiffer = !!policy && !(policy.first === policy.second && policy.second === policy.third)

    return (
        <Box
            component="section"
            aria-label={`${type.name} entitlement per child`}
            sx={{
                bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
                borderRadius: '12px', p: '18px 20px', mb: '14px',
            }}
        >
            <Box sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                gap: '12px', flexWrap: 'wrap',
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 13, fontWeight: 600, color: 'text.primary' }}>
                    <Box component="span" sx={{ fontSize: 18, display: 'inline-flex', alignItems: 'center' }}>
                        {iconForLeaveType(type.name)}
                    </Box>
                    {type.name}
                </Box>
                <Box sx={{ fontSize: 11, color: 'text.secondary' }}>
                    {`Leave year ${formatDate(reference.leaveYearStart)} – ${formatDate(reference.leaveYearEnd)}`}
                </Box>
            </Box>

            {/* What the entitlement actually is, read from the ledger the server
                computed rather than from the leave type's own columns: Maternity
                Leave is seeded with all three of them at 0, so quoting the type
                would print "0 weeks per child" on the type that most needs the
                sentence. */}
            <Box sx={{ fontSize: 11, color: 'text.secondary', mt: '4px', mb: '14px' }}>
                {policy
                    ? `${describePerChildTotals(policy)} · up to ${plural(reference.thisYearCapDays, 'day', 'days')} a leave year`
                    : reference.totalWeeks > 0
                        ? `${plural(reference.totalWeeks, 'week', 'weeks')} per child · up to ${plural(reference.thisYearCapDays, 'day', 'days')} a leave year`
                        : `${plural(reference.totalDays, 'day', 'days')} per child · up to ${plural(reference.thisYearCapDays, 'day', 'days')} a leave year`}
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {ledger.children.map((child) => (
                    <ChildBalanceRow key={child.childId} child={child} showBirthOrder={totalsDiffer} />
                ))}
            </Box>

            <Divider sx={{ my: '12px' }} />

            <Box sx={{ fontSize: 11, color: 'text.secondary' }}>
                {`${plural(ledger.eligibleChildCount, 'eligible child', 'eligible children')} · ${ledger.totalRemainingDays} days remaining in total`}
            </Box>
        </Box>
    )
}

/**
 * One child's row of that card. An aged-out child keeps their row — their usage
 * is real history and hiding it would leave the total unexplained — but loses the
 * figures that no longer mean anything: the remaining-days column and the bar,
 * which would otherwise draw a full green entitlement nobody can book.
 */
function ChildBalanceRow({ child, showBirthOrder }: { child: ChildLeaveEntitlement; showBirthOrder: boolean }) {
    const pct = child.totalDays > 0 ? Math.min(100, (child.usedDays / child.totalDays) * 100) : 0
    const fillColor = pct >= 90 ? 'error.main' : pct >= 70 ? 'warning.main' : 'success.main'

    return (
        <Box sx={{
            display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: '10px', alignItems: 'center',
            opacity: child.isEligible ? 1 : 0.6,
        }}>
            <Box sx={{ fontSize: 18 }}>👶</Box>
            <Box>
                <Box sx={{ fontSize: 12, fontWeight: 500, color: 'text.primary' }}>
                    {child.name}
                    <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>{` · age ${child.ageYears}`}</Box>
                    {showBirthOrder && child.birthOrder ? (
                        <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>{` · ${ordinal(child.birthOrder)} child`}</Box>
                    ) : null}
                </Box>
                {child.isEligible && (
                    <Box sx={{ height: 5, bgcolor: 'action.hover', borderRadius: '3px', mt: '5px', overflow: 'hidden' }}>
                        <Box sx={{ height: '100%', borderRadius: '3px', bgcolor: fillColor, width: `${pct}%` }} />
                    </Box>
                )}
                <Box sx={{ fontSize: 11, color: 'text.secondary', mt: '5px' }}>
                    {child.isEligible
                        ? `${child.thisYearRemainingDays} of ${child.thisYearCapDays} days left this year · eligible until ${formatDateUtc(child.lastEligibleDate)}`
                        : `No longer eligible · ${plural(child.usedDays, 'day used', 'days used')}`}
                </Box>
            </Box>
            <Box sx={{
                fontSize: 13, color: 'text.secondary', fontVariantNumeric: 'tabular-nums',
                textAlign: 'right', minWidth: 50,
            }}>
                {child.isEligible && (
                    <>
                        <Box component="strong" sx={{ fontSize: 14, color: 'text.primary', fontWeight: 700 }}>
                            {child.remainingDays}
                        </Box>
                        /{child.totalDays}
                    </>
                )}
            </Box>
        </Box>
    )
}

function LegendSwatch({ color, label, bordered }: { color: string; label: string; bordered?: boolean }) {
    return (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Box sx={{
                width: 10, height: 10, borderRadius: '2px', bgcolor: color,
                border: bordered ? `1px solid ${'divider'}` : 'none',
                display: 'inline-block',
            }} />
            {label}
        </Box>
    )
}

function SectionHeader({ title }: { title: string }) {
    return (
        <Box sx={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            mt: '18px', mx: '4px', mb: '10px',
        }}>
            <Box sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {title}
            </Box>
        </Box>
    )
}

function LeaveCard({
    leave, leaveTypeName, today, feedback, awaitingDocument, onEdit, onCancel, onView,
}: {
    leave: AnnualLeave
    leaveTypeName?: string
    today: Date
    feedback?: LeaveStatusHistory
    /** Short a document the type insists on — see isAwaitingDocument. */
    awaitingDocument?: boolean
    onEdit?: () => void
    onCancel?: () => void
    onView?: () => void
}) {
    const status = leave.status
    const typeKey = leaveTypeKey(leaveTypeName)
    const typePalette = TYPE_PALETTE[typeKey]
    const sameDay = leave.startDate.slice(0, 10) === leave.endDate.slice(0, 10)
    const startDate = new Date(leave.startDate)
    startDate.setHours(0, 0, 0, 0)
    const daysUntil = daysBetween(today, startDate)
    const isUpcoming = (status === 'Pending' || status === 'Approved') && daysUntil >= 0
    const showDaysPill = isUpcoming && daysUntil <= 14

    return (
        <Box sx={{
            bgcolor: 'background.paper',
            border: '1px solid', borderColor: 'divider',
            borderLeft: '3px solid',
            borderLeftColor:
                status === 'Pending' ? 'warning.main'
                : status === 'Approved' ? 'success.main'
                : status === 'Rejected' ? 'error.main'
                : 'text.disabled',
            borderRadius: '10px', p: '16px 18px', mb: '10px',
            opacity: status === 'Cancelled' ? 0.65 : 1,
            transition: 'all 0.15s',
            '&:hover': { borderColor: 'text.disabled' },
        }}>
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '48px 1fr', sm: '48px 1fr auto' },
                gap: '14px', alignItems: 'flex-start',
            }}>
                <Box sx={{
                    width: 44, height: 44, borderRadius: '10px',
                    bgcolor: typePalette.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, flexShrink: 0,
                }}>
                    {iconForLeaveType(leaveTypeName)}
                </Box>

                <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', mb: '4px' }}>
                        <Box sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary' }}>{leaveTypeName ?? 'Leave'}</Box>
                        <StatusBadge status={status} />
                        {showDaysPill && (
                            <Box component="span" sx={{
                                display: 'inline-block', bgcolor: softBg('primary'), color: 'info.dark',
                                px: '8px', py: '2px', borderRadius: '10px', fontSize: 11, fontWeight: 500,
                            }}>
                                {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`}
                            </Box>
                        )}
                    </Box>

                    <Box sx={{ fontSize: 13, color: 'text.primary', mb: '6px' }}>
                        <Box component="strong" sx={{ color: 'text.primary', fontWeight: 600 }}>
                            {sameDay
                                ? formatDate(leave.startDate)
                                : <>{formatDate(leave.startDate)} – {formatDate(leave.endDate)}</>}
                        </Box>
                        <Box component="span" sx={{
                            display: 'inline-block', bgcolor: 'action.hover', color: 'text.primary',
                            px: '8px', py: '2px', borderRadius: '10px', fontSize: 11, fontWeight: 500, ml: '6px',
                        }}>
                            {leave.totalDays} {leave.totalDays === 1 ? 'day' : 'days'}
                        </Box>
                    </Box>

                    {leave.reason && (
                        <Box sx={{ fontSize: 12, color: 'text.secondary', mt: '6px', fontStyle: 'italic', lineHeight: 1.5 }}>
                            "{leave.reason}"
                        </Box>
                    )}

                    {leave.delegateName && (
                        <Box sx={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px', mt: '10px',
                            p: '4px 10px 4px 6px', bgcolor: 'action.hover',
                            border: '1px solid', borderColor: 'divider', borderRadius: '14px',
                            fontSize: 11, color: 'text.secondary',
                        }}>
                            <Box component="span" sx={{
                                width: 18, height: 18, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, bgcolor: softBg('primary'), color: 'primary.main',
                            }}>🤝</Box>
                            Covered by&nbsp;<Box component="strong" sx={{ color: 'text.primary', fontWeight: 600 }}>{leave.delegateName}</Box>
                        </Box>
                    )}

                    {/* The handover left for the delegate. Shown to its author here;
                        the delegate gets it by email once the leave is approved. */}
                    {leave.coverageNote && (
                        <Box sx={{ fontSize: 12, color: 'text.secondary', mt: '6px', lineHeight: 1.5 }}>
                            <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>Handover: </Box>
                            {leave.coverageNote}
                        </Box>
                    )}
                    {leave.coverageAttachmentUrl && (
                        <Box sx={{ display: 'flex', gap: '6px', mt: '10px', flexWrap: 'wrap' }}>
                            <Box
                                component="a"
                                href={resolveFileUrl(leave.coverageAttachmentUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    p: '4px 10px 4px 6px', bgcolor: 'action.hover',
                                    border: '1px solid', borderColor: 'divider', borderRadius: '14px',
                                    fontSize: 11, color: 'text.primary', textDecoration: 'none',
                                    transition: 'all 0.15s',
                                    '&:hover': { bgcolor: softBg('primary'), borderColor: 'primary.main', color: 'info.dark' },
                                }}
                            >
                                <Box component="span" sx={{
                                    width: 18, height: 18, borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 10, bgcolor: softBg('primary'), color: 'primary.main',
                                }}>📎</Box>
                                Handover document
                            </Box>
                        </Box>
                    )}

                    {leave.evidenceUrl && (
                        <Box sx={{ display: 'flex', gap: '6px', mt: '10px', flexWrap: 'wrap' }}>
                            <Box
                                component="a"
                                href={resolveFileUrl(leave.evidenceUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    p: '4px 10px 4px 6px', bgcolor: 'action.hover',
                                    border: '1px solid', borderColor: 'divider', borderRadius: '14px',
                                    fontSize: 11, color: 'text.primary', textDecoration: 'none',
                                    transition: 'all 0.15s',
                                    '&:hover': { bgcolor: softBg('primary'), borderColor: 'primary.main', color: 'info.dark' },
                                }}
                            >
                                <Box component="span" sx={{
                                    width: 18, height: 18, borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 10, bgcolor: softBg('error'), color: 'error.dark',
                                }}>📄</Box>
                                Attachment
                            </Box>
                        </Box>
                    )}

                    {/* The document a Required type asks for is checked at approval,
                        not filing, so a pending request can sit here without one.
                        Say so, and where to add it, rather than leaving the employee
                        to wonder why nobody has approved it. */}
                    {awaitingDocument && (
                        <Box sx={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px', mt: '10px',
                            p: '4px 10px 4px 6px', bgcolor: softBg('warning'),
                            border: '1px solid', borderColor: 'warning.main', borderRadius: '14px',
                            fontSize: 11, color: 'warning.dark',
                        }}>
                            <Box component="span" sx={{ fontSize: 12 }}>📎</Box>
                            Document needed before approval — add it with Edit
                        </Box>
                    )}

                    <FeedbackBox status={status} feedback={feedback} />
                </Box>

                <Box sx={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                    {status === 'Pending' && onEdit && (
                        <ActionButton onClick={onEdit} variant="ghost">Edit</ActionButton>
                    )}
                    {status === 'Pending' && onCancel && (
                        <ActionButton onClick={onCancel} variant="danger">Cancel</ActionButton>
                    )}
                    {onView && status !== 'Pending' && (
                        <ActionButton onClick={onView} variant="ghost">View details</ActionButton>
                    )}
                </Box>
            </Box>
        </Box>
    )
}

function StatusBadge({ status }: { status: AnnualLeaveStatus }) {
    const config: Record<AnnualLeaveStatus, { bg: SxColor; color: string; label: string }> = {
        Pending:   { bg: softBg('warning'), color: 'warning.dark', label: 'Pending review' },
        Approved:  { bg: softBg('success'), color: 'success.dark', label: 'Approved' },
        Rejected:  { bg: softBg('error'), color: 'error.dark', label: 'Rejected' },
        Cancelled: { bg: 'divider', color: 'text.secondary', label: 'Cancelled' },
    }
    const c = config[status]
    return (
        <Box component="span" sx={{
            display: 'inline-flex', alignItems: 'center', bgcolor: c.bg, color: c.color,
            borderRadius: '20px', px: 1.25, py: '3px',
            fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
        }}>{c.label}</Box>
    )
}

function FeedbackBox({ status, feedback }: { status: AnnualLeaveStatus; feedback?: LeaveStatusHistory }) {
    if (status === 'Pending') {
        return (
            <Box sx={feedbackSx(softBg('warning'), 'warning.dark', 'warning.main')}>
                <Box component="span">⏳</Box>
                <Box>Submitted — waiting for manager to review</Box>
            </Box>
        )
    }
    if (!feedback?.comment) return null
    if (status === 'Approved') {
        return (
            <Box sx={feedbackSx(softBg('success'), 'success.dark', 'success.main')}>
                <Box component="span">💬</Box>
                <Box>
                    <Box component="strong">{feedback.changedByUserName}:</Box> "{feedback.comment}"
                </Box>
            </Box>
        )
    }
    if (status === 'Rejected') {
        return (
            <Box sx={feedbackSx(softBg('error'), 'error.dark', 'error.main')}>
                <Box component="span">💬</Box>
                <Box>
                    <Box component="strong">{feedback.changedByUserName}:</Box> "{feedback.comment}"
                </Box>
            </Box>
        )
    }
    if (status === 'Cancelled') {
        return (
            <Box sx={feedbackSx('action.hover', 'text.secondary', 'text.disabled')}>
                <Box component="span">↪</Box>
                <Box>{feedback.comment}</Box>
            </Box>
        )
    }
    return null
}

function feedbackSx(bg: SxColor, color: string, accent: string) {
    return {
        mt: '10px', p: '10px 12px', borderRadius: '6px', fontSize: 12,
        display: 'flex', alignItems: 'flex-start', gap: '8px',
        bgcolor: bg, color, borderLeft: '3px solid', borderLeftColor: accent,
    } as const
}

function ActionButton({ onClick, variant, children }: {
    onClick: () => void
    variant: 'danger' | 'ghost'
    children: React.ReactNode
}) {
    const styles = variant === 'danger'
        ? { color: 'error.dark', hover: softBg('error') }
        : { color: 'text.secondary', hover: 'action.hover' }
    return (
        <Box
            component="button"
            onClick={onClick}
            sx={{
                fontSize: 12, fontWeight: 500, color: styles.color,
                background: 'transparent', border: '1px solid', borderColor: 'divider',
                borderRadius: '6px', px: '12px', py: '5px',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s',
                '&:hover': { bgcolor: styles.hover },
            }}
        >
            {children}
        </Box>
    )
}

function LeaveDetailRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 500, minWidth: 110, pt: '2px' }}>
                {label}
            </Typography>
            <Box sx={{ fontSize: 13, color: 'text.primary', flex: 1 }}>{value}</Box>
        </Box>
    )
}

function LeaveDetailsDialog({ leave, leaveTypeName, feedback, onClose }: {
    leave: AnnualLeave | null
    leaveTypeName?: string
    feedback?: LeaveStatusHistory
    onClose: () => void
}) {
    if (!leave) {
        return <Dialog open={false} onClose={onClose}><Box /></Dialog>
    }

    const reasonTrimmed = (leave.reason ?? '').trim()
    const isPlaceholderReason = reasonTrimmed === '' || /^[-_‐-―−.·•]+$/.test(reasonTrimmed)

    const today = new Date(); today.setHours(0, 0, 0, 0)
    const start = new Date(leave.startDate); start.setHours(0, 0, 0, 0)
    const daysUntil = Math.round((start.getTime() - today.getTime()) / 86_400_000)
    const noticeText = daysUntil < 0
        ? `Started ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} ago`
        : daysUntil === 0 ? 'Starts today'
        : daysUntil === 1 ? 'Starts tomorrow'
        : `${daysUntil} days notice`

    const status = leave.status
    const isRejected = status === 'Rejected'
    const isApproved = status === 'Approved'
    const isCancelled = status === 'Cancelled'

    const fb = feedback?.comment ? feedback : undefined
    const banner = fb ? {
        bg: isRejected ? softBg('error') : isApproved ? softBg('success') : 'action.hover',
        fg: isRejected ? 'error.dark' : isApproved ? 'success.dark' : 'text.secondary',
        accent: isRejected ? 'error.main' : isApproved ? 'success.main' : 'text.disabled',
        label: isRejected ? 'Rejection reason' : isApproved ? 'Manager note' : isCancelled ? 'Cancellation note' : 'Note',
    } : null

    return (
        <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontSize: 15, fontWeight: 600, color: 'text.primary', pb: 1 }}>
                Leave Request Details
            </DialogTitle>
            <DialogContent sx={{ px: 3, py: 2 }}>
                <Stack spacing={1.5}>
                    {banner && fb && (
                        <Box sx={{
                            p: '10px 14px', bgcolor: banner.bg, color: banner.fg,
                            borderLeft: '3px solid', borderLeftColor: banner.accent, borderRadius: '6px',
                        }}>
                            <Box sx={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mb: '4px' }}>
                                {banner.label}
                            </Box>
                            <Box sx={{ fontSize: 13, lineHeight: 1.5 }}>
                                <Box component="strong">{fb.changedByUserName}:</Box> "{fb.comment}"
                            </Box>
                        </Box>
                    )}
                    <LeaveDetailRow label="Leave Type" value={leaveTypeName ?? 'Annual Leave'} />
                    {/* Per-child leave only — every other row has no child and
                        renders exactly as before. This is the fact the per-child
                        cap turns on, so it belongs beside the type it qualifies. */}
                    {!!leave.childName && <LeaveDetailRow label="Child" value={leave.childName} />}
                    <Divider sx={{ my: 0.5 }} />
                    <LeaveDetailRow label="Start Date" value={formatDate(leave.startDate)} />
                    <LeaveDetailRow label="End Date" value={formatDate(leave.endDate)} />
                    <LeaveDetailRow label="Total Days" value={`${leave.totalDays} working day${leave.totalDays !== 1 ? 's' : ''}`} />
                    <Divider sx={{ my: 0.5 }} />
                    <LeaveDetailRow label="Status" value={<StatusBadge status={status} />} />
                    {!isPlaceholderReason && <LeaveDetailRow label="Reason" value={leave.reason} />}
                    {leave.delegateName && <LeaveDetailRow label="Covered By" value={leave.delegateName} />}
                    {leave.coverageNote && <LeaveDetailRow label="Handover Note" value={leave.coverageNote} />}
                    {leave.coverageAttachmentUrl && (
                        <LeaveDetailRow
                            label="Handover Document"
                            value={
                                <Button
                                    size="small"
                                    variant="outlined"
                                    component="a"
                                    href={resolveFileUrl(leave.coverageAttachmentUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    sx={{
                                        fontSize: 12, textTransform: 'none',
                                        borderColor: 'primary.main', color: 'primary.main',
                                        py: '3px', px: 1.25,
                                        '&:hover': { bgcolor: softBg('info'), borderColor: 'primary.main' },
                                    }}
                                >
                                    Open File
                                </Button>
                            }
                        />
                    )}
                    {leave.evidenceUrl && leave.evidenceUrl.trim() !== '' && (
                        <LeaveDetailRow
                            label="Evidence"
                            value={
                                <Button
                                    size="small"
                                    variant="outlined"
                                    component="a"
                                    href={resolveFileUrl(leave.evidenceUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    sx={{
                                        fontSize: 12, textTransform: 'none',
                                        borderColor: 'primary.main', color: 'primary.main',
                                        py: '3px', px: 1.25,
                                        '&:hover': { bgcolor: softBg('info'), borderColor: 'primary.main' },
                                    }}
                                >
                                    Open File
                                </Button>
                            }
                        />
                    )}
                    <LeaveDetailRow label="Submitted" value={formatDate(leave.createdAt)} />
                    {leave.approvedAt && (
                        <LeaveDetailRow label="Actioned" value={formatDate(leave.approvedAt)} />
                    )}
                    <LeaveDetailRow label="Notice" value={noticeText} />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 1.75 }}>
                <Button
                    size="small"
                    onClick={onClose}
                    sx={{ textTransform: 'none', color: 'text.secondary' }}
                >
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export default MyLeavePage
