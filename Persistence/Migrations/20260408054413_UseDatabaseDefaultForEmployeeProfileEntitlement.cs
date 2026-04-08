using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class UseDatabaseDefaultForEmployeeProfileEntitlement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "AnnualLeaveEntitlement",
                table: "EmployeeProfiles",
                type: "int",
                nullable: false,
                defaultValue: 22,
                oldClrType: typeof(int),
                oldType: "int",
                oldDefaultValue: 20);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "AnnualLeaveEntitlement",
                table: "EmployeeProfiles",
                type: "int",
                nullable: false,
                defaultValue: 20,
                oldClrType: typeof(int),
                oldType: "int",
                oldDefaultValue: 22);
        }
    }
}
