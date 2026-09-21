import { describe, expect, it } from 'vitest'
import { annualCarryoverCap, describeCarryoverCap, splitAtCarryoverCap } from './leave-allowance'
import type { LeaveType } from './types'

/*
 * A carryover cap has three readings and null is not the missing one:
 *
 *   null — no cap, every unused day carries over
 *   0    — nothing carries over
 *   N    — at most N days
 *
 * The cap used to be bounded only by the calendar (0–365), so "nothing expires" was
 * spelled as a number too large to reach — 80 against a 23-day allowance. That reads
 * like a limit and behaves like none, and the preview quoted it as though days were
 * being capped when none ever could be. These hold the three apart.
 */

function leaveType(overrides: Partial<LeaveType> = {}): LeaveType {
    return {
        id: 1,
        name: 'Annual Leave',
        requiresApproval: true,
        isActive: true,
        affectsBalance: true,
        icon: '🌴',
        colorKey: 'annual',
        description: '',
        paid: true,
        attachmentPolicy: 'None',
        defaultAllowance: 23,
        allowanceUnit: 'days/year',
        maxCarryoverDays: 5,
        perChildEntitlement: false,
        perChildTotalWeeks: 0,
        perChildWeeksPerYear: 0,
        childEligibleUntilAge: 0,
        accrualNotes: '',
        minNoticeDays: 0,
        maxConsecutiveDays: 0,
        halfDayAllowed: false,
        availableTo: 'Both',
        isSystem: true,
        supportsPerChildEntitlement: false,
        ...overrides,
    } as LeaveType
}

describe('splitAtCarryoverCap', () => {
    it('carries the whole closing balance when there is no cap', () => {
        expect(splitAtCarryoverCap(46, null)).toEqual({ carried: 46, expired: 0 })
    })

    it('expires everything when the cap is zero', () => {
        expect(splitAtCarryoverCap(46, 0)).toEqual({ carried: 0, expired: 46 })
    })

    /*
     * The case that shows why "carry everything" cannot be spelled as cap = allowance:
     * a closing balance is last year's carry-in plus this year's allowance, so 23 days
     * carried into a 23-day year closes at 46 and a 23-day cap still expires 23 of them.
     */
    it('expires the excess above a cap equal to the allowance', () => {
        expect(splitAtCarryoverCap(46, 23)).toEqual({ carried: 23, expired: 23 })
    })

    it('expires nothing when the closing balance is under the cap', () => {
        expect(splitAtCarryoverCap(4, 23)).toEqual({ carried: 4, expired: 0 })
    })

    it('reads a negative balance as nothing to carry', () => {
        expect(splitAtCarryoverCap(-3, 23)).toEqual({ carried: 0, expired: 0 })
    })
})

describe('describeCarryoverCap', () => {
    it('names the three readings apart', () => {
        expect(describeCarryoverCap(null)).toBe('No cap')
        expect(describeCarryoverCap(0)).toBe('0 days')
        expect(describeCarryoverCap(5)).toBe('5 days')
    })
})

describe('annualCarryoverCap', () => {
    it('passes null through as no cap rather than flattening it to zero', () => {
        expect(annualCarryoverCap([leaveType({ maxCarryoverDays: null })])).toBeNull()
    })

    it('reads the cap off the type the balance is kept in', () => {
        expect(annualCarryoverCap([leaveType({ maxCarryoverDays: 5 })])).toBe(5)
    })

    /* No annual-leave type means no cap is configured — distinct from a type that
       sets one. Nothing carries over, because there is no balance to carry. */
    it('reads zero when no type keeps the pooled balance', () => {
        expect(annualCarryoverCap([leaveType({ affectsBalance: false })])).toBe(0)
    })
})
