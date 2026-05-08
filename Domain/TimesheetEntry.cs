using System;

namespace Domain;

public class TimesheetEntry
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TimesheetId { get; set; } = string.Empty;
    public Timesheet? Timesheet { get; set; }
    public int ProjectId { get; set; }
    public Project? Project { get; set; }
    public DateTime Date { get; set; }
    public decimal HoursWorked { get; set; }
    public string? Notes { get; set; }
}
