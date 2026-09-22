using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <summary>
    /// The Organization settings page used to offer the time zone as one of five
    /// labels — "UTC", "UTC-5 (Eastern)", "UTC-6 (Central)", "UTC-7 (Mountain)"
    /// and "UTC-8 (Pacific)". Only the first is a time zone id; the other four
    /// were stored as typed and fell back to UTC in every rule that read them.
    /// The page now offers IANA ids and the validator refuses anything else, so a
    /// stored label would be a row the page can no longer save. Each is rewritten
    /// to the zone its label meant.
    ///
    /// No schema change, so no model snapshot update; written by hand for the
    /// same reason the previous hand-written migration was.
    /// </summary>
    [DbContext(typeof(AppDbContext))]
    [Migration("20260922120000_NormalizeLegacyTimeZoneLabels")]
    public partial class NormalizeLegacyTimeZoneLabels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE AppSettings SET TimeZoneId = CASE TimeZoneId
                    WHEN 'UTC-5 (Eastern)'  THEN 'America/New_York'
                    WHEN 'UTC-6 (Central)'  THEN 'America/Chicago'
                    WHEN 'UTC-7 (Mountain)' THEN 'America/Denver'
                    WHEN 'UTC-8 (Pacific)'  THEN 'America/Los_Angeles'
                    ELSE TimeZoneId END
                WHERE TimeZoneId IN ('UTC-5 (Eastern)', 'UTC-6 (Central)', 'UTC-7 (Mountain)', 'UTC-8 (Pacific)');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE AppSettings SET TimeZoneId = CASE TimeZoneId
                    WHEN 'America/New_York'    THEN 'UTC-5 (Eastern)'
                    WHEN 'America/Chicago'     THEN 'UTC-6 (Central)'
                    WHEN 'America/Denver'      THEN 'UTC-7 (Mountain)'
                    WHEN 'America/Los_Angeles' THEN 'UTC-8 (Pacific)'
                    ELSE TimeZoneId END
                WHERE TimeZoneId IN ('America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles');
                """);
        }
    }
}
