using Application.AnnualLeaves.Commands;
using Domain;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// The one place the two approval switches are turned into a status. Every path
/// that files or decides a leave calls this, so the tables here are the
/// behaviour; the handler tests only check the plumbing around them.
/// </summary>
public class ApprovalStageRuleTests
{
    private static LeaveType Type(bool manager, bool hr) =>
        new() { Id = 1, Name = "T", RequiresManagerApproval = manager, RequiresHrApproval = hr };

    [Theory]
    [InlineData(false, false, AnnualLeaveStatus.Approved)]
    [InlineData(true, false, AnnualLeaveStatus.Pending)]
    [InlineData(false, true, AnnualLeaveStatus.AwaitingHrApproval)]
    [InlineData(true, true, AnnualLeaveStatus.Pending)]
    public void A_request_is_filed_in_the_stage_the_flags_say(bool manager, bool hr, AnnualLeaveStatus expected) =>
        Assert.Equal(expected, ApprovalStageRule.InitialStatus(Type(manager, hr)));

    [Fact]
    public void Pending_and_awaiting_hr_are_the_open_states()
    {
        Assert.True(ApprovalStageRule.IsOpen(AnnualLeaveStatus.Pending));
        Assert.True(ApprovalStageRule.IsOpen(AnnualLeaveStatus.AwaitingHrApproval));
        Assert.False(ApprovalStageRule.IsOpen(AnnualLeaveStatus.Approved));
        Assert.False(ApprovalStageRule.IsOpen(AnnualLeaveStatus.Rejected));
        Assert.False(ApprovalStageRule.IsOpen(AnnualLeaveStatus.Cancelled));
    }

    [Theory]
    // From Pending on a manager-only type: either role approves outright.
    [InlineData(false, AnnualLeaveStatus.Pending, false, AnnualLeaveStatus.Approved)]
    [InlineData(false, AnnualLeaveStatus.Pending, true, AnnualLeaveStatus.Approved)]
    // From Pending on a type needing HR: a manager advances it, HR finishes it.
    [InlineData(true, AnnualLeaveStatus.Pending, false, AnnualLeaveStatus.AwaitingHrApproval)]
    [InlineData(true, AnnualLeaveStatus.Pending, true, AnnualLeaveStatus.Approved)]
    // From the HR stage, HR finishes it.
    [InlineData(true, AnnualLeaveStatus.AwaitingHrApproval, true, AnnualLeaveStatus.Approved)]
    // Reopening a rejected request from the edit dialog follows the Pending row.
    [InlineData(true, AnnualLeaveStatus.Rejected, true, AnnualLeaveStatus.Approved)]
    [InlineData(true, AnnualLeaveStatus.Rejected, false, AnnualLeaveStatus.AwaitingHrApproval)]
    public void Approve_lands_where_the_stage_table_says(bool needsHr, AnnualLeaveStatus current, bool isHr, AnnualLeaveStatus expected)
    {
        var outcome = ApprovalStageRule.Resolve(Type(true, needsHr), current, AnnualLeaveStatus.Approved, isHr);

        Assert.Null(outcome.Error);
        Assert.Equal(expected, outcome.Status);
    }

    [Theory]
    [InlineData(AnnualLeaveStatus.Approved)]
    [InlineData(AnnualLeaveStatus.Rejected)]
    [InlineData(AnnualLeaveStatus.Cancelled)]
    public void A_manager_cannot_decide_a_request_that_is_with_hr(AnnualLeaveStatus requested)
    {
        var outcome = ApprovalStageRule.Resolve(Type(true, true), AnnualLeaveStatus.AwaitingHrApproval, requested, isHrAdministrator: false);

        Assert.Null(outcome.Status);
        Assert.Equal(ApprovalStageRule.AwaitingHrMessage, outcome.Error);
    }

    [Fact]
    public void Hr_may_reject_a_request_that_is_with_them()
    {
        var outcome = ApprovalStageRule.Resolve(Type(true, true), AnnualLeaveStatus.AwaitingHrApproval, AnnualLeaveStatus.Rejected, isHrAdministrator: true);

        Assert.Equal(AnnualLeaveStatus.Rejected, outcome.Status);
    }

    [Fact]
    public void Rejecting_from_pending_is_open_to_both_roles()
    {
        Assert.Equal(AnnualLeaveStatus.Rejected, ApprovalStageRule.Resolve(Type(true, true), AnnualLeaveStatus.Pending, AnnualLeaveStatus.Rejected, false).Status);
        Assert.Equal(AnnualLeaveStatus.Rejected, ApprovalStageRule.Resolve(Type(true, true), AnnualLeaveStatus.Pending, AnnualLeaveStatus.Rejected, true).Status);
    }

    [Fact]
    public void The_hr_stage_cannot_be_asked_for_directly()
    {
        var outcome = ApprovalStageRule.Resolve(Type(true, true), AnnualLeaveStatus.Pending, AnnualLeaveStatus.AwaitingHrApproval, isHrAdministrator: true);

        Assert.Null(outcome.Status);
        Assert.Equal(ApprovalStageRule.StageIsDerivedMessage, outcome.Error);
    }

    /// <summary>
    /// A row whose leave type has since been deleted carries no flags. It was
    /// filed under the one-switch rule, so it is treated as manager-only rather
    /// than refused or sent to HR.
    /// </summary>
    [Fact]
    public void A_missing_leave_type_reads_as_manager_only()
    {
        var outcome = ApprovalStageRule.Resolve(null, AnnualLeaveStatus.Pending, AnnualLeaveStatus.Approved, isHrAdministrator: false);

        Assert.Equal(AnnualLeaveStatus.Approved, outcome.Status);
    }

    [Theory]
    [InlineData(AnnualLeaveStatus.Approved, false)]
    [InlineData(AnnualLeaveStatus.Approved, true)]
    [InlineData(AnnualLeaveStatus.Rejected, false)]
    [InlineData(AnnualLeaveStatus.Pending, false)]
    public void Asking_for_the_status_a_request_already_has_changes_nothing(AnnualLeaveStatus current, bool isHr)
    {
        var outcome = ApprovalStageRule.Resolve(Type(true, true), current, current, isHr);

        Assert.Null(outcome.Error);
        Assert.Equal(current, outcome.Status);
    }
}
