using Application.AdminUsers.Commands;
using Application.AdminUsers.DTOs;
using Application.AdminUsers.Queries;
using Application.AdminUsers.Validators;
using Application.Core;
using Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// An HR Administrator is assigned the departments they run, as UserDepartment rows.
/// The rule follows DepartmentId's shape: required (at least one) for an HR
/// Administrator, refused for every other role — a System Administrator sees
/// everything, an Employee and a Manager already have a department, and a Manager's
/// extra rows are not this feature's to edit.
/// </summary>
public class HrDepartmentAssignmentTests : IDisposable
{
    private readonly ServiceProvider _services;

    public HrDepartmentAssignmentTests()
    {
        var collection = new ServiceCollection();
        collection.AddLogging(b => b.SetMinimumLevel(LogLevel.Warning));
        collection.AddDbContext<AppDbContext>(options => options
            .UseInMemoryDatabase($"hr-departments-{Guid.NewGuid()}")
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

    private const int Engineering = 1;
    private const int Finance = 2;
    private const int Archived = 3;

    private async Task SeedAsync()
    {
        Db.Departments.AddRange(
            new Department { Id = Engineering, Name = "Engineering", Code = "ENG", IsActive = true },
            new Department { Id = Finance, Name = "Finance", Code = "FIN", IsActive = true },
            new Department { Id = Archived, Name = "Old", Code = "OLD", IsActive = false });
        await Db.SaveChangesAsync();
        foreach (var role in AppRoles.All) await Roles.CreateAsync(new Role { Name = role });
        Db.ChangeTracker.Clear();
    }

    private async Task<User> GivenUserAsync(string email, string role)
    {
        var user = new User { UserName = email, Email = email, DisplayName = email, EmailConfirmed = true };
        Assert.True((await Users.CreateAsync(user)).Succeeded);
        Assert.True((await Users.AddToRoleAsync(user, role)).Succeeded);
        return user;
    }

    private Task<FluentValidation.Results.ValidationResult> ValidateAssign(string userId, params int[] ids) =>
        new SetAdminUserDepartmentsValidator(Db).ValidateAsync(new SetAdminUserDepartments.Command
        {
            Id = userId,
            Departments = new AdminSetUserDepartmentsDto { DepartmentIds = ids.ToList() },
            RequestingUserId = "sysadmin",
        });

    private Task<Result<AdminUserDto>> Assign(string userId, params int[] ids) =>
        new SetAdminUserDepartments.Handler(Users, Db).Handle(new SetAdminUserDepartments.Command
        {
            Id = userId,
            Departments = new AdminSetUserDepartmentsDto { DepartmentIds = ids.ToList() },
            RequestingUserId = "sysadmin",
        }, CancellationToken.None);

    [Fact]
    public async Task Assigning_no_department_is_refused()
    {
        await SeedAsync();
        var hr = await GivenUserAsync("hr@test.local", AppRoles.HrAdministrator);

        var result = await ValidateAssign(hr.Id);

        Assert.Contains(result.Errors, e => e.ErrorMessage == HrDepartmentScopeRules.DepartmentsRequiredMessage);
    }

    [Fact]
    public async Task Assigning_an_unknown_or_inactive_department_is_refused()
    {
        await SeedAsync();
        var hr = await GivenUserAsync("hr@test.local", AppRoles.HrAdministrator);

        Assert.Contains((await ValidateAssign(hr.Id, Engineering, 999)).Errors,
            e => e.ErrorMessage == HrDepartmentScopeRules.UnknownDepartmentMessage);
        Assert.Contains((await ValidateAssign(hr.Id, Archived)).Errors,
            e => e.ErrorMessage == HrDepartmentScopeRules.UnknownDepartmentMessage);
    }

    /// <summary>
    /// A department deactivated after it was assigned is still the HR
    /// Administrator's to keep. The dialog keeps such a department selectable and
    /// the edit mutation re-sends the whole set on every save, so demanding
    /// IsActive for it would 400 a phone-number edit — after the role call had
    /// already committed.
    /// </summary>
    [Fact]
    public async Task Keeping_an_already_assigned_department_that_was_deactivated_is_allowed()
    {
        await SeedAsync();
        var hr = await GivenUserAsync("hr@test.local", AppRoles.HrAdministrator);
        Db.UserDepartments.Add(new UserDepartment { UserId = hr.Id, DepartmentId = Archived });
        await Db.SaveChangesAsync();

        var result = await ValidateAssign(hr.Id, Engineering, Archived);

        Assert.True(result.IsValid, string.Join(", ", result.Errors.Select(e => e.ErrorMessage)));
    }

    /// <summary>
    /// And only for the one they already hold: a deactivated department is not
    /// something a System Administrator may newly assign.
    /// </summary>
    [Fact]
    public async Task Newly_assigning_a_deactivated_department_is_still_refused()
    {
        await SeedAsync();
        var hr = await GivenUserAsync("hr@test.local", AppRoles.HrAdministrator);

        var result = await ValidateAssign(hr.Id, Archived);

        Assert.Contains(result.Errors, e => e.ErrorMessage == HrDepartmentScopeRules.UnknownDepartmentMessage);
    }

    [Fact]
    public async Task Assigning_replaces_the_set_and_records_who_did_it()
    {
        await SeedAsync();
        var hr = await GivenUserAsync("hr@test.local", AppRoles.HrAdministrator);
        Db.UserDepartments.Add(new UserDepartment { UserId = hr.Id, DepartmentId = Finance });
        await Db.SaveChangesAsync();

        var result = await Assign(hr.Id, Engineering, Engineering);

        Assert.True(result.IsSuccess, result.Error);
        var rows = await Db.UserDepartments.Where(ud => ud.UserId == hr.Id).ToListAsync();
        var row = Assert.Single(rows);
        Assert.Equal(Engineering, row.DepartmentId);
        Assert.Equal("sysadmin", row.AssignedByUserId);
        Assert.Equal([Engineering], result.Value!.DepartmentIds);
    }

    [Theory]
    [InlineData(AppRoles.SystemAdministrator)]
    [InlineData(AppRoles.Manager)]
    [InlineData(AppRoles.Employee)]
    public async Task Assigning_departments_to_any_other_role_is_refused(string role)
    {
        await SeedAsync();
        var user = await GivenUserAsync("someone@test.local", role);

        var result = await Assign(user.Id, Engineering);

        Assert.False(result.IsSuccess);
        Assert.Equal(ResultErrorKind.Invalid, result.ErrorKind);
        Assert.Contains(HrDepartmentScopeRules.DepartmentsNotForRoleMessage, result.Error);
        Assert.Empty(await Db.UserDepartments.ToListAsync());
    }

    [Fact]
    public async Task Normalize_drops_duplicates_and_non_positive_ids()
    {
        Assert.Equal(new[] { 2, 5 }, HrDepartmentScopeRules.Normalize([5, 2, 5, 0, -1]));
        Assert.Empty(HrDepartmentScopeRules.Normalize(null));
    }

    private static AdminCreateUserDto CreatePayload(string role, List<int>? departmentIds) => new()
    {
        Email = $"{Guid.NewGuid():N}@test.local",
        DisplayName = "New Person",
        Roles = [role],
        DepartmentIds = departmentIds,
        DepartmentId = AppRoles.IsAdministrator(role) ? null : Engineering,
        DateOfBirth = DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-30),
        EmploymentStartDate = AppRoles.IsAdministrator(role) ? null : DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-1),
        Gender = AppRoles.IsAdministrator(role) ? null : Gender.Female,
    };

