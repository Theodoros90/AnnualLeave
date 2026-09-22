export type AttachmentPolicy = 'None' | 'Optional' | 'Required'
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
    /** Lifetime weeks for the employee's first child. 18 for paternity leave. */
    perChildTotalWeeks: number
    /**
     * Lifetime weeks for the second child, and for the third and every later one.
     * The total can differ by birth order — 22 / 22 / 26 weeks is the maternity
     * policy that forced it. `null` (or absent, from an API predating the columns)
     * means the same as the column before it, so `resolvePerChildTotals` in
     * lib/leave-allowance.ts is how these are read; nothing should read them raw.
     */
    perChildTotalWeeksSecondChild?: number | null
    perChildTotalWeeksThirdChildOnwards?: number | null
    /** Weeks per eligible child per leave year. 5 for paternity leave. */
    perChildWeeksPerYear: number
    /** The age at which a child stops being eligible. 15 for paternity leave. */
    childEligibleUntilAge: number
    accrualNotes: string
    minNoticeDays: number
    maxConsecutiveDays: number
    halfDayAllowed: boolean
    /**
     * Who this type is offered to. Fixed on the three built-in types (see
     * `availabilityLocked`) and an admin's choice on everything else.
     */
    availableTo: GenderAvailability
    /**
     * Months of service before this type is offered, measured from the employee's
     * start date to today. 0 is no minimum. Enforced on the server
     * (`MinimumServiceRule`) and mirrored by `lib/leave-limits.ts`, so a card the
     * rule hides is one the API would refuse. Optional because an API built before
     * the column sends none, which reads as 0.
     */
    minServiceMonths?: number
    /**
     * Whether somebody joining part-way through a leave year gets that year's
     * allowance in proportion: remaining months over twelve, joining month counted,
     * rounded up to the next half day — a September start on 23 days is 8. Only the
     * type flagged `affectsBalance` may set it; the server refuses it elsewhere.
     * Enforced by the balance calculator and quoted back through
     * `EmployeeProfile.currentYearEntitlement`; nothing on the client computes it.
     * Optional because an API built before the column sends none, which reads as off.
     */
    proRateFirstYear?: boolean
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
