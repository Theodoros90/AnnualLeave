using System;

namespace Domain;

public class TimesheetStatusHistory
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TimesheetId { get; set; } = string.Empty;
    public Timesheet? Timesheet { get; set; }
    public string ChangedByUserId { get; set; } = string.Empty;
    public User? ChangedByUser { get; set; }
    public int FromStatus { get; set; }
    public int ToStatus { get; set; }
    public string? Comment { get; set; }
    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
}
