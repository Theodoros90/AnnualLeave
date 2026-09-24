using Application.AnnualLeaves.Commands;
using Domain;
using Persistence;

namespace Application.Timesheets.Support;

/// <summary>
/// Who reviews a submitted timesheet — the same shape as leave's manager stage
/// (<see cref="ApprovalStageRule"/>). A submitted timesheet is the manager's to
/// approve or reject. An HR Administrator reviews it only when no manager is
/// available to: the submitter is the department's only manager (nobody approves
/// their own hours), the department has no manager, or every manager who could
/// review it is on approved leave today. "Available" is
/// <see cref="ManagerAvailability"/>'s reading — the same set of managers that is
/// emailed about the submission, minus the submitter, minus anyone away today —
/// so the rule, the notification and the list agree.
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

    /// <summary>Submitted or resubmitted: the states a reviewer decides.</summary>
    public static bool IsOpen(TimesheetStatus status) =>
        status is TimesheetStatus.Submitted or TimesheetStatus.Resubmitted;
}
