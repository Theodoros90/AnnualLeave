import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StoreProvider } from '../../lib/mobx'
import type { AnnualLeave, ChildLeaveEntitlement, ChildLeaveEntitlementSummary, EmployeeProfile, UserInfo } from '../../lib/types'
import MyLeavePage from './MyLeavePage'

/**
 * The "My Leave Balance" panel is a second surface onto the same two rules the
 * leave forms apply: which types an employee is offered at all
 * (`isLeaveTypeOffered`), and how much of each they have left. It listed every
 * active type and measured every one of them against the pooled annual-leave
 * entitlement, so a woman was shown a Paternity Leave row she could never use and
 * a Maternity Leave row reading 0 while the per-child card below it said 40 days.
 *
 * These tests fail if the panel stops filtering by the parental rule, or if it
 * goes back to describing a per-child entitlement with the pooled balance.
 */
vi.mock('../../lib/api', () => ({
    deleteAnnualLeave: vi.fn(),
    getAnnualLeaves: vi.fn(),
    getAppSettings: vi.fn(),
    getChildLeaveEntitlements: vi.fn(),
    getEmployeeProfiles: vi.fn(),
    getLeaveStatusHistories: vi.fn(),
    getLeaveTypes: vi.fn(),
    // Reached only through the leave form this page mounts alongside itself.
    createAnnualLeave: vi.fn(),
    editAnnualLeave: vi.fn(),
    getAdminUsers: vi.fn(),
    uploadLeaveEvidence: vi.fn(),
}))

const api = vi.mocked(await import('../../lib/api'))

const ANNUAL_LEAVE_TYPE = {
    id: 1, name: 'Annual Leave', requiresApproval: true, isActive: true, affectsBalance: true,
    icon: '', colorKey: 'primary', description: '', paid: true, attachmentPolicy: 'None',
    defaultAllowance: 23, allowanceUnit: 'days/year', maxCarryoverDays: 0,
    perChildEntitlement: false, perChildTotalWeeks: 0, perChildWeeksPerYear: 0, childEligibleUntilAge: 0,
    accrualNotes: '', minNoticeDays: 0,
    maxConsecutiveDays: 0, halfDayAllowed: false, availableTo: 'Both',
} as const

const SICK_LEAVE_TYPE = {
    ...ANNUAL_LEAVE_TYPE, id: 2, name: 'Sick Leave', affectsBalance: false, defaultAllowance: 0,
} as const

/** Configured per child: 4 weeks (20 business days) each, 1 week a year, until age 4. */
const MATERNITY_LEAVE_TYPE = {
    ...ANNUAL_LEAVE_TYPE, id: 3, name: 'Maternity Leave', availableTo: 'Female', affectsBalance: false, defaultAllowance: 0,
    perChildEntitlement: true, perChildTotalWeeks: 4, perChildWeeksPerYear: 1, childEligibleUntilAge: 4,
} as const

const PATERNITY_LEAVE_TYPE = {
    ...ANNUAL_LEAVE_TYPE, id: 4, name: 'Paternity Leave', availableTo: 'Male', affectsBalance: false, defaultAllowance: 0,
    perChildEntitlement: true, perChildTotalWeeks: 18, perChildWeeksPerYear: 5, childEligibleUntilAge: 15,
} as const

const LEAVE_TYPES = [ANNUAL_LEAVE_TYPE, SICK_LEAVE_TYPE, MATERNITY_LEAVE_TYPE, PATERNITY_LEAVE_TYPE]

const USER: UserInfo = {
    id: 'emp-1', userName: 'employee@worktrack.com', email: 'employee@worktrack.com',
    displayName: 'Maria Georgiou', imageUrl: '', roles: ['Employee'], departmentId: 2,
    gender: 'Female',
}

