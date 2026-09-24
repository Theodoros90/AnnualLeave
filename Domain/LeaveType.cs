namespace Domain;

public enum AttachmentPolicy
{
    None = 0,
    Optional = 1,
    Required = 2
}

/// <summary>
/// Who a leave type is offered to, by recorded <see cref="Gender"/>. <c>Both</c> is
/// 0 so every row predating the column reads as offered to everyone, which is what
/// every type but Maternity and Paternity Leave was.
///
/// Serialised as "Both" / "Male" / "Female" like <see cref="Gender"/> is: the client
/// types it as a string union.
/// </summary>
public enum GenderAvailability
{
    Both = 0,
    Male = 1,
    Female = 2,
}

public class LeaveType
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    /* Two switches, two stages. Manager on: a request is filed Pending and a Manager
       in the department — or an HR Administrator covering it, who stands in for the
       manager — approves it. HR on: an HR Administrator must sign it off; with
       Manager also on that is a second stage (AnnualLeaveStatus.AwaitingHrApproval)
       after the manager's, with Manager off the request is filed straight into it.
       Neither: approved on filing. ApprovalStageRule is the one place this is
       decided. RequiresHrApproval defaults to false, so every type predating it
       keeps the single-stage behaviour the old RequiresApproval column meant. */
    public bool RequiresManagerApproval { get; set; }
    public bool RequiresHrApproval { get; set; }
    public bool IsActive { get; set; }
    public bool AffectsBalance { get; set; }

    public string Icon { get; set; } = "🏷️";
    public string ColorKey { get; set; } = "default";
    public string Description { get; set; } = string.Empty;
    public bool Paid { get; set; } = true;
    public AttachmentPolicy AttachmentPolicy { get; set; } = AttachmentPolicy.None;
    public int DefaultAllowance { get; set; }
    public string AllowanceUnit { get; set; } = "days/year";
    /* How many unused days of this type survive the year-end rollover. This was
       org-wide (AppSettings.MaxCarryoverDays), which made it a second number free to
       disagree with the allowance it caps, and left the cap unstated for every type
       but annual leave. It belongs beside the allowance, per type.

       Three readings, and null is not the missing one: null is no cap, every unused
       day carries; 0 is its opposite, nothing carries; N caps at N days and may not
       exceed DefaultAllowance. No cap needs a value of its own because it is the one
       reading the allowance cannot bound — it used to be spelled as a number large
       enough that nothing reached it (80 against a 23-day allowance), which reads
       like a limit and behaves like none.

       The cap and the allowance are not the same quantity at year end: a closing
       balance is last year's carry-in plus this year's allowance, so 23 days carried
       into a 23-day year can close at 46. A cap equal to the allowance therefore
       still expires days, which is why "carry everything" is null and not the
       allowance. Nothing enforces any of this yet — there is no year-end rollover
       job; the figure is read by the carryover preview on Leave Settings and by the
       leave type's card. */
    public int? MaxCarryoverDays { get; set; }

    /* Per-child entitlement. Paternity leave is not one budget per employee but one
       per child, bounded by the child's age -- so the three numbers that describe it
       sit here beside the allowance, the same move MoveCarryoverCapToLeaveType made
       for the carryover cap. When the toggle is false all three are ignored and the
       type behaves exactly as it did.

       Note the opposite hazard to EmployeeProfile.AnnualLeaveEntitlement, where a
       stored 0 disables the balance check outright: a 0 here refuses every request
       instead of waving them all through. The validator still refuses 0, but the
       safe direction is the default. */
    public bool PerChildEntitlement { get; set; }
    /// <summary>
    /// Lifetime entitlement for the employee's <b>first</b> child, in weeks. 18 for
    /// paternity leave. Also the figure every later child gets when the two columns
    /// below are left blank — see <see cref="PerChildTotalWeeksFor"/>.
    /// </summary>
    public int PerChildTotalWeeks { get; set; }

    /* The total can depend on which child it is. Cypriot maternity leave is the
       case that forced it: 22 weeks for the first child, 22 for the second and 26
       from the third onwards. One column could only say "N weeks per child", so
       the policy could not be entered at all.

       Both are nullable and null means "the same as the first child", so every row
       predating the columns — Paternity Leave's 18 among them — behaves exactly as
       it did with no data migration. A stored 0 is treated the same way rather
       than as "no leave for a second child": the validator refuses saving one,
       and the fallback is the safe direction where the alternative would silently
       refuse every request for a younger sibling.

       "Which child" is birth order among the employee's declared children, oldest
       first (PerChildLeaveCalculationService.BirthOrder). It is worked out on
       every read, like the child's age, so nothing about it is stored. */
    /// <summary>Lifetime weeks for the second child. Null: the same as the first.</summary>
    public int? PerChildTotalWeeksSecondChild { get; set; }
    /// <summary>Lifetime weeks for the third and every later child. Null: the same as the second.</summary>
    public int? PerChildTotalWeeksThirdChildOnwards { get; set; }
    /// <summary>Cap per leave year per eligible child, in weeks. 5 for paternity leave.</summary>
    public int PerChildWeeksPerYear { get; set; }
    /// <summary>The age at which a child stops being eligible. 15 for paternity leave.</summary>
    public int ChildEligibleUntilAge { get; set; }

    public string AccrualNotes { get; set; } = string.Empty;
    public int MinNoticeDays { get; set; }
    public int MaxConsecutiveDays { get; set; }
    public bool HalfDayAllowed { get; set; }

    /* Which gender this type is offered to. Enforced, not advertised: a request
       against a type restricted to one gender is refused for an employee whose
       recorded Gender is the other (ParentalLeaveEligibility). An unspecified gender
       still passes — see the comment on User.Gender.

       Fixed on the three built-in types (SystemLeaveTypes.FixedAvailability): Annual
       Leave is for everyone, Maternity Leave for women, Paternity Leave for men, and
       the validator refuses any other value for them. Editable on everything else. */
    public GenderAvailability AvailableTo { get; set; } = GenderAvailability.Both;

    /* How long somebody has to have worked here before this type is offered to
       them, in months, measured from EmployeeProfile.EmploymentStartDate to the day
       they file (MinimumServiceRule). 0 is no minimum — the same reading as
       MinNoticeDays and MaxConsecutiveDays, and the opposite of a 0 DefaultAllowance.

       The seeded data promised this in prose and enforced nothing: Unpaid Leave's
       chip read "Employees after 1yr" and Sabbatical's "Tenured employees (5+
       years)". Those two are stamped 12 and 60 by migration AddLeaveTypeMinService;
       everything else stays at 0. An employee with no recorded start date passes,
       for the same reason a null Gender does: it means nobody entered it, not that
       they started today. */
    public int MinServiceMonths { get; set; }

    /* Whether somebody joining part-way through a leave year gets that year's
       allowance in proportion — remaining months over twelve, the joining month
       counted in full, rounded up to the next half day
       (LeaveCalculationService.ProRateFirstYearEntitlement). A September start on 23
       days is 8, not 23. Any type with a flat allowance may set it, but only the
       type flagged AffectsBalance is *enforced*: its allowance is what
       EmployeeProfile.AnnualLeaveEntitlement is stamped from and what the balance
       check measures against. On every other type the switch scales the figure the
       client's balance rows quote (client/src/lib/leave-allowance.ts mirrors the
       arithmetic for those), which is all a non-balance allowance ever was — the
       server never refuses an eleventh sick day. A per-child type has no yearly
       allowance to scale and the validator refuses the switch on one.

       Nothing per person is written when this is on. The stored entitlement stays
       the full allowance and the pro-rating is applied by AnnualLeaveBalanceCalculator
       to the one leave year the start date falls in — which is why the second year
       is full without a year-end job, and why flipping this switch is safe on a
       database full of existing profiles: it changes what is enforced, not what is
       stored. Off by default so every row predating the column keeps behaving as
       it did. */
    public bool ProRateFirstYear { get; set; }

    /// <summary>
    /// The lifetime per-child total, in weeks, for the child at
    /// <paramref name="birthOrder"/> (1 = the eldest). A blank or 0 later column
    /// falls back to the one before it, so 22 / null / 26 reads as 22, 22, 26 and
    /// 18 / null / null as 18 for everyone.
    /// </summary>
    public int PerChildTotalWeeksFor(int birthOrder)
    {
        var second = PerChildTotalWeeksSecondChild is > 0 ? PerChildTotalWeeksSecondChild.Value : PerChildTotalWeeks;
        var third = PerChildTotalWeeksThirdChildOnwards is > 0 ? PerChildTotalWeeksThirdChildOnwards.Value : second;
        return birthOrder switch
        {
            <= 1 => PerChildTotalWeeks,
            2 => second,
            _ => third,
        };
    }

    public ICollection<AnnualLeave> AnnualLeaves { get; set; } = new List<AnnualLeave>();
}
