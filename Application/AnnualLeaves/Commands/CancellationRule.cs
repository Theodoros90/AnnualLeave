using Domain;

namespace Application.AnnualLeaves.Commands;

/// <summary>
/// An approved leave can be cancelled only while it has not started: its start
/// date is today or later, on the UTC date the leave dates themselves are stored
/// on. Once it is under way or over, the days were taken — cancelling would hand
/// them back to a balance for an absence that happened. The rule applies to
/// whoever is cancelling; it is about the leave, not about who is clicking.
///
/// It only measures <see cref="AnnualLeaveStatus.Approved"/> →
/// <see cref="AnnualLeaveStatus.Cancelled"/>. Taking an approval back with a
/// rejection, or cancelling a request never approved, has no start to protect.
/// Called from <c>UpdateLeaveStatus</c> and the status path of
/// <c>EditAnnualLeave</c>, after <see cref="ApprovalStageRule"/> has said who may
/// act at all. <c>canCancelApproved</c> in <c>client/src/lib/approval-stage.ts</c>
/// mirrors it so the Cancel button is only offered while it would be accepted —
/// keep the two in step, the way <see cref="AttachmentPolicyRule"/> and
/// <c>attachment-policy.ts</c> are.
/// </summary>
public static class CancellationRule
{
    public const string AlreadyStartedMessage =
        "This leave has already started and can no longer be cancelled.";

    /// <summary>Why the transition is refused, or <c>null</c> when it is not.</summary>
    public static string? Check(AnnualLeaveStatus current, AnnualLeaveStatus requested, DateTime startDate, DateTime nowUtc)
    {
        if (current != AnnualLeaveStatus.Approved || requested != AnnualLeaveStatus.Cancelled)
            return null;

        return startDate.Date < nowUtc.Date ? AlreadyStartedMessage : null;
    }
}
