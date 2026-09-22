using Application.AnnualLeaves.Commands;
using Application.Children.Queries;
using Application.Core;
using Application.LeaveTypes.Commands;
using Application.LeaveTypes.DTOs;
using Application.LeaveTypes.Queries;
using Application.LeaveTypes.Validators;
using AutoMapper;
using Domain;
using Domain.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// The per-child lifetime total can depend on which child it is. Cypriot maternity
/// leave is the case: 22 weeks for the first child, 22 for the second and 26 from
/// the third onwards — a policy one "weeks per child" column could not hold, so the
/// dialog could not be made to say it.
///
/// "Which child" is birth order among the employee's declared children, oldest
/// first, computed on every read like the age. The two later columns are nullable
/// and null is "the same as the one before", so Paternity Leave's 18 weeks reads as
/// 18 for everyone exactly as it did, with no data migration.
/// </summary>
public class PerChildTotalFollowsBirthOrderTests
{
    // ── Domain arithmetic ──────────────────────────────────────────────────────

    [Theory]
    [InlineData(1, 22)]
    [InlineData(2, 22)]
    [InlineData(3, 26)]
    [InlineData(4, 26)]
    [InlineData(7, 26)]
    public void Each_position_reads_its_own_total_and_the_third_covers_every_later_child(int birthOrder, int expectedWeeks)
    {
        var type = new LeaveType
        {
            PerChildTotalWeeks = 22,
            PerChildTotalWeeksSecondChild = 22,
            PerChildTotalWeeksThirdChildOnwards = 26,
        };

        Assert.Equal(expectedWeeks, type.PerChildTotalWeeksFor(birthOrder));
    }

    /// <summary>
    /// A blank later column is the one before it, and a stored 0 reads the same way
    /// rather than as "nothing for a second child" — the direction that cannot
    /// silently refuse every request for a younger sibling.
    /// </summary>
    [Theory]
    [InlineData(null, null, 18, 18, 18)]
    [InlineData(0, 0, 18, 18, 18)]
    [InlineData(20, null, 18, 20, 20)]
    [InlineData(null, 26, 18, 18, 26)]
    public void A_blank_or_zero_later_column_falls_back_to_the_one_before_it(
        int? second, int? third, int expectedFirst, int expectedSecond, int expectedThird)
    {
        var type = new LeaveType
        {
            PerChildTotalWeeks = 18,
            PerChildTotalWeeksSecondChild = second,
            PerChildTotalWeeksThirdChildOnwards = third,
        };

        Assert.Equal(expectedFirst, type.PerChildTotalWeeksFor(1));
        Assert.Equal(expectedSecond, type.PerChildTotalWeeksFor(2));
        Assert.Equal(expectedThird, type.PerChildTotalWeeksFor(3));
    }

    [Fact]
    public void Birth_order_is_oldest_first_whatever_order_the_children_were_declared_in()
    {
        var youngest = new Child { Id = "c", Name = "Youngest", DateOfBirth = new DateOnly(2024, 6, 1) };
        var eldest = new Child { Id = "a", Name = "Eldest", DateOfBirth = new DateOnly(2018, 2, 10) };
        var middle = new Child { Id = "b", Name = "Middle", DateOfBirth = new DateOnly(2021, 9, 30) };
        var siblings = new[] { youngest, eldest, middle };

        Assert.Equal(1, PerChildLeaveCalculationService.BirthOrder(siblings, eldest.Id));
        Assert.Equal(2, PerChildLeaveCalculationService.BirthOrder(siblings, middle.Id));
        Assert.Equal(3, PerChildLeaveCalculationService.BirthOrder(siblings, youngest.Id));
    }

    /// <summary>
    /// Twins share a date of birth. The one declared first is the first child, so
    /// the answer does not move between reads; a child not in the set is 0.
    /// </summary>
    [Fact]
    public void Twins_are_ordered_by_when_they_were_declared()
    {
        var dob = new DateOnly(2022, 3, 3);
        var declaredSecond = new Child { Id = "z", DateOfBirth = dob, CreatedAt = new DateTime(2026, 1, 1, 10, 5, 0) };
        var declaredFirst = new Child { Id = "y", DateOfBirth = dob, CreatedAt = new DateTime(2026, 1, 1, 10, 0, 0) };
        var siblings = new[] { declaredSecond, declaredFirst };

        Assert.Equal(1, PerChildLeaveCalculationService.BirthOrder(siblings, declaredFirst.Id));
        Assert.Equal(2, PerChildLeaveCalculationService.BirthOrder(siblings, declaredSecond.Id));
        Assert.Equal(0, PerChildLeaveCalculationService.BirthOrder(siblings, "somebody-else"));
    }

    // ── Enforcement ────────────────────────────────────────────────────────────

