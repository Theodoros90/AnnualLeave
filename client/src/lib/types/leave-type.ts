export type AttachmentPolicy = 'None' | 'Optional' | 'Required'
export type EligibilityScope = 'All' | 'Limited'
/**
 * Who a leave type is offered to, by recorded gender. `'Both'` is everyone.
 * Enforced on the server (`ParentalLeaveEligibility`) and mirrored by
 * `lib/parental-leave.ts`, so a card the rule hides is one the API would refuse.
 */
export type GenderAvailability = 'Both' | 'Male' | 'Female'

export interface LeaveType {
    id: number
    name: string
    requiresApproval: boolean
    isActive: boolean
    affectsBalance: boolean
    icon: string
    colorKey: string
    description: string
    paid: boolean
    attachmentPolicy: AttachmentPolicy
    defaultAllowance: number
    allowanceUnit: string
    /**
     * Unused days of this type that survive the year-end rollover, bounded by
     * `defaultAllowance`. Three readings: `null` = no cap, everything carries;
     * `0` = nothing carries; `N` = at most N days. See lib/leave-allowance.ts.
     */
    maxCarryoverDays: number | null
    /** When true this type's budget is per child, not per employee — see perChild* below. */
    perChildEntitlement: boolean
    /** Lifetime weeks per eligible child. 18 for paternity leave. */
    perChildTotalWeeks: number
    /** Weeks per eligible child per leave year. 5 for paternity leave. */
    perChildWeeksPerYear: number
    /** The age at which a child stops being eligible. 15 for paternity leave. */
    childEligibleUntilAge: number
    accrualNotes: string
    minNoticeDays: number
    maxConsecutiveDays: number
    halfDayAllowed: boolean
    eligibilityNotes: string
    eligibilityScope: EligibilityScope
    /**
     * Who this type is offered to. Fixed on the three built-in types (see
     * `availabilityLocked`) and an admin's choice on everything else. Distinct from
     * `eligibilityScope`/`eligibilityNotes`, which are the free-text chip and gate
     * nothing.
     */
    availableTo: GenderAvailability
    /**
     * Whether `availableTo` is fixed by what the type is — Annual Leave for
     * everyone, Maternity Leave for women, Paternity Leave for men. Server-derived
     * from the name like `isSystem`; the dialog renders the radios read-only when it
     * is set, and the server refuses a change either way. Optional because test
     * fixtures predate it.
     */
    availabilityLocked?: boolean
    /**
     * One of the seeded types the app depends on by name (Annual, Maternity,
     * Paternity): it cannot be renamed or deleted, though every other setting on
     * it stays editable. Server-derived from the name, so there is no list to keep
     * in step here — and the server enforces it either way, so this only decides
     * which controls to lock. Optional because test fixtures predate it.
     */
    isSystem?: boolean
    /**
     * Whether this type's entitlement is per child — Maternity and Paternity Leave
     * only. Not a setting an admin toggles: it is what those two types are, so the
     * edit dialog shows their three per-child numbers with no switch and hides the
     * section entirely for every other type. Server-derived from the name, like
     * `isSystem`.
     */
    supportsPerChildEntitlement?: boolean
}
