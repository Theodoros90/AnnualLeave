import type { LeaveType } from './types'

/**
 * The two limits a leave type puts on *when* a request may start and *how long* it
 * may run: `minNoticeDays` and `maxConsecutiveDays`.
 *
 * This mirrors `Application/AnnualLeaves/Commands/NoticePeriodRule.cs` and
 * `MaxConsecutiveRule.cs`, which are what actually refuse a request; this decides
 * what the forms offer and what they say. Keep the two in step — a disagreement
 * shows up as a submit that only fails when pressed, the same trap
 * `attachment-policy.ts` and `half-day.ts` guard against.
 *
 * Both columns were display-only until those rules. The admin dialog saved them
 * and the leave type's card rendered "Minimum 7 days notice required" and "Max 15
 * consecutive days per request", while the apply page ignored both: it warned
 * "Short notice" below a hardcoded seven days no matter what the type asked for,
 * and never mentioned length at all. So an admin setting 30 days notice on
 * Maternity Leave changed nothing an employee could see, and a request filed for
 * tomorrow submitted happily.
 *
 * The units differ, and deliberately:
 *
 * - Notice is **calendar** days. "30 days notice" is how an HR policy states it,
 *   and the card says "days notice" plainly.
 * - The maximum is **business** days — the same figure the summary panel already
 *   calls "Working days", so "17 consecutive days" and "17 days deducted" are the
 *   same 17.
 */

/** Midnight local, so day arithmetic never drifts on a timezone offset. */
function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function toIso(date: Date): string {
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${date.getFullYear()}-${month}-${day}`
}

/**
 * The first date this type may be started on — what the calendar takes as its
 * minimum, so a date inside the notice period cannot be picked in the first place.
 *
 * Today when no type is chosen yet: a fresh form must not have its calendar
 * narrowed by a limit belonging to nothing.
 */
export function earliestStartDate(
    type: Pick<LeaveType, 'minNoticeDays'> | undefined,
    today: Date = new Date(),
): string {
    const notice = type?.minNoticeDays ?? 0
    const earliest = startOfDay(today)
    if (notice > 0) earliest.setDate(earliest.getDate() + notice)
    return toIso(earliest)
}

/**
 * Why the chosen start date is too soon, or `null` when it is fine.
 *
 * The wording matches `NoticePeriodRule.Check` so the form and the API say the
 * same thing about the same request.
 */
export function noticeError(
    type: Pick<LeaveType, 'name' | 'minNoticeDays'> | undefined,
    startDate: string,
    today: Date = new Date(),
): string | null {
    // No type and no date are both the fresh form. Reading either as a breach
    // would disable submit before anyone has filled anything in.
    if (!type || !startDate) return null
    if (type.minNoticeDays <= 0) return null

    const earliest = startOfDay(today)
    earliest.setDate(earliest.getDate() + type.minNoticeDays)

    const start = startOfDay(new Date(`${startDate}T00:00:00`))
    if (start.getTime() >= earliest.getTime()) return null

    const day = earliest.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    })
    return `${type.name} needs ${type.minNoticeDays} days notice. The earliest you can start is ${day}.`
}

/**
 * `date` plus `months`, clamping the day the way .NET's `DateOnly.AddMonths` does:
 * 31 January plus one month is 28 February, not 3 March. The JS `Date` overflows
 * instead, which would put a month-end hire's eligibility a few days later than
 * the server puts it.
 */
function addMonthsClamped(date: Date, months: number): Date {
    const firstOfTarget = new Date(date.getFullYear(), date.getMonth() + months, 1)
    const daysInTarget = new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth() + 1, 0).getDate()
    return new Date(
        firstOfTarget.getFullYear(),
        firstOfTarget.getMonth(),
        Math.min(date.getDate(), daysInTarget),
    )
}

/**
 * Why the employee has not served long enough for `type`, or `null` when they
 * have — or when nothing says otherwise.
 *
 * Mirrors `MinimumServiceRule.Check`: months of service measured from the
 * employee's start date to **today**, not to the leave's start date, so the type
 * is hidden until the months are served and then appears. A start date nobody
 * recorded (`null`/`undefined`) passes, as it does on the server: an Admin never
 * has one, and an account predating the field has none until next saved. A type
 * carrying no `minServiceMonths` at all — an API built before the column — reads
 * as 0, no minimum.
 */
export function minServiceError(
    type: Pick<LeaveType, 'name' | 'minServiceMonths'> | undefined,
    employmentStartDate: string | null | undefined,
    today: Date = new Date(),
): string | null {
    if (!type) return null
    const months = type.minServiceMonths ?? 0
    if (months <= 0) return null
    if (!employmentStartDate) return null

    const started = startOfDay(new Date(`${employmentStartDate}T00:00:00`))
    const eligibleFrom = addMonthsClamped(started, months)
    if (startOfDay(today).getTime() >= eligibleFrom.getTime()) return null

    const unit = months === 1 ? 'month' : 'months'
    const day = eligibleFrom.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    })
    return `${type.name} is available after ${months} ${unit} of service. You can request it from ${day}.`
}

/**
 * Why the request is too long, or `null` when it is fine. `workingDays` is the
 * business-day count the forms already compute for the summary panel, which is
 * what keeps this in step with the server — that count applies the same weekend
 * and public-holiday rules `MaxConsecutiveRule` does.
 */
export function maxConsecutiveError(
    type: Pick<LeaveType, 'name' | 'maxConsecutiveDays'> | undefined,
    workingDays: number,
): string | null {
    if (!type) return null
    // Zero is the setting the admin dialog labels "0 = no maximum".
    if (type.maxConsecutiveDays <= 0) return null
    if (workingDays <= type.maxConsecutiveDays) return null

    return `${type.name} allows at most ${type.maxConsecutiveDays} working days per request. `
        + `This one covers ${workingDays}.`
}
