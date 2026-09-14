using System;
using System.ComponentModel.DataAnnotations;
using Domain.Services;

namespace Application.AnnualLeaves.DTOs;

public class BaseAnnualLeaveDto
{
    public DateTime StartDate { get; set; }

    public DateTime EndDate { get; set; }

    /// <summary>
    /// Whole days, or half of one. Absent from the payload means
    /// <see cref="LeaveDuration.Full"/>, which is both the enum's default and what
    /// every client sent before half days were persisted at all.
    ///
    /// <c>HalfDayRule</c> decides whether the selected type accepts it and whether
    /// the dates are narrow enough for it — the handlers call it rather than the
    /// validator, because the answer depends on the leave type.
    /// </summary>
    public LeaveDuration Duration { get; set; } = LeaveDuration.Full;

    [Range(1, int.MaxValue)]
    public int LeaveTypeId { get; set; }

    /// <summary>
    /// The child this request is for. Required when the selected leave type has
    /// <c>PerChildEntitlement</c> set, ignored otherwise — the handler clears it
    /// rather than trusting the client, so switching type cannot leave a stale
    /// child attached.
    /// </summary>
    [StringLength(450)]
    public string? ChildId { get; set; }

    [Required(ErrorMessage = "Reason is required.")]
    [StringLength(500, MinimumLength = 1, ErrorMessage = "Reason is required and must be at most 500 characters.")]
    public string Reason { get; set; } = string.Empty;

    [StringLength(2048)]
    public string? EvidenceUrl { get; set; }

    /// <summary>Optional colleague nominated to cover while the employee is away.</summary>
    [StringLength(450)]
    public string? DelegateId { get; set; }
}