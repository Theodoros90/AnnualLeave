using Application.EmployeeProfiles.Commands;
using Application.EmployeeProfiles.DTOs;
using Application.EmployeeProfiles.Queries;
using Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Asp.Versioning;

namespace API.Controllers;

[ApiVersion("1.0")]

public class EmployeeProfilesController : BaseApiController
{
    [HttpGet]
    [Authorize]
    public async Task<ActionResult<List<EmployeeProfileDto>>> GetEmployeeProfiles()
    {
        return await Mediator.Send(new GetEmployeeProfileList.Query
        {
            RequestingUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty,
            IsAdmin = User.IsInRole(AppRoles.SystemAdministrator),
            IsManager = User.IsInRole(AppRoles.Manager),
        });
    }

    /// <summary>
    /// Colleagues in the caller's own department — names and job titles only.
    /// Backs the leave-coverage delegate picker, which every employee can use.
    /// A System Administrator filing leave on somebody's behalf passes that person as
    /// <paramref name="forUserId"/> to get their colleagues instead; anyone else
    /// passing it gets their own list, since a Manager or an Employee has no
    /// business filing for somebody else.
    /// </summary>
    [HttpGet("teammates")]
    [Authorize]
    public async Task<ActionResult<List<TeammateDto>>> GetTeammates([FromQuery] string? forUserId = null)
    {
        return await Mediator.Send(new GetTeammateList.Query
        {
            RequestingUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty,
            ForUserId = User.IsInRole(AppRoles.SystemAdministrator) ? forUserId : null,
        });
    }

    [HttpPut]
    [Authorize(Policy = "EmployeeProfileUpdate")]
    public async Task<ActionResult> EditEmployeeProfile(EditEmployeeProfileRequest request)
    {
        var result = await Mediator.Send(new EditEmployeeProfile.Command
        {
            EmployeeProfile = request
        });

        return HandleResult(result);
    }
}
