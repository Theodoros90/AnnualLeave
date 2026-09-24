using Application.Core;
using Domain;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.AnnualLeaves.Commands;

/// <summary>
/// Whether anybody is there to decide a new request at the manager stage. The
/// managers are the same set that would be emailed about it
/// (<see cref="ManagerNotificationRecipients"/>: the direct manager plus every
/// Manager-role user in the employee's department), and one is "on leave" when
/// they have an <see cref="AnnualLeaveStatus.Approved"/> leave whose dates cover
/// today. When that set is non-empty and every one of them is away, the request
/// is filed straight into the HR stage (<see cref="ApprovalStageRule.InitialStatus"/>)
/// instead of waiting on an absent manager.
///
/// Two things are deliberate. A department with <em>no</em> manager at all reads
/// as available: there is nobody to be away, and such a request waits Pending
/// where an HR Administrator can already decide it, as it always has. And the
/// check runs at filing only — a manager who goes on leave after the request came
/// in does not move it; HR can still step in, as they can on any Pending request.
///
/// "Today" is the UTC date, the same clock the leave dates themselves are stored on.
/// </summary>
public static class ManagerAvailability
{
    /// <summary>
    /// <paramref name="AnyAvailable"/> is whether at least one manager can decide;
    /// <paramref name="OnLeaveNames"/> names the ones who cannot, for the note HR
    /// and the history row carry.
    /// </summary>
    public readonly record struct Report(bool AnyAvailable, IReadOnlyList<string> OnLeaveNames)
    {
        public static readonly Report Available = new(true, []);
    }

    public static async Task<Report> CheckAsync(
        AppDbContext context,
        EmployeeProfile employeeProfile,
        DateTime nowUtc,
        CancellationToken cancellationToken)
    {
        var managers = await ManagerNotificationRecipients.ResolveAsync(context, employeeProfile, cancellationToken);
        if (managers.Count == 0)
            return Report.Available;

        var managerIds = managers.Select(m => m.UserId).ToList();
        var today = nowUtc.Date;

        var awayIds = await context.AnnualLeaves
            .AsNoTracking()
            .Where(l => managerIds.Contains(l.EmployeeId)
                && l.Status == AnnualLeaveStatus.Approved
                && l.StartDate.Date <= today
                && l.EndDate.Date >= today)
            .Select(l => l.EmployeeId)
            .Distinct()
            .ToListAsync(cancellationToken);

        var anyAvailable = managers.Any(m => !awayIds.Contains(m.UserId));
        var onLeaveNames = managers
            .Where(m => awayIds.Contains(m.UserId))
            .Select(m => string.IsNullOrWhiteSpace(m.DisplayName) ? m.Email : m.DisplayName!)
            .ToList();

        return new Report(anyAvailable, onLeaveNames);
    }

    /// <summary>The one sentence both the HR email and the history row carry.</summary>
    public static string Describe(Report report) =>
        $"Sent to HR for approval: {string.Join(", ", report.OnLeaveNames)} on leave.";
}
