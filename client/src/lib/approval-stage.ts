import type { AnnualLeave, AnnualLeaveStatus, LeaveType } from './types'

/**
 * Which approval stage a request is in and who may move it, mirroring
 * `Application/AnnualLeaves/Commands/ApprovalStageRule.cs`. The server decides the
 * stage an Approve lands in — every page sends `'Approved'` — and this only decides
 * which buttons to offer, so a page never shows one the API is certain to refuse.
 * Keep the two in step, the same way `attachment-policy.ts` is kept in step with
 * `AttachmentPolicyRule`. A mirror may under-refuse (a type not yet loaded reads
 * as manager-only); it must never over-refuse.
 *
 * Manager first, then HR. An HR Administrator stands in for the manager, so their
 * Approve from Pending finishes a request even when the type asks for HR. A
 * Manager cannot decide a request that is with HR at all.
 */
export type ApprovalFlags = Pick<LeaveType, 'requiresManagerApproval'> & Partial<Pick<LeaveType, 'requiresHrApproval'>>

export interface ApprovalViewer {
    isHrAdministrator: boolean
}

export type ApproveOutcome = 'approved' | 'awaiting-hr'

export type ApprovalRule = 'auto' | 'manager' | 'hr' | 'manager-then-hr'

/** Still waiting on somebody's decision. */
export function isOpenStatus(status: AnnualLeaveStatus): boolean {
    return status === 'Pending' || status === 'AwaitingHrApproval'
}

/** Whether this viewer may approve or reject the request at its current stage. */
export function canDecide(leave: Pick<AnnualLeave, 'status'>, viewer: ApprovalViewer): boolean {
    if (leave.status === 'Pending') return true
    if (leave.status === 'AwaitingHrApproval') return viewer.isHrAdministrator
    return false
}

/**
 * Where this viewer's Approve lands the request. Any status but `AwaitingHrApproval`
 * itself can be the start of this — Pending ordinarily, but also a Rejected or
 * Cancelled row being reopened from the view dialog — matching the server's
 * `ApprovalStageRule.Resolve`, which applies the same HR check regardless of which
 * status the request is coming from.
 */
export function approveOutcome(
    leave: Pick<AnnualLeave, 'status'>,
    type: ApprovalFlags | undefined,
    viewer: ApprovalViewer,
): ApproveOutcome {
    if (leave.status !== 'AwaitingHrApproval' && !!type?.requiresHrApproval && !viewer.isHrAdministrator) return 'awaiting-hr'
    return 'approved'
}

export function approveButtonLabel(outcome: ApproveOutcome): string {
    return outcome === 'awaiting-hr' ? 'Approve & send to HR' : 'Approve'
}

/** The view dialog's Approve: an open row this viewer may decide, or a rejected one being reopened — never a row already approved or cancelled. */
export function canApproveInDialog(leave: Pick<AnnualLeave, 'status'>, viewer: ApprovalViewer): boolean {
    if (leave.status === 'Rejected') return true
    return canDecide(leave, viewer)
}

/** The view dialog's Reject: an open row this viewer may decide, or an approval being taken back — never a row already rejected or cancelled. */
export function canRejectInDialog(leave: Pick<AnnualLeave, 'status'>, viewer: ApprovalViewer): boolean {
    if (leave.status === 'Approved') return true
    return canDecide(leave, viewer)
}

/** Filing is approval: neither switch is on. Undefined (type not loaded) reads as not. */
export function autoApproves(type: ApprovalFlags | undefined): boolean {
    return !!type && !type.requiresManagerApproval && !type.requiresHrApproval
}

/** The one-line reading of the two switches, for the leave type's card. */
export function approvalRule(type: ApprovalFlags): ApprovalRule {
    const manager = type.requiresManagerApproval
    const hr = !!type.requiresHrApproval
    if (manager && hr) return 'manager-then-hr'
    if (hr) return 'hr'
    if (manager) return 'manager'
    return 'auto'
}

export function statusChipLabel(status: string): string {
    return status === 'AwaitingHrApproval' ? 'Awaiting HR approval' : status
}

/** How a status reads in a sentence ("Leave approved", "Leave awaiting HR approval"). Falls back to the lower-cased enum name for the four original statuses, as the notification text always did. */
export function statusPhrase(status: string): string {
    return status === 'AwaitingHrApproval' ? 'awaiting HR approval' : status.toLowerCase()
}
