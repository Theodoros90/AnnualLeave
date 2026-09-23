using Application.AdminUsers.Commands;
using Application.AdminUsers.DTOs;
using Application.AdminUsers.Validators;
using Application.Core;
using Application.Departments.Commands;
using Application.EmployeeProfiles.Commands;
using Application.EmployeeProfiles.DTOs;
using Application.EmployeeProfiles.Validators;
using Domain;
using Domain.Interfaces;
using MediatR;
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
/// A System Administrator sits outside the department structure: the role sees every department,
/// so belonging to one grants nothing. The admin panel has always said so — it
/// hides the whole Profile section for a System Administrator — but
/// <c>EmployeeProfile.DepartmentId</c> was a required foreign key, so
/// <c>CreateUserDialog</c> substituted "the first active department" for a field it
/// never showed, and the seeder wrote Engineering unconditionally.
///
/// That invented assignment was not inert. It put the admin in the department's
/// team strip and headcount on the Departments panel, in its "not checked in"
/// warning and its leave-used figures, and it counted as an <c>employee</c> blocker
/// in <c>DeleteDepartment</c> — a department the admin had never worked in could
/// not be deleted, and the admin could not be moved out of it through any field the
/// panel offered.
///
/// So the column is nullable and null is what a System Administrator gets. These cover the two
/// halves that had to change deliberately: which roles the validators require a
/// department from, and clearing the rows already written.
/// </summary>
public class AdminHasNoDepartmentTests : IDisposable
{
    private readonly ServiceProvider _services;

