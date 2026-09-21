using Application.AdminUsers.Commands;
using Application.AdminUsers.DTOs;
using Application.AdminUsers.Validators;
using Application.Core;
using Application.EmployeeProfiles.Commands;
using Application.EmployeeProfiles.DTOs;
using Application.EmployeeProfiles.Queries;
using Application.EmployeeProfiles.Validators;
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
/// When somebody joined was recorded nowhere. <c>EmployeeProfile.CreatedAt</c> is
/// when the row was written, which is when an administrator got round to keying
/// the account in — not a hire date, and wrong for everybody migrated in at once.
///
/// So <c>EmployeeProfile.EmploymentStartDate</c>, mandatory for an Employee and a
/// Manager and refused for an Admin, exactly as <c>DepartmentId</c> is: it lives in
/// the Profile section of the admin dialogs, which is already hidden for an Admin,
/// so the role scoping needs no new surface. See
/// <see cref="AdminHasNoDepartmentTests"/> for the department half of the same rule.
///
/// The column is nullable and nothing backfills it: a hire date for somebody who
/// predates the field is not ours to invent, so the rule is what makes it
/// mandatory and every existing account has to be given one the next time it is
/// saved. That is the same trade <c>PersonFieldRules.ValidDateOfBirth</c> documents.
///
/// <c>client/src/lib/validation/person.ts</c> mirrors the rule so the dialogs
/// refuse what the API would refuse; keep the two in step.
/// </summary>
public class EmploymentStartDateTests : IDisposable
{
    private readonly ServiceProvider _services;

