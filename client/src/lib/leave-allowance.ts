import type { LeaveType } from './types'

/**
 * Where a leave allowance comes from.
 *
 * Three tables carry a number that reads like "the annual allowance", and they do
 * not have to agree. This module fixes the order they are consulted in so every
 * surface quotes the same figure:
 *
 *  1. `LeaveType.defaultAllowance` — **authoritative**, and the only place the figure
 *     is edited. It is the only one that can vary per leave type, which is what an
 *     allowance actually does: annual leave and sick leave are different budgets, not
 *     one budget quoted twice. It is also where a new joiner's entitlement comes from
 *     (see Application/AdminUsers/Commands/CreateAdminUser.cs, which reads the
 *     `affectsBalance` type). A type that sets none reads as 0, rendered "—".
 *     **A type with `perChildEntitlement` has no per-employee allowance at all** — its
 *     budget is per child and lives in `perChildTotalWeeks` / `perChildWeeksPerYear`,
 *     read through `describeAllowance`.
 *  2. `EmployeeProfile.annualLeaveEntitlement` — the stored copy of (1) on each
 *     profile, and the pool the API enforces on approval. It is stamped from the
 *     allowance and never edited per person, so the two only disagree while the
 *     server is mid-way through re-stamping. A mid-year joiner's first year is not
 *     expressed here either: `currentYearEntitlement` (below) is the server's
 *     pro-rated figure for *this* year, and the stored entitlement stays whole.
 *
 * There was a third: `AppSettings.defaultAnnualEntitlement`, an org-wide number on
 * Leave Settings that was free to disagree with (1) and out of the box did — 20
 * against annual leave's 25. It is gone; nothing falls back to it any more.
 *
 * `LeaveType.affectsBalance` is a separate question from the allowance: it says whether
 * the type is deducted from the pooled budget the API enforces on approval (see
 * Application/AnnualLeaves/Commands/AnnualLeaveBalanceCalculator.cs). Only annual leave
 * has it set in practice, while sick leave still has a 10 days/year allowance of its
 * own — so a figure quoted here describes that type's allowance, not an enforced quota.
 */

/** Matches the leave type whose budget `EmployeeProfile.annualLeaveEntitlement` overrides. */
export function isAnnualLeaveType(name?: string | null) {
    const n = (name ?? '').toLowerCase()
    return n.includes('annual') || n.includes('vacation')
}

/** A leave type's own allowance. 0 means the type sets none — callers render that "—". */
export function allowanceForLeaveType(type: LeaveType | undefined) {
    return type && type.defaultAllowance > 0 ? type.defaultAllowance : 0
}

/** The annual-leave allowance as configured on Leave Types. */
export function annualLeaveAllowance(leaveTypes: LeaveType[]) {
    const annual = leaveTypes.find((t) => t.isActive && isAnnualLeaveType(t.name))
        ?? leaveTypes.find((t) => isAnnualLeaveType(t.name))
    return allowanceForLeaveType(annual)
}

/**
 * The leave type the pooled balance is kept in — the one `affectsBalance` marks, which
 * is annual leave in practice. Distinct from `isAnnualLeaveType`, which matches on name:
 * this asks which type the API actually enforces a balance for.
 */
export function balanceLeaveType(leaveTypes: LeaveType[]) {
    return leaveTypes.find((t) => t.isActive && t.affectsBalance)
        ?? leaveTypes.find((t) => t.affectsBalance)
}

/**
 * How many unused annual-leave days survive the year-end rollover, as configured on
 * Leave Types beside the allowance they cap. This was an org-wide AppSettings column,
 * free to disagree with the per-type allowance and unable to say that sick leave
 * carries nothing.
 *
 * Three readings, and `null` is not the missing one: `null` is no cap, every unused
 * day carries; `0` is its opposite, nothing carries; `N` caps at N days. A `null`
 * here must therefore not be flattened to 0 the way an absent value is — with no
 * annual-leave type at all there is no balance to carry, which reads as 0.
 */
export function annualCarryoverCap(leaveTypes: LeaveType[]): number | null {
    const type = balanceLeaveType(leaveTypes)
    return type ? type.maxCarryoverDays : 0
}

/**
 * How a closing balance divides at the year end: what carries into next year and what
 * expires. The cap is not the allowance — a closing balance is last year's carry-in
 * plus this year's allowance, so 23 days carried into a 23-day year closes at 46 and
 * a 23-day cap still expires 23 of them. Only `null` carries everything.
 *
 * Nothing performs the rollover yet; this is what the preview on Leave Settings shows.
 */
export function splitAtCarryoverCap(closingBalance: number, cap: number | null) {
    const closing = Math.max(0, closingBalance)
    if (cap === null) return { carried: closing, expired: 0 }
    return { carried: Math.min(closing, cap), expired: Math.max(0, closing - cap) }
}

/** A carryover cap as a label, keeping "no cap" distinct from a cap of 0 days. */
export function describeCarryoverCap(cap: number | null) {
    return cap === null ? 'No cap' : `${cap} days`
}

