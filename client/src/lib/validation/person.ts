import { z } from 'zod'
import type { Gender, UserRole } from '../types/user'

/**
 * The rules for the identity fields collected about a person, shared by every
 * surface that collects them: the employee's own Edit profile (Sidebar) and the
 * admin Add/Edit User dialogs.
 *
 * Mirrors `Application/Core/PersonFieldRules.cs` plus the FluentValidation on
 * AdminCreateUserDto / AdminUpdateUserDto. The admin dialogs used to enforce
 * none of it — a plain text field each — so "cvbcvb" saved as a phone number,
 * "ZXzx" as an email, and today's date as a date of birth. Keep the two copies
 * in step; a disagreement shows up as a field that saves and then 400s.
 */

/** Matches `User.PhoneNumber`'s MaximumLength on both admin validators. */
export const PHONE_MAX_LENGTH = 30

/**
 * Digits, plus the punctuation a written number carries — a leading `+`,
 * spaces, dashes, and the parentheses around a dialling code. "+357 99 123456"
 * is how people write a number, so "only numeric" cannot mean digits alone.
 * What this refuses is letters, which is what was getting through.
 */
export const PHONE_PATTERN = /^[0-9+\s()-]*$/

export const PHONE_INVALID_MESSAGE = 'Phone number can only contain numbers.'
export const PHONE_TOO_LONG_MESSAGE = 'Phone number is too long.'

/** The youngest anyone may be recorded as. Mirrors `PersonFieldRules.MinimumAgeYears`. */
export const MINIMUM_AGE_YEARS = 16

export const EMAIL_REQUIRED_MESSAGE = 'Email is required.'
export const EMAIL_INVALID_MESSAGE = 'Enter a valid email address.'
export const DOB_REQUIRED_MESSAGE = 'Date of birth is required.'
export const DOB_FUTURE_MESSAGE = 'Date of birth must be in the past.'
export const DOB_TOO_YOUNG_MESSAGE = `Must be at least ${MINIMUM_AGE_YEARS} years old.`

/**
 * The message to show for `value`, or `undefined` when it is acceptable.
 * A blank value is acceptable — the phone number is optional everywhere it
 * appears, unlike the email and the date of birth.
 */
export function phoneNumberError(value: string): string | undefined {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    if (trimmed.length > PHONE_MAX_LENGTH) return PHONE_TOO_LONG_MESSAGE
    if (!PHONE_PATTERN.test(trimmed)) return PHONE_INVALID_MESSAGE
    return undefined
}

/**
 * Required, unlike the other two: an account has no way to sign in or be
 * notified without one. Stricter than the server's FluentValidation
 * `EmailAddress()`, which only asks for a single `@` — refusing "theodoros@"
 * in the dialog is better than accepting it and mailing a welcome link nowhere.
 */
export function emailError(value: string): string | undefined {
    const trimmed = value.trim()
    if (!trimmed) return EMAIL_REQUIRED_MESSAGE
    return z.email().safeParse(trimmed).success ? undefined : EMAIL_INVALID_MESSAGE
}

/** Today as `yyyy-MM-dd`, the shape a native date input reads and writes. */
function today(): string {
    return new Date().toISOString().slice(0, 10)
}

/**
 * The latest date of birth that is already old enough: the same day and month,
 * MINIMUM_AGE_YEARS earlier. Someone born exactly then turns the minimum age
 * today and is allowed.
 *
 * Also the date input's `max`, so the native picker will not offer a date the
 * form is then going to refuse — the field used to cap at today, which is how
 * a newborn got recorded as a new hire.
 */
export function latestAllowedDateOfBirth(asOf: string = today()): string {
    return `${Number(asOf.slice(0, 4)) - MINIMUM_AGE_YEARS}${asOf.slice(4)}`
}

/**
 * `value` and `asOf` are both `yyyy-MM-dd`, which compares correctly as a
 * string — no Date arithmetic, so no timezone shifting a birthday by a day.
 *
 * `asOf` is a parameter so the tests can fix the clock; nothing in the app
 * passes it.
 */