    /// <summary>
    /// The rule reads its own clock, so the tests read the same one rather than
    /// pinning a date that would go stale tomorrow.
    /// </summary>
    private static DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow);

    public EmploymentStartDateTests()
    {
        var collection = new ServiceCollection();

        collection.AddLogging(b => b.SetMinimumLevel(LogLevel.Warning));
        collection.AddDbContext<AppDbContext>(options => options
            .UseInMemoryDatabase($"employment-start-date-{Guid.NewGuid()}")
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

    private sealed class FakeAccountEmailSender : IAccountEmailSender
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

    private async Task<int> GivenDepartmentAsync()
    {
        var department = new Department { Name = "Engineering", Code = "ENG", IsActive = true };
        Db.Departments.Add(department);
        await Db.SaveChangesAsync();
        Db.ChangeTracker.Clear();
        return department.Id;
    }

    private async Task GivenRolesAsync()
    {
        foreach (var role in new[] { AppRoles.Admin, AppRoles.Manager, AppRoles.Employee })
        {
            if (!await Roles.RoleExistsAsync(role))
            {
                Assert.True((await Roles.CreateAsync(new Role { Name = role })).Succeeded);
            }
        }
    }

    private async Task<User> GivenUserAsync(string email, string role, DateOnly? dateOfBirth)
    {
        await GivenRolesAsync();

        var user = new User
        {
            DisplayName = email,
            UserName = email,
            Email = email,
            EmailConfirmed = true,
            DateOfBirth = dateOfBirth,
        };

        Assert.True((await Users.CreateAsync(user, "Pa$$w0rd")).Succeeded);
        Assert.True((await Users.AddToRoleAsync(user, role)).Succeeded);
        return user;
    }

    private async Task<EmployeeProfile> GivenProfileAsync(string userId, int? departmentId)
    {
        var profile = new EmployeeProfile
        {
            UserId = userId,
            DepartmentId = departmentId,
            EmploymentStartDate = Today.AddYears(-1),
        };

        Db.EmployeeProfiles.Add(profile);
        await Db.SaveChangesAsync();
        Db.ChangeTracker.Clear();
        return profile;
    }

    /// <summary>Thirty years old, so the age rule never gets in the way by accident.</summary>
    private static DateOnly BornThirtyYearsAgo => Today.AddYears(-30);

    private static AdminCreateUserDto CreatePayload(
        string role,
        int? departmentId,
        DateOnly? employmentStartDate,
        DateOnly? dateOfBirth = null) => new()
        {
            Email = $"{role.ToLowerInvariant()}@test.local",
            DisplayName = $"New {role}",
            DepartmentId = departmentId,
            Roles = [role],
            DateOfBirth = dateOfBirth ?? BornThirtyYearsAgo,
            EmploymentStartDate = employmentStartDate,
            // Required — see UserGenderTests.
            Gender = Gender.Female,
        };

    private Task<FluentValidation.Results.ValidationResult> ValidateCreate(AdminCreateUserDto payload) =>
        new CreateAdminUserValidator(Db, Roles)
            .ValidateAsync(new CreateAdminUser.Command { User = payload });

    private Task<FluentValidation.Results.ValidationResult> ValidateEdit(EditEmployeeProfileRequest payload) =>
        new EditEmployeeProfileRequestValidator(Db)
            .ValidateAsync(new EditEmployeeProfile.Command { EmployeeProfile = payload });

    private static string Errors(FluentValidation.Results.ValidationResult result) =>
        string.Join(" | ", result.Errors.Select(e => $"{e.PropertyName}: {e.ErrorMessage}"));

    /* ── Creating a user ────────────────────────────────────────────────────── */

    /// <summary>
    /// The point of the whole change: an Employee or a Manager cannot be keyed in
    /// without a start date. Both roles, because both sit inside the department
    /// structure the Profile section describes.
    /// </summary>
    [Theory]
    [InlineData(AppRoles.Employee)]
    [InlineData(AppRoles.Manager)]
    public async Task A_non_Admin_cannot_be_created_without_an_employment_start_date(string role)
    {
        var departmentId = await GivenDepartmentAsync();
        await GivenRolesAsync();

        var result = await ValidateCreate(CreatePayload(role, departmentId, employmentStartDate: null));

        Assert.False(result.IsValid);
        Assert.Contains(PersonFieldRules.EmploymentStartDateRequiredMessage, Errors(result));
    }

    /// <summary>
    /// And an Admin is never asked. The dialog hides the Profile section for them,
    /// so a rule that demanded one would make an Admin impossible to create through
    /// the only screen that creates users.
    /// </summary>
    [Fact]
    public async Task An_Admin_can_be_created_without_an_employment_start_date()
    {
        await GivenRolesAsync();

        var result = await ValidateCreate(
            CreatePayload(AppRoles.Admin, departmentId: null, employmentStartDate: null));

        Assert.True(result.IsValid, Errors(result));
    }

    /// <summary>
    /// Refused rather than quietly dropped, matching the department beside it: the
    /// panel cannot send one, so a payload that carries it was built against a
    /// shape this does not have.
    /// </summary>
    [Fact]
    public async Task An_Admin_cannot_be_created_with_an_employment_start_date()
    {
        await GivenRolesAsync();

        var result = await ValidateCreate(
            CreatePayload(AppRoles.Admin, departmentId: null, employmentStartDate: Today));

        Assert.False(result.IsValid);
        Assert.Contains(PersonFieldRules.EmploymentStartDateNotForAdminMessage, Errors(result));
    }

    /// <summary>
    /// A start date before the person was sixteen is a typed year, not a career.
    /// Reuses the minimum age the date of birth already enforces, and is checked
    /// against the date of birth in the same payload.
    /// </summary>
    [Fact]
    public async Task An_employment_start_date_before_the_sixteenth_birthday_is_refused()
    {
        var departmentId = await GivenDepartmentAsync();
        await GivenRolesAsync();

        var dateOfBirth = Today.AddYears(-20);

        var result = await ValidateCreate(CreatePayload(
            AppRoles.Employee,
            departmentId,
            // Four years old on the day they supposedly started.
            employmentStartDate: dateOfBirth.AddYears(4),
            dateOfBirth: dateOfBirth));

        Assert.False(result.IsValid);
        Assert.Contains(PersonFieldRules.EmploymentStartDateTooYoungMessage, Errors(result));
    }

    /// <summary>
    /// The day they turn sixteen is allowed — the boundary belongs to the employee,
    /// the same way <c>LatestAllowedDateOfBirth</c> lets somebody born exactly
    /// sixteen years ago through.
    /// </summary>
    [Fact]
    public async Task An_employment_start_date_on_the_sixteenth_birthday_is_accepted()
    {
        var departmentId = await GivenDepartmentAsync();
        await GivenRolesAsync();

        var dateOfBirth = Today.AddYears(-20);

        var result = await ValidateCreate(CreatePayload(
            AppRoles.Employee,
            departmentId,
            employmentStartDate: dateOfBirth.AddYears(PersonFieldRules.MinimumAgeYears),
            dateOfBirth: dateOfBirth));

        Assert.True(result.IsValid, Errors(result));
    }

    /// <summary>
    /// A future start date is legitimate, unlike a future date of birth: an
    /// administrator keys a new hire in before their first day so the welcome email
    /// and their leave allowance are waiting for them.
    /// </summary>
    [Fact]
    public async Task A_future_employment_start_date_is_accepted()
    {
        var departmentId = await GivenDepartmentAsync();
        await GivenRolesAsync();

        var result = await ValidateCreate(
            CreatePayload(AppRoles.Employee, departmentId, employmentStartDate: Today.AddMonths(1)));

        Assert.True(result.IsValid, Errors(result));
    }

    /// <summary>
    /// No date of birth on file means no age to check against, and refusing would
    /// strand every account predating that column. The start date is still required.
    /// </summary>
    [Fact]
    public async Task An_employment_start_date_is_accepted_when_no_date_of_birth_is_known()
    {
        var departmentId = await GivenDepartmentAsync();
        await GivenRolesAsync();

        var payload = CreatePayload(AppRoles.Employee, departmentId, employmentStartDate: Today.AddYears(-5));
        payload.DateOfBirth = null;

        var result = await ValidateCreate(payload);

        // The date of birth is required in its own right, so the payload is invalid —
        // but not for the start date, which has no age to disagree with.
        Assert.DoesNotContain(nameof(AdminCreateUserDto.EmploymentStartDate), Errors(result));
    }

    /// <summary>The handler stores what the validator let through.</summary>
    [Fact]
    public async Task A_created_employee_stores_their_employment_start_date()
    {
        var departmentId = await GivenDepartmentAsync();
        await GivenRolesAsync();

        var startDate = Today.AddYears(-3);

        var result = await new CreateAdminUser.Handler(
                Db, Users, new FakeAccountEmailSender(), NullLogger<CreateAdminUser.Handler>.Instance)
            .Handle(
                new CreateAdminUser.Command
                {
                    User = CreatePayload(AppRoles.Employee, departmentId, startDate),
                },
                CancellationToken.None);

        Assert.True(result.IsSuccess, result.Error);

        var profile = await Db.EmployeeProfiles.AsNoTracking().SingleAsync();
        Assert.Equal(startDate, profile.EmploymentStartDate);
    }

    /* ── Editing a profile ──────────────────────────────────────────────────── */

    /// <summary>
    /// The same rule through the edit dialog. A full-replace payload that omits the
    /// date would otherwise clear a start date already on file.
    /// </summary>
    [Theory]
    [InlineData(AppRoles.Employee)]
    [InlineData(AppRoles.Manager)]
    public async Task A_non_Admin_profile_cannot_have_its_employment_start_date_cleared(string role)
    {
        var departmentId = await GivenDepartmentAsync();
        var user = await GivenUserAsync($"{role.ToLowerInvariant()}@edit.local", role, BornThirtyYearsAgo);
        var profile = await GivenProfileAsync(user.Id, departmentId);

        var result = await ValidateEdit(new EditEmployeeProfileRequest
        {
            Id = profile.Id,
            DepartmentId = departmentId,
            EmploymentStartDate = null,
        });

        Assert.False(result.IsValid);
        Assert.Contains(PersonFieldRules.EmploymentStartDateRequiredMessage, Errors(result));
    }

    /// <summary>
    /// A promotion to Admin arrives here with both profile fields blank — the
    /// dialog sets roles first, so the user is already an Admin by the time this
    /// runs, and the Profile section it would have read them from is gone.
    /// </summary>
    [Fact]
    public async Task An_Admin_profile_can_be_saved_with_no_employment_start_date()
    {
        var user = await GivenUserAsync("admin@edit.local", AppRoles.Admin, BornThirtyYearsAgo);
        var profile = await GivenProfileAsync(user.Id, departmentId: null);

        var result = await ValidateEdit(new EditEmployeeProfileRequest
        {
            Id = profile.Id,
            DepartmentId = null,
            EmploymentStartDate = null,
        });

        Assert.True(result.IsValid, Errors(result));
    }

    /// <summary>Refused for an Admin on this path too, matching the department.</summary>
    [Fact]
    public async Task An_Admin_profile_cannot_be_saved_with_an_employment_start_date()
    {
        var user = await GivenUserAsync("admin2@edit.local", AppRoles.Admin, BornThirtyYearsAgo);
        var profile = await GivenProfileAsync(user.Id, departmentId: null);

        var result = await ValidateEdit(new EditEmployeeProfileRequest
        {
            Id = profile.Id,
            DepartmentId = null,
            EmploymentStartDate = Today,
        });

        Assert.False(result.IsValid);
        Assert.Contains(PersonFieldRules.EmploymentStartDateNotForAdminMessage, Errors(result));
    }

    /// <summary>
    /// The age check on the edit path reads the date of birth from the database
    /// rather than the payload, which does not carry one. The dialog saves the user
    /// before the profile, so the date read here is the one just stored.
    /// </summary>
    [Fact]
    public async Task An_edited_start_date_before_the_sixteenth_birthday_is_refused()
    {
        var departmentId = await GivenDepartmentAsync();
        var dateOfBirth = Today.AddYears(-20);
        var user = await GivenUserAsync("young@edit.local", AppRoles.Employee, dateOfBirth);
        var profile = await GivenProfileAsync(user.Id, departmentId);

        var result = await ValidateEdit(new EditEmployeeProfileRequest
        {
            Id = profile.Id,
            DepartmentId = departmentId,
            EmploymentStartDate = dateOfBirth.AddYears(4),
        });

        Assert.False(result.IsValid);
        Assert.Contains(PersonFieldRules.EmploymentStartDateTooYoungMessage, Errors(result));
    }

    /// <summary>The handler writes it, so the dialog reads back what was saved.</summary>
    [Fact]
    public async Task Editing_a_profile_stores_the_employment_start_date()
    {
        var departmentId = await GivenDepartmentAsync();
        var user = await GivenUserAsync("moved@edit.local", AppRoles.Employee, BornThirtyYearsAgo);
        var profile = await GivenProfileAsync(user.Id, departmentId);

        var startDate = Today.AddYears(-7);

        var request = new EditEmployeeProfileRequest
        {
            Id = profile.Id,
            DepartmentId = departmentId,
            EmploymentStartDate = startDate,
        };

        var validation = await ValidateEdit(request);
        Assert.True(validation.IsValid, Errors(validation));

        var result = await new EditEmployeeProfile.Handler(Db)
            .Handle(new EditEmployeeProfile.Command { EmployeeProfile = request }, CancellationToken.None);

        Assert.True(result.IsSuccess, result.Error);

        Assert.Equal(startDate, await Db.EmployeeProfiles.AsNoTracking()
            .Where(ep => ep.Id == profile.Id)
            .Select(ep => ep.EmploymentStartDate)
            .SingleAsync());
    }

    /// <summary>
    /// And it comes back out. Without this the edit dialog opens on a blank field
    /// for somebody who has a start date on file, and saving — a full replace —
    /// would be refused as missing, or worse, clear it.
    /// </summary>
    [Fact]
    public async Task The_profile_list_returns_the_employment_start_date()
    {
        var departmentId = await GivenDepartmentAsync();
        var user = await GivenUserAsync("listed@edit.local", AppRoles.Employee, BornThirtyYearsAgo);
        var profile = await GivenProfileAsync(user.Id, departmentId);

        var profiles = await new GetEmployeeProfileList.Handler(Db).Handle(
            new GetEmployeeProfileList.Query { RequestingUserId = user.Id, IsAdmin = true },
            CancellationToken.None);

        Assert.Equal(
            profile.EmploymentStartDate,
            Assert.Single(profiles, p => p.Id == profile.Id).EmploymentStartDate);
    }

    /* ── Demo data ──────────────────────────────────────────────────────────── */

    /// <summary>
    /// Seeded demo staff get one, because a seeded record that the rule refuses is
    /// a demo database where every employee has to be repaired by hand before they
    /// can be saved at all.
    /// </summary>
    [Fact]
    public async Task A_demo_seed_gives_every_non_Admin_an_employment_start_date()
    {
        await DbInitializer.SeedData(Db, Users, Roles, SeedPolicy.Unrestricted(demoData: true));

        var adminId = (await Db.Users.SingleAsync(u => u.Email == "admin@annualleave.com")).Id;
        var others = await Db.EmployeeProfiles.AsNoTracking()
            .Where(ep => ep.UserId != adminId)
            .ToListAsync();

        Assert.NotEmpty(others);
        Assert.All(others, profile => Assert.NotNull(profile.EmploymentStartDate));
    }

    /// <summary>And the seeded Admin does not, since the rule refuses them one.</summary>
    [Fact]
    public async Task A_demo_seed_gives_the_Admin_no_employment_start_date()
    {
        await DbInitializer.SeedData(Db, Users, Roles, SeedPolicy.Unrestricted(demoData: true));

        var adminUser = await Db.Users.SingleAsync(u => u.Email == "admin@annualleave.com");
        var profile = await Db.EmployeeProfiles.AsNoTracking().SingleAsync(ep => ep.UserId == adminUser.Id);

        Assert.Null(profile.EmploymentStartDate);
    }

    /// <summary>
    /// A promotion to Admin clears the date it leaves behind, rather than stranding
    /// a row that still claims a start date the Admin's own dialog cannot show.
    /// </summary>
    [Fact]
    public async Task Promoting_an_employee_to_Admin_clears_their_employment_start_date()
    {
        var departmentId = await GivenDepartmentAsync();
        var user = await GivenUserAsync("promoted@edit.local", AppRoles.Employee, BornThirtyYearsAgo);
        var profile = await GivenProfileAsync(user.Id, departmentId);

        var tracked = await Users.FindByIdAsync(user.Id);
        Assert.NotNull(tracked);
        Assert.True((await Users.RemoveFromRoleAsync(tracked, AppRoles.Employee)).Succeeded);
        Assert.True((await Users.AddToRoleAsync(tracked, AppRoles.Admin)).Succeeded);

        var request = new EditEmployeeProfileRequest
        {
            Id = profile.Id,
            DepartmentId = null,
            EmploymentStartDate = null,
        };

        var validation = await ValidateEdit(request);
        Assert.True(validation.IsValid, Errors(validation));

        var result = await new EditEmployeeProfile.Handler(Db)
            .Handle(new EditEmployeeProfile.Command { EmployeeProfile = request }, CancellationToken.None);

        Assert.True(result.IsSuccess, result.Error);

        Assert.Null(await Db.EmployeeProfiles.AsNoTracking()
            .Where(ep => ep.Id == profile.Id)
            .Select(ep => ep.EmploymentStartDate)
            .SingleAsync());
    }
}