const PROFILE: EmployeeProfile = {
    id: 'pr1', userId: USER.id, displayName: USER.displayName, departmentId: 2,
    managerId: null, annualLeaveEntitlement: 23, leaveBalance: 23,
    jobTitle: null, employmentStartDate: null, createdAt: '2026-01-01T00:00:00',
}

/** Two children, both young enough for either type: 20 days each under maternity. */
function summaryFor(leaveType: { id: number; name: string }, daysPerChild: number): ChildLeaveEntitlementSummary {
    const child = (childId: string, name: string, dateOfBirth: string, ageYears: number) => ({
        childId, name, dateOfBirth, ageYears,
        isEligible: true, lastEligibleDate: '2030-01-01',
        totalDays: daysPerChild, totalWeeks: daysPerChild / 5, usedDays: 0, remainingDays: daysPerChild,
        thisYearCapDays: 5, thisYearUsedDays: 0, thisYearRemainingDays: 5,
        leaveYearStart: '2026-01-01T00:00:00', leaveYearEnd: '2026-12-31T00:00:00',
    })
    return {
        leaveTypeId: leaveType.id,
        leaveTypeName: leaveType.name,
        eligibleChildCount: 2,
        totalRemainingDays: daysPerChild * 2,
        thisYearCapDays: 5,
        thisYearRemainingDays: 5,
        children: [
            child('child-1', 'Elena', '2023-04-02', 3),
            child('child-2', 'Andreas', '2026-01-09', 0),
        ],
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    api.getLeaveTypes.mockResolvedValue(LEAVE_TYPES as never)
    api.getEmployeeProfiles.mockResolvedValue([PROFILE])
    api.getAnnualLeaves.mockResolvedValue([])
    api.getLeaveStatusHistories.mockResolvedValue([])
    api.getAppSettings.mockResolvedValue({ leaveYearStartMonth: 1 } as never)
    api.getAdminUsers.mockResolvedValue([] as never)
    api.getChildLeaveEntitlements.mockImplementation(async (_employeeId?: string, leaveTypeId?: number) =>
        leaveTypeId === PATERNITY_LEAVE_TYPE.id
            ? summaryFor(PATERNITY_LEAVE_TYPE, 90)
            : summaryFor(MATERNITY_LEAVE_TYPE, 20))
})

async function renderPage(user: UserInfo = USER) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
        <StoreProvider>
            <QueryClientProvider client={queryClient}>
                <MyLeavePage user={user} />
            </QueryClientProvider>
        </StoreProvider>,
    )
    await screen.findByText('My Leave Balance')
}

/** The balance panel, scoped so the per-child card below it can't answer for it. */
function balancePanel() {
    return screen.getByText('My Leave Balance').parentElement!.parentElement as HTMLElement
}

/** One row of that panel: icon, name + bar, and the figures on the right. */
function balanceRow(name: string) {
    return within(balancePanel()).getByText(name).parentElement!.parentElement as HTMLElement
}

