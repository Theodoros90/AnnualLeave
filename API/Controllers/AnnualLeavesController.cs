using System;
using Application.Annualleaves.Commands;
using Application.Annualleaves.Queries;
using Domain;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

public class AnnualLeavesController : BaseApiController
{
    [HttpGet]
    public async Task<ActionResult<List<AnnualLeave>>> GetAnnualLeaves()
    {
        return await Mediator.Send(new GetAnnualleaveList.Query());
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<AnnualLeave>> GetAnnualLeaveDetails(string id)
    {

        return await Mediator.Send(new GetAnnualLeaveDetails.Query { Id = id });

    }

    [HttpPost]

    public async Task<ActionResult<string>> CreateCustomer(AnnualLeave annualLeave)
    {
        return await Mediator.Send(new CreateAnnualLeave.Command { AnnualLeave = annualLeave });
    }

    [HttpPut]

    public async Task<ActionResult> EditAnnualLeave(AnnualLeave annualLeave)
    {
        await Mediator.Send(new EditAnnualLeave.Command { AnnualLeave = annualLeave });
        return NoContent();
    }
    [HttpDelete("{id}")]

    public async Task<ActionResult> DeleteCustomer(string id)
    {
        await Mediator.Send(new DeleteAnnualLeave.Command { Id = id });
        return Ok();
    }

}
