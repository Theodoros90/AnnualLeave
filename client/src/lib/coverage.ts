import type { UserRole } from './types'
import { isAdministrator } from './roles'

/**
 * Whether a leave request has to name a colleague to cover it.
 *
 * Mirrors `Application/AnnualLeaves/Commands/CoverageRule.cs`, which is what
 * actually refuses a request; this decides whether the forms offer a submit at
 * all and how step 3 of the apply page is labelled. Keep the two in step — a
 * disagreement shows up as a button that only fails when pressed, the same trap
 * `attachment-policy.ts` guards against.
 *
 * The rule: required for an Employee and a Manager, not for an administrator (System or HR). An administrator
 * has no department, so the picker — which offers department colleagues — would
 * offer them nobody, and a required field with nothing to put in it is a form
 * that cannot be submitted. The server reads the *employee's* stored role, so an
 * admin filing on somebody's behalf is held to it; the roles passed here should
 * therefore be whoever the leave is for, not whoever is typing.
 *
 * Roles unknown (an admin editing somebody else's request, where the DTO carries
 * no role) reads as *not* required: a mirror may under-refuse, it must never
 * over-refuse. The server has the last word either way.
 */
export const COVERAGE_REQUIRED_MESSAGE = 'Please nominate a colleague to cover for you while you are away.'

export const COVERAGE_NOTE_MAX_LENGTH = 1000

export function isCoverageRequired(roles: readonly UserRole[] | null | undefined): boolean {
    if (!roles) return false
    return !isAdministrator(roles)
}

/** The refusal for `delegateId` under `roles`, or null when there is none. Whitespace is not a delegate. */
export function coverageError(roles: readonly UserRole[] | null | undefined, delegateId: string | null | undefined): string | null {
    if (delegateId && delegateId.trim() !== '') return null
    return isCoverageRequired(roles) ? COVERAGE_REQUIRED_MESSAGE : null
}
