using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <summary>
    /// Splits the one approval switch into Manager and HR. The rename keeps every
    /// stored value; the new column defaults to off. See ApprovalStageRule.
    /// </summary>
    public partial class SplitLeaveApprovalIntoManagerAndHr : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // A rename, not a drop-and-add: the old column's true meant "a manager
            // (or HR standing in) approves", which is exactly what the new name
            // means, so every stored value carries over.
            migrationBuilder.RenameColumn(
                name: "RequiresApproval",
                table: "LeaveTypes",
                newName: "RequiresManagerApproval");

            // Off everywhere: nothing changes in behaviour until an admin flips it.
            migrationBuilder.AddColumn<bool>(
                name: "RequiresHrApproval",
                table: "LeaveTypes",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RequiresHrApproval",
                table: "LeaveTypes");

            migrationBuilder.RenameColumn(
                name: "RequiresManagerApproval",
                table: "LeaveTypes",
                newName: "RequiresApproval");
        }
    }
}
