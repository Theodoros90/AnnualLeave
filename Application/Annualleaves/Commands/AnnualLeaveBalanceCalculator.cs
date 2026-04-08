using Domain;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Annualleaves.Commands;

internal static class AnnualLeaveBalanceCalculator
{
    public static async Task EnsureSufficientBalanceAsync(
        AppDbContext context,
        EmployeeProfile employeeProfile,
        AnnualLeave annualLeave,
        string? excludeLeaveId,
        CancellationToken cancellationToken)
    {
        if (!await IsAnnualLeaveAsync(context, annualLeave.LeaveTypeId, cancellationToken))
        {
            return;
        }

        foreach (var year in GetCoveredYears(annualLeave))
        {
            var requestedDays = GetBusinessDaysInYear(annualLeave, year);
            if (requestedDays <= 0)
            {
                continue;
            }

            var usedDays = await GetApprovedAnnualLeaveDaysForYearAsync(
                context,
                annualLeave.EmployeeId,
                year,
                excludeLeaveId,
                cancellationToken);

            var remainingBalance = Math.Max(0, employeeProfile.AnnualLeaveEntitlement - usedDays);
            if (remainingBalance < requestedDays)
            {
                throw new InvalidOperationException(
                    $"Insufficient leave balance for {year}. Remaining balance: {remainingBalance} day(s)."
                );
            }
        }
    }

    public static async Task SyncCurrentYearBalanceAsync(
        AppDbContext context,
        EmployeeProfile employeeProfile,
        CancellationToken cancellationToken)
    {
        var currentYear = DateTime.UtcNow.Year;
        var usedDays = await GetApprovedAnnualLeaveDaysForYearAsync(
            context,
            employeeProfile.UserId,
            currentYear,
            excludeLeaveId: null,
            cancellationToken);

        employeeProfile.LeaveBalance = Math.Max(0, employeeProfile.AnnualLeaveEntitlement - usedDays);
    }

    private static IEnumerable<int> GetCoveredYears(AnnualLeave annualLeave)
    {
        var startYear = annualLeave.StartDate.Year;
        var endYear = annualLeave.EndDate.Year;

        for (var year = startYear; year <= endYear; year++)
        {
            yield return year;
        }
    }

    private static async Task<bool> IsAnnualLeaveAsync(
        AppDbContext context,
        int? leaveTypeId,
        CancellationToken cancellationToken)
    {
        if (!leaveTypeId.HasValue)
        {
            return false;
        }

        return await context.LeaveTypes
            .AsNoTracking()
            .AnyAsync(
                leaveType => leaveType.Id == leaveTypeId.Value && leaveType.Name == "Annual Leave",
                cancellationToken);
    }

    private static async Task<int> GetApprovedAnnualLeaveDaysForYearAsync(
        AppDbContext context,
        string employeeId,
        int year,
        string? excludeLeaveId,
        CancellationToken cancellationToken)
    {
        var annualLeaveTypeIds = await context.LeaveTypes
            .AsNoTracking()
            .Where(leaveType => leaveType.Name == "Annual Leave")
            .Select(leaveType => leaveType.Id)
            .ToListAsync(cancellationToken);

        if (annualLeaveTypeIds.Count == 0)
        {
            return 0;
        }

        var approvedLeaves = await context.AnnualLeaves
            .AsNoTracking()
            .Where(leave =>
                leave.EmployeeId == employeeId
                && leave.Status == AnnualLeaveStatus.Approved
                && leave.StartDate.Year <= year
                && leave.EndDate.Year >= year
                && leave.LeaveTypeId.HasValue
                && annualLeaveTypeIds.Contains(leave.LeaveTypeId.Value)
                && (excludeLeaveId == null || leave.Id != excludeLeaveId))
            .ToListAsync(cancellationToken);

        return approvedLeaves.Sum(leave => GetBusinessDaysInYear(leave, year));
    }

    private static int GetBusinessDaysInYear(AnnualLeave annualLeave, int year)
    {
        var start = annualLeave.StartDate.Date > new DateTime(year, 1, 1)
            ? annualLeave.StartDate.Date
            : new DateTime(year, 1, 1);
        var end = annualLeave.EndDate.Date < new DateTime(year, 12, 31)
            ? annualLeave.EndDate.Date
            : new DateTime(year, 12, 31);

        if (end < start)
        {
            return 0;
        }

        var days = 0;
        for (var date = start; date <= end; date = date.AddDays(1))
        {
            if (date.DayOfWeek is not DayOfWeek.Saturday and not DayOfWeek.Sunday)
            {
                days++;
            }
        }

        return days;
    }
}
