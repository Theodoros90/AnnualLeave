using Domain;
using Microsoft.AspNetCore.Identity;

namespace Persistence;

public class DbInitializer
{
    private const string DefaultSeedPassword = "Pa$$w0rd";

    public static async Task SeedData(AppDbContext context, UserManager<User> userManager,
        RoleManager<Role> roleManager)
    {
        await SeedRoles(roleManager);
        await SeedUsers(userManager);
        await SeedAnnualLeaves(context);
        await SeedLeaveTypes(context);
        await SeedDepartments(context);
        await SeedUserDepartments(context);
        await SeedEmployeeProfiles(context);
    }

    private static async Task SeedRoles(RoleManager<Role> roleManager)
    {
        var roles = new[] { "Admin", "Author", "Viewer" };

        foreach (var role in roles)
        {
            if (!await roleManager.RoleExistsAsync(role))
                await roleManager.CreateAsync(new Role { Name = role });
        }
    }

    private static async Task SeedUsers(UserManager<User> userManager)
    {
        var users = new[]
        {
            new { DisplayName = "Admin User",  Email = "admin@annualleave.com",  Role = "Admin"  },
            new { DisplayName = "Author User", Email = "author@annualleave.com", Role = "Author" },
            new { DisplayName = "Viewer User", Email = "viewer@annualleave.com", Role = "Viewer" }
        };

        foreach (var u in users)
        {
            var existingUser = await userManager.FindByEmailAsync(u.Email);
            if (existingUser is not null)
            {
                if (!string.Equals(existingUser.UserName, u.Email, StringComparison.OrdinalIgnoreCase))
                {
                    var setUserNameResult = await userManager.SetUserNameAsync(existingUser, u.Email);
                    if (!setUserNameResult.Succeeded)
                    {
                        throw new InvalidOperationException($"Failed to set username for seed user '{u.Email}': {string.Join(", ", setUserNameResult.Errors.Select(e => e.Description))}");
                    }
                }

                if (!existingUser.EmailConfirmed)
                {
                    existingUser.EmailConfirmed = true;
                    await userManager.UpdateAsync(existingUser);
                }

                if (!await userManager.IsInRoleAsync(existingUser, u.Role))
                {
                    await userManager.AddToRoleAsync(existingUser, u.Role);
                }

                // Keep seeded users deterministic across environments.
                await EnsurePassword(userManager, existingUser);

                continue;
            }

            var user = new User
            {
                DisplayName = u.DisplayName,
                UserName = u.Email,
                Email = u.Email,
                EmailConfirmed = true
            };

            var createResult = await userManager.CreateAsync(user, DefaultSeedPassword);
            if (!createResult.Succeeded)
            {
                throw new InvalidOperationException($"Failed to create seed user '{u.Email}': {string.Join(", ", createResult.Errors.Select(e => e.Description))}");
            }

            await userManager.AddToRoleAsync(user, u.Role);
        }
    }

    private static async Task EnsurePassword(UserManager<User> userManager, User user)
    {
        if (await userManager.CheckPasswordAsync(user, DefaultSeedPassword))
            return;

        if (await userManager.HasPasswordAsync(user))
        {
            var removeResult = await userManager.RemovePasswordAsync(user);
            if (!removeResult.Succeeded)
            {
                throw new InvalidOperationException($"Failed to remove password for seed user '{user.Email}': {string.Join(", ", removeResult.Errors.Select(e => e.Description))}");
            }
        }

        var addResult = await userManager.AddPasswordAsync(user, DefaultSeedPassword);
        if (!addResult.Succeeded)
        {
            throw new InvalidOperationException($"Failed to set password for seed user '{user.Email}': {string.Join(", ", addResult.Errors.Select(e => e.Description))}");
        }
    }

    private static async Task SeedAnnualLeaves(AppDbContext context)
    {
        if (context.AnnualLeaves.Any()) return;

        var adminUser = context.Users.FirstOrDefault(u => u.Email == "admin@annualleave.com");
        var authorUser = context.Users.FirstOrDefault(u => u.Email == "author@annualleave.com");
        if (adminUser is null || authorUser is null) return;

        var annualLeaves = new List<AnnualLeave>
        {
            new AnnualLeave
            {
                Id = Guid.NewGuid().ToString(),
                EmployeeId = adminUser.Id,
                StartDate = DateTime.Now.AddMonths(1),
                EndDate = DateTime.Now.AddMonths(1).AddDays(5)
            },
            new AnnualLeave
            {
                Id = Guid.NewGuid().ToString(),
                EmployeeId = authorUser.Id,
                StartDate = DateTime.Now.AddMonths(2),
                EndDate = DateTime.Now.AddMonths(2).AddDays(10)
            }
        };

        await context.AnnualLeaves.AddRangeAsync(annualLeaves);
        await context.SaveChangesAsync();
    }

