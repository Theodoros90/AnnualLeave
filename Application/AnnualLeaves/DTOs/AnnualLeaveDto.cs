using System;
using System.ComponentModel.DataAnnotations;
using Domain.Services;

namespace Application.AnnualLeaves.DTOs;

public class AnnualLeaveDto
{

    public string Id { get; set; } = string.Empty;


    public string EmployeeId { get; set; } = string.Empty;

    public int? LeaveTypeId { get; set; }

    public string? ChildId { get; set; }

    /// <summary>Empty when the request is not for a child.</summary>
    public string ChildName { get; set; } = string.Empty;


    public DateTime StartDate { get; set; }


    public DateTime EndDate { get; set; }


    public string Reason { get; set; } = string.Empty;

    public string? EvidenceUrl { get; set; }

    public string? DelegateId { get; set; }

    public string DelegateName { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;


    public DateTime CreatedAt { get; set; }

    public DateTime? ApprovedAt { get; set; }


    /// <summary>
    /// Days charged, which for a half day is 0.5. Decimal, and carrying no
    /// <c>[Range(1, …)]</c>: that attribute sat here while the type was int and
    /// would now reject the very value this field exists to report. It was never
    /// doing anything useful regardless — this is a response DTO, and nothing
    /// validates what the server is about to send.
    /// </summary>
    public decimal TotalDays { get; set; }

    /// <summary>
    /// "Full", "HalfDayMorning" or "HalfDayAfternoon". A string for the same reason
    /// <see cref="Status"/> is one: the client reads it as a label, and a number
    /// would make the wire format turn on the enum's declaration order.
    /// </summary>
    public string Duration { get; set; } = nameof(LeaveDuration.Full);

    public string EmployeeName { get; set; } = string.Empty;

    public string DepartmentName { get; set; } = string.Empty;
}