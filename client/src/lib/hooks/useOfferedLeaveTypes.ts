import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { getChildLeaveEntitlements } from '../api'
import { isLeaveTypeOffered, isParentalLeaveType } from '../parental-leave'
import type { ChildLeaveEntitlementSummary, Gender, LeaveType } from '../types'

/** A per-child ledger and the leave type it belongs to, ready to render. */
export interface PerChildLedger {
    type: LeaveType
    ledger: ChildLeaveEntitlementSummary
}

export interface OfferedLeaveTypes {
    /** Every enabled type, unfiltered — for resolving a type by id. */
    activeLeaveTypes: LeaveType[]
    /** The enabled types this employee may actually request. */
    offeredLeaveTypes: LeaveType[]
    /** Per-child ledgers by leave type id; the value is undefined until the query settles. */
    ledgerByTypeId: Map<number, ChildLeaveEntitlementSummary | undefined>
    /** The offered per-child types that have children on file to describe. */
    perChildLedgers: PerChildLedger[]
}

/**
 * Which leave types to show an employee, and the per-child ledger behind the two
 * that have one.
 *
 * Both halves are needed together, which is why they are one hook: the ledger
 * decides whether a parental type is offered at all (the employee must have a
 * child young enough), and it is also the only entitlement a per-child type has
 * to report — there is no pooled balance behind it.
 *
 * One query per parental type, because the two do not share a ledger: each
 * configures its own weeks and its own cut-off age. Asking without naming a type
 * gets whichever the server resolves first (Maternity, seeded first), which is how
 * a father's dashboard came to quote maternity's policy. A parental type carrying
 * no per-child entitlement of its own asks without a type id, matching the
 * fallback `ParentalLeaveEligibility` makes on the server — otherwise the client
 * would hide a type the API would accept.
 *
 * The keys match `ApplyLeavePage`'s and `ChildLeavePicker`'s so those requests are
 * shared rather than repeated, and are still prefix-matched by `ChildrenSection`'s
 * `['childLeaveEntitlements']` invalidation.
 *
 * While a ledger is in flight `eligibleChildCount` reads 0 and the parental type
 * stays hidden: appearing a moment late beats a card that vanishes a moment later.
 */
export function useOfferedLeaveTypes(
    leaveTypes: LeaveType[],
    gender: Gender | null | undefined,
    employmentStartDate?: string | null,
): OfferedLeaveTypes {
    const activeLeaveTypes = useMemo(() => leaveTypes.filter((lt) => lt.isActive), [leaveTypes])

    const parentalLeaveTypes = useMemo(
        () => activeLeaveTypes.filter((lt) => isParentalLeaveType(lt.name)),
        [activeLeaveTypes],
    )

    const entitlementQueries = useQueries({
        queries: parentalLeaveTypes.map((lt) => {
            const ledgerTypeId = lt.perChildEntitlement ? lt.id : undefined
            return {
                queryKey: ['childLeaveEntitlements', 'me', ledgerTypeId ?? null],
                queryFn: () => getChildLeaveEntitlements(undefined, ledgerTypeId),
            }
        }),
    })

    /* One string rather than one dependency per query: the number of parental types
       is not fixed, and a dependency array that changes length between renders is
       not something React supports — it warns, and compares whatever is left by
       position. `dataUpdatedAt` moves whenever a ledger's data does, so a join of
       them says "something arrived" without the array ever changing size. */
    const ledgerRevisions = entitlementQueries.map((query) => query.dataUpdatedAt).join(',')

    const ledgerByTypeId = useMemo(
        () => new Map(parentalLeaveTypes.map((lt, index) => [lt.id, entitlementQueries[index]?.data])),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- useQueries returns a new array each render; ledgerRevisions is what moves when its data does
        [parentalLeaveTypes, ledgerRevisions],
    )

    const offeredLeaveTypes = useMemo(
        () => activeLeaveTypes.filter((lt) => isLeaveTypeOffered(
            lt,
            gender,
            (ledgerByTypeId.get(lt.id)?.eligibleChildCount ?? 0) > 0,
            employmentStartDate,
        )),
        [activeLeaveTypes, gender, ledgerByTypeId, employmentStartDate],
    )

    const perChildLedgers = useMemo(
        () => offeredLeaveTypes
            .filter((lt) => lt.perChildEntitlement)
            .map((lt) => ({ type: lt, ledger: ledgerByTypeId.get(lt.id) }))
            .filter((entry): entry is PerChildLedger =>
                entry.ledger?.leaveTypeId != null && entry.ledger.children.length > 0),
        [offeredLeaveTypes, ledgerByTypeId],
    )

    return { activeLeaveTypes, offeredLeaveTypes, ledgerByTypeId, perChildLedgers }
}
