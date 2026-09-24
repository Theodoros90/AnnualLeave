import { describe, expect, it } from 'vitest'
import { attachmentRequirement, isAttachmentBlockingSubmit, isAttachmentMissing, isAttachmentOffered, isAwaitingDocument } from './attachment-policy'
import type { LeaveType } from './types'

/**
 * The client half of the attachment rule. The server
 * (`Application/AnnualLeaves/Commands/AttachmentPolicyRule.cs`) is what enforces
 * it; this decides what the employee is told and whether submit is offered at all.
 *
 * The behaviour these pin, in one line: the admin's setting decides, not the leave
 * type's name. The apply page used to read "(recommended for sick leave)" off
 * `name.includes('sick')`, so a type set to Required still read "(optional)".
 */

function leaveType(overrides: Partial<LeaveType> = {}): LeaveType {
    return {
        id: 1,
        name: 'Personal Days',
        requiresManagerApproval: true,
        isActive: true,
        affectsBalance: false,
        icon: '',
        colorKey: 'personal',
        description: '',
        paid: true,
        attachmentPolicy: 'None',
        defaultAllowance: 3,
        allowanceUnit: 'days/year',
        maxCarryoverDays: 0,
        perChildEntitlement: false,
        perChildTotalWeeks: 0,
        perChildWeeksPerYear: 0,
        childEligibleUntilAge: 0,
        accrualNotes: '',
        minNoticeDays: 1,
        maxConsecutiveDays: 3,
        halfDayAllowed: false,
        availableTo: 'Both',
        ...overrides,
    }
}

describe('attachmentRequirement', () => {
    it('reads the requirement off the policy, not the type name', () => {
        expect(attachmentRequirement(leaveType({ attachmentPolicy: 'Required' }))).toBe('required')
        expect(attachmentRequirement(leaveType({ attachmentPolicy: 'Optional' }))).toBe('encouraged')
        expect(attachmentRequirement(leaveType({ attachmentPolicy: 'None' }))).toBe('none')
    })

    it('asks nothing of a type that is not yet selected', () => {
        expect(attachmentRequirement(undefined)).toBe('none')
    })

    /**
     * The name-sniffing this replaces: a type called "Sick Leave" got the amber
     * treatment whatever the admin had configured.
     */
    it('does not treat a sick-sounding name as a policy', () => {
        expect(attachmentRequirement(leaveType({ name: 'Sick Leave', attachmentPolicy: 'None' }))).toBe('none')
    })
})

describe('isAttachmentMissing', () => {
    it('is true only for a required policy with no file staged', () => {
        expect(isAttachmentMissing(leaveType({ attachmentPolicy: 'Required' }), false)).toBe(true)
        expect(isAttachmentMissing(leaveType({ attachmentPolicy: 'Required' }), true)).toBe(false)
    })

    it('never blocks an encouraged or unneeded attachment', () => {
        expect(isAttachmentMissing(leaveType({ attachmentPolicy: 'Optional' }), false)).toBe(false)
        expect(isAttachmentMissing(leaveType({ attachmentPolicy: 'None' }), false)).toBe(false)
    })

    /**
     * Submit is disabled on a dozen other grounds before a type is chosen; this
     * must not be one of them, or the button never enables on a fresh form.
     */
    it('does not block before a type is chosen', () => {
        expect(isAttachmentMissing(undefined, false)).toBe(false)
    })
})

describe('isAttachmentOffered', () => {
    it('offers the upload for a type that asks for a document either way', () => {
        expect(isAttachmentOffered(leaveType({ attachmentPolicy: 'Required' }), false)).toBe(true)
        expect(isAttachmentOffered(leaveType({ attachmentPolicy: 'Optional' }), false)).toBe(true)
    })

    it('offers nothing under a None policy', () => {
        expect(isAttachmentOffered(leaveType({ attachmentPolicy: 'None' }), false)).toBe(false)
    })

    /**
     * A fresh form has no type selected, which reads as 'none' — so the section
     * is absent until the employee picks a type that asks for a document.
     */
    it('offers nothing before a type is chosen', () => {
        expect(isAttachmentOffered(undefined, false)).toBe(false)
    })

    /**
     * A request filed before the policy was moved to None still carries its
     * document. Hiding the section would hide that from the one screen that can
     * open it, so evidence already on the request keeps the section visible.
     */
    it('keeps the section for evidence the request already carries', () => {
        expect(isAttachmentOffered(leaveType({ attachmentPolicy: 'None' }), true)).toBe(true)
    })
})

/**
 * The server gates *approval*, not filing (see AttachmentPolicyRule.cs): a
 * document dated the day of service — call-up papers — cannot be attached to a
 * request that had to go in beforehand. So a missing document only disables
 * submit where submitting would approve, which is a type that auto-approves, or
 * an edit of a request that is already approved.
 */
describe('isAttachmentBlockingSubmit', () => {
    it('lets a required document wait when the request will sit pending', () => {
        expect(isAttachmentBlockingSubmit(leaveType({ attachmentPolicy: 'Required' }), false, false)).toBe(false)
    })

    it('blocks when submitting would approve the request', () => {
        expect(isAttachmentBlockingSubmit(leaveType({ attachmentPolicy: 'Required' }), false, true)).toBe(true)
    })

    it('never blocks once a file is staged, or for a policy that does not require one', () => {
        expect(isAttachmentBlockingSubmit(leaveType({ attachmentPolicy: 'Required' }), true, true)).toBe(false)
        expect(isAttachmentBlockingSubmit(leaveType({ attachmentPolicy: 'Optional' }), false, true)).toBe(false)
        expect(isAttachmentBlockingSubmit(leaveType({ attachmentPolicy: 'None' }), false, true)).toBe(false)
        expect(isAttachmentBlockingSubmit(undefined, false, true)).toBe(false)
    })
})

/**
 * What a manager's Approve button and an employee's pending row both read: is
 * this request short a document its type insists on? Reads the stored
 * `evidenceUrl`, trimming it the way the server does.
 */
describe('isAwaitingDocument', () => {
    it('is true for a required policy with no evidence stored', () => {
        expect(isAwaitingDocument(leaveType({ attachmentPolicy: 'Required' }), null)).toBe(true)
        expect(isAwaitingDocument(leaveType({ attachmentPolicy: 'Required' }), '')).toBe(true)
        expect(isAwaitingDocument(leaveType({ attachmentPolicy: 'Required' }), '   ')).toBe(true)
    })

    it('is false once evidence is stored', () => {
        expect(isAwaitingDocument(leaveType({ attachmentPolicy: 'Required' }), '/api/files/abc')).toBe(false)
    })

    it('is false for a policy that does not require one, or an unknown type', () => {
        expect(isAwaitingDocument(leaveType({ attachmentPolicy: 'Optional' }), null)).toBe(false)
        expect(isAwaitingDocument(leaveType({ attachmentPolicy: 'None' }), null)).toBe(false)
        expect(isAwaitingDocument(undefined, null)).toBe(false)
    })
})
