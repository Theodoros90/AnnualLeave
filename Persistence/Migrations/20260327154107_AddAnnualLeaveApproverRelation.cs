using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAnnualLeaveApproverRelation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ApprovedById",
                table: "AnnualLeaves",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AnnualLeaves_ApprovedById",
                table: "AnnualLeaves",
                column: "ApprovedById");

            migrationBuilder.AddForeignKey(
                name: "FK_AnnualLeaves_AspNetUsers_ApprovedById",
                table: "AnnualLeaves",
                column: "ApprovedById",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AnnualLeaves_AspNetUsers_ApprovedById",
                table: "AnnualLeaves");

            migrationBuilder.DropIndex(
                name: "IX_AnnualLeaves_ApprovedById",
                table: "AnnualLeaves");

            migrationBuilder.DropColumn(
                name: "ApprovedById",
                table: "AnnualLeaves");
        }
    }
}
