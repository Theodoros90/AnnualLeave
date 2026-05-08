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
    public DbSet<Project> Projects { get; set; }
    public DbSet<Timesheet> Timesheets { get; set; }
    public DbSet<TimesheetEntry> TimesheetEntries { get; set; }
    public DbSet<TimesheetStatusHistory> TimesheetStatusHistories { get; set; }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<TimesheetStatusHistory>(entity =>
        {
            entity.Property(e => e.Id)
                .HasMaxLength(450)
                .IsRequired();

            entity.Property(e => e.TimesheetId)
                                .HasMaxLength(450)
                                .IsRequired();

            entity.Property(e => e.ChangedByUserId)
                                .HasMaxLength(450)
                                .IsRequired();

            entity.Property(e => e.FromStatus)
                                .IsRequired();

            entity.Property(e => e.ToStatus)
                                .IsRequired();

            entity.Property(e => e.Comment)
                                .HasMaxLength(500);

            entity.Property(e => e.ChangedAt)
                                .IsRequired();

            entity.HasOne(e => e.Timesheet)
                                .WithMany(t => t.StatusHistory)
                                .HasForeignKey(e => e.TimesheetId)
                                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.ChangedByUser)
                                .WithMany()
                                .HasForeignKey(e => e.ChangedByUserId)
                                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => e.TimesheetId);
        });

        builder.Entity<TimesheetEntry>(entity =>
        {
            entity.Property(e => e.Id)
                .HasMaxLength(450)
                .IsRequired();

            entity.Property(e => e.TimesheetId)
                .HasMaxLength(450)
                .IsRequired();

            entity.Property(e => e.ProjectId)
                .IsRequired();

            entity.Property(e => e.Date)
                .IsRequired();

            entity.Property(e => e.HoursWorked)
                .HasColumnType("decimal(4,2)")
                .IsRequired();

            entity.Property(e => e.Notes)
                .HasMaxLength(300);

            entity.HasOne(e => e.Timesheet)
                .WithMany(t => t.Entries)
                .HasForeignKey(e => e.TimesheetId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Project)
                .WithMany(p => p.TimesheetEntries)
                .HasForeignKey(e => e.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.TimesheetId);
        });

        builder.Entity<Timesheet>(entity =>
        {
            entity.Property(t => t.Id).HasMaxLength(450).IsRequired();
            entity.Property(t => t.EmployeeId).HasMaxLength(450).IsRequired();
            entity.Property(t => t.DepartmentId).IsRequired();
            entity.Property(t => t.PeriodStart).IsRequired();
            entity.Property(t => t.PeriodEnd).IsRequired();
            entity.Property(t => t.TotalHours).HasColumnType("decimal(5,2)").IsRequired();
            entity.Property(t => t.Status).IsRequired();
            entity.Property(t => t.ApproverId).HasMaxLength(450);
            entity.Property(t => t.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()").IsRequired();
            entity.HasIndex(t => t.EmployeeId);
            entity.HasIndex(t => t.DepartmentId);
            entity.HasOne(t => t.Employee).WithMany(e => e.Timesheets).HasForeignKey(t => t.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(t => t.Department).WithMany(d => d.Timesheets).HasForeignKey(t => t.DepartmentId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(t => t.Approver).WithMany(u => u.ApprovedTimesheets).HasForeignKey(t => t.ApproverId).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<UserRole>(entity =>
        {
            entity.HasKey(ur => new { ur.UserId, ur.RoleId });
            entity.HasOne(ur => ur.User).WithMany(u => u.UserRoles).HasForeignKey(ur => ur.UserId).IsRequired();
            entity.HasOne(ur => ur.Role).WithMany(r => r.UserRoles).HasForeignKey(ur => ur.RoleId).IsRequired();
            entity.ToTable("AspNetUserRoles");
        });

        builder.Entity<UserDepartment>(entity =>
        {
            entity.HasKey(ud => new { ud.UserId, ud.DepartmentId });
            entity.HasOne(ud => ud.User).WithMany(u => u.UserDepartments).HasForeignKey(ud => ud.UserId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(ud => ud.AssignedByUser).WithMany(u => u.AssignedUserDepartments).HasForeignKey(ud => ud.AssignedByUserId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(ud => ud.Department).WithMany(d => d.UserDepartments).HasForeignKey(ud => ud.DepartmentId).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<AnnualLeave>(entity =>
        {
            entity.HasOne(al => al.Employee)
                .WithMany()
                .HasForeignKey(al => al.EmployeeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(al => al.ApprovedBy)
                .WithMany()
                .HasForeignKey(al => al.ApprovedById)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Project>(entity =>
        {
            entity.Property(p => p.Name)
                .IsRequired()
                .HasMaxLength(150);

            entity.Property(p => p.Code)
                .IsRequired()
                .HasMaxLength(20);

            entity.Property(p => p.IsActive)
                .HasDefaultValue(true)
                .IsRequired();

            entity.Property(p => p.CreatedAt)
                .HasDefaultValueSql("SYSUTCDATETIME()")
                .IsRequired();

            entity.HasIndex(p => p.Name)
                .IsUnique();

            entity.HasIndex(p => p.Code)
                .IsUnique();

            entity.HasOne(p => p.Department)
                .WithMany(d => d.Projects)
                .HasForeignKey(p => p.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
