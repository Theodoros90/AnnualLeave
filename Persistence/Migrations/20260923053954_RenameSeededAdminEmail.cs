using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <summary>
    /// Moves the seeded administrator account from <c>admin@annualleave.com</c> to
    /// <c>systemadmin@annualleave.com</c> (<c>DbInitializer.SystemAdministratorEmail</c>),
    /// alongside the role's rename to System Administrator.
    ///
    /// The seeder looks the account up by the new address, so without this a
    /// database seeded under the old one would get a <em>second</em> administrator
    /// created beside the first on a development box — and on the deployed host,
    /// where the seeder never runs, the old address would simply stay. Renaming the
    /// row keeps its <c>Id</c>, so profile, leave, timesheets and approvals all
    /// follow it. Only the exact seeded address is touched; an administrator with a
    /// real address is left alone. Nothing happens if the new address is already
    /// taken.
    /// </summary>
    public partial class RenameSeededAdminEmail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(MoveAccount(from: "admin@annualleave.com", to: "systemadmin@annualleave.com"));
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(MoveAccount(from: "systemadmin@annualleave.com", to: "admin@annualleave.com"));
        }

        // Matched on the normalized columns, which Identity upper-cases itself.
        private static string MoveAccount(string from, string to) => $"""
            IF NOT EXISTS (SELECT 1 FROM [AspNetUsers] WHERE [NormalizedEmail] = N'{to.ToUpperInvariant()}' OR [NormalizedUserName] = N'{to.ToUpperInvariant()}')
            BEGIN
                UPDATE [AspNetUsers]
                SET [Email] = N'{to}',
                    [NormalizedEmail] = N'{to.ToUpperInvariant()}',
                    [UserName] = N'{to}',
                    [NormalizedUserName] = N'{to.ToUpperInvariant()}',
                    [ConcurrencyStamp] = CONVERT(nvarchar(36), NEWID())
                WHERE [NormalizedEmail] = N'{from.ToUpperInvariant()}';
            END
            """;
    }
}
