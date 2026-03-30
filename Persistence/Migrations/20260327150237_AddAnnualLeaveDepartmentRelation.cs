using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAnnualLeaveDepartmentRelation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DepartmentId",
                table: "AnnualLeaves",
                type: "int",
                nullable: true);

            migrationBuilder.Sql(@"
                UPDATE al
                SET al.DepartmentId = ep.DepartmentId
                FROM AnnualLeaves al
                INNER JOIN EmployeeProfiles ep ON ep.Id = al.EmployeeProfileId
                WHERE al.DepartmentId IS NULL
            ");

            migrationBuilder.Sql(@"
                UPDATE al
                SET al.DepartmentId = ep.DepartmentId
                FROM AnnualLeaves al
                INNER JOIN EmployeeProfiles ep ON ep.UserId = al.EmployeeId
                WHERE al.DepartmentId IS NULL
            ");

            migrationBuilder.CreateIndex(
                name: "IX_AnnualLeaves_DepartmentId",
                table: "AnnualLeaves",
                column: "DepartmentId");

            migrationBuilder.AddForeignKey(
                name: "FK_AnnualLeaves_Departments_DepartmentId",
                table: "AnnualLeaves",
                column: "DepartmentId",
                principalTable: "Departments",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AnnualLeaves_Departments_DepartmentId",
                table: "AnnualLeaves");

            migrationBuilder.DropIndex(
                name: "IX_AnnualLeaves_DepartmentId",
                table: "AnnualLeaves");

            migrationBuilder.DropColumn(
                name: "DepartmentId",
                table: "AnnualLeaves");
        }
    }
}
