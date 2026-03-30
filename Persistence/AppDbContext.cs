using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Domain;

namespace Persistence;

public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<
    User,
    Role,
    string,
    IdentityUserClaim<string>,
    UserRole,
    IdentityUserLogin<string>,
    IdentityRoleClaim<string>,
    IdentityUserToken<string>>(options)
{
    public DbSet<AnnualLeave> AnnualLeaves { get; set; }
    public DbSet<LeaveType> LeaveTypes { get; set; }
    public DbSet<Department> Departments { get; set; }
    public DbSet<UserDepartment> UserDepartments { get; set; }
    public DbSet<EmployeeProfile> EmployeeProfiles { get; set; }
    public DbSet<LeaveStatusHistory> LeaveStatusHistories { get; set; }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<UserRole>(entity =>
        {
            entity.HasKey(ur => new { ur.UserId, ur.RoleId });

            entity.HasOne(ur => ur.User)
                .WithMany(u => u.UserRoles)
                .HasForeignKey(ur => ur.UserId)
                .IsRequired();

            entity.HasOne(ur => ur.Role)
                .WithMany(r => r.UserRoles)
                .HasForeignKey(ur => ur.RoleId)
                .IsRequired();

            entity.ToTable("AspNetUserRoles");
        });

        builder.Entity<AnnualLeave>()
            .HasOne(a => a.Employee)
            .WithMany(u => u.AnnualLeaves)
            .HasForeignKey(a => a.EmployeeId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<AnnualLeave>()
            .HasOne(a => a.ApprovedBy)
            .WithMany(u => u.ApprovedAnnualLeaves)
            .HasForeignKey(a => a.ApprovedById)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<AnnualLeave>()
            .HasOne(a => a.EmployeeProfile)
            .WithMany(ep => ep.AnnualLeaves)
            .HasForeignKey(a => a.EmployeeProfileId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<AnnualLeave>()
            .HasOne(a => a.Department)
            .WithMany(d => d.AnnualLeaves)
            .HasForeignKey(a => a.DepartmentId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<AnnualLeave>()
            .HasOne(a => a.LeaveType)
            .WithMany(lt => lt.AnnualLeaves)
            .HasForeignKey(a => a.LeaveTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<Department>(entity =>
        {
            entity.Property(d => d.Name)
                .IsRequired()
                .HasMaxLength(150);

            entity.Property(d => d.Code)
                .IsRequired()
                .HasMaxLength(20);

            entity.Property(d => d.IsActive)
                .HasDefaultValue(true)
                .IsRequired();

            entity.Property(d => d.CreatedAt)
                .HasDefaultValueSql("SYSUTCDATETIME()")
                .IsRequired();

            entity.HasIndex(d => d.Name)
                .IsUnique();

            entity.HasIndex(d => d.Code)
                .IsUnique();
        });

        builder.Entity<UserDepartment>(entity =>
        {
            entity.HasKey(ud => new { ud.UserId, ud.DepartmentId });

            entity.Property(ud => ud.UserId)
                .HasMaxLength(450)
                .IsRequired();

            entity.Property(ud => ud.AssignedByUserId)
                .HasMaxLength(450);

            entity.Property(ud => ud.AssignedAt)
                .HasDefaultValueSql("SYSUTCDATETIME()")
                .IsRequired();

            entity.HasOne(ud => ud.User)
                .WithMany(u => u.UserDepartments)
                .HasForeignKey(ud => ud.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ud => ud.Department)
                .WithMany(d => d.UserDepartments)
                .HasForeignKey(ud => ud.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ud => ud.AssignedByUser)
                .WithMany(u => u.AssignedUserDepartments)
                .HasForeignKey(ud => ud.AssignedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<LeaveStatusHistory>(entity =>
        {
            entity.HasKey(h => h.Id);

            entity.Property(h => h.Id)
                .HasMaxLength(450)
                .IsRequired();

            entity.Property(h => h.AnnualLeaveId)
                .HasMaxLength(450)
                .IsRequired();

            entity.Property(h => h.ChangedByUserId)
                .HasMaxLength(450)
                .IsRequired();

            entity.Property(h => h.Comment)
                .HasMaxLength(500);

            entity.Property(h => h.ChangedAt)
                .HasDefaultValueSql("SYSUTCDATETIME()")
                .IsRequired();

            entity.HasOne(h => h.AnnualLeave)
                .WithMany(a => a.StatusHistory)
                .HasForeignKey(h => h.AnnualLeaveId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(h => h.ChangedByUser)
                .WithMany(u => u.LeaveStatusChanges)
                .HasForeignKey(h => h.ChangedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<EmployeeProfile>(entity =>
        {
            entity.HasKey(ep => ep.Id);

            entity.Property(ep => ep.Id)
                .HasMaxLength(450)
                .IsRequired();

            entity.Property(ep => ep.UserId)
                .HasMaxLength(450)
                .IsRequired();

            entity.Property(ep => ep.ManagerId)
                .HasMaxLength(450);

            entity.Property(ep => ep.JobTitle)
                .HasMaxLength(150);

            entity.Property(ep => ep.AnnualLeaveEntitlement)
                .HasDefaultValue(20)
                .IsRequired();

            entity.Property(ep => ep.LeaveBalance)
                .IsRequired();

            entity.Property(ep => ep.CreatedAt)
                .HasDefaultValueSql("SYSUTCDATETIME()")
                .IsRequired();

            entity.HasIndex(ep => ep.UserId)
                .IsUnique();

            entity.HasOne(ep => ep.User)
                .WithOne(u => u.EmployeeProfile)
                .HasForeignKey<EmployeeProfile>(ep => ep.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ep => ep.Department)
                .WithMany(d => d.EmployeeProfiles)
                .HasForeignKey(ep => ep.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ep => ep.Manager)
                .WithMany(ep => ep.DirectReports)
                .HasForeignKey(ep => ep.ManagerId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

}
