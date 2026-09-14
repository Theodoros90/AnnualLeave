using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <summary>
    /// The carryover cap was bounded only by the calendar — 0 to 365, never compared to
    /// the allowance it caps — so a type could grant 23 days a year and carry over 80.
    /// That figure is reachable only after four consecutive years of taking no leave at
    /// all: it reads like a limit and behaves like none, and the preview on Leave
    /// Settings quoted it as though days were being capped when none ever could be.
    ///
    /// Two changes here. The column becomes nullable, giving "no cap, everything
    /// carries" a value of its own instead of leaving it to be spelled as a number too
    /// large to reach — null is no cap, 0 is nothing carries, N is at most N days. And
    /// any stored cap above its own type's allowance is clamped down to it, which is
    /// the repair for a database already holding one. The seeder does not run on the
    /// deployed host (Seed:Enabled is false in Production), so a data repair has to be
    /// a migration.
    ///
    /// Clamping rather than nulling is deliberate: a cap of 80 against 23 days was
    /// almost certainly a misunderstanding of the field, and "nothing ever expires"
    /// should be chosen on purpose — it is one cleared field away on Leave Types.
    /// </summary>
    public partial class BoundCarryoverCapToTheAllowance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "MaxCarryoverDays",
                table: "LeaveTypes",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            // UpsertLeaveTypeRequestValidator refuses this combination from now on, but
            // only on the next save of that type — until then the old figure would keep
            // being quoted on the card and in the carryover preview.
            migrationBuilder.Sql(@"
                UPDATE LeaveTypes
                SET MaxCarryoverDays = DefaultAllowance
                WHERE MaxCarryoverDays > DefaultAllowance;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            /* Lossy, and in the one direction that matters: a column that cannot hold
               null cannot say "no cap", so an uncapped type comes back as one that
               carries nothing — the opposite policy. Done explicitly because the
               defaultValue below only constrains new rows; it does not backfill the
               nulls already stored, and the ALTER would fail on them. */
            migrationBuilder.Sql("UPDATE LeaveTypes SET MaxCarryoverDays = 0 WHERE MaxCarryoverDays IS NULL;");

            migrationBuilder.AlterColumn<int>(
                name: "MaxCarryoverDays",
                table: "LeaveTypes",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);
        }
    }
}
