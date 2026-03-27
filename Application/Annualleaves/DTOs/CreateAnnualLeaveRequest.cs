using System;

namespace Application.Annualleaves.DTOs;

public class CreateAnnualLeaveRequest : BaseAnnualLeaveDto
{

    public string EmployeeId { get; set; } = string.Empty;
}