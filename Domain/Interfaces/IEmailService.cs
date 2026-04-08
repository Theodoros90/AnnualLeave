namespace Domain.Interfaces;

public interface IEmailService
{
    Task SendEmailAsync(
        string toEmail,
        string subject,
        string htmlBody,
        string? textBody = null,
        CancellationToken cancellationToken = default);
}
