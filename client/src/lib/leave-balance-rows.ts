import { allowanceForLeaveTypeThisYear, type FirstYearContext } from './leave-allowance'
import type { AnnualLeave, ChildLeaveEntitlementSummary, LeaveType } from './types'

/**
 * One row of a "leave balance" panel — the employee dashboard's and My Leave's,
 * which show the same figures and so read them from here.
 *
 * `tracked` is whether the type has an entitlement to count down at all — an
 * allowance above 0, whichever ledger it comes from. It is deliberately *not*
 * `affectsBalance`: that flag only says whether the type is also deducted from the
 * pooled budget the API enforces, and reading it as "has a budget" reported sick
 * leave, personal days, bereavement and unpaid leave as a bare 0 apiece while
 * Leave Types gave each of them an allowance. A row that genuinely tracks nothing
 * — a type whose allowance is 0 — has no total to measure against, so it reports
 * `used` and nothing else.
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
    /**
     * The employee's start date and the leave-year start month, so a non-balance
     * type with `proRateFirstYear` on can scale its own allowance for a first-year
     * joiner. The pooled row does not use this: `entitlement` is already the
     * server's figure for this year. Omitted, every type quotes its full allowance.
     */
    firstYear?: FirstYearContext
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
 *
 * Both panels are headed with the current year and set these rows beside "Annual
 * Leave 23/23", so every row answers the same question: how much may I book in
 * this leave year. A per-child row therefore quotes the *yearly* cap summed over
 * eligible children — 5 days against a child's lifetime 20, not 20. The card
 * below the panel is where the lifetime ledger is broken down, and it says so.
 */
export function buildLeaveBalanceRows({
    leaveTypes,
    approvedThisYear,
    entitlement,
    ledgerByTypeId,
    firstYear,
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
                used: eligible.reduce((sum, child) => sum + child.thisYearUsedDays, 0),
                total: eligible.reduce((sum, child) => sum + child.thisYearCapDays, 0),
                // Repeated from the server, never recomputed as cap minus used: it
                // is already the lesser of the yearly and the lifetime remainder,
                // so a child two days short of exhausting their 20 offers two.
                remaining: eligible.reduce((sum, child) => sum + child.thisYearRemainingDays, 0),
                tracked: true,
            }
        }

        /* The pooled type is measured against the employee's own entitlement, which
           is the figure the API enforces and may be overridden per person. Every
           other type is measured against its own allowance — `affectsBalance` says
           only whether a type is *also* deducted from that pool, never that it has
           no budget, and the seeded types all set one (sick leave 10 days a year,
           personal days 3). Reading it as "no budget" is what left four rows
           reporting a bare 0 beside annual leave's 23/23. Same rule as
           `allowanceForRequest`, which an admin's view of a request already uses. */
        const used = usedByTypeId.get(leaveType.id) ?? 0
        // A non-balance type's allowance is never enforced by the server, so its
        // pro-rating for a first-year joiner is mirrored here — the one place the
        // switch shows for such a type.
        const total = leaveType.affectsBalance ? entitlement : allowanceForLeaveTypeThisYear(leaveType, firstYear)
        return {
            id: leaveType.id,
            name: leaveType.name,
            used,
            total,
            remaining: Math.max(0, total - used),
            tracked: total > 0,
        }
    })
}
