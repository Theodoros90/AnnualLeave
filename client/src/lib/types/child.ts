/**
 * A declared child. `ageYears`, `isEligible` and `lastEligibleDate` are computed by
 * the server from `dateOfBirth` on every read — nothing about them is stored, which
 * is how a child ages out of paternity-leave eligibility with no job to run.
 */
export interface Child {
    id: string
    name: string
    /** ISO date "yyyy-MM-dd". */
    dateOfBirth: string
    ageYears: number
    isEligible: boolean
    /** The last date leave for this child may end on. ISO date. */
    lastEligibleDate: string
}

export interface UpsertChildRequest {
    name: string
    dateOfBirth: string
}

/**
 * One child's per-child leave ledger, in business days with a weeks figure for
 * display. An ineligible child is present with `isEligible: false` and keeps the
 * configured entitlement (`totalDays`, `totalWeeks`, `thisYearCapDays`) — zeroing
 * those would misstate the policy rather than explain why it is now moot. Only the
 * two *remaining* figures (`remainingDays`, `thisYearRemainingDays`) are forced to
 * zero, and `usedDays` still shows what they used while eligible.
 */
export interface ChildLeaveEntitlement {
    childId: string
    name: string
    dateOfBirth: string
    ageYears: number
    isEligible: boolean
    lastEligibleDate: string
    /**
     * Which of the employee's children this is, oldest first: 1 for the eldest.
     * It decides which of the leave type's totals `totalDays` was read from.
     * Optional because an API predating it sends none.
     */
    birthOrder?: number
    /** Lifetime entitlement for this child's birth order, in business days. */
    totalDays: number
    totalWeeks: number
    usedDays: number
    remainingDays: number
    thisYearCapDays: number
    thisYearUsedDays: number
    thisYearRemainingDays: number
    /** Full ISO timestamp (DateTime), not date-only. */
    leaveYearStart: string
    /** Full ISO timestamp (DateTime), not date-only. */
    leaveYearEnd: string
}

/**
 * The employee's ledger. The totals cover eligible children only, so they fall on
 * their own when a child turns 15.
 */
export interface ChildLeaveEntitlementSummary {
    /** Null when no active leave type carries a per-child entitlement. */
    leaveTypeId: number | null
    leaveTypeName: string
    eligibleChildCount: number
    /**
     * The policy itself, resolved by the server (a blank later column reads as the
     * one before it): weeks for the 1st child, the 2nd, and the 3rd onwards. Lets a
     * screen say "22 weeks for the 1st and 2nd child, 26 from the 3rd" without a
     * child at each position to quote it from. Optional because an API predating
     * them sends none, in which case the first child's ledger row is the fallback.
     */
    totalWeeksFirstChild?: number
    totalWeeksSecondChild?: number
    totalWeeksThirdChildOnwards?: number
    totalRemainingDays: number
    thisYearCapDays: number
    thisYearRemainingDays: number
    children: ChildLeaveEntitlement[]
}
