namespace Application.SystemErrors.DTOs;

public class SystemErrorDto
{
    public int Id { get; set; }
    public string Source { get; set; } = string.Empty;
    public string ExceptionType { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? CorrelationId { get; set; }
    public DateTime OccurredAtUtc { get; set; }
    public DateTime LastOccurredAtUtc { get; set; }
    public int Occurrences { get; set; }
}
