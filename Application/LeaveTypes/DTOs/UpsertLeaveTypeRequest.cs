using System.ComponentModel.DataAnnotations;

namespace Application.LeaveTypes.DTOs;

public class UpsertLeaveTypeRequest
{
    [Required]
    [StringLength(100, MinimumLength = 1)]
    public string Name { get; set; } = string.Empty;

    public bool RequiresApproval { get; set; } = true;

    public bool IsActive { get; set; } = true;
}
