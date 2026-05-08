using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddUserTimesheetStatusHistoryChangerRelationship : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "UserId",
                table: "TimesheetStatusHistories",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TimesheetStatusHistories_UserId",
                table: "TimesheetStatusHistories",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_TimesheetStatusHistories_AspNetUsers_UserId",
                table: "TimesheetStatusHistories",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TimesheetStatusHistories_AspNetUsers_UserId",
                table: "TimesheetStatusHistories");

            migrationBuilder.DropIndex(
                name: "IX_TimesheetStatusHistories_UserId",
                table: "TimesheetStatusHistories");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "TimesheetStatusHistories");
        }
    }
}
