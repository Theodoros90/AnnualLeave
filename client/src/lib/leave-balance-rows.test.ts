import { describe, expect, it } from 'vitest'
import { buildLeaveBalanceRows } from './leave-balance-rows'
import type { AnnualLeave, ChildLeaveEntitlement, ChildLeaveEntitlementSummary, LeaveType } from './types'

/**
 * The panels these rows feed are both headed with the current year and both put a
 * per-child row directly beside "Annual Leave 23/23", a figure for this year. So a
 * per-child row has to answer the same question its neighbours answer: how much
 * may I book in this leave year — not the lifetime entitlement per child, which is
 * what the card below breaks down and explains.
 */

const ANNUAL: LeaveType = {
    id: 1, name: 'Annual Leave', requiresApproval: true, isActive: true, affectsBalance: true,
    icon: '', colorKey: 'primary', description: '', paid: true, attachmentPolicy: 'None',
    defaultAllowance: 23, allowanceUnit: 'days/year', maxCarryoverDays: 0,
    perChildEntitlement: false, perChildTotalWeeks: 0, perChildWeeksPerYear: 0, childEligibleUntilAge: 0,
    accrualNotes: '', minNoticeDays: 0, maxConsecutiveDays: 0, halfDayAllowed: false,
    eligibilityNotes: '', eligibilityScope: 'All', availableTo: 'Both',
}

/** Its own 10 days/year, and not deducted from the pooled balance — like every seeded type but annual. */
const SICK: LeaveType = { ...ANNUAL, id: 2, name: 'Sick Leave', affectsBalance: false, defaultAllowance: 10 }

/** A type that sets no allowance at all: there is nothing to count down. */
const UNPAID: LeaveType = { ...ANNUAL, id: 5, name: 'Unpaid Leave', affectsBalance: false, defaultAllowance: 0 }

/** 4 weeks (20 business days) per child, 5 days a leave year, until age 15. */
const PATERNITY: LeaveType = {
    ...ANNUAL, id: 4, name: 'Paternity Leave', affectsBalance: false, defaultAllowance: 0,
    perChildEntitlement: true, perChildTotalWeeks: 4, perChildWeeksPerYear: 1, childEligibleUntilAge: 15,
}

function aChild(overrides: Partial<ChildLeaveEntitlement> = {}): ChildLeaveEntitlement {
    return {
        childId: 'child-1', name: 'Kokos', dateOfBirth: '2025-01-20', ageYears: 1,
        isEligible: true, lastEligibleDate: '2040-01-20',
        totalDays: 20, totalWeeks: 4, usedDays: 0, remainingDays: 20,
        thisYearCapDays: 5, thisYearUsedDays: 0, thisYearRemainingDays: 5,
        leaveYearStart: '2026-01-01T00:00:00', leaveYearEnd: '2026-12-31T00:00:00',
        ...overrides,
    }
}

function ledgerFor(children: ChildLeaveEntitlement[]): Map<number, ChildLeaveEntitlementSummary> {
    const eligible = children.filter((c) => c.isEligible)
    return new Map([[PATERNITY.id, {
        leaveTypeId: PATERNITY.id,
        leaveTypeName: PATERNITY.name,
        eligibleChildCount: eligible.length,
        totalRemainingDays: eligible.reduce((sum, c) => sum + c.remainingDays, 0),
        thisYearCapDays: eligible.reduce((sum, c) => sum + c.thisYearCapDays, 0),
        thisYearRemainingDays: eligible.reduce((sum, c) => sum + c.thisYearRemainingDays, 0),
        children,
    }]])
}

function build(children: ChildLeaveEntitlement[], approvedThisYear: AnnualLeave[] = []) {
    return buildLeaveBalanceRows({
        leaveTypes: [ANNUAL, SICK, UNPAID, PATERNITY],
        approvedThisYear,
        entitlement: 23,
        ledgerByTypeId: ledgerFor(children),
    })
}

