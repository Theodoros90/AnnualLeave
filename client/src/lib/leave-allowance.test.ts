import { describe, expect, it } from 'vitest'
import {
    currentYearEntitlement, describePerChildTotals, ordinal, proRateFirstYearAllowance, resolvePerChildTotals,
} from './leave-allowance'

/**
 * What one employee may take this leave year. The server computes it — pro-rated
 * from the start date when the balance type asks for it — and the pages quote it
 * in place of the stored entitlement. An API built before the field sends none,
 * which has to read as the stored figure rather than as 0: 0 would render every
 * balance tile as "0 of 0" the moment an old API met a new client.
 */
describe('currentYearEntitlement', () => {
    it("is the server's figure for this year when it sends one", () => {
        expect(currentYearEntitlement({ annualLeaveEntitlement: 23, currentYearEntitlement: 8 })).toBe(8)
    })

    it('is the stored entitlement when the API predates the field', () => {
        expect(currentYearEntitlement({ annualLeaveEntitlement: 23 })).toBe(23)
    })

    it('keeps a genuine 0 from the server', () => {
        // Somebody whose start date is after this leave year ends has nothing to take.
        expect(currentYearEntitlement({ annualLeaveEntitlement: 23, currentYearEntitlement: 0 })).toBe(0)
    })

    it('is 0 with no profile at all', () => {
        expect(currentYearEntitlement(undefined)).toBe(0)
    })
})

/**
 * Mirror of `LeaveCalculationService.ProRateFirstYearEntitlement`, for the types
 * whose allowance the server does not enforce and so never computes for us: a
 * non-balance type's own allowance (sick leave's 10 days) scaled for a mid-year
 * joiner. Remaining months over twelve, joining month counted in full, rounded up
 * to the next half day. Keep it in step with the C# — the balance type's figure
 * comes from the server, so a drift would show as sick leave disagreeing with
 * annual leave on the same panel.
 */
describe('proRateFirstYearAllowance', () => {
    const today = new Date(2026, 8, 22) // 22 September 2026

    it('scales by the remaining months, joining month included, rounded up to the half day', () => {
        // 10 × 4/12 = 3.33 → 3.5
        expect(proRateFirstYearAllowance(10, '2026-09-10', 1, today)).toBe(3.5)
        // 23 × 4/12 = 7.67 → 8
        expect(proRateFirstYearAllowance(23, '2026-09-30', 1, today)).toBe(8)
    })

    it('is the full allowance for a start before the leave year, or none on file', () => {
        expect(proRateFirstYearAllowance(10, '2025-11-01', 1, today)).toBe(10)
        expect(proRateFirstYearAllowance(10, '2026-01-15', 1, today)).toBe(10)
        expect(proRateFirstYearAllowance(10, null, 1, today)).toBe(10)
        expect(proRateFirstYearAllowance(10, undefined, 1, today)).toBe(10)
    })

    it('is 0 for a start after the leave year ends', () => {
        expect(proRateFirstYearAllowance(10, '2027-02-01', 1, today)).toBe(0)
    })

    it('follows an April leave year into the following calendar year', () => {
        // Leave year April 2026 – March 2027: Sep..Mar = 7 months, 10 × 7/12 = 5.83 → 6
        expect(proRateFirstYearAllowance(10, '2026-09-10', 4, today)).toBe(6)
        // February 2027 is still leave year 2026 when today is February 2027: Feb, Mar = 2/12 → 1.67 → 2
        expect(proRateFirstYearAllowance(10, '2027-02-01', 4, new Date(2027, 1, 10))).toBe(2)
    })

    it('does not round an exact twelfth up', () => {
        expect(proRateFirstYearAllowance(24, '2026-07-01', 1, today)).toBe(12)
    })
})

/**
 * The per-child total by birth order, mirroring `LeaveType.PerChildTotalWeeksFor`
 * on the server: a blank later column is the one before it. This is the only
 * place the two nullable columns are read.
 */
describe('resolvePerChildTotals', () => {
    it('reads a blank later column as the one before it', () => {
        expect(resolvePerChildTotals({
            perChildTotalWeeks: 18, perChildTotalWeeksSecondChild: null, perChildTotalWeeksThirdChildOnwards: null,
        })).toEqual({ first: 18, second: 18, third: 18 })

        expect(resolvePerChildTotals({
            perChildTotalWeeks: 22, perChildTotalWeeksSecondChild: null, perChildTotalWeeksThirdChildOnwards: 26,
        })).toEqual({ first: 22, second: 22, third: 26 })
    })

    it('treats a stored 0 and an absent column the same way as null', () => {
        expect(resolvePerChildTotals({
            perChildTotalWeeks: 20, perChildTotalWeeksSecondChild: 0, perChildTotalWeeksThirdChildOnwards: 0,
        })).toEqual({ first: 20, second: 20, third: 20 })
        expect(resolvePerChildTotals({ perChildTotalWeeks: 20 })).toEqual({ first: 20, second: 20, third: 20 })
    })
})

describe('describePerChildTotals', () => {
    it('is one figure when every child gets the same', () => {
        expect(describePerChildTotals({ first: 18, second: 18, third: 18 })).toBe('18 weeks per child')
        expect(describePerChildTotals({ first: 1, second: 1, third: 1 })).toBe('1 week per child')
    })

    it('states the maternity shape in one sentence', () => {
        expect(describePerChildTotals({ first: 22, second: 22, third: 26 }))
            .toBe('22 weeks for the 1st and 2nd child · 26 weeks from the 3rd')
    })

    it('states a step after the first child', () => {
        expect(describePerChildTotals({ first: 18, second: 20, third: 20 }))
            .toBe('18 weeks for the 1st child · 20 weeks from the 2nd')
    })

    it('lists all three when they all differ', () => {
        expect(describePerChildTotals({ first: 18, second: 20, third: 26 }))
            .toBe('18 / 20 / 26 weeks for the 1st / 2nd / 3rd+ child')
    })
})

describe('ordinal', () => {
    it('suffixes the way English does', () => {
        expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal))
            .toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th'])
    })
})
