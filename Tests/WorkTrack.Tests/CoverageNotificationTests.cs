using Application.AnnualLeaves.Commands;
using Application.AnnualLeaves.DTOs;
using Application.Core;
using AutoMapper;
using Domain;
using Microsoft.Extensions.Logging.Abstractions;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// Coverage announcements: who hears that a colleague is away and who is covering
/// for them.
///
/// Nominating a delegate used to be a private note on the request — stored, shown
/// in a detail drawer, and told to nobody. These tests describe the emails that
/// go out instead, and just as importantly the ones that do not: a pending request
/// announces nothing, because a rejected one would have announced a lie.
/// </summary>
public class CoverageNotificationTests
{
    private const int DepartmentId = 4;
    private const int OtherDepartmentId = 9;
    private const int LeaveTypeId = 7;

    private const string EmployeeUserId = "u-employee";
    private const string EmployeeProfileId = "p-employee";
    private const string DelegateUserId = "u-delegate";
    private const string ColleagueUserId = "u-colleague";
    private const string AdminUserId = "u-admin";
    private const string LeaveId = "L-1";

    private const string EmployeeEmail = "maria@test.local";
    private const string DelegateEmail = "andreas@test.local";
    private const string ColleagueEmail = "petros@test.local";
    private const string OutsiderEmail = "outsider@test.local";
    private const string AdminEmail = "admin@test.local";

    private static readonly DateTime LeaveStart = new(2024, 3, 4);
    private static readonly DateTime LeaveEnd = new(2024, 3, 8);

    private static IMapper BuildMapper() =>
        new MapperConfiguration(
            cfg => cfg.AddProfile<MappingProfiles>(),
            NullLoggerFactory.Instance).CreateMapper();

    /// <summary>
    /// One department with four people in it — the employee going away, the
    /// colleague they nominate, a bystander and a leaver whose account is switched
    /// off — plus somebody in another department who is none of the team's
    /// business.
    /// </summary>
    private static async Task<AppDbContext> SeedWorldAsync(bool requiresApproval)
    {
        var db = TestDb.Create();

        db.Departments.Add(new Department { Id = DepartmentId, Name = "Engineering", Code = "ENG" });
        db.Departments.Add(new Department { Id = OtherDepartmentId, Name = "Finance", Code = "FIN" });

        AddPerson(db, EmployeeUserId, EmployeeProfileId, "Maria Ioannou", EmployeeEmail, DepartmentId);
        AddPerson(db, DelegateUserId, "p-delegate", "Andreas Georgiou", DelegateEmail, DepartmentId);
        AddPerson(db, ColleagueUserId, "p-colleague", "Petros Christou", ColleagueEmail, DepartmentId);
        AddPerson(db, "u-outsider", "p-outsider", "Elena Pavlou", OutsiderEmail, OtherDepartmentId);

        // A System Administrator has a profile with no department at all — the shape the domain
        // requires, and the one that makes "the same department as nobody" a trap
        // worth a seeded example rather than a comment.
        db.Users.Add(new User
        {
            Id = AdminUserId,
            UserName = AdminEmail,
            Email = AdminEmail,
            DisplayName = "Chris System Administrator",
        });
        db.EmployeeProfiles.Add(new EmployeeProfile
        {
            Id = "p-admin",
            UserId = AdminUserId,
            DepartmentId = null,
            AnnualLeaveEntitlement = 25,
            LeaveBalance = 25,
        });

        // These tests also use this user as the caller behind IsAdmin = true on
        // UpdateLeaveStatus/EditAnnualLeave — that flag is now the HR Administrator
        // acting on somebody's behalf, scoped to their assigned departments, so the
        // caller needs a UserDepartment row over the leave's department to still be
        // let through. The profile itself stays department-less, which is what the
        // "same department as nobody" test right below relies on.
        db.UserDepartments.Add(new UserDepartment { UserId = AdminUserId, DepartmentId = DepartmentId });

        db.LeaveTypes.Add(new LeaveType
        {
            Id = LeaveTypeId,
            Name = "Annual Leave",
            IsActive = true,
            AffectsBalance = true,
            RequiresManagerApproval = requiresApproval,
        });

        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        return db;
    }

    private static void AddPerson(
        AppDbContext db, string userId, string profileId, string name, string email, int departmentId)
    {
        db.Users.Add(new User { Id = userId, UserName = email, Email = email, DisplayName = name });
        db.EmployeeProfiles.Add(new EmployeeProfile
        {
            Id = profileId,
            UserId = userId,
            DepartmentId = departmentId,
            AnnualLeaveEntitlement = 25,
            LeaveBalance = 25,
        });
    }

