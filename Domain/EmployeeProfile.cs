namespace Domain;

public class EmployeeProfile
{
    public string Id { get; set; } = Guid.NewGuid().ToString();

    public string UserId { get; set; } = string.Empty;
    public User? User { get; set; }

    public int DepartmentId { get; set; }
    public Department? Department { get; set; }

    public string? ManagerId { get; set; }
    public EmployeeProfile? Manager { get; set; }
    public ICollection<EmployeeProfile> DirectReports { get; set; } = new List<EmployeeProfile>();
    public ICollection<AnnualLeave> AnnualLeaves { get; set; } = new List<AnnualLeave>();

    public int AnnualLeaveEntitlement { get; set; } = 22;
    public int LeaveBalance { get; set; } = 22;

    public string? JobTitle { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
