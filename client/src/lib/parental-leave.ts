import { minServiceError } from './leave-limits'
import type { Gender, GenderAvailability, LeaveType } from './types'

/**
 * Which leave types an employee is offered.
 *
 * Two rules, applied in order. A type whose `availableTo` names one gender is
 * offered only to an employee whose recorded gender matches. Maternity and
 * Paternity Leave additionally need a child young enough to qualify. Everything
 * else is offered to everybody, so this is a filter over the whole list rather
 * than a special case around two cards.
 *
 * The rule is enforced on the server too
 * (`Application/AnnualLeaves/Commands/ParentalLeaveEligibility.cs`), which is what
 * makes hiding the card mean something. Keep the two in step: this decides what a
 * person sees, that decides what the API accepts, and a disagreement shows up as a
 * card that only fails when pressed.
 */

/** Trimmed and lower-cased, matching how `SystemLeaveTypes` compares on the server. */
function key(name: string): string {
    return name.trim().toLowerCase()
}

/**
 * The three built-in types and who each is fixed to — the client's copy of
 * `SystemLeaveTypes.FixedAvailability`. Annual Leave is for everyone, Maternity
 * Leave for women, Paternity Leave for men. These names are frozen (none can be
 * renamed), which is what makes matching on them sound.
 */
const FIXED_AVAILABILITY: Record<string, GenderAvailability> = {
    'annual leave': 'Both',
    'maternity leave': 'Female',
    'paternity leave': 'Male',
}

/** The two types the eligible-child half reaches. */
const PARENTAL_TYPES = new Set(['maternity leave', 'paternity leave'])

export function isParentalLeaveType(name: string): boolean {
    return PARENTAL_TYPES.has(key(name))
}

/**
 * Who a built-in type is fixed to, or undefined for a type whose availability is
 * the admin's to set. The server refuses any other value for these three, so the
 * dialog shows them read-only and the rest of the client reads this ahead of the
 * stored column.
 */
export function fixedAvailability(name: string): GenderAvailability | undefined {
    return FIXED_AVAILABILITY[key(name)]
}

/**
 * Who `type` is available to, as the client should treat it. The fixed value wins
 * for a built-in type; otherwise the stored column; `'Both'` when a response
 * predating the column carries neither. Reading the name first is deliberate: an
 * API built before the column, or a Maternity row the migration has not reached,
 * still reports Both, and a father must not be offered Maternity Leave for it.
 */
export function resolveAvailability(type: Pick<LeaveType, 'name' | 'availableTo'>): GenderAvailability {
    return fixedAvailability(type.name) ?? type.availableTo ?? 'Both'
}

/** The gender `type` is offered to, or undefined when it is offered to everyone. */
function offeredTo(type: Pick<LeaveType, 'name' | 'availableTo'>): Gender | undefined {
    const availability = resolveAvailability(type)
    return availability === 'Both' ? undefined : availability
}

/**
 * Whether to offer `type` to an employee.
 *
 * `gender` null or undefined means "nobody has entered it" — the state of every
 * account created before the field existed — and passes the gender half of the
 * rule. The server reads it the same way. Failing closed instead would take
 * parental leave away from the whole company until an administrator filled the
 * field in one person at a time. Note that a null can no longer be *chosen*: the
 * admin dialogs offer Male or Female only and the API refuses a save without one,
 * so the nulls this tolerates are legacy rows on their way out.
 *
 * `hasEligibleChild` is consulted only for Maternity and Paternity Leave, and
 * still applies when the gender is unspecified: it is a fact about the employee's
 * own declared children, not a field nobody got round to.
 *
 * `employmentStartDate` feeds the minimum-service rule (`minServiceError`): a type
 * wanting N months of service is offered only once the employee's start date is
 * N months behind `today`. Unrecorded passes, like an unrecorded gender.
 */
export function isLeaveTypeOffered(
    type: Pick<LeaveType, 'name' | 'availableTo' | 'minServiceMonths'>,
    gender: Gender | null | undefined,
    hasEligibleChild: boolean,
    employmentStartDate?: string | null,
    today: Date = new Date(),
): boolean {
    if (minServiceError(type, employmentStartDate, today) !== null) return false

    const requiredGender = offeredTo(type)
    if (gender && requiredGender && gender !== requiredGender) return false

    if (!isParentalLeaveType(type.name)) return true

    return hasEligibleChild
}
