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
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string EmployeeId { get; set; } = Guid.NewGuid().ToString();
    public User? Employee { get; set; }
    public string? ApprovedById { get; set; }
    public User? ApprovedBy { get; set; }
    public string? EmployeeProfileId { get; set; }
    public EmployeeProfile? EmployeeProfile { get; set; }
    public int? DepartmentId { get; set; }
    public Department? Department { get; set; }
    public int? LeaveTypeId { get; set; }
    public LeaveType? LeaveType { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public string Reason { get; set; } = string.Empty;
    public AnnualLeaveStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ApprovedAt { get; set; }

    public int TotalDays
    {
        get
        {
            var start = StartDate.Date;
            var end = EndDate.Date;

            if (end < start) return 0;

            var days = 0;
            for (var date = start; date <= end; date = date.AddDays(1))
            {
                if (date.DayOfWeek is not DayOfWeek.Saturday and not DayOfWeek.Sunday)
                    days++;
            }

            return days;
        }
    }
    public ICollection<LeaveStatusHistory> StatusHistory { get; set; } = new List<LeaveStatusHistory>();
}


