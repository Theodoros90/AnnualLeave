namespace Application.AdminUsers.DTOs;

/// <summary>
/// The full set of departments an HR Administrator runs — a replace, not a patch:
/// what is sent is what is stored. At least one is required; the validator says so.
/// </summary>
public class AdminSetUserDepartmentsDto
{
    public List<int> DepartmentIds { get; set; } = new();
}