    private static readonly DateOnly First = new(2019, 1, 15);
    private static readonly DateOnly Second = new(2021, 5, 20);
    private static readonly DateOnly Third = new(2024, 8, 8);

    /// <summary>22 / 22 / 26 weeks, with the yearly cap at the smallest so it stays out of the way.</summary>
    private static void MaternityPolicy(LeaveType type)
    {
        type.PerChildTotalWeeks = 22;
        type.PerChildTotalWeeksSecondChild = 22;
        type.PerChildTotalWeeksThirdChildOnwards = 26;
        type.PerChildWeeksPerYear = 22;
    }

    /// <summary>
    /// The same 125 days against a first child (110-day total) and a third child
    /// (130-day total): refused for one, allowed for the other. 100 days are already
    /// approved in the previous leave year so the yearly cap (110) is not what
    /// decides — only the lifetime total differs between the two children.
    /// </summary>
    [Fact]
    public async Task The_lifetime_total_enforced_is_the_one_for_that_childs_birth_order()
    {
        await using var db = await PerChildLeaveWorld.CreateAsync(configurePerChildType: MaternityPolicy);
        // Declared youngest first, to prove the order comes from the dates of birth.
        var third = await PerChildLeaveWorld.AddChildAsync(db, "Third", Third);
        var first = await PerChildLeaveWorld.AddChildAsync(db, "First", First);
        await PerChildLeaveWorld.AddChildAsync(db, "Second", Second);

        // 20 weeks = 100 business days each, in 2025 (Mon 6 Jan – Fri 23 May).
        await PerChildLeaveWorld.ApproveLeaveAsync(db, first.Id, new DateTime(2025, 1, 6), new DateTime(2025, 5, 23));
        await PerChildLeaveWorld.ApproveLeaveAsync(db, third.Id, new DateTime(2025, 1, 6), new DateTime(2025, 5, 23));

        // 5 more weeks = 25 business days, in 2026 (Mon 5 Jan – Fri 6 Feb).
        var forFirst = PerChildLeaveWorld.Request(first.Id, new DateTime(2026, 1, 5), new DateTime(2026, 2, 6));
        var forThird = PerChildLeaveWorld.Request(third.Id, new DateTime(2026, 1, 5), new DateTime(2026, 2, 6));

        var firstError = await PerChildLeaveWorld.CheckAsync(db, forFirst);
        var thirdError = await PerChildLeaveWorld.CheckAsync(db, forThird);

        Assert.NotNull(firstError);
        Assert.Contains("10 day(s)", firstError);
        Assert.Contains("remaining in total", firstError);
        Assert.Null(thirdError);
    }

    [Fact]
    public async Task With_the_later_columns_blank_every_child_gets_the_first_childs_total()
    {
        await using var db = await PerChildLeaveWorld.CreateAsync();
        await PerChildLeaveWorld.AddChildAsync(db, "First", First);
        await PerChildLeaveWorld.AddChildAsync(db, "Second", Second);
        var third = await PerChildLeaveWorld.AddChildAsync(db, "Third", Third);

        // 18 weeks = 90 business days: the untouched third child has exactly that.
        var request = PerChildLeaveWorld.Request(third.Id, new DateTime(2026, 1, 5), new DateTime(2026, 1, 9));

        Assert.Null(await PerChildLeaveWorld.CheckAsync(db, request));

        var result = await new GetChildLeaveEntitlements.Handler(db).Handle(
            new GetChildLeaveEntitlements.Query { CallerUserId = PerChildLeaveWorld.UserId }, CancellationToken.None);

        Assert.All(result.Value!.Children, child => Assert.Equal(90, child.TotalDays));
    }

    // ── The ledger the UI quotes ───────────────────────────────────────────────

    [Fact]
    public async Task The_ledger_reports_each_child_at_their_own_total_in_birth_order()
    {
        await using var db = await PerChildLeaveWorld.CreateAsync(configurePerChildType: MaternityPolicy);
        await PerChildLeaveWorld.AddChildAsync(db, "Third", Third);
        await PerChildLeaveWorld.AddChildAsync(db, "First", First);
        await PerChildLeaveWorld.AddChildAsync(db, "Second", Second);

        var result = await new GetChildLeaveEntitlements.Handler(db).Handle(
            new GetChildLeaveEntitlements.Query { CallerUserId = PerChildLeaveWorld.UserId }, CancellationToken.None);

        Assert.True(result.IsSuccess);
        var summary = result.Value!;

        Assert.Equal(22, summary.TotalWeeksFirstChild);
        Assert.Equal(22, summary.TotalWeeksSecondChild);
        Assert.Equal(26, summary.TotalWeeksThirdChildOnwards);

        Assert.Collection(summary.Children,
            child =>
            {
                Assert.Equal("First", child.Name);
                Assert.Equal(1, child.BirthOrder);
                Assert.Equal(110, child.TotalDays);
                Assert.Equal(22m, child.TotalWeeks);
            },
            child =>
            {
                Assert.Equal("Second", child.Name);
                Assert.Equal(2, child.BirthOrder);
                Assert.Equal(110, child.TotalDays);
            },
            child =>
            {
                Assert.Equal("Third", child.Name);
                Assert.Equal(3, child.BirthOrder);
                Assert.Equal(130, child.TotalDays);
                Assert.Equal(26m, child.TotalWeeks);
                Assert.Equal(130, child.RemainingDays);
            });
    }