    private static CreateAnnualLeave.Command CreateCmd(string? delegateId, string reason = "Family trip to Greece") => new()
    {
        AnnualLeave = new CreateAnnualLeaveRequest
        {
            EmployeeId = EmployeeUserId,
            LeaveTypeId = LeaveTypeId,
            StartDate = LeaveStart,
            EndDate = LeaveEnd,
            Reason = reason,
            DelegateId = delegateId,
        },
    };

    [Fact]
    public async Task Approved_leave_tells_the_nominated_delegate_they_are_covering()
    {
        await using var db = await SeedWorldAsync(requiresApproval: false);
        var mail = new FakeEmailService();

        var result = await new CreateAnnualLeave.Handler(db, BuildMapper(), mail)
            .Handle(CreateCmd(DelegateUserId), CancellationToken.None);

        Assert.True(result.IsSuccess);

        var toDelegate = Assert.Single(mail.Sent, sent => sent.Recipient == DelegateEmail);
        Assert.Contains("Maria Ioannou", toDelegate.TextBody!, StringComparison.Ordinal);
        Assert.Contains("04 Mar 2024", toDelegate.TextBody!, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Approved_leave_tells_the_department_who_is_covering()
    {
        await using var db = await SeedWorldAsync(requiresApproval: false);
        var mail = new FakeEmailService();

        var result = await new CreateAnnualLeave.Handler(db, BuildMapper(), mail)
            .Handle(CreateCmd(DelegateUserId), CancellationToken.None);

        Assert.True(result.IsSuccess);

        var toColleague = Assert.Single(mail.Sent, sent => sent.Recipient == ColleagueEmail);
        Assert.Contains("Maria Ioannou", toColleague.TextBody!, StringComparison.Ordinal);
        Assert.Contains("Andreas Georgiou", toColleague.TextBody!, StringComparison.Ordinal);

        // Another department's absences are not this team's noticeboard, and
        // neither the traveller nor the delegate needs the round-robin copy.
        Assert.DoesNotContain(mail.Sent, sent => sent.Recipient == OutsiderEmail);
        Assert.DoesNotContain(mail.Sent, sent => sent.Recipient == EmployeeEmail);
        Assert.Single(mail.Sent, sent => sent.Recipient == DelegateEmail);
    }

    /* ── The other two ways a leave becomes approved ─────────────────────────── */

    /// <summary>
    /// An open request. The tests that have the HR Administrator approve it seed it
    /// in the HR stage: a Pending row on a type that asks for the manager is the
    /// manager's to decide, not HR's (<see cref="ApprovalStageRule.WithManagerMessage"/>).
    /// </summary>
    private static void SeedPendingLeave(
        AppDbContext db, string? delegateId, string reason = "Family trip to Greece", AnnualLeaveStatus status = AnnualLeaveStatus.Pending)
    {
        db.AnnualLeaves.Add(new AnnualLeave
        {
            Id = LeaveId,
            EmployeeId = EmployeeUserId,
            EmployeeProfileId = EmployeeProfileId,
            DepartmentId = DepartmentId,
            LeaveTypeId = LeaveTypeId,
            Status = status,
            StartDate = LeaveStart,
            EndDate = LeaveEnd,
            Reason = reason,
            DelegateId = delegateId,
        });
    }

    [Fact]
    public async Task A_manager_approving_a_request_announces_the_coverage()
    {
        await using var db = await SeedWorldAsync(requiresApproval: true);
        SeedPendingLeave(db, DelegateUserId, status: AnnualLeaveStatus.AwaitingHrApproval);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var mail = new FakeEmailService();

        var result = await new UpdateLeaveStatus.Handler(db, mail).Handle(
            new UpdateLeaveStatus.Command
            {
                LeaveId = LeaveId,
                ChangedByUserId = AdminUserId,
                IsAdmin = true,
                Request = new UpdateLeaveStatusRequest { Status = AnnualLeaveStatus.Approved },
            },
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Single(mail.Sent, sent => sent.Recipient == DelegateEmail);
        Assert.Single(mail.Sent, sent => sent.Recipient == ColleagueEmail);

        // The employee hears once — that their request was approved — and is not
        // also told about their own absence.
        Assert.Single(mail.Sent, sent => sent.Recipient == EmployeeEmail);
    }

    [Fact]
    public async Task An_admin_approving_through_the_edit_dialog_announces_the_coverage()
    {
        await using var db = await SeedWorldAsync(requiresApproval: true);
        SeedPendingLeave(db, DelegateUserId, status: AnnualLeaveStatus.AwaitingHrApproval);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var mail = new FakeEmailService();

        var result = await new EditAnnualLeave.Handler(db, mail).Handle(
            new EditAnnualLeave.Command
            {
                AnnualLeave = new EditAnnualLeaveRequest
                {
                    Id = LeaveId,
                    LeaveTypeId = LeaveTypeId,
                    StartDate = LeaveStart,
                    EndDate = LeaveEnd,
                    Reason = "Family trip to Greece",
                    DelegateId = DelegateUserId,
                    Status = AnnualLeaveStatus.Approved,
                },
                ChangedByUserId = AdminUserId,
                IsAdmin = true,
            },
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Single(mail.Sent, sent => sent.Recipient == DelegateEmail);
        Assert.Single(mail.Sent, sent => sent.Recipient == ColleagueEmail);
    }

    /* ── Coverage that changes after the announcement ────────────────────────── */

    [Fact]
    public async Task Swapping_the_delegate_on_approved_leave_tells_the_new_one_only()
    {
        await using var db = await SeedWorldAsync(requiresApproval: true);
        SeedPendingLeave(db, DelegateUserId);
        db.AnnualLeaves.Local.Single().Status = AnnualLeaveStatus.Approved;
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var mail = new FakeEmailService();

        var result = await new EditAnnualLeave.Handler(db, mail).Handle(
            new EditAnnualLeave.Command
            {
                AnnualLeave = new EditAnnualLeaveRequest
                {
                    Id = LeaveId,
                    LeaveTypeId = LeaveTypeId,
                    StartDate = LeaveStart,
                    EndDate = LeaveEnd,
                    Reason = "Family trip to Greece",
                    DelegateId = ColleagueUserId,
                },
                ChangedByUserId = AdminUserId,
                IsAdmin = true,
            },
            CancellationToken.None);

        Assert.True(result.IsSuccess);

        // The colleague now covers and is told so.
        Assert.Single(mail.Sent, sent => sent.Recipient == ColleagueEmail);

        // The department already knows about the absence; only the name on the
        // coverage changed, which is not everybody's business a second time.
        Assert.DoesNotContain(mail.Sent, sent => sent.Recipient == EmployeeEmail);
        Assert.Single(mail.Sent);
    }

    [Fact]
    public async Task Cancelling_approved_leave_tells_the_delegate_they_are_off_the_hook()
    {
        await using var db = await SeedWorldAsync(requiresApproval: true);
        SeedPendingLeave(db, DelegateUserId);
        db.AnnualLeaves.Local.Single().Status = AnnualLeaveStatus.Approved;
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var mail = new FakeEmailService();

        var result = await new UpdateLeaveStatus.Handler(db, mail).Handle(
            new UpdateLeaveStatus.Command
            {
                LeaveId = LeaveId,
                ChangedByUserId = AdminUserId,
                IsAdmin = true,
                Request = new UpdateLeaveStatusRequest { Status = AnnualLeaveStatus.Cancelled },
                // Before the leave starts: one that has begun can no longer be cancelled.
                NowUtc = LeaveStart.AddDays(-7),
            },
            CancellationToken.None);

        Assert.True(result.IsSuccess);

        var toDelegate = Assert.Single(mail.Sent, sent => sent.Recipient == DelegateEmail);
        Assert.Contains("no longer", toDelegate.TextBody!, StringComparison.OrdinalIgnoreCase);

        // The department was told about an absence that is now off; they hear
        // nothing further, because the calendar is where that lives.
        Assert.DoesNotContain(mail.Sent, sent => sent.Recipient == ColleagueEmail);
    }

    /* ── What is deliberately not announced ──────────────────────────────────── */

    [Fact]
    public async Task A_pending_request_announces_nothing_to_the_team()
    {
        await using var db = await SeedWorldAsync(requiresApproval: true);
        var mail = new FakeEmailService();

        var result = await new CreateAnnualLeave.Handler(db, BuildMapper(), mail)
            .Handle(CreateCmd(DelegateUserId), CancellationToken.None);

        Assert.True(result.IsSuccess);

        // A request that may still be rejected is nobody's business but the
        // approver's, and there is no manager seeded here to receive that one.
        Assert.DoesNotContain(mail.Sent, sent => sent.Recipient == DelegateEmail);
        Assert.DoesNotContain(mail.Sent, sent => sent.Recipient == ColleagueEmail);
    }

    [Fact]
    public async Task Approved_leave_with_no_delegate_announces_nothing()
    {
        await using var db = await SeedWorldAsync(requiresApproval: false);
        var mail = new FakeEmailService();

        var result = await new CreateAnnualLeave.Handler(db, BuildMapper(), mail)
            .Handle(CreateCmd(delegateId: null), CancellationToken.None);

        Assert.True(result.IsSuccess);

        // The announcement is about coverage. With nobody covering there is
        // nothing to announce, which also keeps the department's inbox for the
        // absences somebody actually arranged cover for.
        Assert.Empty(mail.Sent);
    }

    [Fact]
    public async Task The_coverage_emails_never_carry_the_private_reason()
    {
        const string PrivateReason = "Fertility treatment appointments";

        await using var db = await SeedWorldAsync(requiresApproval: false);
        var mail = new FakeEmailService();

        var result = await new CreateAnnualLeave.Handler(db, BuildMapper(), mail)
            .Handle(CreateCmd(DelegateUserId, reason: PrivateReason), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotEmpty(mail.Sent);

        // The apply form promises the reason stays private. It reaches the manager
        // who has to decide the request, and nobody else.
        foreach (var sent in mail.Sent)
        {
            Assert.DoesNotContain(PrivateReason, sent.HtmlBody, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(PrivateReason, sent.TextBody!, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task An_employee_with_no_department_announces_to_the_delegate_alone()
    {
        await using var db = await SeedWorldAsync(requiresApproval: false);

        // A System Administrator has no department, and "the same department as nobody" must not
        // read as a match — the seeded admin is the other department-less profile
        // that a null-matching query would wrongly call a colleague.
        var profile = db.EmployeeProfiles.Single(ep => ep.Id == EmployeeProfileId);
        profile.DepartmentId = null;
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var mail = new FakeEmailService();

        var result = await new CreateAnnualLeave.Handler(db, BuildMapper(), mail)
            .Handle(CreateCmd(DelegateUserId), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.DoesNotContain(mail.Sent, sent => sent.Recipient == AdminEmail);
        Assert.Single(mail.Sent);
        Assert.Equal(DelegateEmail, mail.Sent[0].Recipient);
    }

    [Fact]
    public async Task A_deactivated_colleague_is_not_mailed()
    {
        await using var db = await SeedWorldAsync(requiresApproval: false);

        var leaver = db.Users.Single(user => user.Id == ColleagueUserId);
        leaver.IsActive = false;
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var mail = new FakeEmailService();

        var result = await new CreateAnnualLeave.Handler(db, BuildMapper(), mail)
            .Handle(CreateCmd(DelegateUserId), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.DoesNotContain(mail.Sent, sent => sent.Recipient == ColleagueEmail);
    }

    /* ── What the approver sees before deciding ──────────────────────────────── */

    [Fact]
    public async Task The_managers_request_email_names_the_nominated_delegate()
    {
        await using var db = await SeedWorldAsync(requiresApproval: true);

        // Make the colleague this employee's manager, so the new-request email has
        // somewhere to go.
        var employee = db.EmployeeProfiles.Single(ep => ep.Id == EmployeeProfileId);
        employee.ManagerId = "p-colleague";
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var mail = new FakeEmailService();

        var result = await new CreateAnnualLeave.Handler(db, BuildMapper(), mail)
            .Handle(CreateCmd(DelegateUserId), CancellationToken.None);

        Assert.True(result.IsSuccess);

        var toManager = Assert.Single(mail.Sent, sent => sent.Recipient == ColleagueEmail);
        Assert.Contains("Coverage: Andreas Georgiou", toManager.TextBody!, StringComparison.Ordinal);
    }

    [Fact]
    public async Task The_managers_request_email_says_so_when_nobody_was_nominated()
    {
        await using var db = await SeedWorldAsync(requiresApproval: true);

        var employee = db.EmployeeProfiles.Single(ep => ep.Id == EmployeeProfileId);
        employee.ManagerId = "p-colleague";
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var mail = new FakeEmailService();

        var result = await new CreateAnnualLeave.Handler(db, BuildMapper(), mail)
            .Handle(CreateCmd(delegateId: null), CancellationToken.None);

        Assert.True(result.IsSuccess);

        // Silence would read as "not shown on this email"; the approver is deciding
        // and should see that cover was not arranged.
        var toManager = Assert.Single(mail.Sent, sent => sent.Recipient == ColleagueEmail);
        Assert.Contains("Coverage: Nobody nominated", toManager.TextBody!, StringComparison.Ordinal);
    }
}
