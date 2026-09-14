import type { AnnualLeave, ChildLeaveEntitlementSummary, LeaveType } from './types'

/**
 * One row of a "leave balance" panel — the employee dashboard's and My Leave's,
 * which show the same figures and so read them from here.
 *
 * `tracked` is whether the type has an entitlement to count down at all. A row
 * that tracks nothing (sick leave, unpaid leave) has no total to measure against,
 * so it reports `used` and nothing else.
 */
export interface LeaveBalanceRow {
    id: number
    name: string
    used: number
    total: number
    remaining: number
    tracked: boolean
}

interface BuildArgs {
    /** The types to describe — the *offered* ones, so a panel never lists a type the API would refuse. */
    leaveTypes: LeaveType[]
    /** The employee's approved leave for the current year, used for the pooled figures. */
    approvedThisYear: AnnualLeave[]
    /** The pooled annual-leave entitlement, from the employee's profile. */
    entitlement: number
    /** Per-child ledgers by leave type id, from `useOfferedLeaveTypes`. */
    ledgerByTypeId: Map<number, ChildLeaveEntitlementSummary | undefined>
}

/**
 * Which entitlement a row counts down is the leave type's own business, and there
 * are two of them — see "There are two leave ledgers, and they are disjoint" in
 * CLAUDE.md:
 *
 * - the pooled annual entitlement, for the type flagged `affectsBalance`; and
 * - the per-child ledger, summed over the employee's *eligible* children (which is
 *   what the per-child card quotes, and what the API enforces), for a type flagged
 *   `perChildEntitlement`.
 *
 * Measuring the second against the first is what made maternity leave read 0 on a
 * page whose card below it offered 40 days. A per-child row is `tracked` even
 * before its ledger arrives: `total` is 0 until then, which reads as days taken,
 * and the figures fill in when the query settles.
 */
export function buildLeaveBalanceRows({
    leaveTypes,
    approvedThisYear,
    entitlement,
    ledgerByTypeId,
}: BuildArgs): LeaveBalanceRow[] {
    const usedByTypeId = new Map<number, number>()
    for (const leave of approvedThisYear) {
        if (leave.leaveTypeId == null) continue
        usedByTypeId.set(leave.leaveTypeId, (usedByTypeId.get(leave.leaveTypeId) ?? 0) + leave.totalDays)
    }

    return leaveTypes.map((leaveType) => {
        if (leaveType.perChildEntitlement) {
            // Eligible children only: a child who has aged out keeps their usage in
            // history but has no remaining entitlement, so counting their total
            // would promise days the API will refuse.
            const eligible = (ledgerByTypeId.get(leaveType.id)?.children ?? []).filter((child) => child.isEligible)
            return {
                id: leaveType.id,
                name: leaveType.name,
                used: eligible.reduce((sum, child) => sum + child.usedDays, 0),
                total: eligible.reduce((sum, child) => sum + child.totalDays, 0),
                remaining: eligible.reduce((sum, child) => sum + child.remainingDays, 0),
                tracked: true,
            }
        }

        const used = usedByTypeId.get(leaveType.id) ?? 0
        const total = leaveType.affectsBalance ? entitlement : 0
        return {
            id: leaveType.id,
            name: leaveType.name,
            used,
            total,
            remaining: Math.max(0, total - used),
            tracked: leaveType.affectsBalance,
        }
    })
}
