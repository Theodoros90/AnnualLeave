using Application.AnnualLeaves.Commands;
using Application.Core;
using Domain;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Timesheets.Support;

/// <summary>
/// Who reviews a submitted timesheet — the same shape as leave's manager stage
/// (<see cref="ApprovalStageRule"/>). A submitted timesheet is the manager's to
/// approve or reject. An HR Administrator reviews it only when no manager is
/// available to — every manager who could review it is on approved leave today,
/// or the department has none. "Available" is <see cref="ManagerAvailability"/>'s
/// reading — the same set of managers that is emailed about the submission, minus
/// the submitter, minus anyone away today — so the rule, the notification and the
/// list agree.
///
/// <para>
/// A manager's own timesheet is the one case with nobody to hand it to: nobody
/// approves their own hours, and when they are the department's only manager
/// there is no other manager to ask. Rather than put a manager's hours in front
/// of HR, such a sheet is <em>self-certified</em>: <c>SubmitTimesheet</c> files it
/// straight into Approved (<see cref="SelfCertifiesAsync"/>, with a history row
/// saying so), and nobody is emailed. HR still reviews an <em>employee's</em>
/// sheet in a department with no manager — that is a configuration gap the
/// workspace overview flags, and the sheet must not wait on nobody.
/// </para>
///
/// Unlike leave there is no status for "with HR": the sheet stays Submitted, and
/// the question is asked when HR tries to decide it (<c>UpdateTimesheetStatus</c>)
/// and when the list is built (<c>TimesheetDto.AwaitingManager</c>, which the HR
/// pages read to leave the manager's rows out). Both read the clock at that
/// moment, so a manager going on leave after the submission hands the sheet to HR
/// for the duration and takes it back on return — there is nothing to reroute.
/// <c>isTimesheetWithManager</c> in <c>client/src/lib/approval-stage.ts</c> mirrors
/// it by reading the flag.
/// </summary>
public static class TimesheetReviewRule
{
    public const string WithManagerMessage =
        "This timesheet is awaiting the manager's review; an HR Administrator reviews a timesheet only when no manager is available to.";

    public const string SelfCertifiedComment =
        "Approved on submission: the only manager in the department, with nobody else to review it.";

    /// <summary>Whether a manager other than the submitter is available today to review this submitter's timesheet.</summary>
    public static async Task<bool> ManagerAvailableAsync(
        AppDbContext context,
        EmployeeProfile submitter,
        DateTime nowUtc,
        CancellationToken cancellationToken)
    {
        var report = await ManagerAvailability.CheckAsync(context, submitter, nowUtc, cancellationToken);
        return report.AnyAvailable;
    }

    /// <summary>
    /// The same answer for many submitters at once (keyed by <see cref="EmployeeProfile.Id"/>),
    /// for a list. Each distinct submitter is resolved once.
    /// </summary>
    public static async Task<Dictionary<string, bool>> ManagerAvailableAsync(
        AppDbContext context,
        IEnumerable<EmployeeProfile> submitters,
        DateTime nowUtc,
        CancellationToken cancellationToken)
    {
        var result = new Dictionary<string, bool>();
        foreach (var submitter in submitters)
        {
            if (result.ContainsKey(submitter.Id)) continue;
            result[submitter.Id] = await ManagerAvailableAsync(context, submitter, nowUtc, cancellationToken);
        }
        return result;
    }

    /// <summary>
    /// Whether this submitter's sheet is approved on submission: they hold the
    /// Manager role and no other manager could review it (the recipient set —
    /// direct manager plus the department's managers, minus themselves — is
    /// empty). A manager with a colleague manager, or one whose colleague is
    /// merely on leave today, is not self-certified; that sheet is reviewed.
    /// </summary>
    public static async Task<bool> SelfCertifiesAsync(
        AppDbContext context,
        EmployeeProfile submitter,
        CancellationToken cancellationToken)
    {
        var isManager = await (
            from ur in context.UserRoles
            join r in context.Roles on ur.RoleId equals r.Id
            where ur.UserId == submitter.UserId && r.Name == AppRoles.Manager
            select ur).AnyAsync(cancellationToken);
        if (!isManager) return false;

        var reviewers = await ManagerNotificationRecipients.ResolveAsync(context, submitter, cancellationToken);
        return reviewers.Count == 0;
    }

    /// <summary>Submitted or resubmitted: the states a reviewer decides.</summary>
    public static bool IsOpen(TimesheetStatus status) =>
        status is TimesheetStatus.Submitted or TimesheetStatus.Resubmitted;
}
