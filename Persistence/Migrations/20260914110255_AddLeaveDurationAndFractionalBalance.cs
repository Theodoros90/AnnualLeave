using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <summary>
    /// Half days, finally stored and charged.
    ///
    /// <c>AnnualLeaves.Duration</c> is new and defaults to 0, which is
    /// <c>LeaveDuration.Full</c> — so every request written while half days were a
    /// pair of buttons that posted nothing reads as the full day it was actually
    /// charged as. No backfill, and nothing to get wrong on a deployed host, where
    /// the seeder does not run (<c>Seed:Enabled</c> is false in Production).
    ///
    /// <c>EmployeeProfiles.LeaveBalance</c> widens from <c>int</c> to
    /// <c>decimal(5,2)</c> so a balance can sit on a half — 22.5 of 23. SQL Server
    /// does this in place and no stored value can fail to survive it; the
    /// "may result in the loss of data" warning EF raises is about <c>Down</c>,
    /// which narrows back to <c>int</c> and would truncate any half day taken in
    /// the meantime. <c>AnnualLeaveEntitlement</c> deliberately stays <c>int</c>:
    /// an allowance is stamped from <c>LeaveType.DefaultAllowance</c> and is always
    /// whole days. Only what is left of one can be a fraction.
    /// </summary>
    public partial class AddLeaveDurationAndFractionalBalance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<decimal>(
                name: "LeaveBalance",
                table: "EmployeeProfiles",
                type: "decimal(5,2)",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AddColumn<int>(
                name: "Duration",
                table: "AnnualLeaves",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Duration",
                table: "AnnualLeaves");

            migrationBuilder.AlterColumn<int>(
                name: "LeaveBalance",
                table: "EmployeeProfiles",
                type: "int",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "decimal(5,2)");
        }
    }
}
