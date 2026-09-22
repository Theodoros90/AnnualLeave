namespace Domain.Interfaces;

/// <summary>
/// A file to send with an email. Bytes, not a path: the sender has already
/// loaded them from wherever they live, and the provider only has to encode them.
/// </summary>
public sealed record EmailFileAttachment(string FileName, byte[] Content, string ContentType);

public interface IEmailService
{
    Task<bool> SendEmailAsync(
        string toEmail,
        string subject,
        string htmlBody,
        string? textBody = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// The same send, carrying files. A default implementation so every existing
    /// implementation — the test fakes included — keeps compiling; it sends the
    /// message without the files, which is the right fallback for a fake and is
    /// overridden by the real service.
    /// </summary>
    Task<bool> SendEmailAsync(
        string toEmail,
        string subject,
        string htmlBody,
        string? textBody,
        IReadOnlyList<EmailFileAttachment> attachments,
        CancellationToken cancellationToken = default) =>
        SendEmailAsync(toEmail, subject, htmlBody, textBody, cancellationToken);
}
