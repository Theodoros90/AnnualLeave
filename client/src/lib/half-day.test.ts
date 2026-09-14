import { describe, expect, it } from 'vitest'
import type { LeaveType } from './types'
import {
    chargeableDays,
    collapseToHalfDay,
    isHalfDay,
    isHalfDayOffered,
    type LeaveDurationValue,
} from './half-day'

const type = (halfDayAllowed: boolean): Pick<LeaveType, 'halfDayAllowed'> => ({ halfDayAllowed })

describe('isHalfDayOffered', () => {
    it('offers the choice on a type that allows it', () => {
        expect(isHalfDayOffered(type(true))).toBe(true)
    })

    it('withholds it on a type that does not', () => {
        expect(isHalfDayOffered(type(false))).toBe(false)
    })

    /* A fresh form has no type selected. Reading that as "allowed" would show
       buttons the server is certain to refuse the moment a type is picked. */
    it('withholds it before a type is chosen', () => {
        expect(isHalfDayOffered(undefined)).toBe(false)
    })
})

describe('isHalfDay', () => {
    it.each<LeaveDurationValue>(['HalfDayMorning', 'HalfDayAfternoon'])('is true for %s', (duration) => {
        expect(isHalfDay(duration)).toBe(true)
    })

    it('is false for a full day', () => {
        expect(isHalfDay('Full')).toBe(false)
    })
})

describe('chargeableDays', () => {
    it('charges every working day of a full-day request', () => {
        expect(chargeableDays(5, 'Full')).toBe(5)
    })

    it('charges half a day for a half day', () => {
        expect(chargeableDays(1, 'HalfDayAfternoon')).toBe(0.5)
    })

    /* Mirrors the flat 0.5 in LeaveCalculationService: a half day is half a day,
       not half of however many days the range covers. The forms refuse a
       multi-date half day, so this is the summary panel declining to quote a
       figure the server would never charge. */
    it('never charges more than half a day for a half day', () => {
        expect(chargeableDays(5, 'HalfDayMorning')).toBe(0.5)
    })

    it('charges nothing when the range holds no working day', () => {
        expect(chargeableDays(0, 'HalfDayMorning')).toBe(0)
        expect(chargeableDays(0, 'Full')).toBe(0)
    })
})

describe('collapseToHalfDay', () => {
    /* The bug this whole feature started from: picking one date on the calendar
       set the start and cleared the end, so a half day — which covers exactly one
       date — left the form reading "End date —, Working days 0" with submit
       disabled, and no way forward but clicking the same cell twice. */
    it('ends a half day on the date it starts', () => {
        expect(collapseToHalfDay('2026-09-09', '', 'HalfDayAfternoon')).toEqual({
            startDate: '2026-09-09',
            endDate: '2026-09-09',
        })
    })

    it('narrows a range already picked down to its first date', () => {
        expect(collapseToHalfDay('2026-09-09', '2026-09-18', 'HalfDayMorning')).toEqual({
            startDate: '2026-09-09',
            endDate: '2026-09-09',
        })
    })

    it('leaves a full-day range alone', () => {
        expect(collapseToHalfDay('2026-09-09', '2026-09-18', 'Full')).toEqual({
            startDate: '2026-09-09',
            endDate: '2026-09-18',
        })
    })

    /* Nothing to collapse onto, and inventing a date here would put a request on
       the calendar the employee never picked. */
    it('leaves an empty form alone', () => {
        expect(collapseToHalfDay('', '', 'HalfDayMorning')).toEqual({
            startDate: '',
            endDate: '',
        })
    })
})
