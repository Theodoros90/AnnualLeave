using Microsoft.AspNetCore.Identity;

namespace Domain;

public class User : IdentityUser
{
    public string DisplayName { get; set; } = string.Empty;
    public string ImageUrl { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<AnnualLeave> AnnualLeaves { get; set; } = new List<AnnualLeave>();
    public ICollection<AnnualLeave> ApprovedAnnualLeaves { get; set; } = new List<AnnualLeave>();
    public ICollection<LeaveStatusHistory> LeaveStatusChanges { get; set; } = new List<LeaveStatusHistory>();
    public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
    public ICollection<UserDepartment> UserDepartments { get; set; } = new List<UserDepartment>();
    public ICollection<UserDepartment> AssignedUserDepartments { get; set; } = new List<UserDepartment>();
    public EmployeeProfile? EmployeeProfile { get; set; }
}