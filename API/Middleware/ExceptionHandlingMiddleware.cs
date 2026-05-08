using API.Extensions;

namespace API.Middleware;

public class ExceptionHandlingMiddleware(
    RequestDelegate next,
    ILogger<ExceptionHandlingMiddleware> logger,
    IHostEnvironment environment,
    IConfiguration configuration)
{
    private static readonly string[] OAuthCallbackPaths = ["/signin-github", "/signin-google"];

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            // OAuth callback failures must redirect to the client login page, not return JSON 500,
            // because the browser navigated here directly (no JS to handle a JSON error response).
            if (IsOAuthCallback(context.Request.Path))
            {
                logger.LogWarning(ex, "OAuth callback failure for {Path}", context.Request.Path);
                if (!context.Response.HasStarted)
                {
                    var clientBase = configuration["AppUrls:ClientBaseUrl"]?.TrimEnd('/') ?? "http://localhost:5173";
                    var msg = Uri.EscapeDataString("Sign-in failed. Please try again.");
                    context.Response.Redirect($"{clientBase}/?authStatus=error&authMessage={msg}#login");
                }
                return;
            }

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

    private static bool IsOAuthCallback(PathString path) =>
        OAuthCallbackPaths.Any(p => path.StartsWithSegments(p, StringComparison.OrdinalIgnoreCase));

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
