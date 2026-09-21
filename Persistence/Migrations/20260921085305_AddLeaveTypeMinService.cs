using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddLeaveTypeMinService : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "MinServiceMonths",
                table: "LeaveTypes",
                type: "int",
                nullable: false,
                defaultValue: 0);

            /* 0 (no minimum) is right for every existing type except the two whose
               eligibility chip has always promised a length of service and enforced
               nothing: Unpaid Leave read "Employees after 1yr" and Sabbatical
               "Tenured employees (5+ years)". Stamped here rather than in the seeder,
               which does not run on the deployed host. Name comparison is
               case-insensitive, matching how the seeder matches its presets. */
            migrationBuilder.Sql(
                "UPDATE [LeaveTypes] SET [MinServiceMonths] = 12 WHERE LOWER(LTRIM(RTRIM([Name]))) = 'unpaid leave';");
            migrationBuilder.Sql(
                "UPDATE [LeaveTypes] SET [MinServiceMonths] = 60 WHERE LOWER(LTRIM(RTRIM([Name]))) = 'sabbatical';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MinServiceMonths",
                table: "LeaveTypes");
        }
    }
}
