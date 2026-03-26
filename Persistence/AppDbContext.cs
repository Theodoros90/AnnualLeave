using Microsoft.EntityFrameworkCore;
using Domain;

namespace Persistence;

public class AppDbContext(DbContextOptions options) : DbContext(options)
{
    public DbSet<AnnualLeave> AnnualLeaves { get; set; }
}
