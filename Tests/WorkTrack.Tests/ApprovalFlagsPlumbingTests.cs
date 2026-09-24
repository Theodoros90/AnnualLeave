using Application.LeaveTypes.Queries;
using Domain;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// GetLeaveTypeList projects its columns by hand, so a flag left out of it saves
/// with a 200 and reads back at its default — and the card's Enabled toggle, a
/// full replace, would then write that default back. Both approval flags have to
/// make the round trip.
/// </summary>
public class ApprovalFlagsPlumbingTests
{
    [Fact]
    public async Task Both_approval_flags_survive_the_list_projection()
    {
        using var db = TestDb.Create();
        db.LeaveTypes.Add(new LeaveType
        {
            Id = 1, Name = "Sabbatical", IsActive = true,
            RequiresManagerApproval = false, RequiresHrApproval = true,
        });
        await db.SaveChangesAsync();

        var list = await new GetLeaveTypeList.Handler(db).Handle(new GetLeaveTypeList.Query(), CancellationToken.None);

        var dto = Assert.Single(list);
        Assert.False(dto.RequiresManagerApproval);
        Assert.True(dto.RequiresHrApproval);
    }
}