describe('MyLeavePage balance panel', () => {
    it('leaves out a parental type the employee is not offered', async () => {
        await renderPage()

        await waitFor(() => expect(within(balancePanel()).queryByText('Maternity Leave')).not.toBeNull())
        expect(within(balancePanel()).queryByText('Paternity Leave')).toBeNull()
    })

    /* The panel is headed with the year, so a per-child row quotes what this leave
       year allows — the 5-day cap for each of two eligible children — and not the
       20 days a child is entitled to over their whole eligibility. The card below
       is where the lifetime ledger is broken down. */
    it("measures a per-child type against its own ledger's yearly cap, not the pooled balance", async () => {
        await renderPage()

        await waitFor(() => expect(balanceRow('Maternity Leave').textContent).toContain('10/10'))
    })

    it('still measures annual leave against the pooled entitlement', async () => {
        await renderPage()

        expect(balanceRow('Annual Leave').textContent).toContain('23/23')
    })

    it('offers a type with no gender rule to everybody', async () => {
        await renderPage()

        expect(within(balancePanel()).getByText('Sick Leave')).toBeTruthy()
    })

    // The minimum-service half of the same filter, through the shared hook: a type
    // wanting a year of service is not listed for somebody two months in.
    it('withholds a type wanting more service than the employee has', async () => {
        const twoMonthsAgo = new Date()
        twoMonthsAgo.setDate(1)
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)
        const started = `${twoMonthsAgo.getFullYear()}-${`${twoMonthsAgo.getMonth() + 1}`.padStart(2, '0')}-01`

        api.getLeaveTypes.mockResolvedValue([
            ANNUAL_LEAVE_TYPE, { ...SICK_LEAVE_TYPE, minServiceMonths: 12 },
        ] as never)
        await renderPage({ ...USER, employmentStartDate: started })

        expect(within(balancePanel()).queryByText('Sick Leave')).toBeNull()
    })

    it('describes the per-child card with the type the employee is offered', async () => {
        const father: UserInfo = { ...USER, displayName: 'Andreas Georgiou', gender: 'Male' }
        await renderPage(father)

        // Maternity is resolved first by an untyped ledger read, so a page that
        // asks without naming a type labels a father's card "Maternity Leave"
        // and quotes maternity's four weeks against paternity's eighteen.
        const card = await waitFor(() => screen.getByRole('region', { name: 'Paternity Leave entitlement per child' }))
        expect(within(card).getByText('Paternity Leave')).toBeTruthy()
        expect(card.textContent).toContain('180 days remaining in total')
        expect(screen.queryByText('Maternity Leave')).toBeNull()
    })
})

/**
 * The per-child card is the only place the per-child ledger is broken down, and
 * it was the one place on the page showing these figures worse than the screens
 * either side of it: a flat text row per child, "20 of 20 days left · 5 of 5 this
 * year" cramming two different ledgers into one sentence, and a footer reading
 * "child(ren)".
 *
 * What these tests pin is the substance rather than the styling — which figure is
 * quoted from where, and that a date-only value survives a timezone west of UTC.
 */
