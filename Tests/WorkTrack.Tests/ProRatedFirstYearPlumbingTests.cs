using Application.AdminUsers.Commands;
using Application.AdminUsers.DTOs;
using Application.Core;
using Application.EmployeeProfiles.Commands;
using Application.EmployeeProfiles.DTOs;
using Application.EmployeeProfiles.Queries;
using Application.LeaveTypes.Commands;
using Application.LeaveTypes.DTOs;
using Application.LeaveTypes.Queries;
using Application.LeaveTypes.Validators;
using AutoMapper;
using Domain;
using Domain.Interfaces;
using Domain.Services;
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
/// <c>LeaveType.ProRateFirstYear</c> has to travel the whole way round — dialog to
/// column to list — and every writer of <c>LeaveBalance</c> has to read it: hire,
/// a start-date edit, and the switch itself being flipped. The stored entitlement
/// is never pro-rated; the balance and the figure the screens quote are.
/// </summary>
public class ProRatedFirstYearPlumbingTests : IDisposable
{
    private const int AnnualLeaveTypeId = 1;
    private readonly ServiceProvider _services;

    private static DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow);

    /// <summary>The first of this month — inside the current January leave year, whenever the suite runs.</summary>
    private static DateOnly FirstOfThisMonth => new(Today.Year, Today.Month, 1);

    /// <summary>What a 23-day allowance pro-rates to for somebody who joined on <see cref="FirstOfThisMonth"/>.</summary>
    private static decimal ProRatedNow =>
        LeaveCalculationService.ProRateFirstYearEntitlement(23, FirstOfThisMonth, Today.Year, startMonth: 1);

    public ProRatedFirstYearPlumbingTests()
    {
        var collection = new ServiceCollection();
        collection.AddLogging(b => b.SetMinimumLevel(LogLevel.Warning));
        collection.AddDbContext<AppDbContext>(options => options
            .UseInMemoryDatabase($"pro-rate-{Guid.NewGuid()}")
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

    private static IMapper BuildMapper() =>
        new MapperConfiguration(cfg => cfg.AddProfile<MappingProfiles>(), NullLoggerFactory.Instance).CreateMapper();

    private sealed class FakeAccountEmailSender : IAccountEmailSender
    {
        public string BuildClientUrl(string route, IDictionary<string, string?>? query = null) => $"https://test.local{route}";
        public Task<bool> SendWelcomeInviteAsync(User user, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendPasswordResetAsync(User user, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> SendEmailChangeConfirmationAsync(User user, string newEmail, string apiBaseUrlFallback, CancellationToken cancellationToken = default) => Task.FromResult(true);
    }

    private async Task GivenAnnualLeaveAsync(bool proRate)
    {
        Db.LeaveTypes.Add(new LeaveType
        {
            Id = AnnualLeaveTypeId, Name = "Annual Leave", IsActive = true, RequiresManagerApproval = true,
            AffectsBalance = true, DefaultAllowance = 23, ProRateFirstYear = proRate,
        });
        await Db.SaveChangesAsync();
        Db.ChangeTracker.Clear();
    }

    private async Task<EmployeeProfile> GivenProfileAsync(string userId, DateOnly? start)
    {
        // The profile list joins the user row, so a profile needs one to be listed.
        Db.Users.Add(new User { Id = userId, UserName = userId, Email = $"{userId}@test.local", DisplayName = userId });
        var profile = new EmployeeProfile
        {
            UserId = userId, AnnualLeaveEntitlement = 23, LeaveBalance = 23, EmploymentStartDate = start,
        };
        Db.EmployeeProfiles.Add(profile);
        await Db.SaveChangesAsync();
        Db.ChangeTracker.Clear();
        return profile;
    }

    private static UpsertLeaveTypeRequest AnnualLeaveRequest(bool proRate, bool affectsBalance = true) => new()
    {
        Name = "Annual Leave", IsActive = true, RequiresManagerApproval = true,
        AffectsBalance = affectsBalance, DefaultAllowance = 23, ProRateFirstYear = proRate,
    };

    private Task<Result<LeaveTypeDto>> UpdateAnnualLeave(bool proRate) =>
        new UpdateLeaveType.Handler(Db, BuildMapper())
            .Handle(new UpdateLeaveType.Command { Id = AnnualLeaveTypeId, LeaveType = AnnualLeaveRequest(proRate) }, CancellationToken.None);

    private async Task<decimal> StoredBalance(string profileId) =>
        await Db.EmployeeProfiles.AsNoTracking().Where(p => p.Id == profileId).Select(p => p.LeaveBalance).SingleAsync();

    /* ── Validator ─────────────────────────────────────────────────────────── */

    /// <summary>
    /// Every type with an allowance of its own may pro-rate it. Only the balance type
    /// is *enforced* by the server; for the others the switch scales the figure the
    /// balance rows quote, which is all their allowance ever did.
    /// </summary>
    [Fact]
    public void The_switch_is_accepted_on_a_type_that_does_not_affect_the_balance()
    {
        var request = new UpsertLeaveTypeRequest { Name = "Sick Leave", DefaultAllowance = 10, AffectsBalance = false, ProRateFirstYear = true };

        var result = new UpsertLeaveTypeRequestValidator().Validate(request);

        Assert.DoesNotContain(result.Errors, e => e.PropertyName == nameof(UpsertLeaveTypeRequest.ProRateFirstYear));
    }

    /// <summary>A per-child budget is bounded by the child's age, not the leave year — there is nothing to pro-rate.</summary>
    [Fact]
    public void The_switch_is_refused_on_a_per_child_type()
    {
        var request = new UpsertLeaveTypeRequest
        {
            Name = "Paternity Leave", PerChildEntitlement = true, PerChildTotalWeeks = 18, PerChildWeeksPerYear = 5,
            ChildEligibleUntilAge = 15, AvailableTo = GenderAvailability.Male, ProRateFirstYear = true,
        };

        var result = new UpsertLeaveTypeRequestValidator().Validate(request);

        Assert.Contains(result.Errors, e => e.PropertyName == nameof(UpsertLeaveTypeRequest.ProRateFirstYear));
    }

    [Fact]
    public void The_switch_is_accepted_on_the_balance_type()
    {
        var result = new UpsertLeaveTypeRequestValidator().Validate(AnnualLeaveRequest(proRate: true));

        Assert.DoesNotContain(result.Errors, e => e.PropertyName == nameof(UpsertLeaveTypeRequest.ProRateFirstYear));
    }

    /* ── Round trip ────────────────────────────────────────────────────────── */

    [Fact]
    public async Task The_switch_saved_through_the_update_handler_is_what_the_list_reads_back()
    {
        await GivenAnnualLeaveAsync(proRate: false);

        var updated = await UpdateAnnualLeave(proRate: true);
        Assert.True(updated.IsSuccess, updated.Error);
        Assert.True(updated.Value!.ProRateFirstYear);

        Db.ChangeTracker.Clear();
        var listed = await new GetLeaveTypeList.Handler(Db).Handle(new GetLeaveTypeList.Query(), CancellationToken.None);

        Assert.True(Assert.Single(listed).ProRateFirstYear);
    }

    /* ── Flipping the switch re-syncs every balance ────────────────────────── */

    [Fact]
    public async Task Turning_the_switch_on_pro_rates_this_years_joiners_and_leaves_everyone_else_whole()
    {
        await GivenAnnualLeaveAsync(proRate: false);
        var joiner = await GivenProfileAsync("joiner", FirstOfThisMonth);
        var veteran = await GivenProfileAsync("veteran", Today.AddYears(-5));

        var result = await UpdateAnnualLeave(proRate: true);
        Assert.True(result.IsSuccess, result.Error);

        Assert.Equal(ProRatedNow, await StoredBalance(joiner.Id));
        Assert.Equal(23m, await StoredBalance(veteran.Id));
        // The stored entitlement is untouched: next year is full on its own.
        Assert.Equal(23, await Db.EmployeeProfiles.AsNoTracking().Where(p => p.Id == joiner.Id).Select(p => p.AnnualLeaveEntitlement).SingleAsync());
    }

    [Fact]
    public async Task Turning_the_switch_off_restores_the_full_balance()
    {
        await GivenAnnualLeaveAsync(proRate: true);
        var joiner = await GivenProfileAsync("joiner", FirstOfThisMonth);
        // The row was seeded with the switch already on and a balance of 23; the
        // sync the switch triggers is what brings it down, so flip it on "again"
        // through the handler first. Saving with no change to the flag must not
        // re-sync, which the next assertion also checks by expecting the drop.
        Db.LeaveTypes.Single(lt => lt.Id == AnnualLeaveTypeId).ProRateFirstYear = false;
        await Db.SaveChangesAsync();
        Db.ChangeTracker.Clear();
        Assert.True((await UpdateAnnualLeave(proRate: true)).IsSuccess);
        Assert.Equal(ProRatedNow, await StoredBalance(joiner.Id));

        var result = await UpdateAnnualLeave(proRate: false);
        Assert.True(result.IsSuccess, result.Error);

        Assert.Equal(23m, await StoredBalance(joiner.Id));
    }

    /* ── Hire ──────────────────────────────────────────────────────────────── */

    [Fact]
    public async Task A_new_hire_this_month_is_stamped_the_full_entitlement_and_a_pro_rated_balance()
    {
        await GivenAnnualLeaveAsync(proRate: true);
        foreach (var role in new[] { AppRoles.SystemAdministrator, AppRoles.Manager, AppRoles.Employee })
            Assert.True((await Roles.CreateAsync(new Role { Name = role })).Succeeded);
        var department = new Department { Name = "Engineering", Code = "ENG", IsActive = true };
        Db.Departments.Add(department);
        await Db.SaveChangesAsync();

        var result = await new CreateAdminUser.Handler(Db, Users, new FakeAccountEmailSender(), NullLogger<CreateAdminUser.Handler>.Instance)
            .Handle(new CreateAdminUser.Command
            {
                User = new AdminCreateUserDto
                {
                    Email = "new@test.local", DisplayName = "New Joiner", DepartmentId = department.Id,
                    Roles = [AppRoles.Employee], DateOfBirth = Today.AddYears(-30), Gender = Gender.Female,
                    EmploymentStartDate = FirstOfThisMonth,
                },
            }, CancellationToken.None);
        Assert.True(result.IsSuccess, result.Error);

        var profile = await Db.EmployeeProfiles.AsNoTracking().SingleAsync();
        Assert.Equal(23, profile.AnnualLeaveEntitlement);
        Assert.Equal(ProRatedNow, profile.LeaveBalance);
    }

    /* ── Editing the start date ────────────────────────────────────────────── */

    [Fact]
    public async Task Moving_the_start_date_into_this_year_re_syncs_the_balance()
    {
        await GivenAnnualLeaveAsync(proRate: true);
        var profile = await GivenProfileAsync("moved", Today.AddYears(-5));

        var result = await new EditEmployeeProfile.Handler(Db).Handle(new EditEmployeeProfile.Command
        {
            EmployeeProfile = new EditEmployeeProfileRequest { Id = profile.Id, DepartmentId = null, EmploymentStartDate = FirstOfThisMonth },
        }, CancellationToken.None);
        Assert.True(result.IsSuccess, result.Error);

        Assert.Equal(ProRatedNow, await StoredBalance(profile.Id));
    }

    /* ── What the screens quote ────────────────────────────────────────────── */

    [Fact]
    public async Task The_profile_list_quotes_this_years_pro_rated_entitlement_beside_the_stored_one()
    {
        await GivenAnnualLeaveAsync(proRate: true);
        await GivenProfileAsync("joiner", FirstOfThisMonth);
        await GivenProfileAsync("veteran", Today.AddYears(-5));

        var listed = await new GetEmployeeProfileList.Handler(Db)
            .Handle(new GetEmployeeProfileList.Query { RequestingUserId = "admin", IsAdmin = true }, CancellationToken.None);

        var joiner = listed.Single(p => p.UserId == "joiner");
        var veteran = listed.Single(p => p.UserId == "veteran");
        Assert.Equal(23, joiner.AnnualLeaveEntitlement);
        Assert.Equal(ProRatedNow, joiner.CurrentYearEntitlement);
        Assert.Equal(23m, veteran.CurrentYearEntitlement);
    }

    [Fact]
    public async Task With_the_switch_off_the_quoted_entitlement_is_the_stored_one()
    {
        await GivenAnnualLeaveAsync(proRate: false);
        await GivenProfileAsync("joiner", FirstOfThisMonth);

        var listed = await new GetEmployeeProfileList.Handler(Db)
            .Handle(new GetEmployeeProfileList.Query { RequestingUserId = "admin", IsAdmin = true }, CancellationToken.None);

        Assert.Equal(23m, Assert.Single(listed).CurrentYearEntitlement);
    }
}
