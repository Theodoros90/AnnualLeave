import { describe, expect, it } from 'vitest'
import { earliestStartDate, maxConsecutiveError, minServiceError, noticeError } from './leave-limits'
import type { LeaveType } from './types'

function type(overrides: Partial<LeaveType> = {}): LeaveType {
    return {
        id: 1,
        name: 'Annual Leave',
        minNoticeDays: 0,
        maxConsecutiveDays: 0,
        ...overrides,
    } as LeaveType
}

// A Monday, so the weekday arithmetic below reads plainly.
const today = new Date('2026-06-01T00:00:00')

describe('noticeError', () => {
    it('refuses a start date inside the notice period, naming the earliest one', () => {
        expect(noticeError(type({ minNoticeDays: 2 }), '2026-06-02', today)).toBe(
            'Annual Leave needs 2 days notice. The earliest you can start is Wednesday, 3 June 2026.',
        )
    })

    it('allows a start date exactly on the boundary', () => {
        expect(noticeError(type({ minNoticeDays: 2 }), '2026-06-03', today)).toBeNull()
    })

    it('allows anything when the type asks for no notice', () => {
        expect(noticeError(type({ minNoticeDays: 0 }), '2026-06-01', today)).toBeNull()
    })

    // Calendar days, matching NoticePeriodRule.cs: two days notice given on a
    // Friday reaches Sunday, so the Monday after is clear. Counting business days
    // would push the earliest start to Tuesday and disagree with the server.
    it('counts calendar days, so a weekend spends the notice', () => {
        const friday = new Date('2026-06-05T00:00:00')
        expect(noticeError(type({ minNoticeDays: 2 }), '2026-06-08', friday)).toBeNull()
    })

    // The fresh form, before a type or a date is chosen. Reading either as a
    // breach would disable submit on a form nobody has filled in yet.
    it('says nothing without a type or without a date', () => {
        expect(noticeError(undefined, '2026-06-02', today)).toBeNull()
        expect(noticeError(type({ minNoticeDays: 2 }), '', today)).toBeNull()
    })
})

// Mirrors MinimumServiceRule.cs: months of service measured from the employee's
// start date to today, not to the leave's start date, so the type is hidden until
// the months are served and then appears.
describe('minServiceError', () => {
    const today2 = new Date('2026-09-21T00:00:00')

    it('refuses an employee who has not served the months, naming the date they will have', () => {
        expect(minServiceError(type({ name: 'Unpaid Leave', minServiceMonths: 2 }), '2026-08-01', today2)).toBe(
            'Unpaid Leave is available after 2 months of service. You can request it from Thursday, 1 October 2026.',
        )
    })

    it('reads one month in the singular', () => {
        expect(minServiceError(type({ name: 'Unpaid Leave', minServiceMonths: 1 }), '2026-09-01', today2)).toBe(
            'Unpaid Leave is available after 1 month of service. You can request it from Thursday, 1 October 2026.',
        )
    })

    it('allows an employee exactly on the boundary', () => {
        expect(minServiceError(type({ minServiceMonths: 2 }), '2026-07-21', today2)).toBeNull()
    })

    it('allows anything when the type asks for no service', () => {
        expect(minServiceError(type({ minServiceMonths: 0 }), '2026-09-21', today2)).toBeNull()
    })

    // Nobody recorded it — an Admin, or an account predating the field. The same
    // reading the server gives a null gender: not "started today".
    it('passes an unrecorded start date', () => {
        expect(minServiceError(type({ minServiceMonths: 24 }), null, today2)).toBeNull()
        expect(minServiceError(type({ minServiceMonths: 24 }), undefined, today2)).toBeNull()
    })

    // A response from an API built before the column carries no minServiceMonths
    // at all; that has to read as "no minimum", not as a broken form.
    it('passes a type carrying no minimum at all', () => {
        expect(minServiceError(type({ minServiceMonths: undefined }), '2026-09-01', today2)).toBeNull()
    })

    it('says nothing without a type', () => {
        expect(minServiceError(undefined, '2026-09-01', today2)).toBeNull()
    })
})

describe('earliestStartDate', () => {
    it('is today when the type asks for no notice', () => {
        expect(earliestStartDate(type({ minNoticeDays: 0 }), today)).toBe('2026-06-01')
    })

    it('is the far end of the notice period otherwise', () => {
        expect(earliestStartDate(type({ minNoticeDays: 10 }), today)).toBe('2026-06-11')
    })

    it('is today when no type is chosen yet', () => {
        expect(earliestStartDate(undefined, today)).toBe('2026-06-01')
    })
})

describe('maxConsecutiveError', () => {
    it('refuses a request longer than the maximum', () => {
        expect(maxConsecutiveError(type({ maxConsecutiveDays: 17 }), 20)).toBe(
            'Annual Leave allows at most 17 working days per request. This one covers 20.',
        )
    })

    it('allows a request exactly at the maximum', () => {
        expect(maxConsecutiveError(type({ maxConsecutiveDays: 17 }), 17)).toBeNull()
    })

    // Zero is the setting the admin dialog labels "0 = no maximum".
    it('allows any length when the type sets no maximum', () => {
        expect(maxConsecutiveError(type({ maxConsecutiveDays: 0 }), 400)).toBeNull()
    })

    it('says nothing without a type', () => {
        expect(maxConsecutiveError(undefined, 400)).toBeNull()
    })
})
