using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <summary>
    /// Inserts the Identity role <c>HR Administrator</c> (<c>AppRoles.HrAdministrator</c>),
    /// a copy of System Administrator: the same permissions, scopes and role-scoped
    /// rules, under a name that says what HR does.
    ///
    /// <c>DbInitializer.SeedRoles</c> would create it on startup, but only where the
    /// seeder runs: <c>Seed:Enabled</c> is false on the deployed host, while
    /// <c>MigrateAsync</c> always runs. This is the half that reaches production, so
    /// the Users panel can offer the role the moment the build lands. Idempotent —
    /// a database that already has the row is left alone.
    ///
    /// Nothing is moved onto it: an administrator who should hold it is switched
    /// over on the Users panel, one person at a time.
    /// </summary>
    public partial class AddHrAdministratorRole : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM [AspNetRoles] WHERE [NormalizedName] = N'HR ADMINISTRATOR')
                BEGIN
                    INSERT INTO [AspNetRoles] ([Id], [Name], [NormalizedName], [ConcurrencyStamp])
                    VALUES (CONVERT(nvarchar(36), NEWID()), N'HR Administrator', N'HR ADMINISTRATOR', CONVERT(nvarchar(36), NEWID()));
                END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Members go with the role: an account left holding a deleted role would
            // sign in with one nothing recognises, which is worse than signing in as
            // nothing at all. Re-grant them a role on the Users panel.
            migrationBuilder.Sql("""
                DECLARE @role nvarchar(450) = (SELECT TOP 1 [Id] FROM [AspNetRoles] WHERE [NormalizedName] = N'HR ADMINISTRATOR');
                IF @role IS NOT NULL
                BEGIN
                    DELETE FROM [AspNetUserRoles] WHERE [RoleId] = @role;
                    DELETE FROM [AspNetRoleClaims] WHERE [RoleId] = @role;
                    DELETE FROM [AspNetRoles] WHERE [Id] = @role;
                END
                """);
        }
    }
}
