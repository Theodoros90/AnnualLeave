using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTimesheetEntryEntity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_EmployeeProfiles_AspNetUsers_UserId",
                table: "EmployeeProfiles");

            migrationBuilder.DropForeignKey(
                name: "FK_EmployeeProfiles_Departments_DepartmentId",
                table: "EmployeeProfiles");

            migrationBuilder.DropForeignKey(
                name: "FK_EmployeeProfiles_EmployeeProfiles_ManagerId",
                table: "EmployeeProfiles");

            migrationBuilder.AddColumn<string>(
                name: "UserId",
                table: "AnnualLeaves",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UserId1",
                table: "AnnualLeaves",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "TimesheetEntries",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    TimesheetId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    ProjectId = table.Column<int>(type: "int", nullable: false),
                    Date = table.Column<DateTime>(type: "datetime2", nullable: false),
                    HoursWorked = table.Column<decimal>(type: "decimal(4,2)", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TimesheetEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TimesheetEntries_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TimesheetEntries_Timesheets_TimesheetId",
                        column: x => x.TimesheetId,
                        principalTable: "Timesheets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AnnualLeaves_UserId",
                table: "AnnualLeaves",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_AnnualLeaves_UserId1",
                table: "AnnualLeaves",
                column: "UserId1");

            migrationBuilder.CreateIndex(
                name: "IX_TimesheetEntries_ProjectId",
                table: "TimesheetEntries",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_TimesheetEntries_TimesheetId",
                table: "TimesheetEntries",
                column: "TimesheetId");

            migrationBuilder.AddForeignKey(
                name: "FK_AnnualLeaves_AspNetUsers_UserId",
                table: "AnnualLeaves",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_AnnualLeaves_AspNetUsers_UserId1",
                table: "AnnualLeaves",
                column: "UserId1",
                principalTable: "AspNetUsers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_EmployeeProfiles_AspNetUsers_UserId",
                table: "EmployeeProfiles",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_EmployeeProfiles_Departments_DepartmentId",
                table: "EmployeeProfiles",
                column: "DepartmentId",
                principalTable: "Departments",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_EmployeeProfiles_EmployeeProfiles_ManagerId",
                table: "EmployeeProfiles",
                column: "ManagerId",
                principalTable: "EmployeeProfiles",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AnnualLeaves_AspNetUsers_UserId",
                table: "AnnualLeaves");

            migrationBuilder.DropForeignKey(
                name: "FK_AnnualLeaves_AspNetUsers_UserId1",
                table: "AnnualLeaves");

            migrationBuilder.DropForeignKey(
                name: "FK_EmployeeProfiles_AspNetUsers_UserId",
                table: "EmployeeProfiles");

            migrationBuilder.DropForeignKey(
                name: "FK_EmployeeProfiles_Departments_DepartmentId",
                table: "EmployeeProfiles");

            migrationBuilder.DropForeignKey(
                name: "FK_EmployeeProfiles_EmployeeProfiles_ManagerId",
                table: "EmployeeProfiles");

            migrationBuilder.DropTable(
                name: "TimesheetEntries");

            migrationBuilder.DropIndex(
                name: "IX_AnnualLeaves_UserId",
                table: "AnnualLeaves");

            migrationBuilder.DropIndex(
                name: "IX_AnnualLeaves_UserId1",
                table: "AnnualLeaves");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "AnnualLeaves");

            migrationBuilder.DropColumn(
                name: "UserId1",
                table: "AnnualLeaves");

            migrationBuilder.AddForeignKey(
                name: "FK_EmployeeProfiles_AspNetUsers_UserId",
                table: "EmployeeProfiles",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_EmployeeProfiles_Departments_DepartmentId",
                table: "EmployeeProfiles",
                column: "DepartmentId",
                principalTable: "Departments",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_EmployeeProfiles_EmployeeProfiles_ManagerId",
                table: "EmployeeProfiles",
                column: "ManagerId",
                principalTable: "EmployeeProfiles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
