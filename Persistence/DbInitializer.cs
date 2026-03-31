using Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Persistence;

public class DbInitializer
{
    private const string DefaultSeedPassword = "Pa$$w0rd";
    private static readonly Dictionary<string, string> LegacyRoleMappings = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Author"] = AppRoles.Manager,
        ["Viewer"] = AppRoles.Employee
    };

    public static async Task SeedData(AppDbContext context, UserManager<User> userManager,
        RoleManager<Role> roleManager)
    {
        await SeedRoles(roleManager, userManager);
        await SeedUsers(context, userManager);
        await SeedAnnualLeaves(context);
        await SeedLeaveTypes(context);
        await SeedDepartments(context);
        await SeedUserDepartments(context);
        await SeedEmployeeProfiles(context);
    }

    private static async Task SeedRoles(RoleManager<Role> roleManager, UserManager<User> userManager)
    {
        foreach (var role in AppRoles.All)
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await EnsureIdentitySucceeded(
                    () => $"Failed to create role '{role}'.",
                    await roleManager.CreateAsync(new Role { Name = role }));
            }
        }

        foreach (var (legacyRole, replacementRole) in LegacyRoleMappings)
        {
            if (!await roleManager.RoleExistsAsync(legacyRole))
            {
                continue;
            }

            var usersInLegacyRole = await userManager.GetUsersInRoleAsync(legacyRole);
            foreach (var user in usersInLegacyRole)
            {
                if (!await userManager.IsInRoleAsync(user, replacementRole))
                {
                    await EnsureIdentitySucceeded(
                        () => $"Failed to add '{user.Email}' to role '{replacementRole}'.",
                        await userManager.AddToRoleAsync(user, replacementRole));
                }

                await EnsureIdentitySucceeded(
                    () => $"Failed to remove '{user.Email}' from role '{legacyRole}'.",
                    await userManager.RemoveFromRoleAsync(user, legacyRole));
            }

            var role = await roleManager.FindByNameAsync(legacyRole);
            if (role is not null)
            {
                await EnsureIdentitySucceeded(
                    () => $"Failed to delete legacy role '{legacyRole}'.",
                    await roleManager.DeleteAsync(role));
            }
        }
    }

    private static async Task SeedUsers(AppDbContext context, UserManager<User> userManager)
    {
        // Remove legacy seeded accounts so only admin stays as a default user.
        var deprecatedSeedEmails = new[]
        {
            "manager@annualleave.com",
            "employee@annualleave.com",
            "author@annualleave.com",
            "viewer@annualleave.com"
        };

        foreach (var deprecatedEmail in deprecatedSeedEmails)
        {
            var deprecatedUser = await userManager.FindByEmailAsync(deprecatedEmail);
            if (deprecatedUser is null) continue;

            await CleanupUserDependencies(context, deprecatedUser.Id, CancellationToken.None);

            var currentRoles = await userManager.GetRolesAsync(deprecatedUser);
            if (currentRoles.Count > 0)
            {
                await EnsureIdentitySucceeded(
                    () => $"Failed to remove roles for deprecated seed user '{deprecatedEmail}'.",
                    await userManager.RemoveFromRolesAsync(deprecatedUser, currentRoles));
            }

            await EnsureIdentitySucceeded(
                () => $"Failed to delete deprecated seed user '{deprecatedEmail}'.",
                await userManager.DeleteAsync(deprecatedUser));
        }

        var users = new[]
        {
            new { DisplayName = "Admin User", Email = "admin@annualleave.com", LegacyEmail = (string?)null, Role = AppRoles.Admin }
        };

        foreach (var u in users)
        {
            var existingUser = await userManager.FindByEmailAsync(u.Email);
            if (existingUser is null && !string.IsNullOrWhiteSpace(u.LegacyEmail))
            {
                existingUser = await userManager.FindByEmailAsync(u.LegacyEmail);
            }

            if (existingUser is not null)
            {
                var shouldUpdateUser = false;

                if (!string.Equals(existingUser.DisplayName, u.DisplayName, StringComparison.Ordinal))
                {
                    existingUser.DisplayName = u.DisplayName;
                    shouldUpdateUser = true;
                }

                if (!existingUser.EmailConfirmed)
                {
                    existingUser.EmailConfirmed = true;
                    shouldUpdateUser = true;
                }

                if (!string.Equals(existingUser.Email, u.Email, StringComparison.OrdinalIgnoreCase))
                {
                    existingUser.Email = u.Email;
                    shouldUpdateUser = true;
                }

                if (!string.Equals(existingUser.UserName, u.Email, StringComparison.OrdinalIgnoreCase))
                {
                    existingUser.UserName = u.Email;
                    shouldUpdateUser = true;
                }

                if (shouldUpdateUser)
                {
                    await EnsureIdentitySucceeded(
                        () => $"Failed to update seed user '{u.Email}'.",
                        await userManager.UpdateAsync(existingUser));
                }

                if (!await userManager.IsInRoleAsync(existingUser, u.Role))
                {
                    await EnsureIdentitySucceeded(
                        () => $"Failed to add '{u.Email}' to role '{u.Role}'.",
                        await userManager.AddToRoleAsync(existingUser, u.Role));
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

            await EnsureIdentitySucceeded(
                () => $"Failed to add '{u.Email}' to role '{u.Role}'.",
                await userManager.AddToRoleAsync(user, u.Role));
        }
    }

    private static Task EnsureIdentitySucceeded(Func<string> errorMessage, IdentityResult result)
    {
        if (!result.Succeeded)
        {
            throw new InvalidOperationException($"{errorMessage()} {string.Join(", ", result.Errors.Select(e => e.Description))}");
        }

        return Task.CompletedTask;
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

    private static async Task CleanupUserDependencies(AppDbContext context, string userId, CancellationToken cancellationToken)
    {
        var userProfileId = await context.EmployeeProfiles
            .Where(ep => ep.UserId == userId)
            .Select(ep => ep.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(userProfileId))
        {
            var directReports = await context.EmployeeProfiles
                .Where(ep => ep.ManagerId == userProfileId)
                .ToListAsync(cancellationToken);

            foreach (var report in directReports)
            {
                report.ManagerId = null;
            }
        }

        var approvedLeaves = await context.AnnualLeaves
            .Where(al => al.ApprovedById == userId)
            .ToListAsync(cancellationToken);
        foreach (var leave in approvedLeaves)
        {
            leave.ApprovedById = null;
            leave.ApprovedAt = null;
        }

        var assignedByRows = await context.UserDepartments
            .Where(ud => ud.AssignedByUserId == userId)
            .ToListAsync(cancellationToken);
        foreach (var row in assignedByRows)
        {
            row.AssignedByUserId = null;
        }

        var statusChangesByUser = await context.LeaveStatusHistories
            .Where(h => h.ChangedByUserId == userId)
            .ToListAsync(cancellationToken);
        if (statusChangesByUser.Count > 0)
        {
            context.LeaveStatusHistories.RemoveRange(statusChangesByUser);
        }

        var ownedUserDepartments = await context.UserDepartments
            .Where(ud => ud.UserId == userId)
            .ToListAsync(cancellationToken);
        if (ownedUserDepartments.Count > 0)
        {
            context.UserDepartments.RemoveRange(ownedUserDepartments);
        }

        var employeeLeaves = await context.AnnualLeaves
            .Where(al => al.EmployeeId == userId)
            .ToListAsync(cancellationToken);
        if (employeeLeaves.Count > 0)
        {
            context.AnnualLeaves.RemoveRange(employeeLeaves);
        }

        var profile = await context.EmployeeProfiles
            .FirstOrDefaultAsync(ep => ep.UserId == userId, cancellationToken);
        if (profile is not null)
        {
            context.EmployeeProfiles.Remove(profile);
        }

        await context.SaveChangesAsync(cancellationToken);
    }

    private static async Task SeedAnnualLeaves(AppDbContext context)
    {
        if (context.AnnualLeaves.Any()) return;

        var adminUser = context.Users.FirstOrDefault(u => u.Email == "admin@annualleave.com");
        var managerUser = context.Users.FirstOrDefault(u => u.Email == "manager@annualleave.com");
        if (adminUser is null || managerUser is null) return;

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
                EmployeeId = managerUser.Id,
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
        var managerUser = context.Users.FirstOrDefault(u => u.Email == "manager@annualleave.com");
        var employeeUser = context.Users.FirstOrDefault(u => u.Email == "employee@annualleave.com");
        if (adminUser is null || managerUser is null || employeeUser is null) return;

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
                UserId         = managerUser.Id,
                DepartmentId   = engineering.Id,
                AssignedByUserId = adminUser.Id,
                AssignedAt     = DateTime.UtcNow
            },
            new UserDepartment
            {
                UserId         = employeeUser.Id,
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
        var managerUser = context.Users.FirstOrDefault(u => u.Email == "manager@annualleave.com");
        var employeeUser = context.Users.FirstOrDefault(u => u.Email == "employee@annualleave.com");
        if (adminUser is null || managerUser is null || employeeUser is null) return;

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
            AnnualLeaveEntitlement = 22,
            LeaveBalance = 22,
            CreatedAt = DateTime.UtcNow
        };

        // Manager reports to Admin
        var managerProfile = new EmployeeProfile
        {
            Id = Guid.NewGuid().ToString(),
            UserId = managerUser.Id,
            DepartmentId = engineering.Id,
            ManagerId = adminProfile.Id,
            JobTitle = "Engineering Team Lead",
            AnnualLeaveEntitlement = 22,
            LeaveBalance = 22,
            CreatedAt = DateTime.UtcNow
        };

        // Employee in HR, reports to Admin
        var employeeProfile = new EmployeeProfile
        {
            Id = Guid.NewGuid().ToString(),
            UserId = employeeUser.Id,
            DepartmentId = hr.Id,
            ManagerId = adminProfile.Id,
            JobTitle = "HR Coordinator",
            AnnualLeaveEntitlement = 22,
            LeaveBalance = 22,
            CreatedAt = DateTime.UtcNow
        };

        await context.EmployeeProfiles.AddRangeAsync(adminProfile, managerProfile, employeeProfile);
        await context.SaveChangesAsync();
    }

}
