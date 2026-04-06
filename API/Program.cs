using API.Middleware;
using API.Extensions;
using API.Models;
using API.Hubs;
using Application.Core;
using Application.Annualleaves.Queries;
using Application.LeaveTypes.Commands;
using Application.LeaveTypes.DTOs;
using AspNet.Security.OAuth.GitHub;
using Domain;
using FluentValidation;
using Infrastructure;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Persistence;
using System.Text.Json.Serialization;


var builder = WebApplication.CreateBuilder(args);

if (builder.Environment.IsDevelopment())
{
    builder.Configuration.AddUserSecrets<Program>(optional: true);
}

var googleClientId = builder.Configuration["Authentication:Google:ClientId"]?.Trim();
var googleClientSecret = builder.Configuration["Authentication:Google:ClientSecret"]?.Trim();
var githubClientId = builder.Configuration["Authentication:GitHub:ClientId"]?.Trim();
var githubClientSecret = builder.Configuration["Authentication:GitHub:ClientSecret"]?.Trim();

// Add services to the container.

builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
});
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = context =>
    {
        var errors = context.ModelState
            .Where(kvp => kvp.Value is { Errors.Count: > 0 })
            .ToDictionary(
                kvp => kvp.Key,
                kvp => kvp.Value!.Errors
                    .Select(e => string.IsNullOrWhiteSpace(e.ErrorMessage)
                        ? "The input was not valid."
                        : e.ErrorMessage)
                    .ToArray());

        var response = new ApiErrorResponse
        {
            StatusCode = StatusCodes.Status400BadRequest,
            Message = "One or more validation errors occurred.",
            Path = context.HttpContext.Request.Path.Value ?? string.Empty,
            TraceId = context.HttpContext.TraceIdentifier,
            Timestamp = DateTime.UtcNow,
            Errors = errors
        };

        return new BadRequestObjectResult(response);
    };
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerDocumentation();
builder.Services.AddSignalR();
builder.Services.AddInfrastructureServices(builder.Configuration);
builder.Services.AddDbContext<AppDbContext>(opt =>
{

    opt.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection"));
});
builder.Services.AddCors(options =>
{
    options.AddPolicy("ClientPolicy", policy =>
    {
        policy
            .SetIsOriginAllowed(origin =>
            {
                if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
                {
                    return false;
                }

                return uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase);
            })
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});
builder.Services.AddMediatR(x =>
x.RegisterServicesFromAssemblyContaining<GetAnnualleaveList.Handler>());

// Explicit registrations for LeaveType commands to avoid handler resolution issues
// when running under watch/hot-reload in development.
builder.Services.AddTransient<IRequestHandler<CreateLeaveType.Command, Result<LeaveTypeDto>>, CreateLeaveType.Handler>();
builder.Services.AddTransient<IRequestHandler<UpdateLeaveType.Command, Result<LeaveTypeDto>>, UpdateLeaveType.Handler>();
builder.Services.AddTransient<IRequestHandler<DeleteLeaveType.Command, Result<Unit>>, DeleteLeaveType.Handler>();

builder.Services.AddAutoMapper(cfg => { }, typeof(MappingProfiles).Assembly);
builder.Services.AddValidatorsFromAssemblyContaining<MappingProfiles>();
builder.Services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));
builder.Services.AddIdentityApiEndpoints<User>(opt =>
{
    opt.User.RequireUniqueEmail = true;
    opt.SignIn.RequireConfirmedEmail = true;
    opt.SignIn.RequireConfirmedAccount = true;
})
.AddRoles<Role>()
    .AddEntityFrameworkStores<AppDbContext>();

var authenticationBuilder = builder.Services.AddAuthentication();

if (!string.IsNullOrWhiteSpace(googleClientId) && !string.IsNullOrWhiteSpace(googleClientSecret))
{
    authenticationBuilder.AddGoogle(options =>
    {
        options.SignInScheme = IdentityConstants.ExternalScheme;
        options.ClientId = googleClientId;
        options.ClientSecret = googleClientSecret;
    });
}

if (!string.IsNullOrWhiteSpace(githubClientId) && !string.IsNullOrWhiteSpace(githubClientSecret))
{
    authenticationBuilder.AddGitHub(options =>
    {
        options.SignInScheme = IdentityConstants.ExternalScheme;
        options.ClientId = githubClientId;
        options.ClientSecret = githubClientSecret;
        options.Scope.Add("user:email");
    });
}

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AnnualLeaveRead", policy =>
        policy.RequireRole(AppRoles.Admin, AppRoles.Manager, AppRoles.Employee));

    options.AddPolicy("AnnualLeaveCreate", policy =>
        policy.RequireRole(AppRoles.Admin, AppRoles.Manager, AppRoles.Employee));

    options.AddPolicy("AnnualLeaveUpdate", policy =>
        policy.RequireRole(AppRoles.Admin, AppRoles.Manager, AppRoles.Employee));

    options.AddPolicy("AnnualLeaveDelete", policy =>
        policy.RequireRole(AppRoles.Admin, AppRoles.Manager, AppRoles.Employee));

    options.AddPolicy("EmployeeProfileUpdate", policy =>
        policy.RequireRole(AppRoles.Admin));
});
var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwaggerDocumentation();
}

// Configure the HTTP request pipeline.
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseMiddleware<ValidationExceptionMiddleware>();
app.UseMiddleware<RequestValidationMiddleware>();
app.UseCors("ClientPolicy");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGroup("api").MapIdentityApi<User>();
app.MapHub<NotificationsHub>("/hubs/notifications");

using var scope = app.Services.CreateScope();
var services = scope.ServiceProvider;
try
{
    var context = services.GetRequiredService<AppDbContext>();
    var userManager = services.GetRequiredService<UserManager<User>>();
    var roleManager = services.GetRequiredService<RoleManager<Role>>();
    await context.Database.MigrateAsync();
    await DbInitializer.SeedData(context, userManager, roleManager);
}
catch (Exception ex)
{
    var logger = services.GetRequiredService<ILogger<Program>>();
    logger.LogError(ex, "An error accoured duaring migration");
}
app.Run();