    public AdminHasNoDepartmentTests()
    {
        var collection = new ServiceCollection();

        collection.AddLogging(b => b.SetMinimumLevel(LogLevel.Warning));
        collection.AddDbContext<AppDbContext>(options => options
            .UseInMemoryDatabase($"admin-no-department-{Guid.NewGuid()}")
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

    private async Task<int> GivenDepartmentAsync(string name = "Engineering", string code = "ENG")
    {
        var department = new Department { Name = name, Code = code, IsActive = true };
        Db.Departments.Add(department);
        await Db.SaveChangesAsync();
        Db.ChangeTracker.Clear();
        return department.Id;
    }

    private async Task GivenRolesAsync()
    {
        foreach (var role in AppRoles.All)
        {
            if (!await Roles.RoleExistsAsync(role))
            {
                Assert.True((await Roles.CreateAsync(new Role { Name = role })).Succeeded);
            }
        }
    }

    private async Task<User> GivenUserAsync(string email, string role)
    {
        await GivenRolesAsync();

        var user = new User { DisplayName = email, UserName = email, Email = email, EmailConfirmed = true };
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
        };

        Db.EmployeeProfiles.Add(profile);
        await Db.SaveChangesAsync();
        Db.ChangeTracker.Clear();
        return profile;
    }

    private static AdminCreateUserDto CreatePayload(string role, int? departmentId) => new()
    {
        Email = $"{role.Replace(" ", "").ToLowerInvariant()}@test.local",
        DisplayName = $"New {role}",
        DepartmentId = departmentId,
        Roles = [role],
        // Required since the field became mandatory — see PersonFieldValidationTests.
        DateOfBirth = DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-30),
        // Likewise for everyone but an administrator (System or HR), who is refused one — see UserGenderTests.
        Gender = AppRoles.IsAdministrator(role) ? null : Gender.Female,
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
    /// The field the dialog never shows must be one the API accepts as blank —
    /// otherwise the only way to create a System Administrator is to invent a department for
    /// them, which is exactly what the client was doing.
    /// </summary>
    [Fact]
    public async Task An_Admin_can_be_created_without_a_department()
    {
        await GivenDepartmentAsync();
        await GivenRolesAsync();

        var result = await ValidateCreate(CreatePayload(AppRoles.SystemAdministrator, departmentId: null));

        Assert.True(result.IsValid, Errors(result));
    }

    /// <summary>
    /// And the profile that gets written records the absence, rather than a
    /// placeholder that reads as a real assignment everywhere downstream.
    /// </summary>
    [Fact]
    public async Task A_created_Admin_gets_a_profile_with_no_department()
    {
        await GivenDepartmentAsync();
        await GivenRolesAsync();

        var result = await new CreateAdminUser.Handler(
                Db, Users, new FakeAccountEmailSender(), NullLogger<CreateAdminUser.Handler>.Instance)
            .Handle(
                new CreateAdminUser.Command { User = CreatePayload(AppRoles.SystemAdministrator, departmentId: null) },
                CancellationToken.None);

        Assert.True(result.IsSuccess, result.Error);

        var profile = await Db.EmployeeProfiles.AsNoTracking().SingleAsync();
        Assert.Null(profile.DepartmentId);
        // The profile itself still exists: a System Administrator books their own leave against
        // it, and it is the foreign key their leave and timesheet history hangs on.
        // No annual-leave type is seeded here, so the entitlement is the compiled-in
        // fallback rather than an allowance — and must never be a 0, which would
        // switch their balance check off (AnnualLeaveBalanceCalculator).
        Assert.Equal(CreateAdminUser.Handler.DefaultEntitlement, profile.AnnualLeaveEntitlement);
    }

    /// <summary>
    /// Blank is a licence for System Administrators only. Relaxing the rule for everyone would let
    /// an Employee through with no department, which is the field their manager,
    /// their leave routing and their project visibility are all derived from.
    /// </summary>
    [Theory]
    [InlineData(AppRoles.Employee)]
    [InlineData(AppRoles.Manager)]
    public async Task A_non_Admin_still_cannot_be_created_without_a_department(string role)
    {
        await GivenDepartmentAsync();
        await GivenRolesAsync();

        var result = await ValidateCreate(CreatePayload(role, departmentId: null));

        Assert.False(result.IsValid);
        Assert.Contains("Department is required.", Errors(result));
    }

    /// <summary>
    /// Refused rather than quietly dropped. The panel cannot send one, so a request
    /// that carries a department for a System Administrator was built against the old shape — and
    /// silently ignoring it would recreate the invisible assignment this removes.
    /// </summary>
    [Theory]
    [InlineData(AppRoles.SystemAdministrator)]
    [InlineData(AppRoles.HrAdministrator)]
    public async Task An_Admin_cannot_be_created_with_a_department(string role)
    {
        var departmentId = await GivenDepartmentAsync();
        await GivenRolesAsync();

        var result = await ValidateCreate(CreatePayload(role, departmentId));

        Assert.False(result.IsValid);
        Assert.Contains("A System or HR Administrator cannot belong to a department.", Errors(result));
    }

    /* ── Editing a profile ──────────────────────────────────────────────────── */

    /// <summary>
    /// The same rule on the way through the edit dialog, which is the path a
    /// promotion to System Administrator takes: roles are set first, then the profile is saved, so
    /// by the time this validator runs the user is already a System Administrator.
    /// </summary>
    [Fact]
    public async Task An_Admin_profile_can_be_saved_with_no_department()
    {
        var user = await GivenUserAsync("admin@test.local", AppRoles.SystemAdministrator);
        var profile = await GivenProfileAsync(user.Id, departmentId: null);

        var result = await ValidateEdit(new EditEmployeeProfileRequest
        {
            Id = profile.Id,
            DepartmentId = null,
        });

        Assert.True(result.IsValid, Errors(result));
    }

    /// <summary>
    /// A promotion clears the department it leaves behind, rather than stranding a
    /// row that still names the department the admin no longer belongs to.
    /// </summary>
    [Fact]
    public async Task Promoting_an_employee_to_Admin_clears_their_department()
    {
        var departmentId = await GivenDepartmentAsync();
        var user = await GivenUserAsync("promoted@test.local", AppRoles.Employee);
        var profile = await GivenProfileAsync(user.Id, departmentId);

        // The dialog sets roles first, so the user is a System Administrator by the time the
        // profile save lands. Re-read rather than reuse: GivenProfileAsync clears
        // the change tracker, so the instance above is detached.
        var tracked = await Users.FindByIdAsync(user.Id);
        Assert.NotNull(tracked);
        Assert.True((await Users.RemoveFromRoleAsync(tracked, AppRoles.Employee)).Succeeded);
        Assert.True((await Users.AddToRoleAsync(tracked, AppRoles.SystemAdministrator)).Succeeded);

        var request = new EditEmployeeProfileRequest
        {
            Id = profile.Id,
            DepartmentId = null,
        };

        var validation = await ValidateEdit(request);
        Assert.True(validation.IsValid, Errors(validation));

        var result = await new EditEmployeeProfile.Handler(Db)
            .Handle(new EditEmployeeProfile.Command { EmployeeProfile = request }, CancellationToken.None);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Null(await Db.EmployeeProfiles.AsNoTracking()
            .Where(ep => ep.Id == profile.Id)
            .Select(ep => ep.DepartmentId)
            .SingleAsync());
    }

    /// <summary>
    /// Demoting the other way has to supply one: the department is where an
    /// Employee's manager and leave routing come from, so a blank would leave them
    /// invisible to every manager.
    /// </summary>
    [Fact]
    public async Task A_non_Admin_profile_cannot_have_its_department_cleared()
    {
        var departmentId = await GivenDepartmentAsync();
        var user = await GivenUserAsync("employee@test.local", AppRoles.Employee);
        var profile = await GivenProfileAsync(user.Id, departmentId);

        var result = await ValidateEdit(new EditEmployeeProfileRequest
        {
            Id = profile.Id,
            DepartmentId = null,
        });

        Assert.False(result.IsValid);
        Assert.Contains("DepartmentId is required.", Errors(result));
    }

    [Theory]
    [InlineData(AppRoles.SystemAdministrator)]
    [InlineData(AppRoles.HrAdministrator)]
    public async Task An_Admin_profile_cannot_be_given_a_department(string role)
    {
        var departmentId = await GivenDepartmentAsync();
        var user = await GivenUserAsync("admin@test.local", role);
        var profile = await GivenProfileAsync(user.Id, departmentId: null);

        var result = await ValidateEdit(new EditEmployeeProfileRequest
        {
            Id = profile.Id,
            DepartmentId = departmentId,
        });

        Assert.False(result.IsValid);
        Assert.Contains("A System or HR Administrator cannot belong to a department.", Errors(result));
    }

    /* ── The seeder, and rows already written ───────────────────────────────── */

    /// <summary>
    /// The seeder gave the admin Engineering in every environment, which is how the
    /// deployed site got an admin sitting in a department nobody had put them in.
    /// </summary>
    [Fact]
    public async Task The_seeded_admin_profile_has_no_department()
    {
        await DbInitializer.SeedData(Db, Users, Roles, SeedPolicy.Unrestricted(demoData: true));

        var adminUser = await Db.Users.SingleAsync(u => u.Email == "systemadmin@annualleave.com");
        var profile = await Db.EmployeeProfiles.AsNoTracking().SingleAsync(ep => ep.UserId == adminUser.Id);

        Assert.Null(profile.DepartmentId);
    }

    /// <summary>
    /// Demo employees and managers keep theirs, so the seeder has not simply
    /// stopped assigning departments.
    /// </summary>
    [Fact]
    public async Task A_demo_seed_still_places_non_admins_in_departments()
    {
        await DbInitializer.SeedData(Db, Users, Roles, SeedPolicy.Unrestricted(demoData: true));

        // Both administrators — the System Administrator and the demo HR Administrator —
        // sit outside the department structure, so the rule is asserted on everyone else.
        var administratorEmails = new List<string> { "systemadmin@annualleave.com", DbInitializer.HrAdministratorDemoEmail };
        var adminIds = await Db.Users.Where(u => administratorEmails.Contains(u.Email!)).Select(u => u.Id).ToListAsync();
        Assert.Equal(2, adminIds.Count);
        var others = await Db.EmployeeProfiles.AsNoTracking()
            .Where(ep => !adminIds.Contains(ep.UserId))
            .ToListAsync();

        Assert.NotEmpty(others);
        Assert.All(others, profile => Assert.NotNull(profile.DepartmentId));

        // And the demo HR Administrator got a department-less profile from EnsureAdministratorProfiles.
        var hrAdminId = (await Db.Users.SingleAsync(u => u.Email == DbInitializer.HrAdministratorDemoEmail)).Id;
        var hrProfile = await Db.EmployeeProfiles.AsNoTracking().SingleAsync(ep => ep.UserId == hrAdminId);
        Assert.Null(hrProfile.DepartmentId);
    }

    /// <summary>
    /// A database seeded before this change still holds the invented assignment, and
    /// no field in the panel can clear it — the Profile section is hidden for
    /// System Administrators. So the seed run repairs it, the way the non-manager
    /// <c>UserDepartments</c> rows are repaired.
    /// </summary>
    [Fact]
    public async Task A_seed_run_clears_a_department_an_admin_already_had()
    {
        var departmentId = await GivenDepartmentAsync("Finance", "FIN");
        var admin = await GivenUserAsync("legacy.admin@test.local", AppRoles.SystemAdministrator);
        var profile = await GivenProfileAsync(admin.Id, departmentId);

        await DbInitializer.SeedData(Db, Users, Roles, SeedPolicy.Unrestricted(demoData: false));

        Assert.Null(await Db.EmployeeProfiles.AsNoTracking()
            .Where(ep => ep.Id == profile.Id)
            .Select(ep => ep.DepartmentId)
            .SingleAsync());
    }

    /// <summary>
    /// And leaves everyone else's alone — the repair has to tell a System Administrator apart
    /// from anybody else, not clear the column wholesale.
    /// </summary>
    [Fact]
    public async Task A_seed_run_leaves_a_managers_department_alone()
    {
        var departmentId = await GivenDepartmentAsync("Finance", "FIN");
        var manager = await GivenUserAsync("real.manager@test.local", AppRoles.Manager);
        var profile = await GivenProfileAsync(manager.Id, departmentId);

        await DbInitializer.SeedData(Db, Users, Roles, SeedPolicy.Unrestricted(demoData: false));

        Assert.Equal(departmentId, await Db.EmployeeProfiles.AsNoTracking()
            .Where(ep => ep.Id == profile.Id)
            .Select(ep => ep.DepartmentId)
            .SingleAsync());
    }

    /* ── The payoff ─────────────────────────────────────────────────────────── */

    /// <summary>
    /// The blocker that could not be cleared. <c>DeleteDepartment</c> counts every
    /// profile pointing at the department as an "employee", and the admin's
    /// invented row counted — so a department with nobody real in it refused to be
    /// deleted, and the panel offered no way to move the admin out.
    /// </summary>
    [Fact]
    public async Task A_department_with_only_a_department_less_admin_can_be_deleted()
    {
        var departmentId = await GivenDepartmentAsync();
        var admin = await GivenUserAsync("admin@test.local", AppRoles.SystemAdministrator);
        await GivenProfileAsync(admin.Id, departmentId: null);

        var result = await new DeleteDepartment.Handler(Db)
            .Handle(new DeleteDepartment.Command { Id = departmentId }, CancellationToken.None);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Empty(await Db.Departments.Where(d => d.Id == departmentId).ToListAsync());
    }

    /// <summary>
    /// A real employee still blocks it, so the count has not simply been loosened.
    /// </summary>
    [Fact]
    public async Task A_department_with_a_real_employee_still_cannot_be_deleted()
    {
        var departmentId = await GivenDepartmentAsync();
        var employee = await GivenUserAsync("employee@test.local", AppRoles.Employee);
        await GivenProfileAsync(employee.Id, departmentId);

        var result = await new DeleteDepartment.Handler(Db)
            .Handle(new DeleteDepartment.Command { Id = departmentId }, CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Contains("1 employee", result.Error);
    }
}
