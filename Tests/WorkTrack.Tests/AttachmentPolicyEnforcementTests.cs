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
/// <see cref="LeaveType.AttachmentPolicy"/> used to be display-only: the admin
/// dialog saved it and the leave type's card rendered it, and nothing in the
/// request path ever read it. These tests pin it as an enforced rule — a type set
/// to <see cref="AttachmentPolicy.Required"/> refuses a request that carries no
/// evidence, on create and on edit alike.
///
/// Three things the tests exist to hold still:
///
/// <list type="bullet">
/// <item><description>
/// Only <c>Required</c> blocks. <c>Optional</c> is the encouragement the client
/// renders in amber and <c>None</c> is silence; neither may ever refuse a request,
/// or an admin nudging a type towards documentation would lock employees out of it.
/// </description></item>
/// <item><description>
/// There is no exemption. An admin filing on somebody's behalf, and an edit to a
/// request filed before the policy was set, are both refused — the rule is about
/// the leave type, not about who is typing.
/// </description></item>
/// <item><description>
/// Whitespace is not an attachment. <see cref="AnnualLeave.EvidenceUrl"/> is a
/// free-text column, so the check trims before believing it.
/// </description></item>
/// </list>
/// </summary>
public class AttachmentPolicyEnforcementTests
{
    private const string UserId = "employee-1";
    private const string ProfileId = "profile-1";
    private const string EvidenceUrl = "/api/files/8f2c1b6e-0000-4000-8000-000000000001";

    private const int RequiredTypeId = 1;
    private const int OptionalTypeId = 2;
    private const int NoneTypeId = 3;

    private static async Task<AppDbContext> WorldAsync()
    {
        var db = TestDb.Create();

        db.AppSettings.Add(new AppSettings { Id = 1, LeaveYearStartMonth = 1 });

        db.Users.Add(new User
        {
            Id = UserId,
            UserName = "employee-1@example.com",
            Email = "employee-1@example.com",
            DisplayName = "Andreas Georgiou",
        });

        db.EmployeeProfiles.Add(new EmployeeProfile
        {
            Id = ProfileId,
            UserId = UserId,
            AnnualLeaveEntitlement = 25,
            LeaveBalance = 25,
        });

        // Named for its policy rather than "Sick Leave": the rule has to follow the
        // admin's setting, not a word in the type's name, which is what the apply
        // page used to sniff for.
        db.LeaveTypes.Add(new LeaveType
        {
            Id = RequiredTypeId,
            Name = "Evidence Leave",
            IsActive = true,
            RequiresApproval = true,
            AffectsBalance = false,
            AttachmentPolicy = AttachmentPolicy.Required,
            DefaultAllowance = 10,
        });

        db.LeaveTypes.Add(new LeaveType
        {
            Id = OptionalTypeId,
            Name = "Encouraged Leave",
            IsActive = true,
            RequiresApproval = true,
            AffectsBalance = false,
            AttachmentPolicy = AttachmentPolicy.Optional,
            DefaultAllowance = 10,
        });

        db.LeaveTypes.Add(new LeaveType
        {
            Id = NoneTypeId,
            Name = "Annual Leave",
            IsActive = true,
            RequiresApproval = true,
            AffectsBalance = true,
            AttachmentPolicy = AttachmentPolicy.None,
            DefaultAllowance = 25,
        });

        await db.SaveChangesAsync();
        return db;
    }

    private static IMapper BuildMapper() =>
        new MapperConfiguration(cfg => cfg.AddProfile<MappingProfiles>(), NullLoggerFactory.Instance).CreateMapper();

    private static Task<Result<string>> Create(AppDbContext db, int leaveTypeId, string? evidenceUrl) =>
        new CreateAnnualLeave.Handler(db, BuildMapper(), new FakeEmailService())
            .Handle(new CreateAnnualLeave.Command
            {
                AnnualLeave = new CreateAnnualLeaveRequest
                {
                    EmployeeId = UserId,
                    LeaveTypeId = leaveTypeId,
                    StartDate = new DateTime(2026, 6, 1),
                    EndDate = new DateTime(2026, 6, 5),
                    Reason = "Out of office",
                    EvidenceUrl = evidenceUrl,
                },
            }, CancellationToken.None);

    /// <summary>Writes an existing request directly, bypassing the create path.</summary>
    private static async Task SeedLeaveAsync(AppDbContext db, int leaveTypeId, string? evidenceUrl)
    {
        db.AnnualLeaves.Add(new AnnualLeave
        {
            Id = "L1",
            EmployeeId = UserId,
            EmployeeProfileId = ProfileId,
            LeaveTypeId = leaveTypeId,
            StartDate = new DateTime(2026, 6, 1),
            EndDate = new DateTime(2026, 6, 5),
            Reason = "Out of office",
            EvidenceUrl = evidenceUrl,
            Status = AnnualLeaveStatus.Pending,
        });
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
    }

