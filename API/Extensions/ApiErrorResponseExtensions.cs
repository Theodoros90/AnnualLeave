using API.Models;

namespace API.Extensions;

public static class ApiErrorResponseExtensions
{
    public static ApiErrorResponse Create(
        HttpContext context,
        int statusCode,
        string message,
        object? details = null,
        IDictionary<string, string[]>? errors = null)
    {
        return new ApiErrorResponse
        {
            StatusCode = statusCode,
            Message = message,
            Path = context.Request.Path.Value ?? string.Empty,
            TraceId = context.TraceIdentifier,
            Timestamp = DateTime.UtcNow,
            Details = details,
            Errors = errors
        };
    }
}
