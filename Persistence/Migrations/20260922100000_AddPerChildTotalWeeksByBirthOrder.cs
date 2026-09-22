using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <summary>
    /// The per-child lifetime total can now differ by which child it is: 22 weeks
    /// for the first, 22 for the second and 26 from the third onwards is the
    /// maternity policy that could not be entered with one column.
    ///
    /// Both new columns are nullable and null means "the same as the first child"
    /// (<c>LeaveType.PerChildTotalWeeks</c>), so no row is backfilled: Paternity
    /// Leave's 18 weeks reads as 18 for every child exactly as it did.
    ///
    /// Written by hand because the running API held the build output locked when
    /// the migration was added; the attributes the designer file would carry are
    /// on this class instead.
    /// </summary>
    [DbContext(typeof(AppDbContext))]
    [Migration("20260922100000_AddPerChildTotalWeeksByBirthOrder")]
    public partial class AddPerChildTotalWeeksByBirthOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "PerChildTotalWeeksSecondChild",
                table: "LeaveTypes",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PerChildTotalWeeksThirdChildOnwards",
                table: "LeaveTypes",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PerChildTotalWeeksSecondChild",
                table: "LeaveTypes");

            migrationBuilder.DropColumn(
                name: "PerChildTotalWeeksThirdChildOnwards",
                table: "LeaveTypes");
        }
    }
}
