using System.ComponentModel.DataAnnotations;
using Domain;

namespace Application.LeaveTypes.DTOs;

public class UpsertLeaveTypeRequest
{
    [Required]
    [StringLength(100, MinimumLength = 1)]
    public string Name { get; set; } = string.Empty;

    public bool RequiresManagerApproval { get; set; } = true;
    public bool RequiresHrApproval { get; set; } = false;
    public bool IsActive { get; set; } = true;
    public bool AffectsBalance { get; set; } = false;

    [StringLength(16)]
    public string Icon { get; set; } = "🏷️";

    [StringLength(30)]
    public string ColorKey { get; set; } = "default";

    [StringLength(300)]
    public string Description { get; set; } = string.Empty;

    public bool Paid { get; set; } = true;

    public AttachmentPolicy AttachmentPolicy { get; set; } = AttachmentPolicy.None;

    [Range(0, 365)]
    public int DefaultAllowance { get; set; }

    [StringLength(30)]
    public string AllowanceUnit { get; set; } = "days/year";

    [Range(0, 365)]
    public int? MaxCarryoverDays { get; set; }

    /// <summary>
    /// Turns the per-child entitlement engine on. The three numbers below are
    /// validated only when this is true — every other leave type leaves them at 0.
    /// </summary>
    public bool PerChildEntitlement { get; set; }

    /// <summary>The first child's lifetime total, in weeks. 18 for paternity leave.</summary>
    [Range(0, 260)]
    public int PerChildTotalWeeks { get; set; }

    /// <summary>
    /// The second child's lifetime total, and the third-and-later one. Null keeps the
    /// first child's figure, so a policy that is the same for every child sends
    /// nothing here; one that is not — 22 / 22 / 26 weeks — sends all three.
    /// </summary>
    [Range(0, 260)]
    public int? PerChildTotalWeeksSecondChild { get; set; }

    [Range(0, 260)]
    public int? PerChildTotalWeeksThirdChildOnwards { get; set; }

    [Range(0, 52)]
    public int PerChildWeeksPerYear { get; set; }

    [Range(0, 30)]
    public int ChildEligibleUntilAge { get; set; }

    [StringLength(250)]
    public string AccrualNotes { get; set; } = string.Empty;

    [Range(0, 365)]
    public int MinNoticeDays { get; set; }

    [Range(0, 365)]
    public int MaxConsecutiveDays { get; set; }

    public bool HalfDayAllowed { get; set; }

    /// <summary>
    /// Who the type is offered to. Fixed on the three built-in types — the
    /// validator refuses any value but theirs — and free on everything else.
    /// </summary>
    public GenderAvailability AvailableTo { get; set; } = GenderAvailability.Both;

    /// <summary>
    /// Months of service before the type is offered, measured from the employee's
    /// start date to the day they file. 0 is no minimum. Ten years is the ceiling
    /// — plenty for a sabbatical policy, and anything larger is a typed year.
    /// </summary>
    [Range(0, 120)]
    public int MinServiceMonths { get; set; }

    /// <summary>
    /// Whether a mid-year joiner's first leave year of this type's allowance is
    /// pro-rated from their start date. Enforced for the balance type, quoted for
    /// every other; refused on a per-child type, which has no yearly allowance.
    /// </summary>
    public bool ProRateFirstYear { get; set; }
}
