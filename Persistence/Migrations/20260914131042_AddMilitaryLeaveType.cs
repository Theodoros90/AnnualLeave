using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMilitaryLeaveType : Migration
    {
        /// <summary>
        /// Adds Military Leave — national service, a reservist call-up, or the
        /// training that goes with it.
        ///
        /// A migration rather than a DbInitializer change alone, for the two
        /// reasons ConfigurePaternityPerChildEntitlement records and one more.
        /// Seed:Enabled is false in Production, so the seeder never runs on the
        /// deployed host; and SeedLeaveTypes bails out the moment any leave type
        /// exists, so it would skip every database that already has a catalogue —
        /// including every developer's. The seeder keeps its copy so a fresh clone
        /// agrees with a migrated database.
        ///
        /// Guarded rather than unconditional: a database created from scratch runs
        /// the seeder and this migration both, and without the guard the second
        /// would plant a duplicate of a name the upsert validator treats as unique.
        ///
        /// N-prefixed throughout. The icon is astral (U+1F396 U+FE0F) and the
        /// accrual note carries a '·', and an unprefixed literal is varchar,
        /// converted through the database collation — which is how a migrated
        /// database and a fresh clone end up disagreeing on exactly the text this
        /// migration exists to put there.
        /// </summary>
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF NOT EXISTS (SELECT 1 FROM [LeaveTypes] WHERE [Name] = N'Military Leave')
                BEGIN
                    INSERT INTO [LeaveTypes]
                        ([Name], [RequiresApproval], [IsActive], [AffectsBalance],
                         [Icon], [ColorKey], [Description], [Paid],
                         [AttachmentPolicy], [DefaultAllowance], [AllowanceUnit], [MaxCarryoverDays],
                         [PerChildEntitlement], [PerChildTotalWeeks], [PerChildWeeksPerYear], [ChildEligibleUntilAge],
                         [AccrualNotes], [MinNoticeDays], [MaxConsecutiveDays], [HalfDayAllowed],
                         [EligibilityNotes], [EligibilityScope])
                    VALUES
                        (N'Military Leave', 1, 1,
                         -- A call-up is not a holiday: it must not spend the annual pool.
                         0,
                         N'🎖️', N'military',
                         N'Compulsory national service, reservist call-up, or military training.', 1,
                         -- AttachmentPolicy.Required — the call-up papers.
                         2, 30, N'days/year',
                         -- No carryover cap, which is what NULL means here. Moot while
                         -- AffectsBalance is 0, but 0 would be its opposite, not its absence.
                         NULL,
                         -- The per-child ledger belongs to the two parental types alone.
                         0, 0, 0, 0,
                         N'Granted per call-up · Evidence required',
                         -- 0 notice, and it has to be 0 now that NoticePeriodRule refuses
                         -- a late request: call-up papers arrive when they arrive.
                         0, 30, 0,
                         N'Employees called up for national service',
                         -- EligibilityScope.Limited
                         1);
                END
                """);
        }

        /// <summary>
        /// Removes the row again, but only while nothing has been filed against it:
        /// the FK would refuse the delete anyway, and a migration that fails halfway
        /// down is worse than one that leaves a type somebody has used in place.
        /// </summary>
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DELETE FROM [LeaveTypes]
                WHERE [Name] = N'Military Leave'
                  AND NOT EXISTS (
                      SELECT 1 FROM [AnnualLeaves] a WHERE a.[LeaveTypeId] = [LeaveTypes].[Id]);
                """);
        }
    }
}