describe('MyLeavePage per-child card', () => {
    const FATHER: UserInfo = { ...USER, displayName: 'Andreas Georgiou', gender: 'Male' }

    function aChild(overrides: Partial<ChildLeaveEntitlement> = {}): ChildLeaveEntitlement {
        return {
            childId: 'child-1', name: 'Elena', dateOfBirth: '2023-04-02', ageYears: 3,
            isEligible: true, lastEligibleDate: '2038-04-02',
            totalDays: 90, totalWeeks: 18, usedDays: 0, remainingDays: 90,
            thisYearCapDays: 25, thisYearUsedDays: 0, thisYearRemainingDays: 25,
            leaveYearStart: '2026-01-01T00:00:00', leaveYearEnd: '2026-12-31T00:00:00',
            ...overrides,
        }
    }

    /** Serve one ledger for whichever parental type is asked about. */
    function servePaternity(children: ChildLeaveEntitlement[]) {
        const eligible = children.filter((c) => c.isEligible)
        api.getChildLeaveEntitlements.mockResolvedValue({
            leaveTypeId: PATERNITY_LEAVE_TYPE.id,
            leaveTypeName: PATERNITY_LEAVE_TYPE.name,
            eligibleChildCount: eligible.length,
            totalRemainingDays: eligible.reduce((sum, c) => sum + c.remainingDays, 0),
            thisYearCapDays: 25,
            thisYearRemainingDays: 25,
            children,
        })
    }

    /* Named rather than reached through a parent chain: the card is a landmark,
       so the test asks for it the way a screen reader would. */
    function card(typeName = 'Paternity Leave') {
        return screen.getByRole('region', { name: `${typeName} entitlement per child` })
    }

    it("gives each child their own row, with that child's remaining days", async () => {
        servePaternity([aChild({ usedDays: 10, remainingDays: 80, thisYearUsedDays: 5, thisYearRemainingDays: 20 })])
        await renderPage(FATHER)

        await waitFor(() => expect(within(card()).getByText(/Elena/)).toBeTruthy())
        expect(card().textContent).toContain('age 3')
        expect(card().textContent).toContain('80/90')
        expect(card().textContent).toContain('20 of 25 days left this year')
    })

    it('pluralises a single eligible child', async () => {
        servePaternity([aChild()])
        await renderPage(FATHER)

        await waitFor(() => expect(card().textContent).toContain('1 eligible child · 90 days remaining in total'))
        expect(card().textContent).not.toContain('child(ren)')
    })

    it('pluralises several eligible children', async () => {
        servePaternity([aChild(), aChild({ childId: 'child-2', name: 'Petros', ageYears: 0 })])
        await renderPage(FATHER)

        await waitFor(() => expect(card().textContent).toContain('2 eligible children · 180 days remaining in total'))
    })

    it('keeps an aged-out child listed, with what they used while eligible', async () => {
        servePaternity([
            aChild(),
            aChild({
                childId: 'child-2', name: 'Petros', ageYears: 16, isEligible: false,
                usedDays: 4, remainingDays: 0, thisYearRemainingDays: 0,
            }),
        ])
        await renderPage(FATHER)

        await waitFor(() => expect(within(card()).getByText(/Petros/)).toBeTruthy())
        expect(card().textContent).toContain('No longer eligible · 4 days used')
    })

    /* The policy is quoted from the ledger the server computed, never from the
       leave type's own columns: Maternity Leave is seeded with all three of them
       at 0, so reading the type would print "0 weeks per child" on the one type
       that most needs the sentence. */
    it("quotes the entitlement from the ledger, not the type's zeroed columns", async () => {
        api.getLeaveTypes.mockResolvedValue([
            ANNUAL_LEAVE_TYPE,
            { ...MATERNITY_LEAVE_TYPE, perChildTotalWeeks: 0, perChildWeeksPerYear: 0, childEligibleUntilAge: 0 },
        ] as never)
        api.getChildLeaveEntitlements.mockResolvedValue(summaryFor(MATERNITY_LEAVE_TYPE, 20))
        await renderPage()

        await waitFor(() => expect(card('Maternity Leave').textContent).toContain('4 weeks per child'))
        expect(card('Maternity Leave').textContent).not.toContain('0 weeks')
    })

    /* `lastEligibleDate` is a date-only value, which `Date` parses as UTC
       midnight — formatted in local time anywhere west of UTC it renders the day
       before, quietly shortening the child's eligibility by a day. */
    it('renders a last eligible date as stored, west of UTC', async () => {
        const tz = process.env.TZ
        process.env.TZ = 'Pacific/Honolulu'
        try {
            servePaternity([aChild({ lastEligibleDate: '2038-04-02' })])
            await renderPage(FATHER)

            await waitFor(() => expect(card().textContent).toContain('eligible until 02 Apr 2038'))
        } finally {
            process.env.TZ = tz
        }
    })
})

/**
 * The four tiles across the top of the page. Two of them were one figure wearing
 * two labels: "Days remaining" is annual leave, so it must deduct only the type
 * the pooled balance is a budget for, while "Taken in {year} · days · across all
 * types" says what it counts and has to count it. Sharing the first figure made
 * the second under-report every sick day, personal day and day of paternity leave
 * the employee had actually taken.
 */
