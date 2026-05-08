namespace Application.TimesheetStatusHistories.DTOs;

public class TimesheetStatusHistoryDto
{
    public string Id { get; set; } = string.Empty;
    public string TimesheetId { get; set; } = string.Empty;
    public string EmployeeId { get; set; } = string.Empty;
    public string EmployeeName { get; set; } = string.Empty;
    public string ChangedByUserId { get; set; } = string.Empty;
    public string ChangedByUserName { get; set; } = string.Empty;
    public string? OldStatus { get; set; }
    public string NewStatus { get; set; } = string.Empty;
    public string? Comment { get; set; }
    public DateTime ChangedAt { get; set; }
}
