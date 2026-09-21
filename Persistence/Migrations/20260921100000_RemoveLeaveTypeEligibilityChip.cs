using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemoveLeaveTypeEligibilityChip : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            /* The two columns behind the eligibility chip on the leave-type card: a
               free-text note and an All/Limited flag that no rule ever read. Every
               restriction the chip described in prose is now a column something
               enforces (AvailableTo for gender, MinServiceMonths for length of
               service, PerChildEntitlement for the per-child ledger), so the chip
               could only agree with those or contradict them: "Limited" on a type
               nothing limited read like a rule and behaved like none. The card now
               derives its "Available to" from the enforced columns instead. */
            migrationBuilder.DropColumn(
                name: "EligibilityNotes",
                table: "LeaveTypes");

            migrationBuilder.DropColumn(
                name: "EligibilityScope",
                table: "LeaveTypes");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The columns come back at their schema defaults; the free text they
            // held was decorative and is not restored.
            migrationBuilder.AddColumn<string>(
                name: "EligibilityNotes",
                table: "LeaveTypes",
                type: "nvarchar(250)",
                maxLength: 250,
                nullable: false,
                defaultValue: "All employees");

            migrationBuilder.AddColumn<int>(
                name: "EligibilityScope",
                table: "LeaveTypes",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }
    }
}
