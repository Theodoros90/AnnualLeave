using System.Text.Json;
using FluentValidation;

namespace API.Middleware;

public class ValidationExceptionMiddleware(RequestDelegate next, ILogger<ValidationExceptionMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (ValidationException ex)
        {
            logger.LogWarning(ex, "Validation failed for request {Path}", context.Request.Path);

            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            context.Response.ContentType = "application/json";

            var errors = ex.Errors
                .GroupBy(error => error.PropertyName)
                .ToDictionary(
                    group => group.Key,
                    group => group.Select(error => error.ErrorMessage).ToArray());

            var response = new ErrorResponse
            {
                StatusCode = StatusCodes.Status400BadRequest,
                Message = "One or more validation errors occurred.",
                Path = context.Request.Path,
                TraceId = context.TraceIdentifier,
                Timestamp = DateTime.UtcNow,
                Errors = errors
            };

            await context.Response.WriteAsync(JsonSerializer.Serialize(response));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unhandled exception for request {Path}", context.Request.Path);

            if (ex is UnauthorizedAccessException)
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                context.Response.ContentType = "application/json";

                var forbiddenResponse = new ErrorResponse
                {
                    StatusCode = StatusCodes.Status403Forbidden,
                    Message = "You do not have permission to perform this action.",
                    Path = context.Request.Path,
                    TraceId = context.TraceIdentifier,
                    Timestamp = DateTime.UtcNow,
                    Details = ex.Message
                };

                await context.Response.WriteAsync(JsonSerializer.Serialize(forbiddenResponse));
                return;
            }

            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json";

            var response = new ErrorResponse
            {
                StatusCode = StatusCodes.Status500InternalServerError,
                Message = "An unexpected server error occurred.",
                Path = context.Request.Path,
                TraceId = context.TraceIdentifier,
                Timestamp = DateTime.UtcNow,
                Details = ex.Message
            };

            await context.Response.WriteAsync(JsonSerializer.Serialize(response));
        }
    }

    private sealed class ErrorResponse
    {
        public int StatusCode { get; init; }
        public string Message { get; init; } = string.Empty;
        public string Path { get; init; } = string.Empty;
        public string TraceId { get; init; } = string.Empty;
        public DateTime Timestamp { get; init; }
        public object? Details { get; init; }
        public IDictionary<string, string[]>? Errors { get; init; }
    }
}