const rowFor = (rows: ReturnType<typeof build>, name: string) => rows.find((r) => r.name === name)!

describe('buildLeaveBalanceRows, per-child types', () => {
    it("quotes the leave year's cap, not the lifetime entitlement per child", () => {
        const row = rowFor(build([aChild()]), 'Paternity Leave')

        expect(row).toMatchObject({ used: 0, total: 5, remaining: 5, tracked: true })
    })

    it('sums the cap across eligible children', () => {
        const row = rowFor(build([aChild(), aChild({ childId: 'child-2', name: 'Maria' })]), 'Paternity Leave')

        expect(row).toMatchObject({ used: 0, total: 10, remaining: 10 })
    })

    it("counts this year's usage, leaving earlier years in the lifetime ledger", () => {
        const row = rowFor(build([aChild({
            usedDays: 12, remainingDays: 8, thisYearUsedDays: 2, thisYearRemainingDays: 3,
        })]), 'Paternity Leave')

        expect(row).toMatchObject({ used: 2, total: 5, remaining: 3 })
    })

    /* The server caps the yearly remainder at the lifetime one, so an employee two
       days from exhausting a child's 20 is offered two, not five. The row repeats
       the figure rather than recomputing it. */
    it('never promises more this year than the lifetime ledger has left', () => {
        const row = rowFor(build([aChild({
            usedDays: 18, remainingDays: 2, thisYearUsedDays: 0, thisYearRemainingDays: 2,
        })]), 'Paternity Leave')

        expect(row.remaining).toBe(2)
    })

    it('leaves an aged-out child out of every figure', () => {
        const row = rowFor(build([
            aChild(),
            aChild({
                childId: 'child-2', name: 'Petros', ageYears: 18, isEligible: false,
                usedDays: 4, remainingDays: 0, thisYearUsedDays: 0, thisYearRemainingDays: 0,
            }),
        ]), 'Paternity Leave')

        expect(row).toMatchObject({ used: 0, total: 5, remaining: 5 })
    })

    it('reads as tracked with nothing left before its ledger arrives', () => {
        const rows = buildLeaveBalanceRows({
            leaveTypes: [PATERNITY], approvedThisYear: [], entitlement: 23,
            ledgerByTypeId: new Map(),
        })

        expect(rows[0]).toMatchObject({ used: 0, total: 0, remaining: 0, tracked: true })
    })
})

describe('buildLeaveBalanceRows, pooled and per-type allowances', () => {
    const approved = [
        { leaveTypeId: ANNUAL.id, totalDays: 3 },
        { leaveTypeId: SICK.id, totalDays: 2 },
        { leaveTypeId: UNPAID.id, totalDays: 4 },
    ] as AnnualLeave[]

    it("measures annual leave against the employee's own entitlement", () => {
        const row = rowFor(build([aChild()], approved), 'Annual Leave')

        expect(row).toMatchObject({ used: 3, total: 23, remaining: 20, tracked: true })
    })

    /* `affectsBalance` says only whether the type is *also* deducted from the pool
       the API enforces — it never meant the type has no budget. Sick leave has
       10 days a year of its own, which the row used to throw away and report as a
       bare "2 days taken" beside annual leave's 20/23. */
    it('measures every other type against its own allowance', () => {
        const row = rowFor(build([aChild()], approved), 'Sick Leave')

        expect(row).toMatchObject({ used: 2, total: 10, remaining: 8, tracked: true })
    })

    it('reports usage alone for a type that sets no allowance', () => {
        const row = rowFor(build([aChild()], approved), 'Unpaid Leave')

        expect(row).toMatchObject({ used: 4, total: 0, tracked: false })
    })

    it('never reports a negative remainder when a type is overdrawn', () => {
        const row = rowFor(build([aChild()], [{ leaveTypeId: SICK.id, totalDays: 14 }] as AnnualLeave[]), 'Sick Leave')

        expect(row).toMatchObject({ used: 14, total: 10, remaining: 0 })
    })
})
