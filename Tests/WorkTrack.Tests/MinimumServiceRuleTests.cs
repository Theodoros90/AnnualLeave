using Application.AnnualLeaves.Commands;
using Domain;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// <see cref="LeaveType.MinServiceMonths"/>: how long somebody has to have worked
/// here before a leave type is offered to them, measured from
/// <see cref="EmployeeProfile.EmploymentStartDate"/> to the day they file. The
/// seeded data already promised this in prose — Unpaid Leave's chip read
/// "Employees after 1yr" and Sabbatical's "Tenured employees (5+ years)" — and
/// nothing enforced either. These tests pin the arithmetic; the enforcement tests
/// pin that the handlers consult it.
/// </summary>
public class MinimumServiceRuleTests
{
    private static LeaveType Type(int minServiceMonths) => new()
    {
        Id = 1,
        Name = "Unpaid Leave",
        MinServiceMonths = minServiceMonths,
    };

    private static readonly DateOnly Today = new(2026, 9, 21);

    [Fact]
    public void A_type_wanting_service_refuses_an_employee_who_has_not_served_it()
    {
        var error = MinimumServiceRule.Check(Type(2), new DateOnly(2026, 8, 1), Today);

        Assert.Equal(
            "Unpaid Leave is available after 2 months of service. You can request it from Thursday, 1 October 2026.",
            error);
    }

    [Fact]
    public void One_month_reads_in_the_singular()
    {
        var error = MinimumServiceRule.Check(Type(1), new DateOnly(2026, 9, 1), Today);

        Assert.Equal(
            "Unpaid Leave is available after 1 month of service. You can request it from Thursday, 1 October 2026.",
            error);
    }

    [Fact]
    public void An_employee_exactly_on_the_boundary_is_allowed()
    {
        Assert.Null(MinimumServiceRule.Check(Type(2), new DateOnly(2026, 7, 21), Today));
    }

    [Fact]
    public void An_employee_past_the_boundary_is_allowed()
    {
        Assert.Null(MinimumServiceRule.Check(Type(2), new DateOnly(2020, 1, 1), Today));
    }

    /// <summary>Zero is the setting the dialog labels "0 = no minimum".</summary>
    [Fact]
    public void A_type_wanting_no_service_allows_somebody_who_started_today()
    {
        Assert.Null(MinimumServiceRule.Check(Type(0), Today, Today));
    }

    /// <summary>
    /// Nobody has entered it — an Admin never has one, and an Employee row predating
    /// the column has none until it is next saved. The same reading as a null
    /// gender in <see cref="ParentalLeaveEligibility"/>: refusing on a blank would
    /// take the type away from everyone until an admin filled the field in one
    /// person at a time.
    /// </summary>
    [Fact]
    public void An_unrecorded_start_date_passes()
    {
        Assert.Null(MinimumServiceRule.Check(Type(24), null, Today));
    }

    /// <summary>
    /// A hire keyed in before their first day is ordinary. They have served nothing
    /// yet, so a type wanting any service refuses them, from the right date.
    /// </summary>
    [Fact]
    public void A_start_date_in_the_future_has_served_nothing_yet()
    {
        var error = MinimumServiceRule.Check(Type(2), new DateOnly(2026, 10, 1), Today);

        Assert.Equal(
            "Unpaid Leave is available after 2 months of service. You can request it from Tuesday, 1 December 2026.",
            error);
    }
}
