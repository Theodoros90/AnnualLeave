using Domain;
using Microsoft.AspNetCore.Identity;

namespace Persistence;

public class DbInitializer
{
    private const string DefaultSeedPassword = "Pa$$w0rd";

    public static async Task SeedData(AppDbContext context, UserManager<User> userManager,
        RoleManager<IdentityRole> roleManager)
    {
        await SeedRoles(roleManager);
        await SeedUsers(userManager);
        await SeedAnnualLeaves(context);
    }

    private static async Task SeedRoles(RoleManager<IdentityRole> roleManager)
    {
        var roles = new[] { "Admin", "Author", "Viewer" };

        foreach (var role in roles)
        {
            if (!await roleManager.RoleExistsAsync(role))
                await roleManager.CreateAsync(new IdentityRole(role));
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

        var annualLeaves = new List<AnnualLeave>
        {
            new AnnualLeave
            {
                Id = Guid.NewGuid().ToString(),
                EmployeeId = "EMP001",
                StartDate = DateTime.Now.AddMonths(1),
                EndDate = DateTime.Now.AddMonths(1).AddDays(5)
            },
            new AnnualLeave
            {
                Id = Guid.NewGuid().ToString(),
                EmployeeId = "EMP002",
                StartDate = DateTime.Now.AddMonths(2),
                EndDate = DateTime.Now.AddMonths(2).AddDays(10)
            }
        };

        await context.AnnualLeaves.AddRangeAsync(annualLeaves);
        await context.SaveChangesAsync();
    }
}
