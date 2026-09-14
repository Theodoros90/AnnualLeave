import { describe, expect, it } from 'vitest'
import { earliestStartDate, maxConsecutiveError, noticeError } from './leave-limits'
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
