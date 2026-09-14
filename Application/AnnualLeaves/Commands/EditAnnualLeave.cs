using System;
using Application.AnnualLeaves.DTOs;
using Application.Core;
using Domain;
using Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.AnnualLeaves.Commands;

public class EditAnnualLeave
{
    public class Command : IRequest<Result<Unit>>
    {
        public required EditAnnualLeaveRequest AnnualLeave { get; set; }
        public string ChangedByUserId { get; set; } = string.Empty;
        public bool IsAdmin { get; set; }
        public bool IsManager { get; set; }
    }
    public class Handler(AppDbContext context, IEmailService emailService) : IRequestHandler<Command, Result<Unit>>
    {
        public async Task<Result<Unit>> Handle(Command request, CancellationToken cancellationToken)
        {
            var annualLeave = await context.AnnualLeaves
                .FindAsync([request.AnnualLeave.Id], cancellationToken);

            if (annualLeave is null)
                return Result<Unit>.Failure("Cannot find the annual leave.");

            if (string.IsNullOrWhiteSpace(request.ChangedByUserId))
            {
                return Result<Unit>.Failure("User context is required.");
            }

            var isInManagedDepartment = false;
            var isDirectReport = false;
            if (request.IsManager)
            {
                var managerScope = await ManagerAccessScopeResolver.ResolveAsync(
                    context,
                    request.ChangedByUserId,
                    cancellationToken);

                isInManagedDepartment = annualLeave.DepartmentId.HasValue
                    && managerScope.ManagedDepartmentIds.Contains(annualLeave.DepartmentId.Value);
                isDirectReport = managerScope.DirectReportUserIds.Contains(annualLeave.EmployeeId);
            }

            var canEdit = request.IsAdmin || annualLeave.EmployeeId == request.ChangedByUserId;

            if (!canEdit && (isInManagedDepartment || isDirectReport))
            {
                canEdit = true;
            }

            if (!canEdit)
            {
                return Result<Unit>.Failure("You can only update your own leave requests or requests in your managed departments.");
            }

            if ((annualLeave.Status == AnnualLeaveStatus.Rejected || annualLeave.Status == AnnualLeaveStatus.Approved) && !request.IsAdmin)
            {
                return Result<Unit>.Conflict("Approved and rejected leave requests cannot be edited.");
            }

            // Read before the edit overwrites them: what the coverage emails go out
            // for is the difference between these and where the leave ends up.
            var statusBeforeEdit = annualLeave.Status;
            var delegateBeforeEdit = annualLeave.DelegateId;

            annualLeave.StartDate = request.AnnualLeave.StartDate;
            annualLeave.EndDate = request.AnnualLeave.EndDate;
            annualLeave.Duration = request.AnnualLeave.Duration;
            annualLeave.LeaveTypeId = request.AnnualLeave.LeaveTypeId;

            var editedLeaveType = await context.LeaveTypes
                .AsNoTracking()
                .FirstOrDefaultAsync(type => type.Id == request.AnnualLeave.LeaveTypeId, cancellationToken);

            // Same rule as on create: the type decides whether a child is carried.
            annualLeave.ChildId = editedLeaveType?.PerChildEntitlement == true
                ? request.AnnualLeave.ChildId
                : null;

            annualLeave.Reason = request.AnnualLeave.Reason;
            annualLeave.EvidenceUrl = request.AnnualLeave.EvidenceUrl;

            /* Same gate as on create, and deliberately with no exemption: an edit
               can move a request onto a type that requires evidence, and a request
               filed before the policy was set carries none. An admin fixing the
               reason on such a row has to attach one — the rule is about the leave
               type, not about who is typing. */
            if (editedLeaveType is not null)
            {
                var attachmentError = AttachmentPolicyRule.Check(editedLeaveType, annualLeave.EvidenceUrl);
                if (attachmentError is not null)
                    return Result<Unit>.Failure(attachmentError);

                /* Likewise no exemption: an edit can move a request onto a type
                   that offers no half days, or widen a half day's dates past the
                   single date one covers. */
                var halfDayError = HalfDayRule.Check(
                    editedLeaveType, annualLeave.Duration, annualLeave.StartDate, annualLeave.EndDate);
                if (halfDayError is not null)
                    return Result<Unit>.Failure(halfDayError);
            }

            annualLeave.DelegateId = string.IsNullOrWhiteSpace(request.AnnualLeave.DelegateId)
                ? null
                : request.AnnualLeave.DelegateId;

            var employeeProfile = await context.EmployeeProfiles
                .FirstOrDefaultAsync(ep => ep.Id == annualLeave.EmployeeProfileId, cancellationToken);

            if (employeeProfile is not null)
            {
                // Same gate as on create, because an edit can switch the type onto
                // a parental one the employee was never offered.
                if (editedLeaveType is not null)
                {
                    var eligibilityError = await ParentalLeaveEligibility.CheckAsync(
                        context,
                        editedLeaveType,
                        annualLeave.EmployeeId,
                        employeeProfile,
                        cancellationToken);
                    if (eligibilityError is not null)
                        return Result<Unit>.Failure(eligibilityError);
                }

                var perChildError = await PerChildLeaveBalanceCalculator.CheckPerChildEntitlementAsync(
                    context,
                    annualLeave,
                    employeeProfile,
                    excludeLeaveId: annualLeave.Id,
                    cancellationToken);
                if (perChildError is not null)
                    return Result<Unit>.Failure(perChildError);
            }

            var canChangeStatus = request.IsAdmin || isInManagedDepartment || isDirectReport;
            if (request.AnnualLeave.Status.HasValue && !canChangeStatus)
            {
                return Result<Unit>.Failure("Only admins or managers of the request's department can change leave status.");
            }

            if (request.AnnualLeave.Status.HasValue && request.AnnualLeave.Status.Value != annualLeave.Status)
            {
                var changedByUserId = request.ChangedByUserId;
                var userExists = await context.Users
                    .AnyAsync(u => u.Id == changedByUserId, cancellationToken);
                if (!userExists)
                {
                    return Result<Unit>.Failure("Cannot resolve the user who changed status.");
                }

                var oldStatus = annualLeave.Status;
                var newStatus = request.AnnualLeave.Status.Value;
                annualLeave.Status = newStatus;


                if (newStatus == AnnualLeaveStatus.Approved)
                {
                    annualLeave.ApprovedAt = DateTime.UtcNow;
                    annualLeave.ApprovedById = changedByUserId;
                }
                else if (oldStatus == AnnualLeaveStatus.Approved)
                {
                    annualLeave.ApprovedAt = null;
                    annualLeave.ApprovedById = null;
                }

                context.LeaveStatusHistories.Add(new LeaveStatusHistory
                {
                    Id = Guid.NewGuid().ToString(),
                    AnnualLeaveId = annualLeave.Id,
                    ChangedByUserId = changedByUserId,
                    OldStatus = oldStatus,
                    NewStatus = newStatus,
                    Comment = request.AnnualLeave.StatusComment,
                    ChangedAt = DateTime.UtcNow
                });
            }

            if (employeeProfile is not null && annualLeave.Status == AnnualLeaveStatus.Approved)
            {
                var balanceError = await AnnualLeaveBalanceCalculator.CheckSufficientBalanceAsync(
                    context,
                    employeeProfile,
                    annualLeave,
                    excludeLeaveId: annualLeave.Id,
                    cancellationToken);
                if (balanceError is not null)
                    return Result<Unit>.Failure(balanceError);
            }

            // One transaction over both saves: the balance sync reads approved leave
            // back out of the database, so it cannot share the leave's SaveChanges,
            // and a failure on the second write must not leave the balance stale
            // against a leave that has already been written.
            await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);

