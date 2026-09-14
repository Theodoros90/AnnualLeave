namespace Application.EmployeeProfiles.DTOs;

public class EmployeeProfileDto
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public int? DepartmentId { get; set; }
    public string? ManagerId { get; set; }
    public int AnnualLeaveEntitlement { get; set; }

    /// <summary>Decimal because a half day costs 0.5 of it. 22.5 of 23 is a balance.</summary>
    public decimal LeaveBalance { get; set; }
    public string? JobTitle { get; set; }
    public DateTime CreatedAt { get; set; }
}
