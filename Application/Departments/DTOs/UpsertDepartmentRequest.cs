using System.ComponentModel.DataAnnotations;

namespace Application.Departments.DTOs;

public class UpsertDepartmentRequest
{
    [Required]
    [StringLength(100, MinimumLength = 1)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [StringLength(10, MinimumLength = 1)]
    public string Code { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;
}
