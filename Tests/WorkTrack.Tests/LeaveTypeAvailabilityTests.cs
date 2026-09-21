using Application.AnnualLeaves.Commands;
using Application.AnnualLeaves.DTOs;
using Application.Core;
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
/// Who a leave type is available to — everyone, men, or women — is a setting on
/// the type (<see cref="LeaveType.AvailableTo"/>), not a fact about its name. That
/// is what lets an admin restrict a type they made themselves. The three built-in
/// types are the exception: Annual Leave is always for everyone, Maternity Leave
/// for women and Paternity Leave for men, and the validator refuses anything else
/// so a caller going around the read-only dialog is told rather than ignored.
///
/// The second half pins that the column is enforced, not advertised: a custom type
/// set to one gender is refused by <c>CreateAnnualLeave</c> for the other, with the
/// same fail-open rule for an unspecified gender that Maternity and Paternity have
/// always had.
/// </summary>
public class LeaveTypeAvailabilityTests
{
    /* ── The validator locks the three built-in types ───────────────────────── */

    private static UpsertLeaveTypeRequest Request(string name, GenderAvailability availableTo) => new()
    {
        Name = name,
        RequiresApproval = true,
        IsActive = true,
        AvailableTo = availableTo,
    };

    private static string LockMessage(string name) =>
        $"{name} is a built-in leave type — who it is available to cannot be changed.";

    [Theory]
    [InlineData(SystemLeaveTypes.AnnualLeave, GenderAvailability.Both)]
    [InlineData(SystemLeaveTypes.MaternityLeave, GenderAvailability.Female)]
    [InlineData(SystemLeaveTypes.PaternityLeave, GenderAvailability.Male)]
    public void Each_built_in_type_accepts_its_fixed_availability(string name, GenderAvailability availableTo)
    {
        var result = new UpsertLeaveTypeRequestValidator().Validate(Request(name, availableTo));

        Assert.True(result.IsValid, string.Join("; ", result.Errors.Select(e => e.ErrorMessage)));
    }

