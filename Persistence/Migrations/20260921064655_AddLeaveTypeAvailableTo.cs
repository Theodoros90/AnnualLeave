using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddLeaveTypeAvailableTo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AvailableTo",
                table: "LeaveTypes",
                type: "int",
                nullable: false,
                defaultValue: 0);

            /* 0 (Both) is right for every existing type except the two whose
               availability was hard-wired by name until now: Maternity Leave was
               offered to women and Paternity Leave to men, and the eligibility rule
               reads this column from here on. Stamped here rather than in the seeder,
               which does not run on the deployed host. Name comparison is
               case-insensitive, matching SystemLeaveTypes. 2 = Female, 1 = Male. */
            migrationBuilder.Sql(
                "UPDATE [LeaveTypes] SET [AvailableTo] = 2 WHERE LOWER(LTRIM(RTRIM([Name]))) = 'maternity leave';");
            migrationBuilder.Sql(
                "UPDATE [LeaveTypes] SET [AvailableTo] = 1 WHERE LOWER(LTRIM(RTRIM([Name]))) = 'paternity leave';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AvailableTo",
                table: "LeaveTypes");
        }
    }
}
