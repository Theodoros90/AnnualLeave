using System;

namespace Domain;

public enum AnnualLeaveStatus
{
    Pending,
    Approved,
    Rejected,
    Cancelled
}

public class AnnualLeave
{
    public string Id { get; set; } =Guid.NewGuid().ToString();
    public string EmployeeId { get; set; } = Guid.NewGuid().ToString();
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public string Reason { get; set; } = string.Empty;
    public AnnualLeaveStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ApprovedAt { get; set; }

    public int TotalDays => (EndDate.Date - StartDate.Date).Days + 1;
}


