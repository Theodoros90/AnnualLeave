using API.Extensions;

namespace API.Middleware;

public class ExceptionHandlingMiddleware(
    RequestDelegate next,
    ILogger<ExceptionHandlingMiddleware> logger,
    IHostEnvironment environment)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            var statusCode = MapStatusCode(ex);
            var message = MapMessage(ex);

            if (statusCode >= 500)
            {
                logger.LogError(ex, "Unhandled exception for request {Path}", context.Request.Path);
            }
            else
            {
                logger.LogWarning(ex, "Handled exception for request {Path}", context.Request.Path);
            }

            if (context.Response.HasStarted)
            {
                throw;
            }

            context.Response.Clear();
            context.Response.StatusCode = statusCode;
            context.Response.ContentType = "application/json";

            var response = ApiErrorResponseExtensions.Create(
                context,
                statusCode,
                message,
                statusCode >= 500 && !environment.IsDevelopment() ? null : ex.Message);

            await context.Response.WriteAsJsonAsync(response);
        }
    }

    private static int MapStatusCode(Exception ex) => ex switch
    {
        UnauthorizedAccessException => StatusCodes.Status403Forbidden,
        KeyNotFoundException => StatusCodes.Status404NotFound,
        ArgumentException => StatusCodes.Status400BadRequest,
        InvalidOperationException => StatusCodes.Status409Conflict,
        _ => StatusCodes.Status500InternalServerError,
    };

    private static string MapMessage(Exception ex) => ex switch
    {
        UnauthorizedAccessException => "You do not have permission to perform this action.",
        KeyNotFoundException => "The requested resource was not found.",
        ArgumentException => "The request contains invalid data.",
        InvalidOperationException => "The requested operation could not be completed.",
        _ => "An unexpected server error occurred.",
    };
}
