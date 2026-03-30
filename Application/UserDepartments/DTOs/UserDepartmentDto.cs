namespace Application.UserDepartments.DTOs;

public class UserDepartmentDto
{
    public string UserId { get; set; } = string.Empty;
    public int DepartmentId { get; set; }
    public DateTime AssignedAt { get; set; }
    public string? AssignedByUserId { get; set; }
}
