using Application.UserDepartments.DTOs;
using Application.UserDepartments.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

public class UserDepartmentsController : BaseApiController
{
    [HttpGet]
    [Authorize]
    public async Task<ActionResult<List<UserDepartmentDto>>> GetUserDepartments()
    {
        return await Mediator.Send(new GetUserDepartmentList.Query());
    }
}
