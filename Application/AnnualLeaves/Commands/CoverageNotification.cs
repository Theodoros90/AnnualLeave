using Application.Core;
using Application.Files;
using Domain;
using Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.AnnualLeaves.Commands;

/// <summary>
/// The emails that go out when an approved leave request names a delegate — the
/// colleague covering urgent matters while the employee is away.
///
/// Coverage used to be a private note on the request: stored, rendered in a detail
/// drawer, and told to nobody, so the nominated colleague found out in the
/// corridor or not at all. Two messages fix that, and both are deliberate about
/// their timing and their contents:
///
/// <list type="bullet">
/// <item>Nothing is announced until the leave is <see cref="AnnualLeaveStatus.Approved"/>.
/// A request can sit Pending for days and then be rejected; telling a team to
/// arrange itself around a trip that never happens is worse than telling them
/// late. Approval happens in three places — the auto-approving branch of
/// <see cref="CreateAnnualLeave"/>, <see cref="UpdateLeaveStatus"/> and the status
/// path of <see cref="EditAnnualLeave"/> — which is why this lives here rather
/// than inside any one of them.</item>
/// <item>Neither message carries the leave's <see cref="AnnualLeave.Reason"/>. The
/// apply form promises that the reason stays private; it goes to the manager
/// deciding the request, not to the department.</item>
/// </list>
///
/// The delegate's message also carries the handover — <see cref="AnnualLeave.CoverageNote"/>
/// as text and <see cref="AnnualLeave.CoverageAttachmentUrl"/> as a file on the
/// email. Only theirs: the department is told who is covering, not what the
/// cover involves. A handover file that cannot be loaded (deleted, or a path that
/// never resolved) drops off the email rather than stopping it; the note and the
/// dates are the part that cannot wait.
///
/// Every send happens after the caller has committed, matching the rule the
/// existing notifications already follow: an email about a write that rolled back
/// is worse than a late one.
/// </summary>
public static class CoverageNotification
{
    private sealed record Contact(string Email, string Name);

    /// <summary>
    /// Announces that <paramref name="annualLeave"/> is covered: one message to the
    /// delegate, and — when <paramref name="notifyDepartment"/> — one to each of the
    /// employee's remaining department colleagues.
    ///
    /// A no-op unless the leave is approved and names a delegate, so a caller can
    /// hand it any leave it has just written without deciding first.
    /// </summary>
    public static async Task AnnounceAsync(
        AppDbContext context,
        IEmailService emailService,
        AnnualLeave annualLeave,
        EmployeeProfile? employeeProfile,
        bool notifyDepartment,
        CancellationToken cancellationToken)
    {
        if (annualLeave.Status != AnnualLeaveStatus.Approved
            || string.IsNullOrWhiteSpace(annualLeave.DelegateId))
        {
            return;
        }

        var delegateContact = await ResolveContactAsync(context, annualLeave.DelegateId, cancellationToken);
        if (delegateContact is null) return;

        var employeeName = await ResolveNameAsync(context, annualLeave.EmployeeId, cancellationToken);
        var leaveTypeName = await ResolveLeaveTypeNameAsync(context, annualLeave, cancellationToken);
        var dateRange = FormatDateRange(annualLeave);

        var handoverFile = await LoadHandoverAttachmentAsync(context, annualLeave, cancellationToken);

        var toDelegate = NotificationEmail
            .To(delegateContact.Name)
            .Sentence($"{employeeName} has nominated you to cover for them while they are away.")
            .Sentence($"They are on {NotificationEmail.Plain(leaveTypeName)} from {dateRange}.")
            .Detail("Handover note", annualLeave.CoverageNote)
            .Detail("Handover document", handoverFile?.FileName)
            .Closing("Please log in to the Annual Leave system to see the dates.")
            .Build();

        await emailService.SendEmailAsync(
            delegateContact.Email,
            $"You are covering for {employeeName}",
            toDelegate.Html,
            toDelegate.Text,
            handoverFile is null ? [] : [handoverFile],
            cancellationToken);

        if (!notifyDepartment) return;

        // A List, not an array: an array binds Contains to the span overload in
        // MemoryExtensions, which EF cannot translate into a query.
        var alreadyTold = new List<string> { annualLeave.EmployeeId, annualLeave.DelegateId };

        var colleagues = await ResolveDepartmentAsync(
            context,
            employeeProfile,
            alreadyTold,
            cancellationToken);

        foreach (var colleague in colleagues)
        {
            var body = NotificationEmail
                .To(colleague.Name)
                .Sentence($"{employeeName} is away from {dateRange}.")
                .Sentence($"{delegateContact.Name} is covering urgent matters in the meantime.")
                .Closing("Please log in to the Annual Leave system to see the team calendar.")
                .Build();

            await emailService.SendEmailAsync(
                colleague.Email,
                $"{employeeName} is away from {dateRange}",
                body.Html,
                body.Text,
                cancellationToken);
        }
    }

    /// <summary>
    /// Tells <paramref name="delegateUserId"/> that the leave they were covering is
    /// off, after it has left <see cref="AnnualLeaveStatus.Approved"/>.
    ///
    /// The department hears nothing: they were told an absence was coming, and the
    /// calendar is where an absence that went away is visible. The delegate is the
    /// one person who was asked to do something, so they are the one person told it
    /// is no longer needed.
    /// </summary>
    public static async Task AnnounceStoodDownAsync(
        AppDbContext context,
        IEmailService emailService,
        AnnualLeave annualLeave,
        string? delegateUserId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(delegateUserId)) return;

