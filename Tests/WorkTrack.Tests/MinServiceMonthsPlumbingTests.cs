using Application.Core;
using Application.LeaveTypes.Commands;
using Application.LeaveTypes.DTOs;
using Application.LeaveTypes.Queries;
using Application.LeaveTypes.Validators;
using AutoMapper;
using Domain;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// <see cref="LeaveType.MinServiceMonths"/> has to travel the whole way round —
/// admin dialog to column to card and to the leave forms — or it is a setting that
/// saves with a 200 and reads back 0. The list query projects every column by hand
/// rather than through AutoMapper, so a column left out of it is exactly that
/// failure, silently. These pin the round trip and the validator's range.
/// </summary>
public class MinServiceMonthsPlumbingTests
{
    private static IMapper BuildMapper() =>
        new MapperConfiguration(cfg => cfg.AddProfile<MappingProfiles>(), NullLoggerFactory.Instance).CreateMapper();

    private static UpsertLeaveTypeRequest Request(int minServiceMonths) => new()
    {
        Name = "Unpaid Leave",
        DefaultAllowance = 30,
        MinServiceMonths = minServiceMonths,
    };

    [Fact]
    public async Task The_months_saved_through_the_update_handler_are_what_the_list_reads_back()
    {
        await using var db = TestDb.Create();
        db.LeaveTypes.Add(new LeaveType { Id = 1, Name = "Unpaid Leave", IsActive = true });
        await db.SaveChangesAsync();

        var updated = await new UpdateLeaveType.Handler(db, BuildMapper())
            .Handle(new UpdateLeaveType.Command { Id = 1, LeaveType = Request(12) }, CancellationToken.None);
        Assert.True(updated.IsSuccess);
        Assert.Equal(12, updated.Value!.MinServiceMonths);

        db.ChangeTracker.Clear();
        var listed = await new GetLeaveTypeList.Handler(db).Handle(new GetLeaveTypeList.Query(), CancellationToken.None);

        Assert.Equal(12, Assert.Single(listed).MinServiceMonths);
    }

    /// <summary>
    /// Found while adding the column above: the list never projected
    /// <see cref="LeaveType.AvailableTo"/>, so a type an admin restricted to one
    /// gender listed as Both — and the card's Enabled toggle, a full replace, would
    /// have sent that Both back and reopened it.
    /// </summary>
    [Fact]
    public async Task Who_a_type_is_available_to_is_what_the_list_reads_back()
    {
        await using var db = TestDb.Create();
        db.LeaveTypes.Add(new LeaveType
        {
            Id = 1,
            Name = "Menstrual Leave",
            IsActive = true,
            AvailableTo = GenderAvailability.Female,
        });
        await db.SaveChangesAsync();

        var listed = await new GetLeaveTypeList.Handler(db).Handle(new GetLeaveTypeList.Query(), CancellationToken.None);

        Assert.Equal(GenderAvailability.Female, Assert.Single(listed).AvailableTo);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(2)]
    [InlineData(120)]
    public void Months_within_ten_years_are_accepted(int months)
    {
        var result = new UpsertLeaveTypeRequestValidator().Validate(Request(months));

        Assert.DoesNotContain(result.Errors, e => e.PropertyName == nameof(UpsertLeaveTypeRequest.MinServiceMonths));
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(121)]
    public void Months_outside_ten_years_are_refused(int months)
    {
        var result = new UpsertLeaveTypeRequestValidator().Validate(Request(months));

        Assert.Contains(result.Errors, e => e.PropertyName == nameof(UpsertLeaveTypeRequest.MinServiceMonths));
    }
}
