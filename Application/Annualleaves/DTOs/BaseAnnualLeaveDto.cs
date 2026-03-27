using System;
using System.ComponentModel.DataAnnotations;

namespace Application.Annualleaves.DTOs;

public class BaseAnnualLeaveDto
{
    public DateTime StartDate { get; set; }

    public DateTime EndDate { get; set; }

    [StringLength(500, MinimumLength = 1)]
    public string Reason { get; set; } = string.Empty;
}