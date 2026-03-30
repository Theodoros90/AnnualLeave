using Domain;

namespace Application.Annualleaves.DTOs;

public class UpdateLeaveStatusRequest
{
    public AnnualLeaveStatus Status { get; set; }
    public string? StatusComment { get; set; }
}
