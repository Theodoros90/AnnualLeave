using System.Collections.Concurrent;
using System.Net;
using Domain;
using Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Persistence;

namespace Application.SystemErrors;

/// <summary>
/// One fault worth telling the System Administrators about.
/// </summary>
/// <param name="Source">
/// Where it happened, as a person would say it: <c>GET /api/timesheets</c> for a
/// request, <c>reminder 'daily-attendance-report'</c> for a scheduled job.
/// </param>
/// <param name="Exception">What was thrown.</param>
/// <param name="CorrelationId">
/// The request's correlation id (the <c>X-Correlation-ID</c> header and the
/// <c>traceId</c> in the error body), which is what finds the log lines. Null
/// for a fault outside any request.
/// </param>
/// <param name="OccurredAtUtc">When; defaults to now.</param>
public sealed record SystemErrorReport(
    string Source,
    Exception Exception,
    string? CorrelationId = null,
    DateTime? OccurredAtUtc = null);

/// <summary>
/// Remembers which faults were reported recently, so a bug hit on every request
/// is one email an hour rather than one per request. Registered as a singleton;
/// the notifier itself is scoped because it holds a <see cref="AppDbContext"/>.
/// In memory on purpose, like the reminder scheduler's dedup: a restart may
/// repeat one email, which is acceptable for an error report.
/// </summary>
public sealed class SystemErrorThrottle
{
    public static readonly TimeSpan Window = TimeSpan.FromHours(1);

    private readonly ConcurrentDictionary<string, DateTime> _lastReported = new();

    /// <summary>
    /// True if this fault has not been reported inside the window, and records
    /// it as reported now.
    /// </summary>
    public bool TryAcquire(string fingerprint, DateTime nowUtc)
    {
        var acquired = false;
        _lastReported.AddOrUpdate(
            fingerprint,
            _ => { acquired = true; return nowUtc; },
            (_, last) =>
            {
                if (nowUtc - last < Window) return last;
                acquired = true;
                return nowUtc;
            });
        return acquired;
    }
}

