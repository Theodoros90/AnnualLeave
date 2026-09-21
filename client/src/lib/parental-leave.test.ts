import { describe, expect, it } from 'vitest'
import { isLeaveTypeOffered } from './parental-leave'
import type { Gender, GenderAvailability, LeaveType } from './types'

function leaveType(name: string, availableTo: GenderAvailability = 'Both'): LeaveType {
    return {
        id: 1,
        name,
        requiresApproval: true,
        isActive: true,
        affectsBalance: false,
        icon: '👶',
        colorKey: 'maternity',
        description: '',
        paid: true,
        attachmentPolicy: 'Required',
        defaultAllowance: 90,
        allowanceUnit: 'days/event',
        maxCarryoverDays: 0,
        perChildEntitlement: false,
        perChildTotalWeeks: 0,
        perChildWeeksPerYear: 0,
        childEligibleUntilAge: 0,
        accrualNotes: '',
        minNoticeDays: 0,
        maxConsecutiveDays: 0,
        halfDayAllowed: false,
        eligibilityNotes: '',
        eligibilityScope: 'Limited',
        availableTo,
    }
}

// As the server stores them: the built-in types' availability is fixed by what
// they are (Domain/SystemLeaveTypes.cs), so a fixture is not free to disagree.
const maternity = leaveType('Maternity Leave', 'Female')
const paternity = leaveType('Paternity Leave', 'Male')
const annual = leaveType('Annual Leave', 'Both')

function offered(type: LeaveType, gender: Gender | null | undefined, hasEligibleChild: boolean) {
    return isLeaveTypeOffered(type, gender, hasEligibleChild)
}

// The service half of the rule. Mirrors MinimumServiceRule.cs: a type wanting N
// months of service is offered only once the employee's start date is N months
// behind today. It sits inside isLeaveTypeOffered so that every surface that
// filters the type list — the apply page, the balance panel, the edit dialog for
// the employee's own request — hides the card the API would refuse.
describe('isLeaveTypeOffered · minimum service', () => {
    const today = new Date('2026-09-21T00:00:00')
    const unpaid = { ...leaveType('Unpaid Leave'), minServiceMonths: 12 }

    it('hides a type wanting more service than the employee has', () => {
        expect(isLeaveTypeOffered(unpaid, 'Male', false, '2026-08-01', today)).toBe(false)
    })

    it('offers it once the months are served', () => {
        expect(isLeaveTypeOffered(unpaid, 'Male', false, '2025-09-21', today)).toBe(true)
    })

    it('offers it to an employee with no recorded start date', () => {
        expect(isLeaveTypeOffered(unpaid, 'Male', false, null, today)).toBe(true)
        expect(isLeaveTypeOffered(unpaid, 'Male', false, undefined, today)).toBe(true)
    })

    // Both halves apply: enough service does not buy a father Maternity Leave.
    it('still applies the gender and child rules to a tenured employee', () => {
        const tenuredMaternity = { ...maternity, minServiceMonths: 1 }
        expect(isLeaveTypeOffered(tenuredMaternity, 'Male', true, '2020-01-01', today)).toBe(false)
        expect(isLeaveTypeOffered(tenuredMaternity, 'Female', false, '2020-01-01', today)).toBe(false)
        expect(isLeaveTypeOffered(tenuredMaternity, 'Female', true, '2020-01-01', today)).toBe(true)
    })
})

describe('isLeaveTypeOffered', () => {
    it('offers maternity leave to a female employee with an eligible child', () => {
        expect(offered(maternity, 'Female', true)).toBe(true)
    })

    it('withholds maternity leave from a male employee', () => {
        expect(offered(maternity, 'Male', true)).toBe(false)
    })

    it('offers paternity leave to a male employee with an eligible child', () => {
        expect(offered(paternity, 'Male', true)).toBe(true)
    })

    it('withholds paternity leave from a female employee', () => {
        expect(offered(paternity, 'Female', true)).toBe(false)
    })

    it('withholds both parental types when no child is eligible', () => {
        expect(offered(maternity, 'Female', false)).toBe(false)
        expect(offered(paternity, 'Male', false)).toBe(false)
    })

    /**
     * The fail-open rule the server makes too: null is "nobody has entered it",
     * which is every account predating the column, not "neither".
     */
    it('offers both parental types when the gender is not specified', () => {
        expect(offered(maternity, null, true)).toBe(true)
        expect(offered(paternity, undefined, true)).toBe(true)
    })

    it('still requires an eligible child when the gender is not specified', () => {
        expect(offered(maternity, null, false)).toBe(false)
    })

    it('leaves every other leave type alone', () => {
        expect(offered(annual, 'Male', false)).toBe(true)
        expect(offered(annual, null, false)).toBe(true)
    })

    /** Matched the way the server matches a system leave type by name. */
    it('matches the parental type names case-insensitively and ignores surrounding space', () => {
        expect(offered(leaveType('  maternity leave ', 'Female'), 'Male', true)).toBe(false)
    })

    /*
     * The gender half reads the type's own `availableTo`, not its name, so a type
     * an admin made and restricted is filtered the same way the server refuses it
     * (ParentalLeaveEligibility reads the same column). The eligible-child half
     * stays parental-only: a men-only training leave asks nothing about children.
     */
    describe('a custom type restricted to one gender', () => {
        const menOnly = leaveType('Reservist Training', 'Male')
        const womenOnly = leaveType('Menstrual Leave', 'Female')

        it('is withheld from the other gender', () => {
            expect(offered(menOnly, 'Female', false)).toBe(false)
            expect(offered(womenOnly, 'Male', false)).toBe(false)
        })

        it('is offered to the matching gender without asking about children', () => {
            expect(offered(menOnly, 'Male', false)).toBe(true)
            expect(offered(womenOnly, 'Female', false)).toBe(true)
        })

        it('is offered when the gender is not specified', () => {
            expect(offered(menOnly, null, false)).toBe(true)
            expect(offered(womenOnly, undefined, false)).toBe(true)
        })
    })
})

/*
 * The built-in types' availability is fixed by name on the server, but the client
 * must not depend on the row saying so: an API that predates the column, or a row
 * the migration has not reached, still reports Both -- and a father must not be
 * offered Maternity Leave for it.
 */
describe('the built-in types are fixed by name, whatever the row says', () => {
    it('withholds maternity leave from a male employee even when the row says Both', () => {
        expect(offered(leaveType('Maternity Leave', 'Both'), 'Male', true)).toBe(false)
    })

    it('withholds paternity leave from a female employee even when the row says Both', () => {
        expect(offered(leaveType('Paternity Leave', 'Both'), 'Female', true)).toBe(false)
    })

    it('offers annual leave to everyone even when the row says Male', () => {
        expect(offered(leaveType('Annual Leave', 'Male'), 'Female', false)).toBe(true)
    })
})
