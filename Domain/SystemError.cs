namespace Domain;

/// <summary>
/// One fault the system could not recover from, kept so the System Administrator's
/// notification bell can list it. It is the stored twin of the email
/// <c>SystemErrorNotifier</c> sends: the same source, exception type, message and
/// correlation id, recorded whether or not email is switched on.
///
/// A repeat of the same fault (same <see cref="Source"/> and <see cref="ExceptionType"/>)
/// inside the notifier's one-hour window bumps <see cref="Occurrences"/> and
/// <see cref="LastOccurredAtUtc"/> on the existing row rather than adding one, so a bug
/// hit on every request is one line reading "×400", not four hundred lines.
/// </summary>
public class SystemError
{
    public const int SourceMaxLength = 300;
    public const int ExceptionTypeMaxLength = 300;
    public const int MessageMaxLength = 2000;
    public const int CorrelationIdMaxLength = 100;

    public int Id { get; set; }

    /// <summary>Where it happened, as a person would say it: <c>GET /api/timesheets</c>, <c>reminder 'daily-attendance-report'</c>.</summary>
    public string Source { get; set; } = string.Empty;

    /// <summary>The exception's full type name.</summary>
    public string ExceptionType { get; set; } = string.Empty;

    /// <summary>The first occurrence's message, cut to <see cref="MessageMaxLength"/>.</summary>
    public string Message { get; set; } = string.Empty;

    /// <summary>The request's correlation id, which finds the log lines. Null outside a request.</summary>
    public string? CorrelationId { get; set; }

    /// <summary>When the fault was first seen (this row).</summary>
    public DateTime OccurredAtUtc { get; set; }

    /// <summary>When it was last seen; equals <see cref="OccurredAtUtc"/> until a repeat.</summary>
    public DateTime LastOccurredAtUtc { get; set; }

    /// <summary>How many times this row has been hit, including the first.</summary>
    public int Occurrences { get; set; } = 1;
}
