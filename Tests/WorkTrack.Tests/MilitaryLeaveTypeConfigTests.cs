using Application.LeaveTypes.DTOs;
using Application.LeaveTypes.Validators;
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
/// Military Leave covers a call-up an employee does not choose and cannot decline:
/// national service, a reservist summons, or the training that goes with it.
///
/// Two settings carry the weight, and both are the opposite of what a leave type
/// usually wants. It must not touch the pooled balance -- a statutory obligation
/// is not a holiday, and charging it to the annual pool would spend an allowance
/// on something the employee never asked for. And it asks no notice at all, which
/// matters now that NoticePeriodRule actually refuses a request filed too late:
/// call-up papers arrive when they arrive, so any notice figure here would refuse
/// exactly the requests the type exists to record.
///
/// Deliberately not a SystemLeaveTypes entry. Nothing keys off the name -- unlike
/// Annual, Maternity and Paternity, which the allowance helpers and the parental
/// eligibility rule find by name -- so an organisation with no national service
/// can rename, disable or delete it like any other type it owns.
/// </summary>
public class MilitaryLeaveTypeConfigTests : IDisposable
{
    private readonly ServiceProvider _services;

    public MilitaryLeaveTypeConfigTests()
    {
        var collection = new ServiceCollection();

        collection.AddLogging(b => b.SetMinimumLevel(LogLevel.Warning));
        collection.AddDbContext<AppDbContext>(options => options
            .UseInMemoryDatabase($"military-leave-type-{Guid.NewGuid()}")
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

    private Task Seed() => DbInitializer.SeedData(
        Db, Users, Roles, SeedPolicy.For("Development", demoData: false, allowInProduction: false));

    /// <summary>
    /// A fresh database and a migrated one must agree, the same pairing
    /// ConfigurePaternityPerChildEntitlement needed: the migration inserts the row
    /// into databases that already exist, and this holds the seeder's copy so a
    /// fresh clone comes up with the same policy rather than none at all.
    /// </summary>
    [Fact]
    public async Task The_seeded_military_type_carries_the_call_up_policy()
    {
        await Seed();

        var military = await Db.LeaveTypes.SingleAsync(lt => lt.Name == "Military Leave");

        // A call-up is not a holiday: it must not spend the annual pool.
        Assert.False(military.AffectsBalance);
        Assert.True(military.Paid);
        // The call-up papers. Safe to require on a brand new type, which has no
        // existing requests to strand -- the retroactive bite AttachmentPolicyRule
        // warns about needs rows that predate the policy.
        Assert.Equal(AttachmentPolicy.Required, military.AttachmentPolicy);
        // Enforced by NoticePeriodRule, where 0 means no limit rather than none allowed.
        Assert.Equal(0, military.MinNoticeDays);
        Assert.Equal(30, military.MaxConsecutiveDays);
        Assert.False(military.HalfDayAllowed);
        Assert.True(military.RequiresManagerApproval);
        Assert.True(military.IsActive);
        Assert.Equal("military", military.ColorKey);
    }

    /// <summary>
    /// The per-child ledger belongs to the two parental types alone, and a type
    /// carrying both it and the pooled balance would charge one day twice.
    /// </summary>
    [Fact]
    public async Task The_seeded_military_type_keeps_no_per_child_ledger()
    {
        await Seed();

        var military = await Db.LeaveTypes.SingleAsync(lt => lt.Name == "Military Leave");

        Assert.False(military.PerChildEntitlement);
    }

    /// <summary>
    /// Seeding is skipped wholesale once any leave type exists, so a second run
    /// must not plant a duplicate -- which would break the name uniqueness the
    /// upsert validator enforces and leave two rows an admin cannot tell apart.
    /// </summary>
    [Fact]
    public async Task Seeding_twice_leaves_one_military_type()
    {
        await Seed();
        await Seed();

        Assert.Equal(1, await Db.LeaveTypes.CountAsync(lt => lt.Name == "Military Leave"));
    }

    /// <summary>
    /// Nothing finds this type by name, so freezing the name would cost an
    /// organisation without national service the ability to repurpose or remove it.
    /// </summary>
    [Fact]
    public void Military_leave_is_not_a_protected_system_type()
    {
        Assert.False(SystemLeaveTypes.IsSystem("Military Leave"));
    }

    /// <summary>
    /// The seeded settings must survive a round trip through the edit dialog: an
    /// admin who opens the type and saves it back unchanged must not be refused.
    /// </summary>
    [Fact]
    public async Task The_seeded_configuration_passes_the_upsert_validator()
    {
        await Seed();
        var military = await Db.LeaveTypes.SingleAsync(lt => lt.Name == "Military Leave");

        var result = new UpsertLeaveTypeRequestValidator().Validate(new UpsertLeaveTypeRequest
        {
            Name = military.Name,
            RequiresManagerApproval = military.RequiresManagerApproval,
            IsActive = military.IsActive,
            AffectsBalance = military.AffectsBalance,
            Icon = military.Icon,
            ColorKey = military.ColorKey,
            Description = military.Description,
            Paid = military.Paid,
            AttachmentPolicy = military.AttachmentPolicy,
            DefaultAllowance = military.DefaultAllowance,
            AllowanceUnit = military.AllowanceUnit,
            MaxCarryoverDays = military.MaxCarryoverDays,
            PerChildEntitlement = military.PerChildEntitlement,
            PerChildTotalWeeks = military.PerChildTotalWeeks,
            PerChildWeeksPerYear = military.PerChildWeeksPerYear,
            ChildEligibleUntilAge = military.ChildEligibleUntilAge,
            AccrualNotes = military.AccrualNotes,
            MinNoticeDays = military.MinNoticeDays,
            MaxConsecutiveDays = military.MaxConsecutiveDays,
            HalfDayAllowed = military.HalfDayAllowed,
        });

        Assert.True(result.IsValid, string.Join("; ", result.Errors.Select(e => e.ErrorMessage)));
    }
}
