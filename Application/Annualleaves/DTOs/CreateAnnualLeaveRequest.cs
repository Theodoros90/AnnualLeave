using System;
using System.ComponentModel.DataAnnotations;

namespace Application.Annualleaves.DTOs;

public class CreateAnnualLeaveRequest : BaseAnnualLeaveDto
{
    [Required]
    public string EmployeeId { get; set; } = string.Empty;
}