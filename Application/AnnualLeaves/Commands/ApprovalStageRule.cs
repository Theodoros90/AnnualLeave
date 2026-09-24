using Domain;

namespace Application.AnnualLeaves.Commands;

/// <summary>
/// Turns a leave type's two approval switches into the status a request is filed
/// in and the status an "Approve" lands it in. The client always asks for
/// <see cref="AnnualLeaveStatus.Approved"/>; this decides whether that means the
/// HR stage or the end. <c>client/src/lib/approval-stage.ts</c> mirrors it so no
/// page offers a button the API is certain to refuse — keep the two in step, the
/// way <see cref="AttachmentPolicyRule"/> and <c>attachment-policy.ts</c> are.
///
/// <para>
/// Manager first, then HR. An HR Administrator stands in for the manager inside
/// their assigned departments, so their Approve from Pending finishes the request
/// in one step even when the type requires HR: they are the HR sign-off. A Manager
/// cannot decide a request that is with HR — approve, reject or cancel — because
/// they already had their say at stage one.
/// </para>
///
/// A <c>null</c> leave type (a row whose type has since been deleted) is treated as
/// manager-only, which is the one-switch rule it was filed under.
/// </summary>
public static class ApprovalStageRule
{
    public const string AwaitingHrMessage =
        "This request is awaiting HR approval; only an HR Administrator can decide it.";

    public const string StageIsDerivedMessage =
        "A request cannot be put into 'Awaiting HR approval' directly. Approve it and the stage is decided for you.";

    /// <summary>The status a fresh request is filed in.</summary>
    public static AnnualLeaveStatus InitialStatus(LeaveType leaveType) =>
        (leaveType.RequiresManagerApproval, leaveType.RequiresHrApproval) switch
        {
            (false, false) => AnnualLeaveStatus.Approved,
            (false, true) => AnnualLeaveStatus.AwaitingHrApproval,
            _ => AnnualLeaveStatus.Pending,
        };

    /// <summary>Still waiting on somebody's decision.</summary>
    public static bool IsOpen(AnnualLeaveStatus status) =>
        status is AnnualLeaveStatus.Pending or AnnualLeaveStatus.AwaitingHrApproval;

    /// <summary>The status to store, or why the request cannot be changed by this caller.</summary>
    public readonly record struct Outcome(AnnualLeaveStatus? Status, string? Error);

    public static Outcome Resolve(
        LeaveType? leaveType,
        AnnualLeaveStatus current,
        AnnualLeaveStatus requested,
        bool isHrAdministrator)
    {
        if (requested == AnnualLeaveStatus.AwaitingHrApproval)
            return new Outcome(null, StageIsDerivedMessage);

        if (current == AnnualLeaveStatus.AwaitingHrApproval && !isHrAdministrator)
            return new Outcome(null, AwaitingHrMessage);

        if (requested != AnnualLeaveStatus.Approved)
            return new Outcome(requested, null);

        var needsHr = leaveType?.RequiresHrApproval == true;
        if (needsHr && !isHrAdministrator)
            return new Outcome(AnnualLeaveStatus.AwaitingHrApproval, null);

        return new Outcome(AnnualLeaveStatus.Approved, null);
    }
}
