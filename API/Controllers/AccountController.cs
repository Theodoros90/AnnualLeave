using API.DTOs;
using Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace API.Controllers;

public class AccountController(
    UserManager<User> userManager,
    SignInManager<User> signInManager,
    AppDbContext context) : BaseApiController
{
    [AllowAnonymous]
    [HttpPost("register")]
    public async Task<ActionResult> Register(RegisterDto request)
    {
        if (await userManager.FindByEmailAsync(request.Email) is not null)
        {
            return BadRequest(new { message = "Email is already registered." });
        }

        var user = new User
        {
            UserName = request.Email,
            Email = request.Email,
            DisplayName = request.DisplayName,
            EmailConfirmed = true
        };

        var result = await userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            return BadRequest(new
            {
                message = "Registration failed.",
                errors = result.Errors.Select(e => e.Description)
            });
        }

        var addToRoleResult = await userManager.AddToRoleAsync(user, "Viewer");
        if (!addToRoleResult.Succeeded)
        {
            await userManager.DeleteAsync(user);
            return BadRequest(new
            {
                message = "Failed to assign role.",
                errors = addToRoleResult.Errors.Select(e => e.Description)
            });
        }

        var defaultDepartmentId = await context.Departments
            .Where(d => d.IsActive)
            .OrderBy(d => d.Id)
            .Select(d => (int?)d.Id)
            .FirstOrDefaultAsync();

        if (defaultDepartmentId is null)
        {
            await userManager.DeleteAsync(user);
            return BadRequest(new
            {
                message = "Registration failed because no active department is configured for employee profile assignment."
            });
        }

        var employeeProfile = new EmployeeProfile
        {
            UserId = user.Id,
            DepartmentId = defaultDepartmentId.Value,
            JobTitle = "Employee",
            AnnualLeaveEntitlement = 20,
            LeaveBalance = 20,
            CreatedAt = DateTime.UtcNow
        };

        try
        {
            context.EmployeeProfiles.Add(employeeProfile);
            await context.SaveChangesAsync();
        }
        catch
        {
            await userManager.DeleteAsync(user);
            throw;
        }

        return Ok(new
        {
            message = "User registered successfully.",
            role = "Viewer",
            employeeProfileId = employeeProfile.Id
        });
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult> Login(LoginDto request)
    {
        var result = await signInManager.PasswordSignInAsync(request.Email, request.Password, request.RememberMe, lockoutOnFailure: false);
        if (!result.Succeeded)
        {
            return Unauthorized(new { message = "Invalid email or password." });
        }

        return Ok(new { message = "Logged in successfully." });
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<ActionResult> Logout()
    {
        await signInManager.SignOutAsync();
        return Ok(new { message = "Logged out successfully." });
    }

    [Authorize]
    [HttpGet("user-info")]
    public async Task<ActionResult> GetUserInfo()
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null)
        {
            return Unauthorized(new { message = "User is not authenticated." });
        }

        var roles = await userManager.GetRolesAsync(user);

        return Ok(new
        {
            user.Id,
            user.UserName,
            user.Email,
            user.DisplayName,
            Roles = roles
        });
    }
}