    private static async Task SeedLeaveTypes(AppDbContext context)
    {
        if (context.LeaveTypes.Any()) return;

        var leaveTypes = new List<LeaveType>
        {
            new LeaveType { Name = "Annual Leave",       RequiresApproval = true,  IsActive = true },
            new LeaveType { Name = "Sick Leave",         RequiresApproval = false, IsActive = true },
            new LeaveType { Name = "Maternity Leave",    RequiresApproval = true,  IsActive = true },
            new LeaveType { Name = "Paternity Leave",    RequiresApproval = true,  IsActive = true },
            new LeaveType { Name = "Unpaid Leave",       RequiresApproval = true,  IsActive = true },
            new LeaveType { Name = "Compassionate Leave",RequiresApproval = false, IsActive = true },
        };

        await context.LeaveTypes.AddRangeAsync(leaveTypes);
        await context.SaveChangesAsync();
    }

    private static async Task SeedDepartments(AppDbContext context)
    {
        if (context.Departments.Any()) return;

        var departments = new List<Department>
        {
            new Department { Name = "Engineering",       Code = "ENG",  IsActive = true },
            new Department { Name = "Human Resources",   Code = "HR",   IsActive = true },
            new Department { Name = "Finance",           Code = "FIN",  IsActive = true },
            new Department { Name = "Marketing",         Code = "MKT",  IsActive = true },
            new Department { Name = "Operations",        Code = "OPS",  IsActive = true },
        };

        await context.Departments.AddRangeAsync(departments);
        await context.SaveChangesAsync();
    }

    private static async Task SeedUserDepartments(AppDbContext context)
    {
        if (context.UserDepartments.Any()) return;

        var adminUser = context.Users.FirstOrDefault(u => u.Email == "admin@annualleave.com");
        var authorUser = context.Users.FirstOrDefault(u => u.Email == "author@annualleave.com");
        var viewerUser = context.Users.FirstOrDefault(u => u.Email == "viewer@annualleave.com");
        if (adminUser is null || authorUser is null || viewerUser is null) return;

        var engineering = context.Departments.FirstOrDefault(d => d.Code == "ENG");
        var hr = context.Departments.FirstOrDefault(d => d.Code == "HR");
        var finance = context.Departments.FirstOrDefault(d => d.Code == "FIN");
        if (engineering is null || hr is null || finance is null) return;

        var userDepartments = new List<UserDepartment>
        {
            new UserDepartment
            {
                UserId         = adminUser.Id,
                DepartmentId   = engineering.Id,
                AssignedByUserId = adminUser.Id,
                AssignedAt     = DateTime.UtcNow
            },
            new UserDepartment
            {
                UserId         = authorUser.Id,
                DepartmentId   = engineering.Id,
                AssignedByUserId = adminUser.Id,
                AssignedAt     = DateTime.UtcNow
            },
            new UserDepartment
            {
                UserId         = viewerUser.Id,
                DepartmentId   = hr.Id,
                AssignedByUserId = adminUser.Id,
                AssignedAt     = DateTime.UtcNow
            },
        };

        await context.UserDepartments.AddRangeAsync(userDepartments);
        await context.SaveChangesAsync();
    }

    private static async Task SeedEmployeeProfiles(AppDbContext context)
    {
        if (context.EmployeeProfiles.Any()) return;

        var adminUser = context.Users.FirstOrDefault(u => u.Email == "admin@annualleave.com");
        var authorUser = context.Users.FirstOrDefault(u => u.Email == "author@annualleave.com");
        var viewerUser = context.Users.FirstOrDefault(u => u.Email == "viewer@annualleave.com");
        if (adminUser is null || authorUser is null || viewerUser is null) return;

        var engineering = context.Departments.FirstOrDefault(d => d.Code == "ENG");
        var hr = context.Departments.FirstOrDefault(d => d.Code == "HR");
        if (engineering is null || hr is null) return;

        // Admin profile — no manager (top of hierarchy)
        var adminProfile = new EmployeeProfile
        {
            Id = Guid.NewGuid().ToString(),
            UserId = adminUser.Id,
            DepartmentId = engineering.Id,
            ManagerId = null,
            JobTitle = "Engineering Manager",
            AnnualLeaveEntitlement = 25,
            LeaveBalance = 25,
            CreatedAt = DateTime.UtcNow
        };

        // Author reports to Admin
        var authorProfile = new EmployeeProfile
        {
            Id = Guid.NewGuid().ToString(),
            UserId = authorUser.Id,
            DepartmentId = engineering.Id,
            ManagerId = adminProfile.Id,
            JobTitle = "Senior Developer",
            AnnualLeaveEntitlement = 22,
            LeaveBalance = 22,
            CreatedAt = DateTime.UtcNow
        };

        // Viewer in HR, reports to Admin
        var viewerProfile = new EmployeeProfile
        {
            Id = Guid.NewGuid().ToString(),
            UserId = viewerUser.Id,
            DepartmentId = hr.Id,
            ManagerId = adminProfile.Id,
            JobTitle = "HR Coordinator",
            AnnualLeaveEntitlement = 20,
            LeaveBalance = 20,
            CreatedAt = DateTime.UtcNow
        };

        await context.EmployeeProfiles.AddRangeAsync(adminProfile, authorProfile, viewerProfile);
        await context.SaveChangesAsync();
    }

}
