import type { LeaveType } from './types'

/**
 * What a leave type asks of the employee by way of a supporting document.
 *
 * This mirrors `Application/AnnualLeaves/Commands/AttachmentPolicyRule.cs`, which
 * is what actually refuses a request; this decides what the form says and whether
 * submit is offered at all. Keep the two in step — a disagreement shows up as a
 * button that only fails when pressed, the same trap `parental-leave.ts` guards
 * against for the parental types.
 *
 * It replaces a guess. The apply page used to decide all of this from the type's
 * *name* — `name.includes('sick')` earned the amber "(recommended for sick leave)"
 * label, anything else read "(optional)" — so an admin who set *Attachment
 * required* on Personal Days changed nothing the employee could see, and the
 * request submitted happily with no document. The admin's setting decides now.
 */
export type AttachmentRequirement =
    /** Nothing is asked, and nothing is offered — see `isAttachmentOffered`. */
    | 'none'
    /** `Optional`: encouraged, rendered in amber. Never blocks. */
    | 'encouraged'
    /** `Required`: submit stays disabled until a document is staged. */
    | 'required'

export function attachmentRequirement(type: Pick<LeaveType, 'attachmentPolicy'> | undefined): AttachmentRequirement {
    switch (type?.attachmentPolicy) {
        case 'Required':
            return 'required'
        case 'Optional':
            return 'encouraged'
        default:
            // Covers 'None' and the not-yet-chosen type alike: on a fresh form no
            // type is selected, and that must not read as a requirement or submit
            // would never enable.
            return 'none'
    }
}

/**
 * Whether the request is short a document its type insists on — the one condition
 * that disables submit. `hasFile` covers both a freshly staged file and evidence a
 * request already carries.
 */
export function isAttachmentMissing(
    type: Pick<LeaveType, 'attachmentPolicy'> | undefined,
    hasFile: boolean,
): boolean {
    return attachmentRequirement(type) === 'required' && !hasFile
}

/**
 * Whether the upload is shown at all. `None` means *no attachment needed*, so the
 * whole section goes — an upload offered under a type the admin set to None is a
 * step that asks for something nobody wants.
 *
 * `hasExistingEvidence` is the one exception, and it is about history rather than
 * policy: a request filed before the policy moved to None still carries a
 * document, and the edit form is the only place to open it. A freshly staged file
 * is *not* that — a form that hides the section must drop the file with it, or it
 * uploads on submit with nothing on screen to say so.
 */
export function isAttachmentOffered(
    type: Pick<LeaveType, 'attachmentPolicy'> | undefined,
    hasExistingEvidence: boolean,
): boolean {
    return attachmentRequirement(type) !== 'none' || hasExistingEvidence
}
