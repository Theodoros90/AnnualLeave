namespace Infrastructure.Configuration;

public class AppUrlOptions
{
    public const string SectionName = "AppUrls";

    public string ApiBaseUrl { get; set; } = "http://localhost:5000";

    public string ClientBaseUrl { get; set; } = "https://localhost:5173";
}
