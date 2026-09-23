using Microsoft.AspNetCore.Identity;

namespace Domain;

public class User : IdentityUser
{
    public string DisplayName { get; set; } = string.Empty;
    public string ImageUrl { get; set; } = string.Empty;

    // Date of birth (date only, no time). Used by the birthday reminder.
    // PhoneNumber is inherited from IdentityUser.
    public DateOnly? DateOfBirth { get; set; }

    /// <summary>
    /// Recorded HR data, maintained by an administrator, and the one thing that
    /// decides who is offered Maternity and Paternity Leave: each is offered to
    /// one gender, and only to an employee who also has a child young enough to
    /// qualify. Enforced by
    /// <c>Application.AnnualLeaves.Commands.ParentalLeaveEligibility</c> on both
    /// create and edit, and mirrored on the client by <c>lib/parental-leave.ts</c>,
    /// which hides the types it would refuse.
    ///
    /// It gated nothing until that rule — the per-child paternity entitlement was
    /// deliberately gender-neutral and the eligibility notes on those types were
    /// decorative. Both have changed; the notes now describe a rule that runs.
    ///
    /// Nullable because every account predating the column has no value, and a
    /// default would assert a fact about a real person that nobody entered. But
    /// for an Employee or a Manager <c>null</c> is a gap, not an answer: both
    /// admin validators refuse saving one without it
    /// (<c>PersonFieldRules.GenderRequiredMessage</c>), so those nulls disappear
    /// one save at a time, as the date of birth's did. The dialog used to offer
    /// an explicit "Not specified" — dropped, because the rule reads a null as
    /// "offer everything", which made a type restricted to one gender reachable
    /// by anyone an admin left unspecified.
    ///
    /// An <b>System Administrator</b> is the exception: the dialogs never ask, and both
    /// validators refuse a value for one
    /// (<c>PersonFieldRules.GenderNotForAdminMessage</c>), so a System Administrator's null is
    /// the standing answer rather than a legacy gap — the same role scoping
    /// <c>EmployeeProfile.DepartmentId</c> and <c>EmploymentStartDate</c> carry.
    /// **A stored null is still offered both parental types, not neither**:
    /// reading "nobody entered it" as a mismatch would take parental leave away
    /// from every account created before the column existed. That covers an
    /// System Administrator filing their own leave too, which is accepted as the price of not
    /// asking them.
    /// </summary>
    public Gender? Gender { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Whether this account may sign in. An administrator switches a leaver off
    /// here rather than deleting them: DeleteAdminUser has to null out every
    /// approval they ever gave, so deletion rewrites history, while an enabled
    /// account leaves working credentials behind.
    ///
    /// Enforced by <c>API.Security.ActiveUserSignInManager</c> — inside Identity,
    /// so no sign-in path can miss it. Deliberately distinct from
    /// <c>LockoutEnd</c>, which is the 15-minute brake on password guessing.
    /// </summary>
    public bool IsActive { get; set; } = true;

    public ICollection<AnnualLeave> AnnualLeaves { get; set; } = new List<AnnualLeave>();
    public ICollection<AnnualLeave> ApprovedAnnualLeaves { get; set; } = new List<AnnualLeave>();
    public ICollection<LeaveStatusHistory> LeaveStatusChanges { get; set; } = new List<LeaveStatusHistory>();
    public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
    public ICollection<UserDepartment> UserDepartments { get; set; } = new List<UserDepartment>();
    public ICollection<UserDepartment> AssignedUserDepartments { get; set; } = new List<UserDepartment>();
    public EmployeeProfile? EmployeeProfile { get; set; }
    public ICollection<Timesheet> ApprovedTimesheets { get; set; } = new List<Timesheet>();
    public ICollection<TimesheetStatusHistory> ChangedTimesheetStatuses { get; set; } = new List<TimesheetStatusHistory>();
}

/// <summary>
/// Serialised as "Male" / "Female" rather than 1 / 2: <c>API/Program.cs</c>
/// registers <c>JsonStringEnumConverter</c>, so the client types this as a string
/// union the same way it types <c>AttachmentPolicy</c> and <c>GenderAvailability</c>.
/// </summary>
public enum Gender
{
    Male = 1,
    Female = 2,
}
