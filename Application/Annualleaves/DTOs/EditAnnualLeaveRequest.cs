using System;

namespace Application.Annualleaves.DTOs;

public class EditAnnualLeaveRequest : BaseAnnualLeaveDto
{

    public string Id { get; set; } = string.Empty;
}