    private Task<FluentValidation.Results.ValidationResult> ValidateCreate(AdminCreateUserDto payload) =>
        new CreateAdminUserValidator(Db, Roles).ValidateAsync(new CreateAdminUser.Command { User = payload });

    [Fact]
    public async Task Creating_an_HR_Administrator_without_departments_is_refused()
    {
        await SeedAsync();

        var none = await ValidateCreate(CreatePayload(AppRoles.HrAdministrator, null));
        var empty = await ValidateCreate(CreatePayload(AppRoles.HrAdministrator, []));

        Assert.Contains(none.Errors, e => e.ErrorMessage == HrDepartmentScopeRules.DepartmentsRequiredMessage);
        Assert.Contains(empty.Errors, e => e.ErrorMessage == HrDepartmentScopeRules.DepartmentsRequiredMessage);
    }

    [Theory]
    [InlineData(AppRoles.SystemAdministrator)]
    [InlineData(AppRoles.Manager)]
    [InlineData(AppRoles.Employee)]
    public async Task Creating_any_other_role_with_departments_is_refused(string role)
    {
        await SeedAsync();

        var result = await ValidateCreate(CreatePayload(role, [Engineering]));

        Assert.Contains(result.Errors, e => e.ErrorMessage == HrDepartmentScopeRules.DepartmentsNotForRoleMessage);
    }

