using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAnnualLeaveEmployeeProfileRelation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EmployeeProfileId",
                table: "AnnualLeaves",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.Sql(@"
                UPDATE al
                SET al.EmployeeProfileId = ep.Id
                FROM AnnualLeaves al
                INNER JOIN EmployeeProfiles ep ON ep.UserId = al.EmployeeId
                WHERE al.EmployeeProfileId IS NULL
            ");

            migrationBuilder.CreateIndex(
                name: "IX_AnnualLeaves_EmployeeProfileId",
                table: "AnnualLeaves",
                column: "EmployeeProfileId");

            migrationBuilder.AddForeignKey(
                name: "FK_AnnualLeaves_EmployeeProfiles_EmployeeProfileId",
                table: "AnnualLeaves",
                column: "EmployeeProfileId",
                principalTable: "EmployeeProfiles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AnnualLeaves_EmployeeProfiles_EmployeeProfileId",
                table: "AnnualLeaves");

            migrationBuilder.DropIndex(
                name: "IX_AnnualLeaves_EmployeeProfileId",
                table: "AnnualLeaves");

            migrationBuilder.DropColumn(
                name: "EmployeeProfileId",
                table: "AnnualLeaves");
        }
    }
}
