using API.DTOs;
using CloudinaryDotNet;
using CloudinaryDotNet.Actions;
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
    AppDbContext context,
    IConfiguration configuration) : BaseApiController
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

        var addToRoleResult = await userManager.AddToRoleAsync(user, AppRoles.Employee);
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
            AnnualLeaveEntitlement = 22,
            LeaveBalance = 22,
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
            role = AppRoles.Employee,
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
            user.ImageUrl,
            Roles = roles
        });
    }

    [Authorize]
    [HttpPost("profile-image")]
    [RequestSizeLimit(5_000_000)]
    public async Task<ActionResult> UploadProfileImage([FromForm] IFormFile file)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest(new { message = "Please select an image file." });
        }

        if (!file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "Only image files are supported." });
        }

        var user = await userManager.GetUserAsync(User);
        if (user is null)
        {
            return Unauthorized(new { message = "User is not authenticated." });
        }

        var cloudName = configuration["Cloudinary:CloudName"];
        var apiKey = configuration["Cloudinary:ApiKey"];
        var apiSecret = configuration["Cloudinary:ApiSecret"];

        if (string.IsNullOrWhiteSpace(cloudName)
            || string.IsNullOrWhiteSpace(apiKey)
            || string.IsNullOrWhiteSpace(apiSecret))
        {
            return BadRequest(new { message = "Cloudinary is not configured." });
        }

        var account = new Account(cloudName, apiKey, apiSecret);
        var cloudinary = new Cloudinary(account)
        {
            Api = { Secure = true }
        };

        await using var stream = file.OpenReadStream();
        var uploadParams = new ImageUploadParams
        {
            File = new FileDescription(file.FileName, stream),
            Folder = "annualleave/users",
            PublicId = $"user-{user.Id}-{DateTime.UtcNow:yyyyMMddHHmmss}",
            UseFilename = false,
            UniqueFilename = true,
            Overwrite = true
        };

        var uploadResult = await cloudinary.UploadAsync(uploadParams);
        if (uploadResult.Error is not null || uploadResult.SecureUrl is null)
        {
            return BadRequest(new
            {
                message = uploadResult.Error?.Message ?? "Failed to upload image."
            });
        }

        user.ImageUrl = uploadResult.SecureUrl.ToString();
        await userManager.UpdateAsync(user);

        return Ok(new { imageUrl = user.ImageUrl });
    }
}