    [Fact]
    public async Task Creating_an_HR_Administrator_writes_their_department_rows()
    {
        await SeedAsync();
        var payload = CreatePayload(AppRoles.HrAdministrator, [Finance, Engineering]);
        Assert.True((await ValidateCreate(payload)).IsValid);

        var result = await new CreateAdminUser.Handler(Db, Users, new NoInviteMail(), Microsoft.Extensions.Logging.Abstractions.NullLogger<CreateAdminUser.Handler>.Instance)
            .Handle(new CreateAdminUser.Command { User = payload }, CancellationToken.None);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal([Engineering, Finance], result.Value!.DepartmentIds);
        var rows = await Db.UserDepartments.Where(ud => ud.UserId == result.Value.Id).Select(ud => ud.DepartmentId).OrderBy(id => id).ToListAsync();
        Assert.Equal([Engineering, Finance], rows);
    }

    private sealed class NoInviteMail : Domain.Interfaces.IAccountEmailSender
    {
        public string BuildClientUrl(string route, IDictionary<string, string?>? query = null) => $"https://test.local{route}";
        public Task<bool> SendWelcomeInviteAsync(User user, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendPasswordResetAsync(User user, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendEmailChangeConfirmationAsync(User user, string newEmail, string apiBaseUrlFallback, CancellationToken cancellationToken = default) => Task.FromResult(true);
    }

    [Fact]
    public async Task The_user_list_carries_each_persons_department_ids_and_scopes_to_an_HR_caller()
    {
        await SeedAsync();
        var hr = await GivenUserAsync("hr@test.local", AppRoles.HrAdministrator);
        var eng = await GivenUserAsync("eng@test.local", AppRoles.Employee);
        var fin = await GivenUserAsync("fin@test.local", AppRoles.Employee);
        Db.EmployeeProfiles.AddRange(
            new EmployeeProfile { Id = "hr-p", UserId = hr.Id, DepartmentId = null },
            new EmployeeProfile { Id = "eng-p", UserId = eng.Id, DepartmentId = Engineering },
            new EmployeeProfile { Id = "fin-p", UserId = fin.Id, DepartmentId = Finance });
        Db.UserDepartments.Add(new UserDepartment { UserId = hr.Id, DepartmentId = Engineering });
        await Db.SaveChangesAsync();

        var all = await new GetAdminUserList.Handler(Users, Db).Handle(new GetAdminUserList.Query(), CancellationToken.None);
        Assert.Equal([Engineering], all.Single(u => u.Id == hr.Id).DepartmentIds);
        Assert.Equal(3, all.Count);

        var scoped = await new GetAdminUserList.Handler(Users, Db).Handle(
            new GetAdminUserList.Query { RequestingUserId = hr.Id, ScopeToCaller = true }, CancellationToken.None);
        Assert.Equal(new[] { eng.Id, hr.Id }.OrderBy(x => x), scoped.Select(u => u.Id).OrderBy(x => x));

        var outOfScope = await new GetAdminUserDetail.Handler(Users, Db).Handle(
            new GetAdminUserDetail.Query { Id = fin.Id, RequestingUserId = hr.Id, ScopeToCaller = true }, CancellationToken.None);
        Assert.False(outOfScope.IsSuccess);
    }
}