            try
            {
                await context.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateConcurrencyException)
            {
                // Nothing is committed, so disposing the transaction rolls the
                // attempted write back.
                return Result<Unit>.Failure(ConcurrencyError.Message);
            }

            if (employeeProfile is not null)
            {
                await AnnualLeaveBalanceCalculator.SyncCurrentYearBalanceAsync(context, employeeProfile, cancellationToken);
                await context.SaveChangesAsync(cancellationToken);
            }

            await transaction.CommitAsync(cancellationToken);

            // Three ways an edit changes who should be hearing about coverage. The
            // first is this command's own approval path, the one an admin uses from
            // the edit dialog rather than from the approve button.
            if (annualLeave.Status == AnnualLeaveStatus.Approved
                && statusBeforeEdit != AnnualLeaveStatus.Approved)
            {
                await CoverageNotification.AnnounceAsync(
                    context, emailService, annualLeave, employeeProfile, notifyDepartment: true, cancellationToken);
            }
            else if (annualLeave.Status == AnnualLeaveStatus.Approved
                && annualLeave.DelegateId != delegateBeforeEdit)
            {
                // The absence was announced already and has not changed; only the
                // name on the coverage has. The new delegate needs to know they are
                // covering, but the department does not need telling twice.
                await CoverageNotification.AnnounceAsync(
                    context, emailService, annualLeave, employeeProfile, notifyDepartment: false, cancellationToken);
            }
            else if (statusBeforeEdit == AnnualLeaveStatus.Approved
                && annualLeave.Status != AnnualLeaveStatus.Approved)
            {
                await CoverageNotification.AnnounceStoodDownAsync(
                    context, emailService, annualLeave, delegateBeforeEdit, cancellationToken);
            }

            return Result<Unit>.Success(Unit.Value);
        }
    }
}
