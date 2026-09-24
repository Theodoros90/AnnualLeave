using Application.AnnualLeaves.Commands;
using Application.AnnualLeaves.DTOs;
using Application.Core;
using AutoMapper;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// The two approval switches through the handlers: where a request is filed,
/// where an Approve lands it, who is emailed, and what the balance does. The
/// table itself lives in ApprovalStageRuleTests; this is the plumbing.
/// </summary>
public class ApprovalStageHandlerTests
{
    private const int Dept = 1;
    private const int ManagerOnlyType = 1;
    private const int HrOnlyType = 2;
    private const int BothType = 3;

    private const string Employee = "u-emp";
    private const string EmployeeProfile = "p-emp";
    private const string Manager = "u-mgr";
    private const string Hr = "u-hr";
    private const string Delegate = "u-del";

    private static readonly DateTime Start = new(2026, 6, 1); // Monday
    private static readonly DateTime End = new(2026, 6, 5);   // Friday: 5 business days

    private static IMapper Mapper() =>
        new MapperConfiguration(cfg => cfg.AddProfile<MappingProfiles>(), NullLoggerFactory.Instance).CreateMapper();

    private static async Task<AppDbContext> WorldAsync()
    {
        var db = TestDb.Create();
        db.AppSettings.Add(new AppSettings { Id = 1, LeaveYearStartMonth = 1 });
        db.Departments.Add(new Department { Id = Dept, Name = "Engineering", Code = "ENG" });
        db.Roles.AddRange(
            new Role { Id = "r-hr", Name = AppRoles.HrAdministrator, NormalizedName = AppRoles.HrAdministrator.ToUpperInvariant() },
            new Role { Id = "r-mgr", Name = AppRoles.Manager, NormalizedName = AppRoles.Manager.ToUpperInvariant() });
        db.Users.AddRange(
            new User { Id = Employee, UserName = Employee, Email = "emp@t.local", DisplayName = "Maria Ioannou" },
            new User { Id = Manager, UserName = Manager, Email = "mgr@t.local", DisplayName = "Nikos Manager" },
            new User { Id = Hr, UserName = Hr, Email = "hr@t.local", DisplayName = "Helen HR" },
            new User { Id = Delegate, UserName = Delegate, Email = "del@t.local", DisplayName = "Andreas Georgiou" });
        db.UserRoles.AddRange(
            new UserRole { UserId = Hr, RoleId = "r-hr" },
            new UserRole { UserId = Manager, RoleId = "r-mgr" });
        db.EmployeeProfiles.AddRange(
            new EmployeeProfile { Id = EmployeeProfile, UserId = Employee, DepartmentId = Dept, AnnualLeaveEntitlement = 20, LeaveBalance = 20 },
            new EmployeeProfile { Id = "p-mgr", UserId = Manager, DepartmentId = Dept, AnnualLeaveEntitlement = 20, LeaveBalance = 20 },
            new EmployeeProfile { Id = "p-del", UserId = Delegate, DepartmentId = Dept, AnnualLeaveEntitlement = 20, LeaveBalance = 20 },
            new EmployeeProfile { Id = "p-hr", UserId = Hr, DepartmentId = null });
        db.UserDepartments.Add(new UserDepartment { UserId = Hr, DepartmentId = Dept });
        db.LeaveTypes.AddRange(
            new LeaveType { Id = ManagerOnlyType, Name = "Annual Leave", IsActive = true, AffectsBalance = true, DefaultAllowance = 20, RequiresManagerApproval = true, RequiresHrApproval = false },
            new LeaveType { Id = HrOnlyType, Name = "Sabbatical", IsActive = true, AffectsBalance = false, DefaultAllowance = 10, RequiresManagerApproval = false, RequiresHrApproval = true },
            new LeaveType { Id = BothType, Name = "Unpaid Leave", IsActive = true, AffectsBalance = true, DefaultAllowance = 20, RequiresManagerApproval = true, RequiresHrApproval = true });
        await db.SaveChangesAsync();
        return db;
    }

    private static Task<Result<string>> CreateAsync(AppDbContext db, FakeEmailService email, int leaveTypeId) =>
        new CreateAnnualLeave.Handler(db, Mapper(), email).Handle(new CreateAnnualLeave.Command
        {
            AnnualLeave = new CreateAnnualLeaveRequest
            {
                EmployeeId = Employee, LeaveTypeId = leaveTypeId, StartDate = Start, EndDate = End,
                Reason = "Family trip", DelegateId = Delegate,
            },
        }, CancellationToken.None);

    private static async Task<AnnualLeave> SeedLeaveAsync(AppDbContext db, int leaveTypeId, AnnualLeaveStatus status, string id = "L1")
    {
        var leave = new AnnualLeave
        {
            Id = id, EmployeeId = Employee, EmployeeProfileId = EmployeeProfile, DepartmentId = Dept,
            LeaveTypeId = leaveTypeId, StartDate = Start, EndDate = End, Reason = "Family trip",
            DelegateId = Delegate, Status = status, CreatedAt = DateTime.UtcNow,
        };
        db.AnnualLeaves.Add(leave);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        return leave;
    }

    private static Task<Result<Unit>> DecideAsync(AppDbContext db, FakeEmailService email, string leaveId, AnnualLeaveStatus status, bool asHr) =>
        new UpdateLeaveStatus.Handler(db, email).Handle(new UpdateLeaveStatus.Command
        {
            LeaveId = leaveId,
            ChangedByUserId = asHr ? Hr : Manager,
            IsAdmin = asHr,
            IsManager = !asHr,
            Request = new UpdateLeaveStatusRequest { Status = status },
        }, CancellationToken.None);

    private static async Task<AnnualLeave> StoredAsync(AppDbContext db, string id = "L1") =>
        (await db.AnnualLeaves.AsNoTracking().FirstAsync(l => l.Id == id));

    private static async Task<decimal> BalanceAsync(AppDbContext db) =>
        (await db.EmployeeProfiles.AsNoTracking().FirstAsync(p => p.Id == EmployeeProfile)).LeaveBalance;

    // ── Filing ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task A_manager_only_type_is_filed_pending_and_the_manager_is_told()
    {
        using var db = await WorldAsync();
        var email = new FakeEmailService();

        var result = await CreateAsync(db, email, ManagerOnlyType);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.Pending, (await StoredAsync(db, result.Value!)).Status);
        Assert.Contains(email.Sent, m => m.Recipient == "mgr@t.local" && m.Subject.StartsWith("New leave request"));
        Assert.DoesNotContain(email.Sent, m => m.Recipient == "hr@t.local");
    }

    [Fact]
    public async Task An_hr_only_type_is_filed_straight_into_the_hr_stage_and_hr_is_told()
    {
        using var db = await WorldAsync();
        var email = new FakeEmailService();

        var result = await CreateAsync(db, email, HrOnlyType);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.AwaitingHrApproval, (await StoredAsync(db, result.Value!)).Status);
        var toHr = Assert.Single(email.Sent, m => m.Recipient == "hr@t.local");
        Assert.Equal(HrApprovalNotification.Subject, toHr.Subject);
        Assert.Contains("Family trip", toHr.HtmlBody);
        Assert.DoesNotContain(email.Sent, m => m.Recipient == "mgr@t.local");
        Assert.Equal(20m, await BalanceAsync(db));
    }

    [Fact]
    public async Task A_type_needing_both_is_filed_pending()
    {
        using var db = await WorldAsync();

        var result = await CreateAsync(db, new FakeEmailService(), BothType);

        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(AnnualLeaveStatus.Pending, (await StoredAsync(db, result.Value!)).Status);
    }
}
