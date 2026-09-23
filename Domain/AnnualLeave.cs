using System;
using System.ComponentModel.DataAnnotations;
using Domain.Interfaces;
using Domain.Services;

namespace Domain;

public enum AnnualLeaveStatus
{
    Pending,
    Approved,
    Rejected,
    Cancelled
}

public class AnnualLeave : IAuditable
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string EmployeeId { get; set; } = Guid.NewGuid().ToString();
    public User? Employee { get; set; }
    public string? ApprovedById { get; set; }
    public User? ApprovedBy { get; set; }

    /// <summary>
    /// Colleague nominated to cover urgent matters while the employee is away.
    ///
    /// Nullable in the column, required by the rule: <c>CoverageRule</c> refuses a
    /// request from an Employee or a Manager that names nobody, on create and on
    /// edit. A System Administrator's own leave is the one standing null — a System Administrator has no
    /// department, so there is nobody to offer — and every row predating the rule
    /// keeps whatever it had.
    /// </summary>
    public string? DelegateId { get; set; }
    public User? Delegate { get; set; }

    /// <summary>
    /// What the employee wants the delegate to know — the handover. Goes to the
    /// delegate alone, in the coverage email, and is shown beside their name on
    /// the leave. Unlike <see cref="Reason"/> it is written for a colleague, not
    /// for the approver, so nothing here is promised private.
    /// </summary>
    public string? CoverageNote { get; set; }

    /// <summary>
    /// A handover document for the delegate, in the same <c>/api/files/{id}</c>
    /// shape as <see cref="EvidenceUrl"/> but under its own
    /// <c>StoredFilePurpose.CoverageHandover</c>, so who may read it is decided
    /// separately from who may read evidence: the delegate can open this and not
    /// a doctor's note. Attached to the delegate's coverage email as a file.
    /// </summary>
    public string? CoverageAttachmentUrl { get; set; }
    public string? EmployeeProfileId { get; set; }
    public EmployeeProfile? EmployeeProfile { get; set; }
    public int? DepartmentId { get; set; }
    public Department? Department { get; set; }
    public int? LeaveTypeId { get; set; }
    public LeaveType? LeaveType { get; set; }

    /// <summary>
    /// The child this leave was taken for, on a leave type with
    /// <see cref="LeaveType.PerChildEntitlement"/> set. Required for those types
    /// and refused for the rest.
    ///
    /// Nullable for one reason: paternity rows that predate the per-child
    /// entitlement have no child and must stay approved and visible. They count
    /// against no child's ledger — an admin can attach one later by editing.
    /// </summary>
    public string? ChildId { get; set; }
    public Child? Child { get; set; }

    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }

    /// <summary>
    /// Whether this request covers whole days or half of one, and which half.
    ///
    /// <see cref="LeaveDuration.Full"/> is 0, so rows predating the column — every
    /// request filed while half days were a pair of buttons that posted nothing —
    /// read as full days, which is what they were charged as.
    ///
    /// A half day is always a single date: <c>HalfDayRule</c> refuses anything
    /// wider, and refuses a half day on a type whose
    /// <see cref="LeaveType.HalfDayAllowed"/> is off.
    /// </summary>
    public LeaveDuration Duration { get; set; } = LeaveDuration.Full;

    public string Reason { get; set; } = string.Empty;
    public string? EvidenceUrl { get; set; }
    public AnnualLeaveStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ApprovedAt { get; set; }

    /// <summary>
    /// Weekend-aware chargeable-day count for this leave request, ignoring public
    /// holidays. Holiday-aware calculations require external input and should be
    /// done via <see cref="LeaveCalculationService.CalculateChargeableDays"/> directly.
    ///
    /// Decimal because a half day is 0.5 of one. Whole for every full-day request,
    /// which is all of them before <see cref="Duration"/> existed.
    /// </summary>
    public decimal TotalDays =>
        LeaveCalculationService.CalculateChargeableDays(StartDate, EndDate, Duration);
    public ICollection<LeaveStatusHistory> StatusHistory { get; set; } = new List<LeaveStatusHistory>();

    /// <summary>
    /// Optimistic-concurrency token. SQL Server stamps this on every update; a
    /// stale value on SaveChanges raises <see cref="Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException"/>.
    /// </summary>
    [Timestamp]
    public byte[]? RowVersion { get; set; }
}