    [Theory]
    [InlineData(SystemLeaveTypes.AnnualLeave, GenderAvailability.Male)]
    [InlineData(SystemLeaveTypes.AnnualLeave, GenderAvailability.Female)]
    [InlineData(SystemLeaveTypes.MaternityLeave, GenderAvailability.Both)]
    [InlineData(SystemLeaveTypes.MaternityLeave, GenderAvailability.Male)]
    [InlineData(SystemLeaveTypes.PaternityLeave, GenderAvailability.Both)]
    [InlineData(SystemLeaveTypes.PaternityLeave, GenderAvailability.Female)]
    public void A_built_in_type_refuses_any_other_availability(string name, GenderAvailability availableTo)
    {
        var result = new UpsertLeaveTypeRequestValidator().Validate(Request(name, availableTo));

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.ErrorMessage == LockMessage(name));
    }

    [Fact]
    public void The_lock_matches_the_name_case_insensitively()
    {
        var result = new UpsertLeaveTypeRequestValidator().Validate(Request("maternity leave", GenderAvailability.Male));

        Assert.Contains(result.Errors, e => e.ErrorMessage == LockMessage("maternity leave"));
    }

    [Theory]
    [InlineData("Sick Leave", GenderAvailability.Both)]
    [InlineData("Sick Leave", GenderAvailability.Male)]
    [InlineData("Menstrual Leave", GenderAvailability.Female)]
    public void Any_other_type_may_be_made_available_to_anyone(string name, GenderAvailability availableTo)
    {
        var result = new UpsertLeaveTypeRequestValidator().Validate(Request(name, availableTo));

        Assert.True(result.IsValid, string.Join("; ", result.Errors.Select(e => e.ErrorMessage)));
    }

    /* ── The flag the dialog reads ──────────────────────────────────────────── */

    [Theory]
    [InlineData(SystemLeaveTypes.AnnualLeave)]
    [InlineData(SystemLeaveTypes.MaternityLeave)]
    [InlineData(SystemLeaveTypes.PaternityLeave)]
    public void The_dto_marks_the_built_in_types_as_locked(string name)
    {
        Assert.True(new LeaveTypeDto { Name = name }.AvailabilityLocked);
    }

    [Theory]
    [InlineData("Sick Leave")]
    [InlineData("")]
    public void The_dto_marks_everything_else_as_editable(string name)
    {
        Assert.False(new LeaveTypeDto { Name = name }.AvailabilityLocked);
    }

    /* ── The column is enforced when a request is filed ─────────────────────── */

    private const string UserId = "employee-1";
    private const string ProfileId = "profile-1";
    private const int MenOnlyTypeId = 10;
    private const int EveryoneTypeId = 11;

    private static async Task<AppDbContext> WorldAsync(Gender? gender)
    {
        var db = TestDb.Create();

        db.AppSettings.Add(new AppSettings { Id = 1, LeaveYearStartMonth = 1 });

        db.Users.Add(new User
        {
            Id = UserId,
            UserName = "employee-1@example.com",
            Email = "employee-1@example.com",
            DisplayName = "Andreas Georgiou",
            Gender = gender,
        });

        db.EmployeeProfiles.Add(new EmployeeProfile
        {
            Id = ProfileId,
            UserId = UserId,
            AnnualLeaveEntitlement = 25,
            LeaveBalance = 25,
        });

        // A type an admin made and restricted. Not parental, so no child is asked for.
        db.LeaveTypes.Add(new LeaveType
        {
            Id = MenOnlyTypeId,
            Name = "Reservist Training",
            IsActive = true,
            RequiresApproval = true,
            AffectsBalance = false,
            DefaultAllowance = 10,
            AvailableTo = GenderAvailability.Male,
        });

        db.LeaveTypes.Add(new LeaveType
        {
            Id = EveryoneTypeId,
            Name = "Study Leave",
            IsActive = true,
            RequiresApproval = true,
            AffectsBalance = false,
            DefaultAllowance = 10,
            AvailableTo = GenderAvailability.Both,
        });

        await db.SaveChangesAsync();
        return db;
    }

    private static IMapper BuildMapper() =>
        new MapperConfiguration(cfg => cfg.AddProfile<MappingProfiles>(), NullLoggerFactory.Instance).CreateMapper();

    private static Task<Result<string>> Create(AppDbContext db, int leaveTypeId) =>
        new CreateAnnualLeave.Handler(db, BuildMapper(), new FakeEmailService())
            .Handle(new CreateAnnualLeave.Command
            {
                AnnualLeave = new CreateAnnualLeaveRequest
                {
                    EmployeeId = UserId,
                    LeaveTypeId = leaveTypeId,
                    StartDate = new DateTime(2026, 6, 1),
                    EndDate = new DateTime(2026, 6, 5),
                    Reason = "Training",
                },
            }, CancellationToken.None);

    [Fact]
    public async Task A_men_only_type_is_refused_for_a_female_employee()
    {
        await using var db = await WorldAsync(Gender.Female);

        var result = await Create(db, MenOnlyTypeId);

        Assert.False(result.IsSuccess);
        Assert.Equal("Reservist Training is not available to you.", result.Error);
        Assert.Empty(await db.AnnualLeaves.ToListAsync());
    }

    [Fact]
    public async Task A_men_only_type_is_allowed_to_a_male_employee()
    {
        await using var db = await WorldAsync(Gender.Male);

        var result = await Create(db, MenOnlyTypeId);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Single(await db.AnnualLeaves.ToListAsync());
    }

    /// <summary>
    /// The same fail-open rule the parental types have: null is "nobody entered it",
    /// not "neither", and reading it as a mismatch would strip the type from every
    /// account predating the Gender column.
    /// </summary>
    [Fact]
    public async Task A_men_only_type_is_allowed_when_the_gender_is_unspecified()
    {
        await using var db = await WorldAsync(gender: null);

        var result = await Create(db, MenOnlyTypeId);

        Assert.True(result.IsSuccess, result.Error);
    }

    [Theory]
    [InlineData(Gender.Male)]
    [InlineData(Gender.Female)]
    [InlineData(null)]
    public async Task A_type_for_everyone_is_allowed_to_anyone(Gender? gender)
    {
        await using var db = await WorldAsync(gender);

        var result = await Create(db, EveryoneTypeId);

        Assert.True(result.IsSuccess, result.Error);
    }
}
