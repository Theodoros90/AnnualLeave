using Application.LeaveTypes.DTOs;
using Application.LeaveTypes.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

public class LeaveTypesController : BaseApiController
{
    [HttpGet]
    [Authorize]
    public async Task<ActionResult<List<LeaveTypeDto>>> GetLeaveTypes()
    {
        return await Mediator.Send(new GetLeaveTypeList.Query());
    }
}
