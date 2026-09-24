import { describe, expect, it } from 'vitest'
import {
    approvalRule, approveButtonLabel, approveOutcome, autoApproves, canApproveInDialog, canDecide, canRejectInDialog,
    isOpenStatus, statusChipLabel,
} from './approval-stage'

/**
 * Mirror of `Application/AnnualLeaves/Commands/ApprovalStageRule.cs`. The server
 * decides the stage; this decides which buttons a page offers, so it must never
 * offer one the server refuses — and may under-offer when the type is not loaded.
 */
const MANAGER = { isHrAdministrator: false }
const HR = { isHrAdministrator: true }
const both = { requiresManagerApproval: true, requiresHrApproval: true }
const managerOnly = { requiresManagerApproval: true, requiresHrApproval: false }
const hrOnly = { requiresManagerApproval: false, requiresHrApproval: true }
const neither = { requiresManagerApproval: false, requiresHrApproval: false }

describe('isOpenStatus', () => {
    it('is Pending or AwaitingHrApproval', () => {
        expect(isOpenStatus('Pending')).toBe(true)
        expect(isOpenStatus('AwaitingHrApproval')).toBe(true)
        expect(isOpenStatus('Approved')).toBe(false)
        expect(isOpenStatus('Rejected')).toBe(false)
        expect(isOpenStatus('Cancelled')).toBe(false)
    })
})

describe('canDecide', () => {
    it('lets either role decide a Pending request', () => {
        expect(canDecide({ status: 'Pending' }, MANAGER)).toBe(true)
        expect(canDecide({ status: 'Pending' }, HR)).toBe(true)
    })
    it('lets only HR decide a request that is with HR', () => {
        expect(canDecide({ status: 'AwaitingHrApproval' }, MANAGER)).toBe(false)
        expect(canDecide({ status: 'AwaitingHrApproval' }, HR)).toBe(true)
    })
    it('offers nothing on a decided request', () => {
        expect(canDecide({ status: 'Approved' }, HR)).toBe(false)
        expect(canDecide({ status: 'Rejected' }, HR)).toBe(false)
    })
})

describe('approveOutcome', () => {
    it("sends a manager's approve to HR when the type asks for HR", () => {
        expect(approveOutcome({ status: 'Pending' }, both, MANAGER)).toBe('awaiting-hr')
    })
    it('finishes for HR from either open state', () => {
        expect(approveOutcome({ status: 'Pending' }, both, HR)).toBe('approved')
        expect(approveOutcome({ status: 'AwaitingHrApproval' }, both, HR)).toBe('approved')
    })
    it('finishes for a manager on a manager-only type, or when the type is not loaded', () => {
        expect(approveOutcome({ status: 'Pending' }, managerOnly, MANAGER)).toBe('approved')
        expect(approveOutcome({ status: 'Pending' }, undefined, MANAGER)).toBe('approved')
    })
    it('sends a reopened Rejected request to HR the same way a Pending one would', () => {
        expect(approveOutcome({ status: 'Rejected' }, both, MANAGER)).toBe('awaiting-hr')
        expect(approveOutcome({ status: 'Rejected' }, both, HR)).toBe('approved')
    })
    it('labels the button accordingly', () => {
        expect(approveButtonLabel('awaiting-hr')).toBe('Approve & send to HR')
        expect(approveButtonLabel('approved')).toBe('Approve')
    })
})

describe('canApproveInDialog', () => {
    it('offers Approve on a rejected request being reopened, either role', () => {
        expect(canApproveInDialog({ status: 'Rejected' }, MANAGER)).toBe(true)
        expect(canApproveInDialog({ status: 'Rejected' }, HR)).toBe(true)
    })
    it('offers Approve on a Pending request, either role', () => {
        expect(canApproveInDialog({ status: 'Pending' }, MANAGER)).toBe(true)
        expect(canApproveInDialog({ status: 'Pending' }, HR)).toBe(true)
    })
    it('offers Approve on a request with HR only to HR', () => {
        expect(canApproveInDialog({ status: 'AwaitingHrApproval' }, MANAGER)).toBe(false)
        expect(canApproveInDialog({ status: 'AwaitingHrApproval' }, HR)).toBe(true)
    })
    it('offers no Approve on an already-approved or cancelled request', () => {
        expect(canApproveInDialog({ status: 'Approved' }, HR)).toBe(false)
        expect(canApproveInDialog({ status: 'Cancelled' }, HR)).toBe(false)
    })
})

describe('canRejectInDialog', () => {
    it('offers Reject on an approval being taken back, either role', () => {
        expect(canRejectInDialog({ status: 'Approved' }, MANAGER)).toBe(true)
        expect(canRejectInDialog({ status: 'Approved' }, HR)).toBe(true)
    })
    it('offers Reject on a Pending request, either role', () => {
        expect(canRejectInDialog({ status: 'Pending' }, MANAGER)).toBe(true)
        expect(canRejectInDialog({ status: 'Pending' }, HR)).toBe(true)
    })
    it('offers Reject on a request with HR only to HR', () => {
        expect(canRejectInDialog({ status: 'AwaitingHrApproval' }, MANAGER)).toBe(false)
        expect(canRejectInDialog({ status: 'AwaitingHrApproval' }, HR)).toBe(true)
    })
    it('offers no Reject on an already-rejected or cancelled request', () => {
        expect(canRejectInDialog({ status: 'Rejected' }, HR)).toBe(false)
        expect(canRejectInDialog({ status: 'Cancelled' }, HR)).toBe(false)
    })
})

describe('the type-level readings', () => {
    it('autoApproves only when both switches are off', () => {
        expect(autoApproves(neither)).toBe(true)
        expect(autoApproves(managerOnly)).toBe(false)
        expect(autoApproves(hrOnly)).toBe(false)
        expect(autoApproves(undefined)).toBe(false)
    })
    it('names the rule for the card', () => {
        expect(approvalRule(neither)).toBe('auto')
        expect(approvalRule(managerOnly)).toBe('manager')
        expect(approvalRule(hrOnly)).toBe('hr')
        expect(approvalRule(both)).toBe('manager-then-hr')
    })
    it('reads a missing HR flag (an older API) as off', () => {
        expect(approvalRule({ requiresManagerApproval: true })).toBe('manager')
    })
})

describe('statusChipLabel', () => {
    it('spells the HR stage out', () => {
        expect(statusChipLabel('AwaitingHrApproval')).toBe('Awaiting HR approval')
        expect(statusChipLabel('Pending')).toBe('Pending')
    })
})