    // ── Validation ─────────────────────────────────────────────────────────────

    private static UpsertLeaveTypeRequest MaternityRequest(int first, int? second, int? third, int perYear) => new()
    {
        Name = SystemLeaveTypes.MaternityLeave,
        AvailableTo = GenderAvailability.Female,
        PerChildEntitlement = true,
        PerChildTotalWeeks = first,
        PerChildTotalWeeksSecondChild = second,
        PerChildTotalWeeksThirdChildOnwards = third,
        PerChildWeeksPerYear = perYear,
        ChildEligibleUntilAge = 15,
    };

    [Fact]
    public void The_maternity_policy_is_accepted()
    {
        var result = new UpsertLeaveTypeRequestValidator().Validate(MaternityRequest(22, 22, 26, perYear: 22));

        Assert.True(result.IsValid, string.Join("; ", result.Errors.Select(e => e.ErrorMessage)));
    }

    [Fact]
    public void Blank_later_columns_are_accepted()
    {
        var result = new UpsertLeaveTypeRequestValidator().Validate(MaternityRequest(18, null, null, perYear: 5));

        Assert.True(result.IsValid, string.Join("; ", result.Errors.Select(e => e.ErrorMessage)));
    }

    /// <summary>
    /// A 0 is refused rather than saved: the entity would read it as "same as the
    /// first child", so the stored figure would mean something other than it says.
    /// </summary>
    [Theory]
    [InlineData(0, 26)]
    [InlineData(22, 0)]
    [InlineData(261, 26)]
    public void A_zero_or_out_of_range_later_total_is_refused(int second, int third)
    {
        var result = new UpsertLeaveTypeRequestValidator().Validate(MaternityRequest(22, second, third, perYear: 22));

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e =>
            e.PropertyName is nameof(UpsertLeaveTypeRequest.PerChildTotalWeeksSecondChild)
                or nameof(UpsertLeaveTypeRequest.PerChildTotalWeeksThirdChildOnwards));
    }

    /// <summary>
    /// The yearly cap is bounded by the *smallest* total: 24 weeks a year against a
    /// first child who only ever gets 22 is a cap that child can never reach.
    /// </summary>
    [Fact]
    public void The_yearly_cap_may_not_exceed_the_smallest_total()
    {
        var result = new UpsertLeaveTypeRequestValidator().Validate(MaternityRequest(22, 22, 26, perYear: 24));

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.ErrorMessage == "The yearly cap cannot exceed the total per child.");
    }

    // ── Plumbing ───────────────────────────────────────────────────────────────

    private static IMapper BuildMapper() =>
        new MapperConfiguration(cfg => cfg.AddProfile<MappingProfiles>(), NullLoggerFactory.Instance).CreateMapper();

    /// <summary>
    /// The list query projects every column by hand, so a column left out of it
    /// saves with a 200 and reads back blank — and the card's Enabled toggle, a full
    /// replace, would then write that blank back.
    /// </summary>
    [Fact]
    public async Task The_totals_saved_through_the_update_handler_are_what_the_list_reads_back()
    {
        await using var db = TestDb.Create();
        db.LeaveTypes.Add(new LeaveType { Id = 1, Name = SystemLeaveTypes.MaternityLeave, IsActive = true });
        await db.SaveChangesAsync();

        var updated = await new UpdateLeaveType.Handler(db, BuildMapper())
            .Handle(new UpdateLeaveType.Command { Id = 1, LeaveType = MaternityRequest(22, 22, 26, perYear: 22) }, CancellationToken.None);
        Assert.True(updated.IsSuccess, updated.Error);
        Assert.Equal(22, updated.Value!.PerChildTotalWeeksSecondChild);
        Assert.Equal(26, updated.Value!.PerChildTotalWeeksThirdChildOnwards);

        db.ChangeTracker.Clear();
        var listed = Assert.Single(
            await new GetLeaveTypeList.Handler(db).Handle(new GetLeaveTypeList.Query(), CancellationToken.None));

        Assert.Equal(22, listed.PerChildTotalWeeks);
        Assert.Equal(22, listed.PerChildTotalWeeksSecondChild);
        Assert.Equal(26, listed.PerChildTotalWeeksThirdChildOnwards);
    }
}
