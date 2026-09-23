using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <summary>
    /// Renames the Identity role <c>Admin</c> to <c>System Administrator</c>, in place.
    ///
    /// <c>AppRoles.SystemAdministrator</c> now carries the new name, and every
    /// <c>[Authorize(Roles = ...)]</c>, policy and client check reads it, so a
    /// database still holding the old row would sign every administrator in with a
    /// role nothing recognises. Renaming the row rather than inserting a new one
    /// keeps its <c>Id</c>, so <c>AspNetUserRoles</c> needs no rewrite.
    ///
    /// <c>DbInitializer.SeedRoles</c> would create the new role on startup, but
    /// only where the seeder runs: <c>Seed:Enabled</c> is false on the deployed
    /// host, while <c>MigrateAsync</c> always runs. This is the half that reaches
    /// production. Should both rows already exist — a database somebody created the
    /// new role in by hand — the old role's members are moved onto the new row and
    /// the old row is dropped, so no administrator is left holding a dead role.
    ///
    /// Signed-in administrators carry the old name in their cookie until the
    /// security-stamp validator next rebuilds their principal, which
    /// <c>Program.cs</c> sets to one minute.
    /// </summary>
    public partial class RenameAdminRoleToSystemAdministrator : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(MoveRole(
                fromNormalized: "ADMIN",
                toName: "System Administrator",
                toNormalized: "SYSTEM ADMINISTRATOR"));
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(MoveRole(
                fromNormalized: "SYSTEM ADMINISTRATOR",
                toName: "Admin",
                toNormalized: "ADMIN"));
        }

        // NormalizedName rather than Name: Identity writes the upper-cased form
        // itself, so it cannot have been edited to a different casing.
        private static string MoveRole(string fromNormalized, string toName, string toNormalized) => $"""
            DECLARE @old nvarchar(450) = (SELECT TOP 1 [Id] FROM [AspNetRoles] WHERE [NormalizedName] = N'{fromNormalized}');
            DECLARE @new nvarchar(450) = (SELECT TOP 1 [Id] FROM [AspNetRoles] WHERE [NormalizedName] = N'{toNormalized}');

            IF @old IS NOT NULL AND @new IS NULL
            BEGIN
                UPDATE [AspNetRoles]
                SET [Name] = N'{toName}',
                    [NormalizedName] = N'{toNormalized}',
                    [ConcurrencyStamp] = CONVERT(nvarchar(36), NEWID())
                WHERE [Id] = @old;
            END
            ELSE IF @old IS NOT NULL AND @new IS NOT NULL
            BEGIN
                INSERT INTO [AspNetUserRoles] ([UserId], [RoleId])
                SELECT [ur].[UserId], @new
                FROM [AspNetUserRoles] AS [ur]
                WHERE [ur].[RoleId] = @old
                  AND NOT EXISTS (
                    SELECT 1 FROM [AspNetUserRoles] AS [x]
                    WHERE [x].[UserId] = [ur].[UserId] AND [x].[RoleId] = @new);

                DELETE FROM [AspNetUserRoles] WHERE [RoleId] = @old;
                DELETE FROM [AspNetRoleClaims] WHERE [RoleId] = @old;
                DELETE FROM [AspNetRoles] WHERE [Id] = @old;
            END
            """;
    }
}
