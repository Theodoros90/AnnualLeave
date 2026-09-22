namespace Application.EmployeeProfiles.DTOs;

public class EmployeeProfileDto
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public int? DepartmentId { get; set; }
    public string? ManagerId { get; set; }
    public int AnnualLeaveEntitlement { get; set; }

    /// <summary>
    /// What this employee may take in the current leave year. Equal to
    /// <see cref="AnnualLeaveEntitlement"/> except for somebody who joined during
    /// this leave year while the balance type pro-rates the first year, when it is
    /// the scaled figure. Computed on every read, never stored, so the year after
    /// the hire reads whole on its own. The employee-facing pages quote this;
    /// the year-end carryover preview keeps the stored one, next year being full.
    /// </summary>
    public decimal CurrentYearEntitlement { get; set; }

    /// <summary>Decimal because a half day costs 0.5 of it. 22.5 of 23 is a balance.</summary>
    public decimal LeaveBalance { get; set; }
    public string? JobTitle { get; set; }

    /// <summary>
    /// Null for an Admin, and for any profile predating the column. Distinct from
    /// <see cref="CreatedAt"/>, which is when the row was written rather than when
    /// the person started.
    /// </summary>
    public DateOnly? EmploymentStartDate { get; set; }

    public DateTime CreatedAt { get; set; }
}
