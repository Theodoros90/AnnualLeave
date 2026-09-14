import type { LeaveType } from './types'

/**
 * Whole days, or half of one — and which half.
 *
 * The strings are `Domain.Services.LeaveDuration`'s member names, which is what
 * `AnnualLeaveDto.Duration` carries and what the create and edit payloads send
 * back. Names rather than numbers for the same reason `status` is a name: the wire
 * format should not turn on the order members happen to be declared in.
 */
export type LeaveDurationValue = 'Full' | 'HalfDayMorning' | 'HalfDayAfternoon'

/**
 * Whether a leave type offers half days at all.
 *
 * This mirrors `Application/AnnualLeaves/Commands/HalfDayRule.cs`, which is what
 * actually refuses a request; this decides what the form offers. Keep the two in
 * step — a disagreement shows up as a button that only fails when pressed, the
 * same trap `attachment-policy.ts` and `parental-leave.ts` guard against.
 *
 * `LeaveType.halfDayAllowed` was display-only until that rule. The admin dialog
 * saved it and the type's card rendered "Half-day requests allowed" as a badge,
 * while the apply page showed its AM and PM buttons for every type regardless —
 * and then posted no duration at all, so a half day was stored and charged as a
 * whole one. Turning the switch off changed nothing; turning it on changed
 * nothing either.
 */
export function isHalfDayOffered(type: Pick<LeaveType, 'halfDayAllowed'> | undefined): boolean {
    // `undefined` covers the fresh form, where no type is chosen yet. Reading that
    // as "allowed" would offer a choice the server refuses the moment a type is.
    return type?.halfDayAllowed === true
}

export function isHalfDay(duration: LeaveDurationValue): boolean {
    return duration !== 'Full'
}

/**
 * Days deducted for a request covering `workingDays` working days.
 *
 * A half day costs half a day flat, not half of however many days the range
 * covers — mirroring `LeaveCalculationService.CalculateChargeableDays`. The forms
 * keep a half day on a single date, so the two agree in every case a user can
 * reach; the flat figure is what stops the summary panel quoting 2.5 days for a
 * week-long request that still calls itself a half day.
 *
 * A range holding no working day charges nothing, half day or not — matching a
 * full-day request over a weekend, which counts 0 rather than being refused.
 */
export function chargeableDays(workingDays: number, duration: LeaveDurationValue): number {
    if (!isHalfDay(duration)) return workingDays
    return workingDays > 0 ? 0.5 : 0
}

/**
 * The dates a request should hold once `duration` is applied to them.
 *
 * A half day covers exactly one date, so it ends on the day it starts. This is the
 * bug the feature started from: the calendar's first click set the start date and
 * cleared the end, which is right for a range and wrong for a half day — the form
 * sat at "End date —, Working days 0, Days deducted 0" with submit disabled, and
 * the only way forward was to click the same cell a second time.
 *
 * An empty form is left empty: there is nothing to collapse onto, and inventing a
 * date would put a request on the calendar nobody picked.
 */
export function collapseToHalfDay(
    startDate: string,
    endDate: string,
    duration: LeaveDurationValue,
): { startDate: string; endDate: string } {
    if (!isHalfDay(duration) || !startDate) return { startDate, endDate }
    return { startDate, endDate: startDate }
}

/** "Half day (AM)" and friends — one spelling, shared by every surface. */
export function durationLabel(duration: LeaveDurationValue): string {
    switch (duration) {
        case 'HalfDayMorning':
            return 'Half day (AM)'
        case 'HalfDayAfternoon':
            return 'Half day (PM)'
        default:
            return 'Full day(s)'
    }
}

/**
 * No `formatDays` helper here on purpose. Every surface already spells the count as
 * `${n} day${n === 1 ? '' : 's'}`, and that reads correctly for 0.5 as it stands —
 * "0.5 days" — so there was nothing for a helper to fix.
 */
