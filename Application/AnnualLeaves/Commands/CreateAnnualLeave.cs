using Domain.Interfaces;
using Application.AnnualLeaves.DTOs;
using Application.Core;
using AutoMapper;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.AnnualLeaves.Commands;

public class CreateAnnualLeave
{
    public class Command : IRequest<Result<string>>
    {
        public required CreateAnnualLeaveRequest AnnualLeave { get; set; }
    }

    public class Handler(AppDbContext context, IMapper mapper, IEmailService emailService) : IRequestHandler<Command, Result<string>>
    {
        public async Task<Result<string>> Handle(Command request, CancellationToken cancellationToken)
        {
            var annualLeave = mapper.Map<AnnualLeave>(request.AnnualLeave);

            var employeeProfile = await context.EmployeeProfiles
                .FirstOrDefaultAsync(ep => ep.UserId == request.AnnualLeave.EmployeeId, cancellationToken);

            if (employeeProfile is null)
                return Result<string>.Failure("Employee profile not found for the selected user.");

            annualLeave.EmployeeProfileId = employeeProfile.Id;
            annualLeave.DepartmentId = employeeProfile.DepartmentId;

            var leaveType = await context.LeaveTypes
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    type => type.Id == annualLeave.LeaveTypeId && type.IsActive, cancellationToken);

            if (leaveType is null)
                return Result<string>.Failure("Selected leave type is not available.");

            /* First of the three type-driven refusals, because it is the one the
               employee can act on without leaving the form. The client disables
               submit for it, so reaching this is a crafted request or a stale page. */
            var attachmentError = AttachmentPolicyRule.Check(leaveType, annualLeave.EvidenceUrl);
            if (attachmentError is not null)
                return Result<string>.Failure(attachmentError);

            /* Beside the attachment check and for the same reason: the employee can
               act on it without leaving the form, and the client mirrors it so
               reaching here means a crafted request or a stale page. */
            var halfDayError = HalfDayRule.Check(
                leaveType, annualLeave.Duration, annualLeave.StartDate, annualLeave.EndDate);
            if (halfDayError is not null)
                return Result<string>.Failure(halfDayError);

            /* The two limits the leave type's card has always advertised and nothing
               has ever enforced. Beside the checks above because they are the same
               kind of refusal: the employee can act on both without leaving the form,
               and client/src/lib/leave-limits.ts mirrors them, so reaching here means
               a crafted request or a stale page. No exemption for an admin filing on
               somebody else's behalf, matching AttachmentPolicyRule. */
            var noticeError = NoticePeriodRule.Check(
                leaveType, annualLeave.StartDate, DateTime.UtcNow.Date);
            if (noticeError is not null)
                return Result<string>.Failure(noticeError);

            var maxConsecutiveError = await MaxConsecutiveRule.CheckAsync(
                context, leaveType, annualLeave.StartDate, annualLeave.EndDate, cancellationToken);
            if (maxConsecutiveError is not null)
                return Result<string>.Failure(maxConsecutiveError);

            /* How long the employee has to have worked here before this type is
               offered to them, measured to today. The client hides the card until
               then; this is what makes hiding it mean something. No exemption for an
               admin filing on somebody's behalf — the rule is about the employee,
               not about who is typing. */
            var serviceError = MinimumServiceRule.Check(
                leaveType, employeeProfile.EmploymentStartDate, DateOnly.FromDateTime(DateTime.UtcNow.Date));
            if (serviceError is not null)
                return Result<string>.Failure(serviceError);

            /* Maternity and Paternity Leave are offered on the employee's recorded
               gender and their having a child young enough to qualify. The client
               hides the cards; this is what makes hiding them mean something. Runs
               before the per-child check and defers to it for a type that keeps its
               own ledger, so Paternity Leave keeps its more specific messages. */
            var eligibilityError = await ParentalLeaveEligibility.CheckAsync(
                context,
                leaveType,
                request.AnnualLeave.EmployeeId,
                employeeProfile,
                cancellationToken);
            if (eligibilityError is not null)
                return Result<string>.Failure(eligibilityError);

            /* The child comes from the client, so trust the leave type instead: a
               request on a type with no per-child entitlement carries no child, no
               matter what was posted. Otherwise switching a request from Paternity
               to Annual Leave would leave the ledger charging a child for it. */
            annualLeave.ChildId = leaveType.PerChildEntitlement
                ? request.AnnualLeave.ChildId
                : null;