/**
 * How many annual-leave days one employee gets: their own entitlement when it is set,
 * otherwise the allowance from Leave Types. Replaces the literal `20` that several
 * rollups used to fall back to.
 */
export function employeeAnnualEntitlement(
    profile: { annualLeaveEntitlement: number } | undefined,
    annualAllowanceDays: number,
) {
    return profile && profile.annualLeaveEntitlement > 0 ? profile.annualLeaveEntitlement : annualAllowanceDays
}

/**
 * What one employee may take in the current leave year — the server's pro-rated
 * figure when the balance type asks for one, otherwise their stored entitlement.
 * An API built before `currentYearEntitlement` sends none, and that has to read as
 * the stored entitlement rather than 0: `?? ` and not `||`, because a genuine 0
 * (a start date after this leave year ends) is a real answer.
 */
export function currentYearEntitlement(
    profile: { annualLeaveEntitlement: number; currentYearEntitlement?: number } | undefined,
) {
    if (!profile) return 0
    return profile.currentYearEntitlement ?? profile.annualLeaveEntitlement
}

/**
 * What the caller knows about the employee's first year, for the types whose
 * allowance the server does not compute for us. `today` is injectable for tests.
 */
export interface FirstYearContext {
    employmentStartDate: string | null | undefined
    leaveYearStartMonth: number
    today?: Date
}

/**
 * Mirror of `LeaveCalculationService.ProRateFirstYearEntitlement`, for a type
 * whose allowance the server does not enforce and so never pro-rates for us —
 * sick leave's own 10 days, say. The balance type's figure must come from the
 * server (`currentYearEntitlement`), never from here, so the two cannot drift.
 *
 * Remaining months of the current leave year over twelve, the joining month
 * counted in full whatever the day, rounded **up** to the next half day. A start
 * before the leave year — or none on file, which means nobody entered it — is the
 * full allowance; a start after it ends is 0. Keep in step with the C#.
 */
export function proRateFirstYearAllowance(
    allowance: number,
    employmentStartDate: string | null | undefined,
    leaveYearStartMonth: number,
    today: Date = new Date(),
) {
    if (!employmentStartDate) return allowance
    const [y, m, d] = employmentStartDate.slice(0, 10).split('-').map(Number)
    if (!y || !m || !d) return allowance
    const start = new Date(y, m - 1, d)

    const startMonth = Math.min(12, Math.max(1, leaveYearStartMonth || 1))
    const key = today.getMonth() + 1 >= startMonth ? today.getFullYear() : today.getFullYear() - 1
    const lyStart = new Date(key, startMonth - 1, 1)
    const lyEnd = new Date(key + 1, startMonth - 1, 0) // last day of the month before the next leave year

    if (start <= lyStart) return allowance
    if (start > lyEnd) return 0

    const monthsIn = (start.getFullYear() - lyStart.getFullYear()) * 12 + (start.getMonth() - lyStart.getMonth())
    const remainingMonths = 12 - monthsIn
    return Math.ceil((allowance * remainingMonths / 12) * 2) / 2
}

/**
 * A leave type's own allowance as it applies to one employee this year: scaled
 * for a first-year joiner when the type asks for it, otherwise as configured. For
 * the balance type callers should prefer the server's `currentYearEntitlement`.
 */
export function allowanceForLeaveTypeThisYear(type: LeaveType | undefined, firstYear: FirstYearContext | undefined) {
    const allowance = allowanceForLeaveType(type)
    if (!type?.proRateFirstYear || type.perChildEntitlement || !firstYear) return allowance
    return proRateFirstYearAllowance(allowance, firstYear.employmentStartDate, firstYear.leaveYearStartMonth, firstYear.today)
}

/**
 * The budget a single request is measured against: its own leave type's allowance,
 * except for annual leave, where the employee's own entitlement wins. Independent of
 * `affectsBalance` — a type that is not deducted from the pooled budget still has an
 * allowance of its own to measure against.
 */
export function allowanceForRequest(
    type: LeaveType | undefined,
    profile: { annualLeaveEntitlement: number; currentYearEntitlement?: number } | undefined,
    firstYear?: FirstYearContext,
) {
    if (isAnnualLeaveType(type?.name)) {
        // The server's figure for this year when it sends one — already pro-rated
        // where the balance type asks for it — otherwise the stored entitlement.
        const own = profile?.currentYearEntitlement ?? profile?.annualLeaveEntitlement ?? 0
        return own > 0 ? own : allowanceForLeaveType(type)
    }
    return allowanceForLeaveTypeThisYear(type, firstYear)
}

/**
 * How a leave type's budget reads on a card. A per-child type has no meaningful
 * `defaultAllowance` — it is 0 by migration — so quoting the usual "N days/year"
 * would render "— days/year" beside a type that grants 18 weeks per child.
 */
export function describeAllowance(type: LeaveType | undefined) {
    if (!type) return '—'

    if (type.perChildEntitlement) {
        return `${type.perChildTotalWeeks} weeks per child · max ${type.perChildWeeksPerYear} weeks/year`
    }

    const allowance = allowanceForLeaveType(type)
    return allowance > 0 ? `${allowance} ${type.allowanceUnit}` : '—'
}
