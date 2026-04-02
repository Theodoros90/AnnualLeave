using API.Extensions;
using System.Text.Json;

namespace API.Middleware;

public class RequestValidationMiddleware(RequestDelegate next, ILogger<RequestValidationMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (BadHttpRequestException ex)
        {
            logger.LogWarning(ex, "Bad HTTP request for {Path}", context.Request.Path);
            await WriteBadRequest(context, "Invalid request.", ex.Message);
        }
        catch (JsonException ex)
        {
            logger.LogWarning(ex, "Malformed JSON payload for {Path}", context.Request.Path);
            await WriteBadRequest(context, "Malformed JSON payload.", ex.Message);
        }
    }

    private static async Task WriteBadRequest(HttpContext context, string message, string details)
    {
        if (context.Response.HasStarted)
        {
            return;
        }

        context.Response.Clear();
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        context.Response.ContentType = "application/json";

        var response = ApiErrorResponseExtensions.Create(
            context,
            StatusCodes.Status400BadRequest,
            message,
            details);

        await context.Response.WriteAsJsonAsync(response);
    }
}
