namespace Domain;

public class LeaveStatusHistory
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string AnnualLeaveId { get; set; } = string.Empty;
    public AnnualLeave? AnnualLeave { get; set; }
    public string ChangedByUserId { get; set; } = string.Empty;
    public User? ChangedByUser { get; set; }
    public AnnualLeaveStatus? OldStatus { get; set; }
    public AnnualLeaveStatus NewStatus { get; set; }
    public string? Comment { get; set; }
    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
}
