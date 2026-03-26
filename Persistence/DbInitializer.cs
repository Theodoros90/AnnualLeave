using System;
using Domain;
namespace Persistence;

public class DbInitializer
{
    public static async Task SeedData(AppDbContext context)
    {
        await Task.CompletedTask;
    }
}
