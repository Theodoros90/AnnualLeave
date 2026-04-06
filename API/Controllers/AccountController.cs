using API.DTOs;
using CloudinaryDotNet;
using CloudinaryDotNet.Actions;
using Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Persistence;
using Resend;
using System.Net;
using System.Security.Claims;
using System.Text;

namespace API.Controllers;

public class AccountController(
    UserManager<User> userManager,
    SignInManager<User> signInManager,
    AppDbContext context,
    IConfiguration configuration,
    IResend resend,
    ILogger<AccountController> logger) : BaseApiController
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
            EmailConfirmed = false
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

        var departmentExists = await context.Departments
            .AnyAsync(d => d.Id == request.DepartmentId && d.IsActive);

        if (!departmentExists)
        {
            await userManager.DeleteAsync(user);
            return BadRequest(new
            {
                message = "Registration failed because the selected department is invalid or inactive."
            });
        }

        var employeeProfile = new EmployeeProfile
        {
            UserId = user.Id,
            DepartmentId = request.DepartmentId,
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

        var verificationEmailSent = await SendVerificationEmailAsync(user);

        return Ok(new
        {
            message = verificationEmailSent
                ? "User registered successfully. Please check your email to verify your account."
                : "User registered successfully, but the verification email could not be sent.",
            role = AppRoles.Employee,
            employeeProfileId = employeeProfile.Id,
            emailVerificationRequired = true,
            verificationEmailSent
        });
    }

    [AllowAnonymous]
    [HttpGet("verify-email")]
    public async Task<ActionResult> VerifyEmail([FromQuery] string userId, [FromQuery] string token)
    {
        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(token))
        {
            return RenderVerificationPage(
                "Verification link invalid",
                "We could not verify your email because the link is incomplete or invalid.",
                false);
        }

        var user = await userManager.FindByIdAsync(userId);
        if (user is null)
        {
            return RenderVerificationPage(
                "Verification failed",
                "This verification link is no longer valid or the account could not be found.",
                false);
        }

        if (user.EmailConfirmed)
        {
            return RenderVerificationPage(
                "Email already confirmed",
                "Your email address has already been verified. You can sign in to your account.",
                true);
        }

        string decodedToken;
        try
        {
            decodedToken = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(token));
        }
        catch (Exception)
        {
            return RenderVerificationPage(
                "Verification token invalid",
                "The confirmation token could not be read. Please request a new verification email.",
                false);
        }

        var result = await userManager.ConfirmEmailAsync(user, decodedToken);
        if (!result.Succeeded)
        {
            var errorMessage = result.Errors.Select(e => e.Description).FirstOrDefault()
                ?? "Email verification failed.";

            return RenderVerificationPage(
                "Verification failed",
                errorMessage,
                false);
        }

        return RenderVerificationPage(
            "Email confirmed",
            "Thanks for confirming your email address. Your account is now active and you can log in.",
            true);
    }

    [AllowAnonymous]
    [HttpGet("external-login/{provider}")]
    public IActionResult ExternalLogin(string provider, [FromQuery] string? returnUrl = null)
    {
        if (!TryGetExternalProviderSettings(provider, out var normalizedProvider, out var clientId, out var clientSecret))
        {
            return RedirectToAuthPage("error", "Only Google and GitHub sign-in are currently supported.");
        }

        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
        {
            return RedirectToAuthPage("error", $"{normalizedProvider} sign-in is not configured yet. Add the client ID and client secret first.");
        }

        returnUrl ??= BuildClientAuthUrl("dashboard");

        var redirectUrl = Url.Action(nameof(ExternalLoginCallback), "Account", new { returnUrl });
        if (string.IsNullOrWhiteSpace(redirectUrl))
        {
            redirectUrl = $"/api/account/external-login-callback?returnUrl={Uri.EscapeDataString(returnUrl)}";
        }

        var properties = signInManager.ConfigureExternalAuthenticationProperties(normalizedProvider, redirectUrl);
        return Challenge(properties, normalizedProvider);
    }

    [AllowAnonymous]
    [HttpGet("external-login-callback")]
    public async Task<IActionResult> ExternalLoginCallback([FromQuery] string? returnUrl = null, [FromQuery] string? remoteError = null)
    {
        returnUrl ??= BuildClientAuthUrl("dashboard");

        if (!string.IsNullOrWhiteSpace(remoteError))
        {
            return RedirectToAuthPage("error", $"External sign-in failed: {remoteError}");
        }

        var info = await signInManager.GetExternalLoginInfoAsync();
        if (info is null)
        {
            return RedirectToAuthPage("error", "We could not load your external login information. Please try again.");
        }

        var signInResult = await signInManager.ExternalLoginSignInAsync(
            info.LoginProvider,
            info.ProviderKey,
            isPersistent: false,
            bypassTwoFactor: true);

        if (signInResult.Succeeded)
        {
            return RedirectToClient(returnUrl);
        }

        if (signInResult.IsLockedOut)
        {
            return RedirectToAuthPage("error", "This account is locked. Please contact an administrator.");
        }

        var email = info.Principal.FindFirstValue(ClaimTypes.Email);
        if (string.IsNullOrWhiteSpace(email))
        {
            return RedirectToAuthPage("error", $"{info.LoginProvider} did not provide an email address for this account.");
        }

        var user = await userManager.FindByEmailAsync(email);
        if (user is null)
        {
            var defaultDepartment = await context.Departments
                .AsNoTracking()
                .Where(d => d.IsActive)
                .OrderBy(d => d.Name)
                .FirstOrDefaultAsync();

            if (defaultDepartment is null)
            {
                return RedirectToAuthPage("error", "No active department is available for new social sign-ins. Please contact an administrator.");
            }

            var displayName = info.Principal.FindFirstValue(ClaimTypes.Name) ?? email;
            user = new User
            {
                UserName = email,
                Email = email,
                DisplayName = displayName,
                EmailConfirmed = true
            };

            var createResult = await userManager.CreateAsync(user);
            if (!createResult.Succeeded)
            {
                var createMessage = createResult.Errors.Select(e => e.Description).FirstOrDefault()
                    ?? $"Unable to create a local account for {info.LoginProvider} sign-in.";

                return RedirectToAuthPage("error", createMessage);
            }

            var addRoleResult = await userManager.AddToRoleAsync(user, AppRoles.Employee);
            if (!addRoleResult.Succeeded)
            {
                await userManager.DeleteAsync(user);
                var roleMessage = addRoleResult.Errors.Select(e => e.Description).FirstOrDefault()
                    ?? "Unable to assign the default Employee role for this account.";

                return RedirectToAuthPage("error", roleMessage);
            }

            try
            {
                context.EmployeeProfiles.Add(new EmployeeProfile
                {
                    UserId = user.Id,
                    DepartmentId = defaultDepartment.Id,
                    JobTitle = "Employee",
                    AnnualLeaveEntitlement = 22,
                    LeaveBalance = 22,
                    CreatedAt = DateTime.UtcNow
                });

                await context.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to create an employee profile for external login user {UserId}.", user.Id);
                await userManager.DeleteAsync(user);
                return RedirectToAuthPage("error", "Unable to finish setting up your social sign-in account. Please try again.");
            }
        }
        else if (!user.EmailConfirmed)
        {
            user.EmailConfirmed = true;
            await userManager.UpdateAsync(user);
        }

        var addLoginResult = await userManager.AddLoginAsync(user, info);
        if (!addLoginResult.Succeeded)
        {
            var loginMessage = addLoginResult.Errors.Select(e => e.Description).FirstOrDefault()
                ?? $"Unable to link your {info.LoginProvider} account.";

            return RedirectToAuthPage("error", loginMessage);
        }

        await signInManager.SignInAsync(user, isPersistent: false, info.LoginProvider);
        return RedirectToClient(returnUrl);
    }

    [AllowAnonymous]
    [HttpPost("forgot-password")]
    public async Task<ActionResult> ForgotPassword(ForgotPasswordDto request)
    {
        const string responseMessage = "If an account with that email exists and has been verified, a password reset link has been sent.";

        var email = request.Email.Trim();
        var user = await userManager.FindByEmailAsync(email);
        if (user is null || !user.EmailConfirmed)
        {
            return Ok(new { message = responseMessage });
        }

        await SendPasswordResetEmailAsync(user);
        return Ok(new { message = responseMessage });
    }

    [AllowAnonymous]
    [HttpPost("reset-password")]
    public async Task<ActionResult> ResetPassword(ResetPasswordDto request)
    {
        var email = request.Email.Trim();
        var user = await userManager.FindByEmailAsync(email);
        if (user is null || !user.EmailConfirmed)
        {
            return BadRequest(new { message = "The password reset link is invalid or has expired." });
        }

        string decodedToken;
        try
        {
            decodedToken = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(request.Token));
        }
        catch (Exception)
        {
            return BadRequest(new { message = "The password reset token is invalid." });
        }

        var result = await userManager.ResetPasswordAsync(user, decodedToken, request.NewPassword);
        if (!result.Succeeded)
        {
            return BadRequest(new
            {
                message = "Unable to reset the password.",
                errors = result.Errors.Select(e => e.Description)
            });
        }

        return Ok(new { message = "Password reset successfully. You can now sign in with your new password." });
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult> Login(LoginDto request)
    {
        var result = await signInManager.PasswordSignInAsync(request.Email, request.Password, request.RememberMe, lockoutOnFailure: false);
        if (result.IsNotAllowed)
        {
            return Unauthorized(new
            {
                message = "Your account has not been verified yet. Please check your email and click the confirmation link before signing in."
            });
        }

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
        var employeeProfile = await context.EmployeeProfiles
            .AsNoTracking()
            .Include(profile => profile.Department)
            .FirstOrDefaultAsync(profile => profile.UserId == user.Id);

        return Ok(new
        {
            user.Id,
            user.UserName,
            user.Email,
            user.DisplayName,
            user.ImageUrl,
            DepartmentId = employeeProfile?.DepartmentId,
            DepartmentName = employeeProfile?.Department?.Name,
            Roles = roles
        });
    }

    [Authorize]
    [HttpPut("profile")]
    public async Task<ActionResult> UpdateProfile(UpdateProfileDto request)
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null)
        {
            return Unauthorized(new { message = "User is not authenticated." });
        }

        var displayName = request.DisplayName.Trim();
        var email = request.Email.Trim();
        var normalizedEmail = userManager.NormalizeEmail(email);

        var emailInUse = await userManager.Users
            .AnyAsync(existing => existing.Id != user.Id && existing.NormalizedEmail == normalizedEmail);

        if (emailInUse)
        {
            return BadRequest(new { message = "Email is already registered." });
        }

        var employeeProfile = await context.EmployeeProfiles
            .FirstOrDefaultAsync(profile => profile.UserId == user.Id);

        if (employeeProfile is null)
        {
            return BadRequest(new { message = "Employee profile could not be found." });
        }

        var department = await context.Departments
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == request.DepartmentId && d.IsActive);

        if (department is null)
        {
            return BadRequest(new { message = "The selected department is invalid or inactive." });
        }

        user.DisplayName = displayName;
        user.Email = email;
        user.UserName = email;
        employeeProfile.DepartmentId = department.Id;

        var result = await userManager.UpdateAsync(user);

        if (!result.Succeeded)
        {
            return BadRequest(new
            {
                message = "Failed to update profile.",
                errors = result.Errors.Select(e => e.Description)
            });
        }

        await context.SaveChangesAsync();

        return Ok(new
        {
            message = "Profile updated successfully.",
            displayName = user.DisplayName,
            email = user.Email,
            departmentId = department.Id,
            departmentName = department.Name
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

    private bool TryGetExternalProviderSettings(string provider, out string normalizedProvider, out string? clientId, out string? clientSecret)
    {
        if (string.Equals(provider, "google", StringComparison.OrdinalIgnoreCase))
        {
            normalizedProvider = "Google";
            clientId = configuration["Authentication:Google:ClientId"];
            clientSecret = configuration["Authentication:Google:ClientSecret"];
            return true;
        }

        if (string.Equals(provider, "github", StringComparison.OrdinalIgnoreCase))
        {
            normalizedProvider = "GitHub";
            clientId = configuration["Authentication:GitHub:ClientId"];
            clientSecret = configuration["Authentication:GitHub:ClientSecret"];
            return true;
        }

        normalizedProvider = string.Empty;
        clientId = null;
        clientSecret = null;
        return false;
    }

    private IActionResult RedirectToAuthPage(string status, string message, string hashRoute = "login")
    {
        return Redirect(BuildClientAuthUrl(hashRoute, new Dictionary<string, string?>
        {
            ["authStatus"] = status,
            ["authMessage"] = message
        }));
    }

    private IActionResult RedirectToClient(string url)
    {
        return Uri.TryCreate(url, UriKind.Absolute, out _)
            ? Redirect(url)
            : LocalRedirect(url);
    }

    private string BuildClientAuthUrl(string hashRoute, IDictionary<string, string?>? query = null)
    {
        var clientBaseUrl = configuration["ClientApp:BaseUrl"];
        if (string.IsNullOrWhiteSpace(clientBaseUrl))
        {
            clientBaseUrl = "https://localhost:5173";
        }

        clientBaseUrl = clientBaseUrl.TrimEnd('/');

        var url = $"{clientBaseUrl}/";
        if (query is { Count: > 0 })
        {
            url = QueryHelpers.AddQueryString(url, query);
        }

        if (!string.IsNullOrWhiteSpace(hashRoute))
        {
            url = $"{url}{(hashRoute.StartsWith('#') ? hashRoute : $"#{hashRoute}")}";
        }

        return url;
    }

    private ContentResult RenderVerificationPage(string title, string message, bool isSuccess)
    {
        var loginUrl = BuildClientAuthUrl("login", new Dictionary<string, string?>
        {
            ["authStatus"] = isSuccess ? "success" : "error",
            ["authMessage"] = message
        });

        var safeTitle = WebUtility.HtmlEncode(title);
        var safeMessage = WebUtility.HtmlEncode(message);
        var safeClientBaseUrl = WebUtility.HtmlEncode(loginUrl);
        var badgeText = isSuccess ? "Email confirmed" : "Verification issue";
        var badgeClass = isSuccess ? "badge success" : "badge error";
        var buttonText = isSuccess ? "Go to login" : "Open application";

        var html = $$"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{safeTitle}}</title>
    <style>
        :root {
            color-scheme: light;
            --bg: #f4f7fb;
            --card: #ffffff;
            --text: #0f172a;
            --muted: #475569;
            --success: #0f766e;
            --success-soft: #ccfbf1;
            --error: #b91c1c;
            --error-soft: #fee2e2;
            --shadow: 0 20px 45px rgba(15, 23, 42, 0.12);
        }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
            font-family: Inter, "Segoe UI", Arial, sans-serif;
            background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 50%, #ecfeff 100%);
            color: var(--text);
        }

        .card {
            width: min(100%, 560px);
            background: var(--card);
            border-radius: 20px;
            padding: 32px;
            box-shadow: var(--shadow);
            border: 1px solid rgba(148, 163, 184, 0.18);
        }

        .badge {
            display: inline-flex;
            align-items: center;
            padding: 6px 12px;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 700;
            margin-bottom: 18px;
        }

        .badge.success {
            color: var(--success);
            background: var(--success-soft);
        }

        .badge.error {
            color: var(--error);
            background: var(--error-soft);
        }

        h1 {
            margin: 0 0 12px;
            font-size: 30px;
            line-height: 1.2;
        }

        p {
            margin: 0 0 24px;
            font-size: 16px;
            line-height: 1.6;
            color: var(--muted);
        }

        .actions {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }

        .button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 12px 18px;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 700;
            background: #111827;
            color: #ffffff;
        }

        .subtle {
            font-size: 14px;
            margin-top: 18px;
            color: #64748b;
        }
    </style>
</head>
<body>
    <main class="card">
        <div class="{{badgeClass}}">{{badgeText}}</div>
        <h1>{{safeTitle}}</h1>
        <p>{{safeMessage}}</p>
        <div class="actions">
            <a class="button" href="{{safeClientBaseUrl}}">{{buttonText}}</a>
        </div>
        <p class="subtle">Annual Leave account services</p>
    </main>
</body>
</html>
""";

        return Content(html, "text/html");
    }

    private static string BuildEmailBody(
        string previewText,
        string heading,
        string recipientName,
        string bodyText,
        string actionText,
        string actionUrl,
        string footerText)
    {
        var safePreviewText = WebUtility.HtmlEncode(previewText);
        var safeHeading = WebUtility.HtmlEncode(heading);
        var safeRecipientName = WebUtility.HtmlEncode(recipientName);
        var safeBodyText = WebUtility.HtmlEncode(bodyText);
        var safeActionText = WebUtility.HtmlEncode(actionText);
        var safeActionUrl = WebUtility.HtmlEncode(actionUrl);
        var safeFooterText = WebUtility.HtmlEncode(footerText);

        return $$"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{safeHeading}}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef3f8;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{{safePreviewText}}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(180deg,#eef3f8 0%,#f8fafc 100%);">
        <tr>
            <td align="center" style="padding:40px 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background-color:#ffffff;border:1px solid #d9e3f0;border-radius:20px;overflow:hidden;box-shadow:0 18px 40px rgba(15,23,42,0.08);">
                    <tr>
                        <td style="padding:0;background-color:#0b1f3a;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="padding:28px 32px;background:linear-gradient(135deg,#0f766e 0%,#0b1f3a 100%);color:#ffffff;">
                                        <div style="display:inline-block;padding:8px 12px;border-radius:999px;background-color:rgba(255,255,255,0.14);font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Annual Leave</div>
                                        <div style="margin-top:14px;font-size:30px;line-height:1.25;font-weight:700;">{{safeHeading}}</div>
                                        <div style="margin-top:8px;font-size:14px;line-height:1.6;color:rgba(255,255,255,0.84);">Secure account communication</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:34px 32px;">
                            <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Hello {{safeRecipientName}},</p>
                            <p style="margin:0 0 24px;font-size:16px;line-height:1.75;color:#334155;">{{safeBodyText}}</p>

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border:1px solid #dbe7f3;border-radius:14px;background-color:#f8fbff;">
                                <tr>
                                    <td style="padding:18px 20px;">
                                        <div style="font-size:13px;font-weight:700;color:#0f766e;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Next step</div>
                                        <div style="font-size:14px;line-height:1.7;color:#475569;">Use the button below to continue securely.</div>
                                    </td>
                                </tr>
                            </table>

                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
                                <tr>
                                    <td align="center" bgcolor="#0f766e" style="border-radius:12px;background-color:#0f766e;mso-padding-alt:14px 26px;">
                                        <a href="{{safeActionUrl}}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.2;font-weight:700;color:#ffffff !important;text-decoration:none;background-color:#0f766e;border:1px solid #0f766e;border-radius:12px;">
                                            <span style="color:#ffffff;">{{safeActionText}}</span>
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#475569;">If the button above does not open, copy and paste this secure link into your browser:</p>
                            <p style="margin:0 0 24px;padding:12px 14px;font-size:13px;line-height:1.8;word-break:break-all;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                                <a href="{{safeActionUrl}}" style="color:#0f766e;text-decoration:underline;">{{safeActionUrl}}</a>
                            </p>

                            <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 18px;" />
                            <p style="margin:0 0 10px;font-size:14px;line-height:1.75;color:#334155;">{{safeFooterText}}</p>
                            <p style="margin:0;font-size:12px;line-height:1.7;color:#64748b;">This is an automated message from Annual Leave account services. Please do not reply directly to this email.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
""";
    }

    private async Task<bool> SendPasswordResetEmailAsync(User user)
    {
        if (string.IsNullOrWhiteSpace(user.Email))
        {
            logger.LogWarning("Password reset email was skipped because the user email is missing for user {UserId}.", user.Id);
            return false;
        }

        var fromEmail = configuration["Resend:FromEmail"];
        if (string.IsNullOrWhiteSpace(fromEmail))
        {
            logger.LogWarning("Password reset email was skipped because Resend:FromEmail is not configured.");
            return false;
        }

        var token = await userManager.GeneratePasswordResetTokenAsync(user);
        var encodedToken = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));
        var resetUrl = BuildClientAuthUrl("reset-password", new Dictionary<string, string?>
        {
            ["email"] = user.Email,
            ["token"] = encodedToken
        });

        var displayName = string.IsNullOrWhiteSpace(user.DisplayName) ? user.Email : user.DisplayName;
        var fromName = configuration["Resend:FromName"];

        var emailMessage = new EmailMessage
        {
            From = string.IsNullOrWhiteSpace(fromName)
                ? fromEmail
                : $"{fromName} <{fromEmail}>",
            Subject = "Reset your Annual Leave password",
            TextBody = $"Hello {displayName},\n\nWe received a request to reset your Annual Leave password. Use the secure link below to choose a new password:\n{resetUrl}\n\nIf you did not request a password reset, you can safely ignore this email.",
            HtmlBody = BuildEmailBody(
                "Reset your Annual Leave password",
                "Password reset request",
                displayName,
                "We received a request to reset your Annual Leave password. Use the secure button below to choose a new password.",
                "Reset your password",
                resetUrl,
                "If you did not request a password reset, no further action is required and you can safely ignore this message.")
        };

        emailMessage.To.Add(user.Email);

        try
        {
            await resend.EmailSendAsync(emailMessage);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to send password reset email for user {UserId}.", user.Id);
            return false;
        }
    }

    private async Task<bool> SendVerificationEmailAsync(User user)
    {
        if (string.IsNullOrWhiteSpace(user.Email))
        {
            logger.LogWarning("Verification email was skipped because the user email is missing for user {UserId}.", user.Id);
            return false;
        }

        var fromEmail = configuration["Resend:FromEmail"];
        if (string.IsNullOrWhiteSpace(fromEmail))
        {
            logger.LogWarning("Verification email was skipped because Resend:FromEmail is not configured.");
            return false;
        }

        var token = await userManager.GenerateEmailConfirmationTokenAsync(user);
        var encodedToken = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));

        var baseUrl = configuration["App:BaseUrl"];
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            baseUrl = $"{Request.Scheme}://{Request.Host.Value}";
        }

        baseUrl = baseUrl.TrimEnd('/');
        var verificationUrl = $"{baseUrl}/api/account/verify-email?userId={Uri.EscapeDataString(user.Id)}&token={Uri.EscapeDataString(encodedToken)}";
        var displayName = string.IsNullOrWhiteSpace(user.DisplayName) ? user.Email : user.DisplayName;
        var fromName = configuration["Resend:FromName"];

        var emailMessage = new EmailMessage
        {
            From = string.IsNullOrWhiteSpace(fromName)
                ? fromEmail
                : $"{fromName} <{fromEmail}>",
            Subject = "Verify your Annual Leave account",
            TextBody = $"Hello {displayName},\n\nWelcome to Annual Leave. Please confirm your email address using the secure link below:\n{verificationUrl}\n\nIf you did not create this account, you can safely ignore this email.",
            HtmlBody = BuildEmailBody(
                "Verify your Annual Leave account",
                "Confirm your email address",
                displayName,
                "Welcome to Annual Leave. Please confirm your email address to activate your account and complete sign-in access.",
                "Verify email address",
                verificationUrl,
                "If you did not create this account, you can safely ignore this email.")
        };

        emailMessage.To.Add(user.Email);

        try
        {
            await resend.EmailSendAsync(emailMessage);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to send verification email for user {UserId}.", user.Id);
            return false;
        }
    }
}
