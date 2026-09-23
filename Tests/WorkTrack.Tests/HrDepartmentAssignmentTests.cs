using Application.AdminUsers.Commands;
using Application.AdminUsers.DTOs;
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
}
