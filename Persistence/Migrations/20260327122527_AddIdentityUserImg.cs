using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddIdentityUserImg : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ImageUrl",
                table: "AspNetUsers",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AlterColumn<string>(
                name: "EmployeeId",
                table: "AnnualLeaves",
                type: "nvarchar(450)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.Sql(@"
IF NOT EXISTS (SELECT 1 FROM [AspNetUsers])
BEGIN
    DELETE FROM [AnnualLeaves];
END
ELSE
BEGIN
    UPDATE [al]
    SET [al].[EmployeeId] = (
        SELECT TOP(1) [u].[Id]
        FROM [AspNetUsers] AS [u]
        ORDER BY [u].[CreatedAt]
    )
    FROM [AnnualLeaves] AS [al]
    WHERE NOT EXISTS (
        SELECT 1
        FROM [AspNetUsers] AS [u]
        WHERE [u].[Id] = [al].[EmployeeId]
    );
END
");

            migrationBuilder.CreateIndex(
                name: "IX_AnnualLeaves_EmployeeId",
                table: "AnnualLeaves",
                column: "EmployeeId");

            migrationBuilder.AddForeignKey(
                name: "FK_AnnualLeaves_AspNetUsers_EmployeeId",
                table: "AnnualLeaves",
                column: "EmployeeId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AnnualLeaves_AspNetUsers_EmployeeId",
                table: "AnnualLeaves");

            migrationBuilder.DropIndex(
                name: "IX_AnnualLeaves_EmployeeId",
                table: "AnnualLeaves");

            migrationBuilder.DropColumn(
                name: "ImageUrl",
                table: "AspNetUsers");

            migrationBuilder.AlterColumn<string>(
                name: "EmployeeId",
                table: "AnnualLeaves",
                type: "nvarchar(max)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(450)");
        }
    }
}
