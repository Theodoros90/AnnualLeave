using Application.AdminUsers.Commands;
using Application.AdminUsers.DTOs;
using Application.AdminUsers.Validators;
using Application.Core;
using Domain;
using Domain.Interfaces;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// Gender is recorded HR data an administrator maintains, and it decides who is
/// offered a leave type restricted through <c>LeaveType.AvailableTo</c> — see
/// <see cref="ParentalLeaveEligibilityTests"/> for that rule. What this file covers
/// is the plumbing around the column: it survives a create and an edit, and it is
/// <b>required</b> on both.
///
/// The requirement is the load-bearing part. The dialog used to offer an explicit
/// "Not specified", and the eligibility rule reads a stored null as "offer
/// everything" (so that accounts predating the column keep their parental leave).
/// Together those meant a type restricted to Male was still offered to anyone an
/// admin had left unspecified — the restriction looked like a rule and behaved
/// like none. Both admin validators now refuse a null, so a null can only be a
/// legacy row, and it goes away the next time that account is saved.
/// </summary>
public class UserGenderTests : IDisposable
{
    private readonly ServiceProvider _services;

    public UserGenderTests()
    {
        var collection = new ServiceCollection();

        collection.AddLogging(b => b.SetMinimumLevel(LogLevel.Warning));
        collection.AddDbContext<AppDbContext>(options => options
            .UseInMemoryDatabase($"user-gender-{Guid.NewGuid()}")
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning)));

        collection.AddIdentityCore<User>(options => options.User.RequireUniqueEmail = true)
            .AddRoles<Role>()
            .AddEntityFrameworkStores<AppDbContext>();

        _services = collection.BuildServiceProvider();
    }

    public void Dispose() => _services.Dispose();

    private AppDbContext Db => _services.GetRequiredService<AppDbContext>();
    private UserManager<User> Users => _services.GetRequiredService<UserManager<User>>();
    private RoleManager<Role> Roles => _services.GetRequiredService<RoleManager<Role>>();

    private sealed class SilentAccountEmailSender : IAccountEmailSender
    {
        public string BuildClientUrl(string route, IDictionary<string, string?>? query = null) => $"https://test.local{route}";

        public Task<bool> SendWelcomeInviteAsync(User user, CancellationToken cancellationToken = default) =>
            Task.FromResult(true);

        public Task<bool> SendPasswordResetAsync(User user, CancellationToken cancellationToken = default) =>
            Task.FromResult(true);

        public Task<bool> SendEmailChangeConfirmationAsync(
            User user, string newEmail, string apiBaseUrlFallback, CancellationToken cancellationToken = default) =>
            Task.FromResult(true);
    }

    private async Task SeedAsync()
    {
        var db = Db;
        db.Departments.Add(new Department { Id = 1, Name = "Engineering", Code = "ENG" });
        await db.SaveChangesAsync();

        foreach (var role in new[] { AppRoles.Admin, AppRoles.Manager, AppRoles.Employee })
        {
            await Roles.CreateAsync(new Role { Name = role });
        }

        db.ChangeTracker.Clear();
    }

    private Task<Result<AdminUserDto>> Create(Gender? gender) =>
        new CreateAdminUser.Handler(Db, Users, new SilentAccountEmailSender(), NullLogger<CreateAdminUser.Handler>.Instance)
            .Handle(new CreateAdminUser.Command
            {
                User = new AdminCreateUserDto
                {
                    Email = "newjoiner@test.local",
                    DisplayName = "New Joiner",
                    DepartmentId = 1,
                    Roles = [AppRoles.Employee],
                    Gender = gender,
                },
            }, CancellationToken.None);

    private Task<Result<AdminUserDto>> Update(string id, Gender? gender) =>
        new UpdateAdminUser.Handler(Users).Handle(new UpdateAdminUser.Command
        {
            Id = id,
            User = new AdminUpdateUserDto
            {
                Email = "newjoiner@test.local",
                DisplayName = "New Joiner",
                Gender = gender,
            },
        }, CancellationToken.None);

    private async Task<Gender?> StoredGenderAsync(string id) =>
        (await Db.Users.AsNoTracking().SingleAsync(u => u.Id == id)).Gender;

    [Theory]
    [InlineData(Gender.Male)]
    [InlineData(Gender.Female)]
    public async Task A_gender_chosen_on_create_is_stored_and_returned(Gender gender)
    {
        await SeedAsync();

        var result = await Create(gender);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(gender, result.Value!.Gender);
        Assert.Equal(gender, await StoredGenderAsync(result.Value!.Id));
    }

    private static AdminCreateUserDto CreatePayload(Gender? gender) => new()
    {
        Email = "newjoiner@test.local",
        DisplayName = "New Joiner",
        DepartmentId = 1,
        Roles = [AppRoles.Employee],
        DateOfBirth = DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-30),
        EmploymentStartDate = DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-2),
        Gender = gender,
    };

    private static AdminUpdateUserDto UpdatePayload(Gender? gender) => new()
    {
        Email = "newjoiner@test.local",
        DisplayName = "New Joiner",
        DateOfBirth = DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-30),
        Gender = gender,
    };

    private async Task<FluentValidation.Results.ValidationResult> ValidateCreateAsync(Gender? gender)
    {
        await SeedAsync();
        return await new CreateAdminUserValidator(Db, Roles)
            .ValidateAsync(new CreateAdminUser.Command { User = CreatePayload(gender) });
    }

    private static FluentValidation.Results.ValidationResult ValidateUpdate(Gender? gender) =>
        new UpdateAdminUserValidator()
            .Validate(new UpdateAdminUser.Command { Id = "u-1", User = UpdatePayload(gender) });

    private static void AssertGenderRefused(FluentValidation.Results.ValidationResult result)
    {
        Assert.False(result.IsValid, "Expected Gender to be refused.");
        var error = Assert.Single(result.Errors, e => e.PropertyName.EndsWith("Gender", StringComparison.Ordinal));
        Assert.Equal(PersonFieldRules.GenderRequiredMessage, error.ErrorMessage);
    }

    private static void AssertGenderAccepted(FluentValidation.Results.ValidationResult result) =>
        Assert.DoesNotContain(result.Errors, e => e.PropertyName.EndsWith("Gender", StringComparison.Ordinal));

    /// <summary>
    /// The rule this file exists for. Without it "no gender" was a third answer
    /// the dialog offered, and the eligibility rule reads a null as "offer every
    /// type" — so restricting a type to one gender changed nothing for anyone an
    /// admin had left unspecified.
    /// </summary>
    [Fact]
    public async Task Create_refuses_no_gender_at_all() =>
        AssertGenderRefused(await ValidateCreateAsync(null));

    [Fact]
    public void Update_refuses_no_gender_at_all() =>
        AssertGenderRefused(ValidateUpdate(null));

    /// <summary>
    /// The DTO is nullable so the binder can say "missing" rather than defaulting
    /// to the enum's 0 — but a number outside the enum is not an answer either.
    /// </summary>
    [Fact]
    public void Update_refuses_a_gender_outside_the_enum() =>
        AssertGenderRefused(ValidateUpdate((Gender)7));

    [Theory]
    [InlineData(Gender.Male)]
    [InlineData(Gender.Female)]
    public async Task Create_accepts_either_gender(Gender gender) =>
        AssertGenderAccepted(await ValidateCreateAsync(gender));

    [Theory]
    [InlineData(Gender.Male)]
    [InlineData(Gender.Female)]
    public void Update_accepts_either_gender(Gender gender) =>
        AssertGenderAccepted(ValidateUpdate(gender));

    /// <summary>
    /// The backfill path. An account created before the column has a null the
    /// validator would now refuse to *write* — the handler still has to be able to
    /// replace it with a real answer, or those accounts could never be saved again.
    /// <c>Create(null)</c> goes straight to the handler, bypassing the validator,
    /// to stand in for such a row.
    /// </summary>
    [Fact]
    public async Task An_edit_can_set_a_gender_that_was_never_specified()
    {
        await SeedAsync();
        var id = (await Create(null)).Value!.Id;

        var result = await Update(id, Gender.Female);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(Gender.Female, result.Value!.Gender);
        Assert.Equal(Gender.Female, await StoredGenderAsync(id));
    }

    [Fact]
    public async Task An_edit_can_change_a_stored_gender()
    {
        await SeedAsync();
        var id = (await Create(Gender.Male)).Value!.Id;

        var result = await Update(id, Gender.Female);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(Gender.Female, await StoredGenderAsync(id));
    }

}
