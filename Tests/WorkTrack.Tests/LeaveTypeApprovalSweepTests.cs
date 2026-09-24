using Application.Core;
using Application.LeaveTypes.Commands;
using Application.LeaveTypes.DTOs;
using AutoMapper;
using Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// What happens to requests already in flight when an admin changes a type's
/// approval switches. Turning every switch off approves everything open (as the
/// one-switch sweep always did); turning HR off approves what was with HR, whose
/// manager stage is done; turning Manager off while HR stays on moves Pending
/// rows to HR, since there is no manager stage left to clear. Turning a switch
/// on moves nothing.
/// </summary>
public class LeaveTypeApprovalSweepTests
{
    private const int TypeId = 1;

    private static IMapper Mapper() =>
        new MapperConfiguration(cfg => cfg.AddProfile<MappingProfiles>(), NullLoggerFactory.Instance).CreateMapper();

    private static async Task<AppDbContext> WorldAsync(bool manager, bool hr)
    {
        var db = TestDb.Create();
        db.AppSettings.Add(new AppSettings { Id = 1, LeaveYearStartMonth = 1 });
        db.LeaveTypes.Add(new LeaveType { Id = TypeId, Name = "Unpaid Leave", IsActive = true, AffectsBalance = false, DefaultAllowance = 10, RequiresManagerApproval = manager, RequiresHrApproval = hr });
        db.EmployeeProfiles.AddRange(
            new EmployeeProfile { Id = "p1", UserId = "u1", AnnualLeaveEntitlement = 20, LeaveBalance = 20 },
            new EmployeeProfile { Id = "p2", UserId = "u2", AnnualLeaveEntitlement = 20, LeaveBalance = 20 });
        db.AnnualLeaves.AddRange(
            new AnnualLeave { Id = "pending", EmployeeId = "u1", EmployeeProfileId = "p1", LeaveTypeId = TypeId, Status = AnnualLeaveStatus.Pending, StartDate = new DateTime(2026, 6, 1), EndDate = new DateTime(2026, 6, 5), Reason = "a" },
            new AnnualLeave { Id = "with-hr", EmployeeId = "u2", EmployeeProfileId = "p2", LeaveTypeId = TypeId, Status = AnnualLeaveStatus.AwaitingHrApproval, StartDate = new DateTime(2026, 7, 6), EndDate = new DateTime(2026, 7, 10), Reason = "b" });
        await db.SaveChangesAsync();
        return db;
    }

    private static Task<Result<LeaveTypeDto>> SaveAsync(AppDbContext db, bool manager, bool hr) =>
        new UpdateLeaveType.Handler(db, Mapper()).Handle(new UpdateLeaveType.Command
        {
            Id = TypeId,
            LeaveType = new UpsertLeaveTypeRequest
            {
                Name = "Unpaid Leave", IsActive = true, AffectsBalance = false, DefaultAllowance = 10,
                RequiresManagerApproval = manager, RequiresHrApproval = hr,
            },
        }, CancellationToken.None);

    private static async Task<AnnualLeaveStatus> StatusAsync(AppDbContext db, string id) =>
        (await db.AnnualLeaves.AsNoTracking().FirstAsync(l => l.Id == id)).Status;

    [Fact]
    public async Task Turning_every_switch_off_approves_everything_open()
    {
        using var db = await WorldAsync(manager: true, hr: true);

        var result = await SaveAsync(db, manager: false, hr: false);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.Approved, await StatusAsync(db, "pending"));
        Assert.Equal(AnnualLeaveStatus.Approved, await StatusAsync(db, "with-hr"));
        Assert.Equal(2, await db.LeaveStatusHistories.CountAsync());
    }

    [Fact]
    public async Task Turning_hr_off_approves_what_was_with_hr_and_leaves_pending_alone()
    {
        using var db = await WorldAsync(manager: true, hr: true);

        var result = await SaveAsync(db, manager: true, hr: false);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.Pending, await StatusAsync(db, "pending"));
        Assert.Equal(AnnualLeaveStatus.Approved, await StatusAsync(db, "with-hr"));
    }

    [Fact]
    public async Task Turning_manager_off_while_hr_stays_on_sends_pending_to_hr()
    {
        using var db = await WorldAsync(manager: true, hr: true);

        var result = await SaveAsync(db, manager: false, hr: true);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.AwaitingHrApproval, await StatusAsync(db, "pending"));
        Assert.Equal(AnnualLeaveStatus.AwaitingHrApproval, await StatusAsync(db, "with-hr"));
        var history = await db.LeaveStatusHistories.SingleAsync();
        Assert.Equal("pending", history.AnnualLeaveId);
        Assert.Equal(AnnualLeaveStatus.AwaitingHrApproval, history.NewStatus);
    }

    [Fact]
    public async Task Turning_a_switch_on_moves_nothing()
    {
        using var db = await WorldAsync(manager: true, hr: false);
        // A stray with-hr row cannot exist on a manager-only type, but the seed has
        // one; the point is that switching HR *on* leaves both rows where they are.
        var result = await SaveAsync(db, manager: true, hr: true);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.Pending, await StatusAsync(db, "pending"));
        Assert.Equal(AnnualLeaveStatus.AwaitingHrApproval, await StatusAsync(db, "with-hr"));
        Assert.Equal(0, await db.LeaveStatusHistories.CountAsync());
    }
}
