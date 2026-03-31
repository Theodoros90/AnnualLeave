using Application.Annualleaves.Commands;
using Application.Annualleaves.DTOs;
using Application.Annualleaves.Queries;
using Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace API.Controllers;

public class AnnualLeavesController : BaseApiController
{
    // Visibility is role-scoped: Admin all, Manager by assigned departments, Employee own requests.
    [HttpGet]
    [Authorize(Policy = "AnnualLeaveRead")]
    public async Task<ActionResult<List<AnnualLeaveDto>>> GetAnnualLeaves()
    {
        return await Mediator.Send(new GetAnnualleaveList.Query
        {
            RequestingUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty,
            IsAdmin = User.IsInRole(AppRoles.Admin),
            IsManager = User.IsInRole(AppRoles.Manager),
            IsEmployee = User.IsInRole(AppRoles.Employee)
        });
    }

    // Visibility is role-scoped: Admin all, Manager by assigned departments, Employee own requests.
    [HttpGet("{id}")]
    [Authorize(Policy = "AnnualLeaveRead")]
    public async Task<ActionResult<AnnualLeaveDto>> GetAnnualLeaveDetails(string id)
    {
        var result = await Mediator.Send(new GetAnnualLeaveDetails.Query
        {
            Id = id,
            RequestingUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty,
            IsAdmin = User.IsInRole(AppRoles.Admin),
            IsManager = User.IsInRole(AppRoles.Manager),
            IsEmployee = User.IsInRole(AppRoles.Employee)
        });
        return HandleResult(result);
    }

    // All roles can create leaves; status is defaulted to Pending in mapping profile.
    // Admin can supply a target EmployeeId to create on behalf of another user.
    [HttpPost]
    [Authorize(Policy = "AnnualLeaveCreate")]
    public async Task<ActionResult<string>> CreateAnnualLeave(CreateAnnualLeaveRequest request)
    {
        var isAdmin = User.IsInRole(AppRoles.Admin);
        // Non-admins always create for themselves; admins may supply a target user id.
        if (!isAdmin || string.IsNullOrWhiteSpace(request.EmployeeId))
            request.EmployeeId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;

        return await Mediator.Send(new CreateAnnualLeave.Command { AnnualLeave = request });
    }

    // Admin can edit all leaves; Employee can edit own leaves; Manager can edit own and managed-department leaves.
    [HttpPut]
    [Authorize(Policy = "AnnualLeaveUpdate")]
    public async Task<ActionResult> EditAnnualLeave(EditAnnualLeaveRequest request)
    {
        await Mediator.Send(new EditAnnualLeave.Command
        {
            AnnualLeave = request,
            ChangedByUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty,
            IsAdmin = User.IsInRole(AppRoles.Admin),
            IsManager = User.IsInRole(AppRoles.Manager)
        });
        return NoContent();
    }

    // Admin and Managers can approve/reject leaves via status-only update.
    [HttpPatch("{id}/status")]
    [Authorize(Policy = "AnnualLeaveUpdate")]
    public async Task<ActionResult> UpdateLeaveStatus(string id, UpdateLeaveStatusRequest request)
    {
        await Mediator.Send(new UpdateLeaveStatus.Command
        {
            LeaveId = id,
            Request = request,
            ChangedByUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty,
            IsAdmin = User.IsInRole(AppRoles.Admin),
            IsManager = User.IsInRole(AppRoles.Manager),
        });
        return NoContent();
    }

    // Admin can delete all leaves; Employee can delete own leaves; Manager can delete own and managed-department leaves.
    [HttpDelete("{id}")]
    [Authorize(Policy = "AnnualLeaveDelete")]
    public async Task<ActionResult> DeleteAnnualLeave(string id)
    {
        await Mediator.Send(new DeleteAnnualLeave.Command
        {
            Id = id,
            RequestingUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty,
            IsAdmin = User.IsInRole(AppRoles.Admin),
            IsManager = User.IsInRole(AppRoles.Manager)
        });
        return Ok();
    }
}