            /* Checked here even when the type requires approval — unlike the pooled
               balance, which is only checked at creation when the type auto-approves.
               A per-child refusal is something the employee can act on (pick another
               child, shorten the request); waiting for a manager to hit it days later
               helps nobody. It is re-checked on approval in UpdateLeaveStatus. */
            var perChildError = await PerChildLeaveBalanceCalculator.CheckPerChildEntitlementAsync(
                context,
                annualLeave,
                employeeProfile,
                excludeLeaveId: annualLeave.Id,
                cancellationToken);
            if (perChildError is not null)
                return Result<string>.Failure(perChildError);

            if (leaveType.RequiresApproval)
            {
                annualLeave.Status = AnnualLeaveStatus.Pending;
            }
            else
            {
                annualLeave.Status = AnnualLeaveStatus.Approved;
                annualLeave.ApprovedAt = DateTime.UtcNow;

                var balanceError = await AnnualLeaveBalanceCalculator.CheckSufficientBalanceAsync(
                    context,
                    employeeProfile,
                    annualLeave,
                    excludeLeaveId: annualLeave.Id,
                    cancellationToken);
                if (balanceError is not null)
                    return Result<string>.Failure(balanceError);

                context.LeaveStatusHistories.Add(new LeaveStatusHistory
                {
                    Id = Guid.NewGuid().ToString(),
                    AnnualLeaveId = annualLeave.Id,
                    ChangedByUserId = annualLeave.EmployeeId,
                    OldStatus = AnnualLeaveStatus.Pending,
                    NewStatus = AnnualLeaveStatus.Approved,
                    Comment = "Automatically approved based on leave type settings.",
                    ChangedAt = DateTime.UtcNow,
                });
            }

            context.AnnualLeaves.Add(annualLeave);

            // One transaction over both saves: the balance sync reads approved leave
            // back out of the database, so it cannot share the leave's SaveChanges,
            // and a failure on the second write must not leave the balance stale
            // against a leave that has already been written.
            await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);

            await context.SaveChangesAsync(cancellationToken);

            if (!leaveType.RequiresApproval)
            {
                await AnnualLeaveBalanceCalculator.SyncCurrentYearBalanceAsync(context, employeeProfile, cancellationToken);
                await context.SaveChangesAsync(cancellationToken);
            }

            await transaction.CommitAsync(cancellationToken);

            // Manager notifications go out only once the write is committed: an email
            // about a request that rolled back is worse than a late one.
            if (leaveType.RequiresApproval)
            {
                // Notify the employee's manager(s): the direct manager and every
                // Manager-role user in the employee's department.
                var recipients = await ManagerNotificationRecipients.ResolveAsync(
                    context, employeeProfile, cancellationToken);

                if (recipients.Count > 0)
                {
                    var employeeUser = await context.Users
                        .AsNoTracking()
                        .FirstOrDefaultAsync(u => u.Id == employeeProfile.UserId, cancellationToken);

                    var employeeName = employeeUser?.DisplayName ?? employeeUser?.Email ?? "Employee";
                    var leaveTypeName = leaveType.Name;
                    var dateRange = $"{annualLeave.StartDate:dd MMM yyyy} to {annualLeave.EndDate:dd MMM yyyy}";
                    var subject = $"New leave request from {employeeName}";

                    // The approver decides with cover in front of them, rather than
                    // having to open the request to find out whether any was
                    // arranged. This is the only coverage detail that goes out
                    // before approval — see CoverageNotification for why the rest
                    // waits.
                    var coverage = await CoverageNotification.DescribeAsync(
                        context, annualLeave.DelegateId, cancellationToken);

                    foreach (var recipient in recipients)
                    {
                        // NotificationEmail encodes the display names and the
                        // free-text reason for the HTML rendering. This used to
                        // interpolate all three raw.
                        var body = NotificationEmail
                            .To(recipient.DisplayName ?? recipient.Email)
                            .Sentence($"You have a new {leaveTypeName} request from {employeeName} for {dateRange}.")
                            .Detail("Reason", annualLeave.Reason)
                            .Detail("Coverage", coverage)
                            .Closing("Please log in to the Annual Leave system to review and take action.")
                            .Build();

                        await emailService.SendEmailAsync(
                            recipient.Email,
                            subject,
                            body.Html,
                            body.Text,
                            cancellationToken);
                    }
                }
            }
            else
            {
                // The type approved it on the spot, so coverage is settled and can
                // be announced now. A type that requires approval announces nothing
                // here — UpdateLeaveStatus does it if and when a manager approves.
                await CoverageNotification.AnnounceAsync(
                    context,
                    emailService,
                    annualLeave,
                    employeeProfile,
                    notifyDepartment: true,
                    cancellationToken);
            }

            return Result<string>.Success(annualLeave.Id);
        }
    }
}
