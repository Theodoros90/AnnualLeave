namespace API.Models;

public class ApiErrorResponse
{
    public int StatusCode { get; init; }
    public string Message { get; init; } = string.Empty;
    public string Path { get; init; } = string.Empty;
    public string TraceId { get; init; } = string.Empty;
    public DateTime Timestamp { get; init; }
    public object? Details { get; init; }
    public IDictionary<string, string[]>? Errors { get; init; }
}
