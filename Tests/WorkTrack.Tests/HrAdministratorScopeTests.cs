using Application.AnnualLeaves.Commands;
using Application.AnnualLeaves.DTOs;
using Application.AnnualLeaves.Queries;
using Application.Core;
using AutoMapper;
using Domain;
using Microsoft.Extensions.Logging.Abstractions;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// An HR Administrator assigned department A sees and decides A's leave and is
/// refused B's, exactly as a Manager of A would be. Their profile has no
/// department; the scope is UserDepartment rows alone.
/// </summary>
public class HrAdministratorScopeTests
{
    private const string Hr = "hr";
    private const int A = 1;
    private const int B = 2;

    private static AppDbContext SeedWorld()
    {
        var db = TestDb.Create();
        db.Departments.AddRange(
            new Department { Id = A, Name = "A", Code = "A" },
            new Department { Id = B, Name = "B", Code = "B" });
        db.Users.AddRange(
            new User { Id = Hr, UserName = "hr", Email = "hr@t.local", DisplayName = "HR" },
            new User { Id = "ua", UserName = "ua", Email = "ua@t.local", DisplayName = "Anna A" },
            new User { Id = "ub", UserName = "ub", Email = "ub@t.local", DisplayName = "Ben B" });
        db.EmployeeProfiles.AddRange(
            new EmployeeProfile { Id = "hr-p", UserId = Hr, DepartmentId = null },
            new EmployeeProfile { Id = "pa", UserId = "ua", DepartmentId = A, AnnualLeaveEntitlement = 20, LeaveBalance = 20 },
            new EmployeeProfile { Id = "pb", UserId = "ub", DepartmentId = B, AnnualLeaveEntitlement = 20, LeaveBalance = 20 });
        db.UserDepartments.Add(new UserDepartment { UserId = Hr, DepartmentId = A });
        db.LeaveTypes.Add(new LeaveType { Id = 1, Name = "Annual Leave", IsActive = true, AffectsBalance = true, DefaultAllowance = 20, RequiresApproval = true });
        db.AnnualLeaves.AddRange(
            new AnnualLeave { Id = "la", EmployeeId = "ua", EmployeeProfileId = "pa", DepartmentId = A, LeaveTypeId = 1, StartDate = new DateTime(2026, 10, 5), EndDate = new DateTime(2026, 10, 6), Status = AnnualLeaveStatus.Pending, CreatedAt = DateTime.UtcNow },
            new AnnualLeave { Id = "lb", EmployeeId = "ub", EmployeeProfileId = "pb", DepartmentId = B, LeaveTypeId = 1, StartDate = new DateTime(2026, 10, 5), EndDate = new DateTime(2026, 10, 6), Status = AnnualLeaveStatus.Pending, CreatedAt = DateTime.UtcNow });
        db.SaveChanges();
        return db;
    }

    private static IMapper Mapper() =>
        new MapperConfiguration(cfg => cfg.AddProfile<MappingProfiles>(), NullLoggerFactory.Instance).CreateMapper();

    [Fact]
    public async Task The_leave_list_shows_only_the_assigned_departments()
    {
        using var db = SeedWorld();

        var page = await new GetAnnualLeaveList.Handler(db, Mapper()).Handle(new GetAnnualLeaveList.Query
        {
            RequestingUserId = Hr, IsAdmin = false, IsManager = true, IsEmployee = false,
        }, CancellationToken.None);

        Assert.Equal(["la"], page.Items.Select(l => l.Id));
    }

    [Fact]
    public async Task Approving_inside_the_scope_succeeds_and_outside_is_refused()
    {
        using var db = SeedWorld();
        var handler = new UpdateLeaveStatus.Handler(db, new FakeEmailService());

        var inside = await handler.Handle(new UpdateLeaveStatus.Command
        {
            LeaveId = "la", ChangedByUserId = Hr, IsAdmin = true, IsManager = false,
            Request = new UpdateLeaveStatusRequest { Status = AnnualLeaveStatus.Approved },
        }, CancellationToken.None);
        var outside = await handler.Handle(new UpdateLeaveStatus.Command
        {
            LeaveId = "lb", ChangedByUserId = Hr, IsAdmin = true, IsManager = false,
            Request = new UpdateLeaveStatusRequest { Status = AnnualLeaveStatus.Approved },
        }, CancellationToken.None);

        Assert.True(inside.IsSuccess, inside.Error);
        Assert.False(outside.IsSuccess);
        Assert.Equal(AnnualLeaveStatus.Pending, (await db.AnnualLeaves.FindAsync("lb"))!.Status);
    }

    [Fact]
    public async Task Cancelling_somebody_elses_leave_outside_the_scope_is_refused()
    {
        using var db = SeedWorld();
        var handler = new DeleteAnnualLeave.Handler(db);

        var outside = await handler.Handle(new DeleteAnnualLeave.Command { Id = "lb", RequestingUserId = Hr, IsAdmin = true }, CancellationToken.None);
        var inside = await handler.Handle(new DeleteAnnualLeave.Command { Id = "la", RequestingUserId = Hr, IsAdmin = true }, CancellationToken.None);

        Assert.False(outside.IsSuccess);
        Assert.True(inside.IsSuccess, inside.Error);
    }

    [Fact]
    public async Task Filing_on_behalf_of_somebody_outside_the_scope_is_refused()
    {
        using var db = SeedWorld();
        var handler = new CreateAnnualLeave.Handler(db, Mapper(), new FakeEmailService());

        var outside = await handler.Handle(new CreateAnnualLeave.Command
        {
            RequestingUserId = Hr,
            AnnualLeave = new CreateAnnualLeaveRequest
            {
                EmployeeId = "ub", LeaveTypeId = 1,
                StartDate = new DateTime(2026, 11, 2), EndDate = new DateTime(2026, 11, 3), Reason = "x",
            },
        }, CancellationToken.None);

        Assert.False(outside.IsSuccess);
        Assert.Contains("assigned departments", outside.Error);
    }
}
