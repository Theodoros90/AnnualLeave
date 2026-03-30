namespace Domain;

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
