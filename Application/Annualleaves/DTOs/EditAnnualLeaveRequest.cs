using System;
using Domain;

namespace Application.Annualleaves.DTOs;

public class EditAnnualLeaveRequest : BaseAnnualLeaveDto
{

    public string Id { get; set; } = string.Empty;
    public AnnualLeaveStatus? Status { get; set; }
    public string? StatusComment { get; set; }
}