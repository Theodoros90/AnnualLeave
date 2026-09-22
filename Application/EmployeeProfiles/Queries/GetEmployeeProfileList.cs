using Application.AnnualLeaves.Commands;
using Application.EmployeeProfiles.DTOs;
using Application.Core;
using Domain.Services;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.EmployeeProfiles.Queries;

public class GetEmployeeProfileList
{
    public class Query : IRequest<List<EmployeeProfileDto>>
    {
        public string RequestingUserId { get; set; } = string.Empty;
        public bool IsAdmin { get; set; }
        public bool IsManager { get; set; }
    }

    public class Handler(AppDbContext context) : IRequestHandler<Query, List<EmployeeProfileDto>>
    {
        public async Task<List<EmployeeProfileDto>> Handle(Query request, CancellationToken cancellationToken)
        {
            IQueryable<Domain.EmployeeProfile> query = context.EmployeeProfiles
                .AsNoTracking()
                .Include(ep => ep.User);

            if (request.IsAdmin)
            {
                // Admin sees all profiles.
            }
            else if (request.IsManager)
            {
                var managerScope = await ManagerAccessScopeResolver.ResolveAsync(
                    context,
                    request.RequestingUserId,
                    cancellationToken);

                // Restrict to only employees in the manager's own department(s)
                query = query.Where(ep =>
                    ((ep.DepartmentId != null && managerScope.ManagedDepartmentIds.Contains(ep.DepartmentId.Value))
                     || (ep.ManagerId != null && managerScope.ManagerProfileIds.Contains(ep.ManagerId))
                     || ep.UserId == request.RequestingUserId)
                    && (ep.User == null || !ep.User.UserRoles.Any(ur => ur.Role != null && ur.Role.Name == AppRoles.Admin)));
            }
            else
            {
                // Employee sees only their own profile.
                query = query.Where(ep => ep.UserId == request.RequestingUserId);
            }

            var profiles = await query
                .OrderBy(ep => ep.UserId)
                .Select(ep => new
                {
                    Profile = ep,
                    DisplayName = ep.User != null
                        ? (ep.User.DisplayName ?? ep.User.UserName ?? ep.UserId)
                        : ep.UserId,
                })
                .ToListAsync(cancellationToken);

            // This year's figure is a projection over the start date and the balance
            // type's switch, worked out here rather than stored — see the DTO.
            var startMonth = await LeaveYearQueries.GetLeaveYearStartMonthAsync(context, cancellationToken);
            var currentLeaveYearKey = LeaveCalculationService.GetLeaveYearKey(DateTime.UtcNow, startMonth);
            var proRateFirstYear = await AnnualLeaveBalanceCalculator.ProRatesFirstYearAsync(context, cancellationToken);

            return profiles
                .Select(row => new EmployeeProfileDto
                {
                    Id = row.Profile.Id,
                    UserId = row.Profile.UserId,
                    DisplayName = row.DisplayName,
                    DepartmentId = row.Profile.DepartmentId,
                    ManagerId = row.Profile.ManagerId,
                    AnnualLeaveEntitlement = row.Profile.AnnualLeaveEntitlement,
                    CurrentYearEntitlement = AnnualLeaveBalanceCalculator.EntitlementForLeaveYear(
                        row.Profile, currentLeaveYearKey, startMonth, proRateFirstYear),
                    LeaveBalance = row.Profile.LeaveBalance,
                    JobTitle = row.Profile.JobTitle,
                    EmploymentStartDate = row.Profile.EmploymentStartDate,
                    CreatedAt = row.Profile.CreatedAt
                })
                .ToList();
        }
    }
}
