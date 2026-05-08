using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CascadeDeleteProjectTimesheetEntries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TimesheetEntries_Projects_ProjectId",
                table: "TimesheetEntries");

            migrationBuilder.AddForeignKey(
                name: "FK_TimesheetEntries_Projects_ProjectId",
                table: "TimesheetEntries",
                column: "ProjectId",
                principalTable: "Projects",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TimesheetEntries_Projects_ProjectId",
                table: "TimesheetEntries");

            migrationBuilder.AddForeignKey(
                name: "FK_TimesheetEntries_Projects_ProjectId",
                table: "TimesheetEntries",
                column: "ProjectId",
                principalTable: "Projects",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
