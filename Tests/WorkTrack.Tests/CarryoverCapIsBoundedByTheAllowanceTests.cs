using Application.Core;
using Application.LeaveTypes.Commands;
using Application.LeaveTypes.DTOs;
using Application.LeaveTypes.Validators;
using AutoMapper;
using Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// The carryover cap used to be validated against nothing but the calendar — 0 to 365,
/// never compared to the allowance it caps. So an admin could grant 23 days a year and
/// carry over 80, a figure reachable only after four consecutive years of taking no
/// leave at all: a policy that reads like a limit and behaves like none.
///
/// The cap is now bounded by the type's own allowance, and "no cap at all" has a value
/// of its own — <c>null</c> — rather than being spelled as a number large enough that
/// nothing ever reaches it. Three readings, all distinct:
///
///   <c>null</c> — no cap, every unused day carries over
///   <c>0</c>    — nothing carries over
///   <c>N</c>    — at most N days, and N may not exceed the allowance
///
/// Note the cap and the allowance are not the same quantity at year end: a closing
/// balance is last year's carry-in plus this year's allowance, so 23 days carried into
/// a 23-day year can close at 46. A cap equal to the allowance still expires days.
/// </summary>
public class CarryoverCapIsBoundedByTheAllowanceTests
{
    private static IMapper BuildMapper() =>
        new MapperConfiguration(
            cfg => cfg.AddProfile<MappingProfiles>(),
            NullLoggerFactory.Instance).CreateMapper();

    private static Task<Result<LeaveTypeDto>> Handle(AppDbContext db, UpdateLeaveType.Command command) =>
        new UpdateLeaveType.Handler(db, BuildMapper()).Handle(command, CancellationToken.None);

    private static UpsertLeaveTypeRequest Request(int allowance, int? carryover) => new()
    {
        Name = "Annual Leave",
        RequiresApproval = true,
        IsActive = true,
        AffectsBalance = true,
        DefaultAllowance = allowance,
        MaxCarryoverDays = carryover,
    };

    /// <summary>The case from the screenshot that started this: 23 days a year, 80 carried.</summary>
    [Fact]
    public void A_cap_above_the_allowance_is_refused()
    {
        var result = new UpsertLeaveTypeRequestValidator().Validate(Request(allowance: 23, carryover: 80));

        Assert.False(result.IsValid);
        var error = Assert.Single(
            result.Errors,
            e => e.PropertyName == nameof(UpsertLeaveTypeRequest.MaxCarryoverDays));
        // The message has to name the bound, or the admin is left guessing which of the
        // two numbers on the row the server objected to.
        Assert.Contains("23", error.ErrorMessage);
    }

    [Fact]
    public void A_cap_equal_to_the_allowance_is_allowed()
    {
        var result = new UpsertLeaveTypeRequestValidator().Validate(Request(allowance: 23, carryover: 23));

        Assert.True(result.IsValid);
    }

    [Fact]
    public void A_negative_cap_is_still_refused()
    {
        var result = new UpsertLeaveTypeRequestValidator().Validate(Request(allowance: 23, carryover: -1));

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(UpsertLeaveTypeRequest.MaxCarryoverDays));
    }

    /// <summary>
    /// No cap is the one reading the allowance cannot bound, so it is not a number:
    /// a blank field, stored as null, means every unused day survives the year end.
    /// </summary>
    [Fact]
    public void No_cap_is_not_bounded_by_the_allowance()
    {
        var result = new UpsertLeaveTypeRequestValidator().Validate(Request(allowance: 23, carryover: null));

        Assert.True(result.IsValid);
    }

    [Fact]
    public async Task Updating_a_leave_type_stores_no_cap_as_null()
    {
        using var db = TestDb.Create();
        db.LeaveTypes.Add(new LeaveType
        {
            Id = 1, Name = "Annual Leave", IsActive = true,
            RequiresApproval = true, AffectsBalance = true, DefaultAllowance = 23, MaxCarryoverDays = 5,
        });
        await db.SaveChangesAsync();

        var result = await Handle(db, new UpdateLeaveType.Command
        {
            Id = 1,
            LeaveType = Request(allowance: 23, carryover: null),
        });

        Assert.True(result.IsSuccess);
        Assert.Null(result.Value!.MaxCarryoverDays);
        Assert.Null((await db.LeaveTypes.AsNoTracking().SingleAsync(t => t.Id == 1)).MaxCarryoverDays);
    }

    /// <summary>
    /// Distinct from no cap, and the distinction has to survive a round trip: a 0 that
    /// read back as null would turn "nothing carries over" into its opposite.
    /// </summary>
    [Fact]
    public async Task Carrying_nothing_over_stays_a_zero_not_a_null()
    {
        using var db = TestDb.Create();
        db.LeaveTypes.Add(new LeaveType
        {
            Id = 1, Name = "Annual Leave", IsActive = true,
            RequiresApproval = true, AffectsBalance = true, DefaultAllowance = 23,
        });
        await db.SaveChangesAsync();

        var result = await Handle(db, new UpdateLeaveType.Command
        {
            Id = 1,
            LeaveType = Request(allowance: 23, carryover: 0),
        });

        Assert.True(result.IsSuccess);
        Assert.Equal(0, result.Value!.MaxCarryoverDays);
    }
}
