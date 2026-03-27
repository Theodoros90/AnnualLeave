using System;
using Domain;
namespace Persistence;

public class DbInitializer
{
    public static async Task SeedData(AppDbContext context)
    {
        // Check if data already exists
        if (context.AnnualLeaves.Any())
            return;

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
