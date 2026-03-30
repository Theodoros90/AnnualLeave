using Application.Annualleaves.Commands;
using Application.Annualleaves.DTOs;
using Application.Annualleaves.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace API.Controllers;

public class AnnualLeavesController : BaseApiController
{
    // Admin, Author and Viewer can view all leaves
    [HttpGet]
    [Authorize(Policy = "AnnualLeaveRead")]
    public async Task<ActionResult<List<AnnualLeaveDto>>> GetAnnualLeaves()
    {
        return await Mediator.Send(new GetAnnualleaveList.Query());
    }

    // Admin, Author and Viewer can view leave details
    [HttpGet("{id}")]
    [Authorize(Policy = "AnnualLeaveRead")]
    public async Task<ActionResult<AnnualLeaveDto>> GetAnnualLeaveDetails(string id)
    {
        var result = await Mediator.Send(new GetAnnualLeaveDetails.Query { Id = id });
        return HandleResult(result);
    }

    // All roles can create leaves; status is defaulted to Pending in mapping profile.
    [HttpPost]
    [Authorize(Policy = "AnnualLeaveCreate")]
    public async Task<ActionResult<string>> CreateAnnualLeave(CreateAnnualLeaveRequest request)
    {
        request.EmployeeId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        return await Mediator.Send(new CreateAnnualLeave.Command { AnnualLeave = request });
    }

    // Only Admin can edit leaves
    [HttpPut]
    [Authorize(Policy = "AnnualLeaveUpdate")]
    public async Task<ActionResult> EditAnnualLeave(EditAnnualLeaveRequest request)
    {
        await Mediator.Send(new EditAnnualLeave.Command
        {
            AnnualLeave = request,
            ChangedByUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty
        });
        return NoContent();
    }

    // Only Admin can delete leaves
    [HttpDelete("{id}")]
    [Authorize(Policy = "AnnualLeaveDelete")]
    public async Task<ActionResult> DeleteAnnualLeave(string id)
    {
        await Mediator.Send(new DeleteAnnualLeave.Command { Id = id });
        return Ok();
    }
}
