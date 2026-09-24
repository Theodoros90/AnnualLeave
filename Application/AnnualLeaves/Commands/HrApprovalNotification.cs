using Application.Core;
using Domain;
using Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.AnnualLeaves.Commands;

/// <summary>
/// "A leave request is waiting on you" to the HR Administrators who can decide
/// it. Sent from the two places a request reaches
/// <see cref="AnnualLeaveStatus.AwaitingHrApproval"/>: filing on a type that asks
/// for HR alone (<see cref="CreateAnnualLeave"/>), and a manager's approval on a
/// type that asks for both (<see cref="UpdateLeaveStatus"/>, and the status path
/// of <see cref="EditAnnualLeave"/>).
///
/// Carries the reason and the coverage line, like the manager's new-request
/// email: the apply form promises the reason reaches the people deciding the
/// request, and at this stage that is HR. Nothing is announced to the delegate
/// or the department — see <see cref="CoverageNotification"/> for why that waits
/// for the final approval.
/// </summary>
public static class HrApprovalNotification
{
    public const string Subject = "Leave request awaiting your approval";

    public static async Task SendAsync(
        AppDbContext context,
        IEmailService emailService,
        AnnualLeave annualLeave,
        LeaveType leaveType,
        EmployeeProfile employeeProfile,
        string? approvedByUserId,
        CancellationToken cancellationToken)
    {
        var recipients = await HrApprovalRecipients.ResolveAsync(
            context, annualLeave.DepartmentId, approvedByUserId ?? annualLeave.EmployeeId, cancellationToken);
        // The employee is never told about their own request this way, whoever approved it.
        recipients.RemoveAll(r => r.UserId == annualLeave.EmployeeId);
        if (recipients.Count == 0)
            return;

        var names = await context.Users
            .AsNoTracking()
            .Where(u => u.Id == annualLeave.EmployeeId || u.Id == approvedByUserId)
            .Select(u => new { u.Id, Name = !string.IsNullOrWhiteSpace(u.DisplayName) ? u.DisplayName : (u.Email ?? u.UserName ?? "") })
            .ToListAsync(cancellationToken);

        var employeeName = names.FirstOrDefault(n => n.Id == annualLeave.EmployeeId)?.Name is { Length: > 0 } e ? e : "Employee";
        var approverName = approvedByUserId is null ? null : names.FirstOrDefault(n => n.Id == approvedByUserId)?.Name;
        var dateRange = $"{annualLeave.StartDate:dd MMM yyyy} to {annualLeave.EndDate:dd MMM yyyy}";
        var coverage = await CoverageNotification.DescribeAsync(context, annualLeave.DelegateId, cancellationToken);

        // Sentence takes a FormattableString so it can encode each interpolated
        // value; a ternary of two interpolations would decay to a plain string.
        FormattableString sentence;
        if (approverName is null)
            sentence = $"A {leaveType.Name} request from {employeeName} for {dateRange} is awaiting HR approval.";
        else
            sentence = $"A {leaveType.Name} request from {employeeName} for {dateRange} has been approved by {approverName} and is awaiting HR approval.";

        foreach (var recipient in recipients)
        {
            var body = NotificationEmail
                .To(recipient.DisplayName ?? recipient.Email)
                .Sentence(sentence)
                .Detail("Reason", annualLeave.Reason)
                .Detail("Coverage", coverage)
                .Closing("Please log in to the Annual Leave system to review and take action.")
                .Build();

            await emailService.SendEmailAsync(recipient.Email, Subject, body.Html, body.Text, cancellationToken);
        }
    }
}
