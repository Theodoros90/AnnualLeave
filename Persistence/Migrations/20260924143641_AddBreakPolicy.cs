using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <summary>
    /// The organisation's break: a mode ("none", "fixed", "flexible"), the fixed
    /// window and the flexible duration. The existing row gets the entity defaults
    /// — no break, with a 13:00–14:00 window ready for when the mode is switched —
    /// so nothing an attendance rule measures changes until an admin sets one.
    /// </summary>
    public partial class AddBreakPolicy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BreakEnd",
                table: "AppSettings",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "14:00");

            migrationBuilder.AddColumn<int>(
                name: "BreakMinutes",
                table: "AppSettings",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "BreakMode",
                table: "AppSettings",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "none");

            migrationBuilder.AddColumn<string>(
                name: "BreakStart",
                table: "AppSettings",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "13:00");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BreakEnd",
                table: "AppSettings");

            migrationBuilder.DropColumn(
                name: "BreakMinutes",
                table: "AppSettings");

            migrationBuilder.DropColumn(
                name: "BreakMode",
                table: "AppSettings");

            migrationBuilder.DropColumn(
                name: "BreakStart",
                table: "AppSettings");
        }
    }
}
