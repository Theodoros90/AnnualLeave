using Application.AnnualLeaves.Commands;
using Domain;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// An approved leave can be cancelled only while it has not started. Mirrored by
/// <c>canCancelApproved</c> in <c>client/src/lib/approval-stage.ts</c>.
/// </summary>
public class CancellationRuleTests
{
    private static readonly DateTime Start = new(2026, 6, 1);

    [Theory]
    [InlineData(2026, 5, 20)]  // well before
    [InlineData(2026, 6, 1)]   // the morning it starts — still today, still cancellable
    public void An_approved_leave_that_has_not_started_can_be_cancelled(int y, int m, int d) =>
        Assert.Null(CancellationRule.Check(AnnualLeaveStatus.Approved, AnnualLeaveStatus.Cancelled, Start, new DateTime(y, m, d, 15, 0, 0, DateTimeKind.Utc)));

    [Theory]
    [InlineData(2026, 6, 2)]   // under way
    [InlineData(2026, 7, 1)]   // long over
    public void An_approved_leave_that_has_started_cannot_be_cancelled(int y, int m, int d) =>
        Assert.Equal(
            CancellationRule.AlreadyStartedMessage,
            CancellationRule.Check(AnnualLeaveStatus.Approved, AnnualLeaveStatus.Cancelled, Start, new DateTime(y, m, d, 0, 0, 0, DateTimeKind.Utc)));

    /// <summary>
    /// The clock only bites on Approved → Cancelled. Taking an approval back with a
    /// rejection, or cancelling something never approved, has no start to protect.
    /// </summary>
    [Theory]
    [InlineData(AnnualLeaveStatus.Approved, AnnualLeaveStatus.Rejected)]
    [InlineData(AnnualLeaveStatus.Pending, AnnualLeaveStatus.Cancelled)]
    [InlineData(AnnualLeaveStatus.AwaitingHrApproval, AnnualLeaveStatus.Cancelled)]
    [InlineData(AnnualLeaveStatus.Approved, AnnualLeaveStatus.Approved)]
    public void Only_cancelling_an_approved_leave_is_measured_against_the_clock(AnnualLeaveStatus current, AnnualLeaveStatus requested) =>
        Assert.Null(CancellationRule.Check(current, requested, Start, new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc)));
}
