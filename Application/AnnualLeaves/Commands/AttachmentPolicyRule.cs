using Domain;

namespace Application.AnnualLeaves.Commands;

/// <summary>
/// Whether a leave request satisfies its type's <see cref="AttachmentPolicy"/>.
/// Returns the refusal message, or <c>null</c> when the request may go ahead — the
/// same shape as <see cref="ParentalLeaveEligibility"/>, which runs beside it.
///
/// The policy was display-only until this rule: the admin dialog saved it and the
/// leave type's card rendered it, while the apply page guessed at the same thing
/// from the type's <em>name</em> (anything containing "sick"). So a type set to
/// <see cref="AttachmentPolicy.Required"/> still read "(optional)" to the employee
/// and submitted happily without a document. This is what makes the setting mean
/// something; <c>client/src/lib/attachment-policy.ts</c> mirrors it so the form
/// never offers a submit the API is certain to refuse.
///
/// Synchronous, unlike the eligibility and per-child checks beside it: both call
/// sites have already loaded the <see cref="LeaveType"/>, and the answer needs
/// nothing else from the database.
///
/// Only <see cref="AttachmentPolicy.Required"/> refuses anything.
/// <see cref="AttachmentPolicy.Optional"/> is encouragement the client renders in
/// amber and <see cref="AttachmentPolicy.None"/> is silence — if either could
/// refuse, an admin nudging a type towards documentation would lock employees out
/// of it instead.
/// </summary>
public static class AttachmentPolicyRule
{
    public static string? Check(LeaveType leaveType, string? evidenceUrl)
    {
        if (leaveType.AttachmentPolicy != AttachmentPolicy.Required)
            return null;

        // EvidenceUrl is a free-text column, so a blank string would otherwise
        // satisfy the requirement while pointing at nothing.
        if (!string.IsNullOrWhiteSpace(evidenceUrl))
            return null;

        return $"{leaveType.Name} requires a supporting document. Attach one and submit again.";
    }
}