describe('MyLeavePage year tiles', () => {
    const year = new Date().getFullYear()

    function aLeave(over: Partial<AnnualLeave> & { leaveTypeId: number; totalDays: number }): AnnualLeave {
        return {
            id: `leave-${over.leaveTypeId}-${over.totalDays}`, employeeId: USER.id,
            startDate: `${year}-03-02T00:00:00`, endDate: `${year}-03-04T00:00:00`,
            reason: '', evidenceUrl: null, delegateId: null, delegateName: '',
            status: 'Approved', duration: 'Full', createdAt: `${year}-02-01T00:00:00`, approvedAt: `${year}-02-02T00:00:00`,
            employeeName: USER.displayName, departmentName: 'Delivery', childId: null, childName: '',
            ...over,
        }
    }

    /** A tile, reached by its label — the value and subtitle are its siblings. */
    function tile(label: string) {
        return screen.getByText(label).parentElement as HTMLElement
    }

    beforeEach(() => {
        api.getAnnualLeaves.mockResolvedValue([
            aLeave({ leaveTypeId: ANNUAL_LEAVE_TYPE.id, totalDays: 3 }),
            aLeave({ leaveTypeId: SICK_LEAVE_TYPE.id, totalDays: 2 }),
        ])
    })

    it('deducts only the pooled type from the days remaining', async () => {
        await renderPage()

        await waitFor(() => expect(tile('🌴 Days remaining').textContent).toContain('20'))
        expect(tile('🌴 Days remaining').textContent).toContain('of 23 annual leave')
    })

    it('counts every type towards the days taken, as the tile says it does', async () => {
        await renderPage()

        await waitFor(() => expect(tile(`✓ Taken in ${year}`).textContent).toContain('5'))
    })
})

/**
 * A pending request has to be editable, because of the attachment rule. The
 * server (`AttachmentPolicyRule`) gates *approval* on the document, not filing:
 * call-up papers are dated the day of service, so a Military Leave request goes
 * in first and the document is attached afterwards — from here. The row used to
 * offer only Cancel while pending, so there was nowhere to attach anything.
 */
describe('MyLeavePage pending requests', () => {
    const year = new Date().getFullYear() + 1

    const MILITARY_LEAVE_TYPE = {
        ...ANNUAL_LEAVE_TYPE, id: 5, name: 'Military Leave', affectsBalance: false, attachmentPolicy: 'Required',
    } as const

    function aRequest(over: Partial<AnnualLeave> = {}): AnnualLeave {
        return {
            id: 'L-military', employeeId: USER.id, leaveTypeId: MILITARY_LEAVE_TYPE.id,
            startDate: `${year}-03-02T00:00:00`, endDate: `${year}-03-04T00:00:00`,
            reason: 'Reservist call-up', evidenceUrl: null, delegateId: null, delegateName: '',
            status: 'Pending', duration: 'Full', totalDays: 3,
            createdAt: `${year - 1}-02-01T00:00:00`, approvedAt: null,
            employeeName: USER.displayName, departmentName: 'Delivery', childId: null, childName: '',
            ...over,
        }
    }

    beforeEach(() => {
        api.getLeaveTypes.mockResolvedValue([...LEAVE_TYPES, MILITARY_LEAVE_TYPE] as never)
    })

    it('offers Edit on a pending request and opens it in the edit dialog', async () => {
        api.getAnnualLeaves.mockResolvedValue([aRequest()])
        await renderPage()

        fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))

        expect(await screen.findByText('Edit Leave Request')).toBeInTheDocument()
    })

    it('says on the row that a required document is still to come', async () => {
        api.getAnnualLeaves.mockResolvedValue([aRequest()])
        await renderPage()

        expect(await screen.findByText(/Document needed before approval/)).toBeInTheDocument()
    })

    it('drops the reminder once the document is attached', async () => {
        api.getAnnualLeaves.mockResolvedValue([aRequest({ evidenceUrl: '/api/files/8f2c1b6e-0000-4000-8000-000000000001' })])
        await renderPage()

        await screen.findByRole('button', { name: 'Edit' })
        expect(screen.queryByText(/Document needed/)).not.toBeInTheDocument()
    })

    it('offers no Edit on a request that has been decided', async () => {
        api.getAnnualLeaves.mockResolvedValue([aRequest({ status: 'Approved', approvedAt: `${year - 1}-02-02T00:00:00` })])
        await renderPage()

        await screen.findByRole('button', { name: 'View details' })
        expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    })
})
