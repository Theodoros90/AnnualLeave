using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAnnualLeaveLeaveTypeRelation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "LeaveTypeId",
                table: "AnnualLeaves",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AnnualLeaves_LeaveTypeId",
                table: "AnnualLeaves",
                column: "LeaveTypeId");

            migrationBuilder.AddForeignKey(
                name: "FK_AnnualLeaves_LeaveTypes_LeaveTypeId",
                table: "AnnualLeaves",
                column: "LeaveTypeId",
                principalTable: "LeaveTypes",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AnnualLeaves_LeaveTypes_LeaveTypeId",
                table: "AnnualLeaves");

            migrationBuilder.DropIndex(
                name: "IX_AnnualLeaves_LeaveTypeId",
                table: "AnnualLeaves");

            migrationBuilder.DropColumn(
                name: "LeaveTypeId",
                table: "AnnualLeaves");
        }
    }
}
