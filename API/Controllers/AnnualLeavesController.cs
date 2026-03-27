using System;
using Application.Annualleaves.Commands;
using Application.Annualleaves.DTOs;
using Application.Annualleaves.Queries;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

public class AnnualLeavesController : BaseApiController
{
    [HttpGet]
    public async Task<ActionResult<List<AnnualLeaveDto>>> GetAnnualLeaves()
    {
        return await Mediator.Send(new GetAnnualleaveList.Query());
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<AnnualLeaveDto>> GetAnnualLeaveDetails(string id)
    {
        var result = await Mediator.Send(new GetAnnualLeaveDetails.Query { Id = id });
        return HandleResult(result);
    }

    [HttpPost]
    public async Task<ActionResult<string>> CreateAnnualLeave(CreateAnnualLeaveRequest request)
    {
        return await Mediator.Send(new CreateAnnualLeave.Command { AnnualLeave = request });
    }

    [HttpPut]
    public async Task<ActionResult> EditAnnualLeave(EditAnnualLeaveRequest request)
    {
        await Mediator.Send(new EditAnnualLeave.Command { AnnualLeave = request });
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteAnnualLeave(string id)
    {
        await Mediator.Send(new DeleteAnnualLeave.Command { Id = id });
        return Ok();
    }
}
