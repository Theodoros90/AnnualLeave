namespace Domain;

/// <summary>
/// A department this user covers beyond the one on their profile. For a Manager an
/// extra department; for an HR Administrator — whose profile has no department —
/// the whole of their scope. Read by <c>ManagerAccessScopeResolver</c> for both.
/// Rows are written by <c>CreateAdminUser</c> and <c>SetAdminUserDepartments</c>,
/// and cleared when the user leaves those two roles (<c>SetAdminUserRoles</c>).
/// </summary>
public class UserDepartment
{
    public string UserId { get; set; } = string.Empty;
    public User? User { get; set; }

    public int DepartmentId { get; set; }
    public Department? Department { get; set; }

    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;

    public string? AssignedByUserId { get; set; }
    public User? AssignedByUser { get; set; }
}