export function dateOfBirthError(value: string, asOf: string = today()): string | undefined {
    if (!value) return DOB_REQUIRED_MESSAGE
    if (value > asOf) return DOB_FUTURE_MESSAGE
    return value > latestAllowedDateOfBirth(asOf) ? DOB_TOO_YOUNG_MESSAGE : undefined
}

export const GENDER_REQUIRED_MESSAGE = 'Gender is required.'

/**
 * Mirrors the `Gender` rule on both admin validators
 * (`PersonFieldRules.GenderRequiredMessage`). Required, with no "not specified"
 * answer: gender decides who is offered a leave type restricted through
 * "Available to", and the server reads a stored null as "offer everything" so
 * that accounts predating the field keep their parental leave. Letting an admin
 * *choose* that null made a type restricted to one gender reachable by anyone
 * left unspecified. The only thing that can be wrong with the value is its
 * absence — the radios offer two answers and nothing else.
 *
 * Callers only ask this for an Employee or a Manager. A System Administrator has no recorded
 * gender — the field is hidden for them, and the API refuses one outright
 * (`PersonFieldRules.GenderNotForAdminMessage`) — so the dialogs skip the check
 * and send null, exactly as they do for `employmentStartDateError`.
 */
export function genderError(value: Gender | null | undefined): string | undefined {
    return value ? undefined : GENDER_REQUIRED_MESSAGE
}

export const START_DATE_REQUIRED_MESSAGE = 'Employment start date is required.'
export const START_DATE_TOO_YOUNG_MESSAGE =
    `Employment start date must be on or after their ${MINIMUM_AGE_YEARS}th birthday.`

/**
 * The earliest date somebody born on `dateOfBirth` may be recorded as having
 * started: their MINIMUM_AGE_YEARS birthday. Also the date input's `min`, so the
 * native picker will not offer a date the form is then going to refuse.
 *
 * Undefined when no date of birth is on file, which leaves the input uncapped —
 * there is no age to bound it by.
 */
export function earliestAllowedStartDate(dateOfBirth: string | null | undefined): string | undefined {
    if (!dateOfBirth) return undefined
    return `${Number(dateOfBirth.slice(0, 4)) + MINIMUM_AGE_YEARS}${dateOfBirth.slice(4)}`
}

/**
 * Mirrors `PersonFieldRules.EmploymentStartDate*` and the two validators that
 * apply them. Required, and not before the person's MINIMUM_AGE_YEARS birthday —
 * a start date decades before that is a typed year, not a career.
 *
 * Note what is *not* here: a start date in the future is accepted, unlike a date
 * of birth. An administrator keys a new hire in before their first day.
 *
 * Callers only ask this for an Employee or a Manager. A System Administrator has no start date
 * — the Profile section that collects it is hidden for them, and the API refuses
 * one outright — so the dialogs skip the check rather than passing a blank.
 */
export function employmentStartDateError(
    value: string,
    dateOfBirth: string | null | undefined,
): string | undefined {
    if (!value) return START_DATE_REQUIRED_MESSAGE

    const earliest = earliestAllowedStartDate(dateOfBirth)
    return earliest && value < earliest ? START_DATE_TOO_YOUNG_MESSAGE : undefined
}

export const HR_DEPARTMENTS_REQUIRED_MESSAGE = 'Select at least one department.'

/**
 * Mirrors `HrDepartmentScopeRules` and the two validators that apply it. An HR
 * Administrator's reach is the departments assigned to them, so one is required;
 * the API also refuses the field for every other role, but the dialogs never send
 * it for them, so there is nothing for this to say about those.
 */
export function hrDepartmentsError(role: UserRole, departmentIds: readonly number[]): string | undefined {
    return role === 'HR Administrator' && departmentIds.length === 0 ? HR_DEPARTMENTS_REQUIRED_MESSAGE : undefined
}
