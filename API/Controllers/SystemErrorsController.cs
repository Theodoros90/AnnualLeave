using Application.SystemErrors.DTOs;
using Application.SystemErrors.Queries;
using Asp.Versioning;
using Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiVersion("1.0")]
public class SystemErrorsController : BaseApiController
{
    // The faults the system hit: what the System Administrator's bell lists, as the
    // stored twin of the error email. Keeping the system running is system
    // administration, so the HR Administrator does not see it — and a stack of
    // exception messages is nothing an HR page has a use for.
    [HttpGet]
    [Authorize(Roles = AppRoles.SystemAdministrator)]
    public async Task<ActionResult<List<SystemErrorDto>>> GetSystemErrors([FromQuery] int take = GetSystemErrorList.DefaultTake)
    {
        return await Mediator.Send(new GetSystemErrorList.Query { Take = take });
    }
}
