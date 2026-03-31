using API.Middleware;
using API.Extensions;
using Application.Core;
using Application.Annualleaves.Queries;
using Application.LeaveTypes.Commands;
using Application.LeaveTypes.DTOs;
using Domain;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Persistence;
using FluentValidation;
using Application.Annualleaves.Validators;
using Application.EmployeeProfiles.Validators;
using System.Text.Json.Serialization;


var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerDocumentation();
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
builder.Services.AddValidatorsFromAssemblyContaining<CreateAnnualLeaveRequestValidator>();
builder.Services.AddValidatorsFromAssemblyContaining<EditAnnualLeaveRequestValidator>();
builder.Services.AddValidatorsFromAssemblyContaining<EditEmployeeProfileRequestValidator>();
builder.Services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));
builder.Services.AddIdentityApiEndpoints<User>(opt =>
{
    opt.User.RequireUniqueEmail = true;
    opt.SignIn.RequireConfirmedEmail = false;
    opt.SignIn.RequireConfirmedAccount = false;
})
.AddRoles<Role>()
    .AddEntityFrameworkStores<AppDbContext>();
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
app.UseMiddleware<ValidationExceptionMiddleware>();
app.UseCors("ClientPolicy");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGroup("api").MapIdentityApi<User>();

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