/// <summary>
/// Emails every active System Administrator about a fault in the system. The
/// System Administrator configures the workspace and keeps it running, so this
/// is the one operational email the role gets — the attendance report and the
/// approval digests are HR's and the managers', not theirs.
///
/// Called from the two places an error escapes everything else: the
/// <c>GlobalExceptionMiddleware</c> when a request ends in a 500, and the
/// <c>ReminderBackgroundService</c> when a reminder's dispatch throws. Both call
/// it after the fact — the 500 has already been written, the next reminder is
/// still going to run — and it never throws back into them: a broken mail
/// provider must not turn one error into two.
///
/// It also <b>records</b> the fault as a <see cref="SystemError"/> row, which is what
/// the System Administrator's notification bell lists (<c>GET /api/systemerrors</c>).
/// The row is written before the email is attempted and regardless of whether email
/// is switched on, so the bell agrees with the log even when the inbox is silent; a
/// repeat inside the hour bumps the existing row's count rather than adding one.
///
/// Four things about it that are deliberate:
/// <list type="bullet">
/// <item>The fingerprint is the source plus the exception type, not the message.
/// A message often carries the row id or the input that broke, and a fault
/// keyed on it would be reported once per row.</item>
/// <item>It respects <see cref="AppSettings.EmailNotificationsEnabled"/> like every
/// other email the system sends. An organisation that switched email off did
/// not ask for this one either; the log still has everything.</item>
/// <item>A deactivated System Administrator is not mailed. A leaver's inbox is
/// nobody's, and the security stamp rotation already ended their sessions.</item>
/// <item>Recording and emailing fail independently. A database that is itself the
/// fault must not stop the email, and a broken mail provider must not lose the
/// row; each is caught and logged on its own.</item>
/// </list>
/// </summary>
public class SystemErrorNotifier(
    AppDbContext context,
    IEmailService emailService,
    SystemErrorThrottle throttle,
    ILogger<SystemErrorNotifier> logger)
{
    /// <summary>How many lines of the stack trace the email quotes; the log has the rest.</summary>
    private const int StackTraceLines = 8;

    /// <summary>Sends the report. Returns how many emails went out; 0 when throttled, disabled, or failed.</summary>
    public async Task<int> NotifyAsync(SystemErrorReport report, CancellationToken cancellationToken)
    {
        try
        {
            return await NotifyCoreAsync(report, cancellationToken);
        }
        catch (Exception ex)
        {
            // The caller is already handling one failure; this one is only logged.
            logger.LogError(ex, "Could not email the System Administrators about an error in {Source}.", report.Source);
            return 0;
        }
    }

    private async Task<int> NotifyCoreAsync(SystemErrorReport report, CancellationToken ct)
    {
        var occurredAt = report.OccurredAtUtc ?? DateTime.UtcNow;
        var exceptionType = report.Exception.GetType().FullName ?? report.Exception.GetType().Name;
        var fingerprint = $"{report.Source}|{exceptionType}";
        var firstInWindow = throttle.TryAcquire(fingerprint, occurredAt);

        await RecordAsync(report, exceptionType, occurredAt, firstInWindow, ct);

        if (!firstInWindow)
        {
            logger.LogInformation("System error in {Source} ({Type}) already reported within the last hour; not emailing again.",
                report.Source, report.Exception.GetType().Name);
            return 0;
        }

        var settings = await context.AppSettings.AsNoTracking().FirstOrDefaultAsync(ct) ?? new AppSettings();
        if (!settings.EmailNotificationsEnabled)
        {
            logger.LogInformation("System error in {Source}: email notifications disabled; not emailing the System Administrators.", report.Source);
            return 0;
        }

        var recipients = await SystemAdministratorsAsync(ct);
        if (recipients.Count == 0)
        {
            logger.LogWarning("System error in {Source}: no active System Administrator with an email address to tell.", report.Source);
            return 0;
        }

        var subject = $"Jenus People: system error in {report.Source}";
        var sent = 0;
        foreach (var admin in recipients)
        {
            var name = string.IsNullOrWhiteSpace(admin.DisplayName) ? admin.Email : admin.DisplayName;
            var html = RenderHtml(name, report, occurredAt);
            var text = RenderText(name, report, occurredAt);
            if (await emailService.SendEmailAsync(admin.Email, subject, html, text, ct)) sent++;
        }

        logger.LogInformation("System error in {Source} reported to {Count} System Administrator(s).", report.Source, sent);
        return sent;
    }

    /// <summary>
    /// Writes the fault down for the bell. The first report in the throttle window
    /// is a new row; a repeat bumps the most recent row of the same fault, keeping
    /// the first message (a repeat's usually differs only by the row id that broke).
    /// A repeat with no row to bump — the earlier write failed — gets a row of its own.
    /// </summary>
    private async Task RecordAsync(SystemErrorReport report, string exceptionType, DateTime occurredAt, bool firstInWindow, CancellationToken ct)
    {
        try
        {
            var source = Cut(report.Source, SystemError.SourceMaxLength);
            var type = Cut(exceptionType, SystemError.ExceptionTypeMaxLength);

            SystemError? existing = null;
            if (!firstInWindow)
            {
                existing = await context.SystemErrors
                    .Where(e => e.Source == source && e.ExceptionType == type)
                    .OrderByDescending(e => e.LastOccurredAtUtc)
                    .ThenByDescending(e => e.Id)
                    .FirstOrDefaultAsync(ct);
            }

            if (existing is not null)
            {
                existing.Occurrences++;
                if (occurredAt > existing.LastOccurredAtUtc) existing.LastOccurredAtUtc = occurredAt;
            }
            else
            {
                context.SystemErrors.Add(new SystemError
                {
                    Source = source,
                    ExceptionType = type,
                    Message = Cut(report.Exception.Message, SystemError.MessageMaxLength),
                    CorrelationId = report.CorrelationId is null ? null : Cut(report.CorrelationId, SystemError.CorrelationIdMaxLength),
                    OccurredAtUtc = occurredAt,
                    LastOccurredAtUtc = occurredAt,
                    Occurrences = 1,
                });
            }

            await context.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            // The database may be the very thing that failed; the email still goes.
            logger.LogError(ex, "Could not record the system error in {Source} for the System Administrators' notifications.", report.Source);
        }
    }

    private static string Cut(string value, int max) => value.Length <= max ? value : value[..max];

    private sealed record Recipient(string Email, string? DisplayName);

    private async Task<List<Recipient>> SystemAdministratorsAsync(CancellationToken ct)
    {
        var roleId = await context.Roles
            .Where(r => r.Name == AppRoles.SystemAdministrator)
            .Select(r => r.Id)
            .FirstOrDefaultAsync(ct);
        if (roleId is null) return [];

        return await (
            from ur in context.UserRoles
            where ur.RoleId == roleId
            join u in context.Users on ur.UserId equals u.Id
            where u.IsActive && u.Email != null && u.Email != ""
            select new Recipient(u.Email!, u.DisplayName)
        ).Distinct().ToListAsync(ct);
    }

    private static string RenderHtml(string greetingName, SystemErrorReport r, DateTime occurredAt)
    {
        static string Row(string label, string value) =>
            $"<tr><td style=\"padding:2px 12px 2px 0;color:#555;white-space:nowrap\">{label}</td><td style=\"padding:2px 0\">{WebUtility.HtmlEncode(value)}</td></tr>";

        var ex = r.Exception;
        return $"""
<p>Hello {WebUtility.HtmlEncode(greetingName)},</p>
<p>Jenus People hit an error it could not recover from. The full details are in the server log; the correlation id below finds the lines.</p>
<table style="border-collapse:collapse">
{Row("When", $"{occurredAt:dd MMM yyyy HH:mm:ss} UTC")}
{Row("Where", r.Source)}
{Row("Correlation ID", r.CorrelationId ?? "—")}
{Row("Error", ex.GetType().FullName ?? ex.GetType().Name)}
{Row("Message", ex.Message)}
{(ex.InnerException is { } inner ? Row("Caused by", $"{inner.GetType().Name}: {inner.Message}") : "")}
</table>
<p style="color:#555">Stack trace (first {StackTraceLines} frames):</p>
<pre style="font-size:12px;white-space:pre-wrap">{WebUtility.HtmlEncode(TrimmedStackTrace(ex))}</pre>
<p style="color:#555">The same error in the same place is reported at most once an hour.</p>
""";
    }

    private static string RenderText(string greetingName, SystemErrorReport r, DateTime occurredAt)
    {
        var ex = r.Exception;
        var lines = new List<string>
        {
            $"Hello {greetingName},",
            "",
            "Jenus People hit an error it could not recover from. The full details are in the server log; the correlation id below finds the lines.",
            "",
            $"When: {occurredAt:dd MMM yyyy HH:mm:ss} UTC",
            $"Where: {r.Source}",
            $"Correlation ID: {r.CorrelationId ?? "-"}",
            $"Error: {ex.GetType().FullName ?? ex.GetType().Name}",
            $"Message: {ex.Message}",
        };
        if (ex.InnerException is { } inner)
            lines.Add($"Caused by: {inner.GetType().Name}: {inner.Message}");
        lines.Add("");
        lines.Add($"Stack trace (first {StackTraceLines} frames):");
        lines.Add(TrimmedStackTrace(ex));
        lines.Add("");
        lines.Add("The same error in the same place is reported at most once an hour.");
        return string.Join("\n", lines);
    }

    private static string TrimmedStackTrace(Exception ex)
    {
        var trace = ex.StackTrace;
        if (string.IsNullOrWhiteSpace(trace)) return "(no stack trace)";
        var lines = trace.Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(l => l.TrimEnd('\r'))
            .ToList();
        var shown = lines.Take(StackTraceLines);
        return string.Join("\n", shown) + (lines.Count > StackTraceLines ? $"\n   … {lines.Count - StackTraceLines} more in the log" : "");
    }
}
