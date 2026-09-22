import { describe, expect, it } from 'vitest'
import { currentYearEntitlement, proRateFirstYearAllowance } from './leave-allowance'

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
