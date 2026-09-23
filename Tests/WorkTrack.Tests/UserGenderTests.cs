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
/// is the plumbing around the column: it survives a create and an edit, it is
/// <b>required</b> on both for an Employee and a Manager, and it is <b>refused</b>
/// on both for a System Administrator.
///
/// The requirement is the load-bearing part. The dialog used to offer an explicit
/// "Not specified", and the eligibility rule reads a stored null as "offer
/// everything" (so that accounts predating the column keep their parental leave).
/// Together those meant a type restricted to Male was still offered to anyone an
/// admin had left unspecified — the restriction looked like a rule and behaved
/// like none. Both admin validators now refuse a null for those two roles, so a
/// null can only be a legacy row, and it goes away the next time that account is
/// saved.
///
/// The System Administrator half follows the department and the employment start date (see
/// <see cref="AdminHasNoDepartmentTests"/> and <see cref="EmploymentStartDateTests"/>):
/// the dialogs never ask a System Administrator, so a payload carrying one was built against a
/// shape the dialog does not have, and refusing rather than ignoring it means a
/// promotion to System Administrator clears the stored answer instead of stranding it. The edit
/// validator reads the stored role, which is why the dialog sets roles before it
/// saves the user.
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

        foreach (var role in new[] { AppRoles.SystemAdministrator, AppRoles.Manager, AppRoles.Employee })
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

    /// <summary>
    /// The Profile fields go with the role: a System Administrator has no department and no
    /// start date (both refused for them), so the payload must not carry either
    /// or the failure being tested would be drowned by two it is not about.
    /// </summary>
    private static AdminCreateUserDto CreatePayload(Gender? gender, string role = AppRoles.Employee) => new()
    {
        Email = "newjoiner@test.local",
        DisplayName = "New Joiner",
        DepartmentId = role == AppRoles.SystemAdministrator ? null : 1,
        Roles = [role],
        DateOfBirth = DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-30),
        EmploymentStartDate = role == AppRoles.SystemAdministrator ? null : DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-2),
        Gender = gender,
    };

    private static AdminUpdateUserDto UpdatePayload(Gender? gender) => new()
    {
        Email = "newjoiner@test.local",
        DisplayName = "New Joiner",
        DateOfBirth = DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-30),
        Gender = gender,
    };

    private async Task<FluentValidation.Results.ValidationResult> ValidateCreateAsync(
        Gender? gender, string role = AppRoles.Employee)
    {
        await SeedAsync();
        return await new CreateAdminUserValidator(Db, Roles)
            .ValidateAsync(new CreateAdminUser.Command { User = CreatePayload(gender, role) });
    }

    /// <summary>
    /// A stored account in <paramref name="role"/>, because the edit validator
    /// reads the role off the database — the payload carries none.
    /// </summary>
    private async Task<string> GivenUserAsync(string role)
    {
        var user = new User
        {
            Email = "stored@test.local",
            UserName = "stored@test.local",
            DisplayName = "Stored User",
            EmailConfirmed = true,
        };

        Assert.True((await Users.CreateAsync(user, "Pa$$w0rd!")).Succeeded);
        Assert.True((await Users.AddToRoleAsync(user, role)).Succeeded);
        Db.ChangeTracker.Clear();
        return user.Id;
    }

    private async Task<FluentValidation.Results.ValidationResult> ValidateUpdateAsync(
        Gender? gender, string role = AppRoles.Employee)
    {
        await SeedAsync();
        var id = await GivenUserAsync(role);
        return await new UpdateAdminUserValidator(Db)
            .ValidateAsync(new UpdateAdminUser.Command { Id = id, User = UpdatePayload(gender) });
    }

    private static void AssertGenderRefused(
        FluentValidation.Results.ValidationResult result,
        string expectedMessage)
    {
        Assert.False(result.IsValid, "Expected Gender to be refused.");
        var error = Assert.Single(result.Errors, e => e.PropertyName.EndsWith("Gender", StringComparison.Ordinal));
        Assert.Equal(expectedMessage, error.ErrorMessage);
    }

    private static void AssertGenderRequired(FluentValidation.Results.ValidationResult result) =>
        AssertGenderRefused(result, PersonFieldRules.GenderRequiredMessage);

    private static void AssertGenderNotForAdmin(FluentValidation.Results.ValidationResult result) =>
        AssertGenderRefused(result, PersonFieldRules.GenderNotForAdminMessage);

    private static void AssertGenderAccepted(FluentValidation.Results.ValidationResult result) =>
        Assert.DoesNotContain(result.Errors, e => e.PropertyName.EndsWith("Gender", StringComparison.Ordinal));

    /* ── Employee and Manager: required ─────────────────────────────────────── */

    /// <summary>
    /// The rule this file exists for. Without it "no gender" was a third answer
    /// the dialog offered, and the eligibility rule reads a null as "offer every
    /// type" — so restricting a type to one gender changed nothing for anyone an
    /// admin had left unspecified. Both roles, because both sit inside the leave
    /// rules a gender routes.
    /// </summary>
    [Theory]
    [InlineData(AppRoles.Employee)]
    [InlineData(AppRoles.Manager)]
    public async Task Create_refuses_no_gender_at_all(string role) =>
        AssertGenderRequired(await ValidateCreateAsync(null, role));

    [Theory]
    [InlineData(AppRoles.Employee)]
    [InlineData(AppRoles.Manager)]
    public async Task Update_refuses_no_gender_at_all(string role) =>
        AssertGenderRequired(await ValidateUpdateAsync(null, role));

    /// <summary>
    /// The DTO is nullable so the binder can say "missing" rather than defaulting
    /// to the enum's 0 — but a number outside the enum is not an answer either.
    /// </summary>
    [Fact]
    public async Task Update_refuses_a_gender_outside_the_enum() =>
        AssertGenderRequired(await ValidateUpdateAsync((Gender)7));

    [Theory]
    [InlineData(Gender.Male)]
    [InlineData(Gender.Female)]
    public async Task Create_accepts_either_gender(Gender gender) =>
        AssertGenderAccepted(await ValidateCreateAsync(gender));

    [Theory]
    [InlineData(Gender.Male)]
    [InlineData(Gender.Female)]
    public async Task Update_accepts_either_gender(Gender gender) =>
        AssertGenderAccepted(await ValidateUpdateAsync(gender));

    /// <summary>
    /// The one path with no stored role to read: nothing behind the id. Held to
    /// the non-System Administrator rule rather than waved through, so the shape tests that use a
    /// made-up id (<see cref="PersonFieldValidationTests"/>) keep meaning what they
    /// say, and the handler is the one to report the account as missing.
    /// </summary>
    [Fact]
    public async Task An_unknown_account_is_held_to_the_non_Admin_rule()
    {
        await SeedAsync();

        var result = await new UpdateAdminUserValidator(Db)
            .ValidateAsync(new UpdateAdminUser.Command { Id = "no-such-user", User = UpdatePayload(null) });

        AssertGenderRequired(result);
    }

    /* ── System Administrator: never asked, so refused ─────────────────────────────────────── */

    /// <summary>
    /// The dialogs hide the field for a System Administrator, so a rule that demanded one would
    /// make a System Administrator impossible to create or save through the only screen that
    /// does either.
    /// </summary>
    [Fact]
    public async Task An_Admin_can_be_created_without_a_gender() =>
        AssertGenderAccepted(await ValidateCreateAsync(null, AppRoles.SystemAdministrator));

    [Fact]
    public async Task An_Admin_can_be_saved_without_a_gender() =>
        AssertGenderAccepted(await ValidateUpdateAsync(null, AppRoles.SystemAdministrator));

    /// <summary>
    /// Refused rather than quietly dropped, matching the department and the start
    /// date: the dialog cannot send one, so a payload that carries it was built
    /// against a shape the dialog does not have.
    /// </summary>
    [Theory]
    [InlineData(Gender.Male)]
    [InlineData(Gender.Female)]
    public async Task An_Admin_cannot_be_created_with_a_gender(Gender gender) =>
        AssertGenderNotForAdmin(await ValidateCreateAsync(gender, AppRoles.SystemAdministrator));

    [Theory]
    [InlineData(Gender.Male)]
    [InlineData(Gender.Female)]
    public async Task An_Admin_cannot_be_saved_with_a_gender(Gender gender) =>
        AssertGenderNotForAdmin(await ValidateUpdateAsync(gender, AppRoles.SystemAdministrator));

    /// <summary>
    /// What "refused rather than ignored" buys: a promotion to System Administrator arrives, roles
    /// already switched, with the null the dialog now sends — and the full-replace
    /// handler clears the stored answer rather than stranding one the System Administrator's own
    /// dialog can no longer show or take back.
    /// </summary>
    [Fact]
    public async Task Promoting_an_employee_to_Admin_clears_their_gender()
    {
        await SeedAsync();
        var id = (await Create(Gender.Male)).Value!.Id;

        var tracked = await Users.FindByIdAsync(id);
        Assert.NotNull(tracked);
        Assert.True((await Users.RemoveFromRoleAsync(tracked, AppRoles.Employee)).Succeeded);
        Assert.True((await Users.AddToRoleAsync(tracked, AppRoles.SystemAdministrator)).Succeeded);
        Db.ChangeTracker.Clear();

        var validation = await new UpdateAdminUserValidator(Db)
            .ValidateAsync(new UpdateAdminUser.Command { Id = id, User = UpdatePayload(null) });
        Assert.True(validation.IsValid, string.Join(" | ", validation.Errors.Select(e => e.ErrorMessage)));

        var result = await Update(id, null);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Null(result.Value!.Gender);
        Assert.Null(await StoredGenderAsync(id));
    }

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
