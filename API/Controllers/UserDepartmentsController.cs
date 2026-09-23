using Application.UserDepartments.DTOs;
using Application.UserDepartments.Queries;
using Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Asp.Versioning;

namespace API.Controllers;

[ApiVersion("1.0")]

public class UserDepartmentsController : BaseApiController
{
    // A UserDepartment row now says which departments an HR Administrator runs, so
    // the whole table is a map of who reaches whose leave and timesheets. That is
    // system administration to read, not a company directory.
    [HttpGet]
    [Authorize(Roles = AppRoles.SystemAdministrator)]
    public async Task<ActionResult<List<UserDepartmentDto>>> GetUserDepartments()
    {
        return await Mediator.Send(new GetUserDepartmentList.Query());
    }
}
