using Application.Core;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class BaseApiController : ControllerBase
    {
        private IMediator? _mediator;
        protected IMediator Mediator =>
        _mediator ??= HttpContext.RequestServices.GetService<IMediator>()
        ?? throw new InvalidOperationException("IMediator Service is unvailable");

        protected ActionResult HandleResult<T>(Result<T> result)
        {
            if (result.IsSuccess)
            {
                return result.Value is null ? NotFound() : Ok(result.Value);
            }

            if (result.ValidationErrors is not null && result.ValidationErrors.Count > 0)
            {
                return BadRequest(new
                {
                    statusCode = StatusCodes.Status400BadRequest,
                    message = string.IsNullOrWhiteSpace(result.Error)
                        ? "One or more validation errors occurred."
                        : result.Error,
                    path = HttpContext.Request.Path.Value,
                    traceId = HttpContext.TraceIdentifier,
                    timestamp = DateTime.UtcNow,
                    errors = result.ValidationErrors
                });
            }

            return NotFound(new
            {
                statusCode = StatusCodes.Status404NotFound,
                message = string.IsNullOrWhiteSpace(result.Error) ? "Resource not found." : result.Error,
                path = HttpContext.Request.Path.Value,
                traceId = HttpContext.TraceIdentifier,
                timestamp = DateTime.UtcNow
            });
        }

    }
}