    private static Task<Result<Unit>> Edit(AppDbContext db, int leaveTypeId, string? evidenceUrl, bool isAdmin = false) =>
        new EditAnnualLeave.Handler(db)
            .Handle(new EditAnnualLeave.Command
            {
                ChangedByUserId = isAdmin ? "admin-1" : UserId,
                IsAdmin = isAdmin,
                AnnualLeave = new EditAnnualLeaveRequest
                {
                    Id = "L1",
                    LeaveTypeId = leaveTypeId,
                    StartDate = new DateTime(2026, 6, 8),
                    EndDate = new DateTime(2026, 6, 12),
                    Reason = "Rebooked",
                    EvidenceUrl = evidenceUrl,
                },
            }, CancellationToken.None);

    [Fact]
    public async Task A_type_that_requires_an_attachment_refuses_a_request_carrying_none()
    {
        await using var db = await WorldAsync();

        var result = await Create(db, RequiredTypeId, evidenceUrl: null);

        Assert.False(result.IsSuccess);
        Assert.Equal(
            "Evidence Leave requires a supporting document. Attach one and submit again.",
            result.Error);
        Assert.Empty(await db.AnnualLeaves.ToListAsync());
    }

    [Fact]
    public async Task A_type_that_requires_an_attachment_accepts_a_request_carrying_one()
    {
        await using var db = await WorldAsync();

        var result = await Create(db, RequiredTypeId, EvidenceUrl);

        Assert.True(result.IsSuccess);
        var leave = Assert.Single(await db.AnnualLeaves.ToListAsync());
        Assert.Equal(EvidenceUrl, leave.EvidenceUrl);
    }

    /// <summary>
    /// EvidenceUrl is free text, so a blank string would otherwise satisfy a
    /// required policy while pointing at nothing.
    /// </summary>
    [Fact]
    public async Task Whitespace_is_not_an_attachment()
    {
        await using var db = await WorldAsync();

        var result = await Create(db, RequiredTypeId, "   ");

        Assert.False(result.IsSuccess);
        Assert.Empty(await db.AnnualLeaves.ToListAsync());
    }

    [Fact]
    public async Task An_encouraged_attachment_never_blocks_a_request()
    {
        await using var db = await WorldAsync();

        var result = await Create(db, OptionalTypeId, evidenceUrl: null);

        Assert.True(result.IsSuccess);
        Assert.Single(await db.AnnualLeaves.ToListAsync());
    }

    [Fact]
    public async Task A_type_needing_no_attachment_never_blocks_a_request()
    {
        await using var db = await WorldAsync();

        var result = await Create(db, NoneTypeId, evidenceUrl: null);

        Assert.True(result.IsSuccess);
        Assert.Single(await db.AnnualLeaves.ToListAsync());
    }

    [Fact]
    public async Task An_edit_that_clears_the_evidence_is_refused()
    {
        await using var db = await WorldAsync();
        await SeedLeaveAsync(db, RequiredTypeId, EvidenceUrl);

        var result = await Edit(db, RequiredTypeId, evidenceUrl: null);

        Assert.False(result.IsSuccess);
        Assert.Equal(
            "Evidence Leave requires a supporting document. Attach one and submit again.",
            result.Error);

        db.ChangeTracker.Clear();
        var leave = await db.AnnualLeaves.AsNoTracking().SingleAsync();
        Assert.Equal(EvidenceUrl, leave.EvidenceUrl);
        Assert.Equal("Out of office", leave.Reason);
    }

    /// <summary>
    /// The no-exemption decision, and the one that will bite on real data: a
    /// request filed before the policy was set to Required has no evidence, so an
    /// admin cannot edit it — not even to fix the reason — without attaching one.
    /// </summary>
    [Fact]
    public async Task An_edit_of_a_request_predating_the_policy_is_refused_for_an_admin_too()
    {
        await using var db = await WorldAsync();
        await SeedLeaveAsync(db, RequiredTypeId, evidenceUrl: null);

        var result = await Edit(db, RequiredTypeId, evidenceUrl: null, isAdmin: true);

        Assert.False(result.IsSuccess);
        Assert.Equal(
            "Evidence Leave requires a supporting document. Attach one and submit again.",
            result.Error);
    }

    [Fact]
    public async Task An_edit_that_keeps_the_evidence_is_accepted()
    {
        await using var db = await WorldAsync();
        await SeedLeaveAsync(db, RequiredTypeId, EvidenceUrl);

        var result = await Edit(db, RequiredTypeId, EvidenceUrl);

        Assert.True(result.IsSuccess);

        db.ChangeTracker.Clear();
        var leave = await db.AnnualLeaves.AsNoTracking().SingleAsync();
        Assert.Equal("Rebooked", leave.Reason);
    }

    /// <summary>
    /// An edit can move a request onto a type with a different policy, which is
    /// the moment the requirement starts applying to it.
    /// </summary>
    [Fact]
    public async Task An_edit_onto_a_type_that_requires_an_attachment_is_refused_without_one()
    {
        await using var db = await WorldAsync();
        await SeedLeaveAsync(db, NoneTypeId, evidenceUrl: null);

        var result = await Edit(db, RequiredTypeId, evidenceUrl: null);

        Assert.False(result.IsSuccess);

        db.ChangeTracker.Clear();
        var leave = await db.AnnualLeaves.AsNoTracking().SingleAsync();
        Assert.Equal(NoneTypeId, leave.LeaveTypeId);
    }
}