        var delegateContact = await ResolveContactAsync(context, delegateUserId, cancellationToken);
        if (delegateContact is null) return;

        var employeeName = await ResolveNameAsync(context, annualLeave.EmployeeId, cancellationToken);
        var dateRange = FormatDateRange(annualLeave);

        var body = NotificationEmail
            .To(delegateContact.Name)
            .Sentence($"The leave you were covering for {employeeName} ({NotificationEmail.Plain(dateRange)}) is no longer going ahead.")
            .Sentence($"You are no longer nominated to cover for them.")
            .Closing("Please log in to the Annual Leave system if you need the details.")
            .Build();

        await emailService.SendEmailAsync(
            delegateContact.Email,
            $"You are no longer covering for {employeeName}",
            body.Html,
            body.Text,
            cancellationToken);
    }

    /// <summary>
    /// How the coverage reads on the email the approver gets — a name, or the fact
    /// that there is no name. Blank would be worse than either: <c>Detail</c> drops
    /// an empty value, so the line would vanish and read as "not shown on this
    /// email" rather than "no cover arranged".
    /// </summary>
    public static async Task<string> DescribeAsync(
        AppDbContext context, string? delegateUserId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(delegateUserId)) return "Nobody nominated";

        var contact = await ResolveContactAsync(context, delegateUserId, cancellationToken);
        return contact?.Name ?? "Nobody nominated";
    }

    private static string FormatDateRange(AnnualLeave annualLeave) =>
        $"{annualLeave.StartDate:dd MMM yyyy} to {annualLeave.EndDate:dd MMM yyyy}";

    /// <summary>
    /// The handover document as an email attachment, or null when the leave has
    /// none or the path no longer resolves to a stored file of the right purpose.
    /// The purpose is checked so a crafted request pointing the handover at
    /// somebody's evidence cannot get that file mailed out.
    /// </summary>
    private static async Task<EmailFileAttachment?> LoadHandoverAttachmentAsync(
        AppDbContext context, AnnualLeave annualLeave, CancellationToken cancellationToken)
    {
        var fileId = StoredFilePath.TryParseId(annualLeave.CoverageAttachmentUrl);
        if (fileId is null) return null;

        return await context.StoredFiles
            .AsNoTracking()
            .Where(file => file.Id == fileId && file.Purpose == StoredFilePurpose.CoverageHandover)
            .Select(file => new EmailFileAttachment(file.FileName, file.Content, file.ContentType))
            .FirstOrDefaultAsync(cancellationToken);
    }

    /// <summary>
    /// A user's email and display name, or null when there is nothing to send to —
    /// a deactivated account is a leaver, and a leaver covers nobody.
    /// </summary>
    private static async Task<Contact?> ResolveContactAsync(
        AppDbContext context, string userId, CancellationToken cancellationToken) =>
        await context.Users
            .AsNoTracking()
            .Where(user => user.Id == userId && user.IsActive && user.Email != null && user.Email != "")
            .Select(user => new Contact(
                user.Email!,
                !string.IsNullOrWhiteSpace(user.DisplayName)
                    ? user.DisplayName
                    : (user.Email ?? user.UserName ?? "Colleague")))
            .FirstOrDefaultAsync(cancellationToken);

    private static async Task<string> ResolveNameAsync(
        AppDbContext context, string userId, CancellationToken cancellationToken) =>
        await context.Users
            .AsNoTracking()
            .Where(user => user.Id == userId)
            .Select(user => !string.IsNullOrWhiteSpace(user.DisplayName)
                ? user.DisplayName
                : (user.Email ?? user.UserName ?? "A colleague"))
            .FirstOrDefaultAsync(cancellationToken)
            ?? "A colleague";

    private static async Task<string> ResolveLeaveTypeNameAsync(
        AppDbContext context, AnnualLeave annualLeave, CancellationToken cancellationToken)
    {
        if (!annualLeave.LeaveTypeId.HasValue) return "leave";

        return await context.LeaveTypes
            .AsNoTracking()
            .Where(leaveType => leaveType.Id == annualLeave.LeaveTypeId.Value)
            .Select(leaveType => leaveType.Name)
            .FirstOrDefaultAsync(cancellationToken)
            ?? "leave";
    }

    /// <summary>
    /// The employee's department colleagues, minus whoever has already been told.
    ///
    /// An Admin has no department, and "the same department as nobody" is not a
    /// match — the same reasoning as in <see cref="ManagerNotificationRecipients"/>.
    /// A null department therefore announces to nobody, rather than to every other
    /// department-less profile in the company.
    /// </summary>
    private static async Task<List<Contact>> ResolveDepartmentAsync(
        AppDbContext context,
        EmployeeProfile? employeeProfile,
        List<string> excludeUserIds,
        CancellationToken cancellationToken)
    {
        if (employeeProfile?.DepartmentId is not int departmentId) return [];

        return await (
            from profile in context.EmployeeProfiles.AsNoTracking()
            where profile.DepartmentId == departmentId
            join user in context.Users on profile.UserId equals user.Id
            where user.IsActive
                && user.Email != null
                && user.Email != ""
                && !excludeUserIds.Contains(user.Id)
            select new Contact(
                user.Email!,
                !string.IsNullOrWhiteSpace(user.DisplayName)
                    ? user.DisplayName
                    : (user.Email ?? user.UserName ?? "Colleague")))
            .Distinct()
            .ToListAsync(cancellationToken);
    }
}
