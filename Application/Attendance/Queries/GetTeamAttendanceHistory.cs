using Application.Attendance.DTOs;
using Application.Attendance.Support;
using Application.Core;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Attendance.Queries;

/// <summary>
/// Per-day earliest check-in time per team member over the last N days, for the
/// "Team Health" line chart. Reported as minutes from midnight in the org's time
/// zone (<see cref="WorkingDaySchedule"/>) so the chart plots a numeric y-axis
/// whose "09:00" is the 09:00 the working-hours setting means, and null for a day
/// with no check-in (off, on leave, or a weekend). It used to be UTC minutes,
/// which on a UTC+3 deployment drew every arrival three hours early.
///
/// The population for a non-admin is the same reach as the team board beside it:
/// managed departments and direct reports. It used to scope to direct reports
/// (ManagerId) alone, so a manager's chart and their board disagreed about who
/// was on the team.
/// </summary>
public class GetTeamAttendanceHistory
{
    public const int DefaultDays = 30;
    public const int MaxDays = 90;

    public class Query : IRequest<Result<TeamHistoryDto>>
    {
        public required string RequestingUserId { get; set; }
        public bool IsAdmin { get; set; }
        public int Days { get; set; } = DefaultDays;

        /// <summary>Test seam for the clock; the controller leaves it null.</summary>
        public DateTime? NowUtc { get; init; }
    }

    public class Handler(AppDbContext context) : IRequestHandler<Query, Result<TeamHistoryDto>>
    {
        public async Task<Result<TeamHistoryDto>> Handle(Query request, CancellationToken cancellationToken)
        {
            var days = request.Days is <= 0 or > MaxDays ? DefaultDays : request.Days;

            var profilesQuery = AttendanceDay.ExcludeAdmins(
                context.EmployeeProfiles
                    .Include(p => p.User));

            if (!request.IsAdmin)
            {
                var me = await AttendanceDay.ResolveProfileAsync(context, request.RequestingUserId, cancellationToken);
                if (me is null) return AttendanceDay.NoProfile<TeamHistoryDto>();

                // The same reach as the team board beside it: the caller's departments
                // and direct reports. It used to read direct reports alone, so a
                // manager's chart and their board disagreed about who was on the team.
                var scope = await ManagerAccessScopeResolver.ResolveAsync(context, request.RequestingUserId, cancellationToken);
                profilesQuery = profilesQuery.Where(p =>
                    p.UserId != request.RequestingUserId
                    && ((p.DepartmentId != null && scope.ManagedDepartmentIds.Contains(p.DepartmentId.Value))
                        || (p.ManagerId != null && scope.ManagerProfileIds.Contains(p.ManagerId))));
            }

            var profiles = await profilesQuery
                .OrderBy(p => p.User != null ? p.User.DisplayName : "")
                .ToListAsync(cancellationToken);

            var profileIds = profiles.Select(p => p.Id).ToList();

            var now = request.NowUtc ?? DateTime.UtcNow;
            var schedule = await WorkingDaySchedule.LoadAsync(context, cancellationToken);
            var today = AttendanceDay.UtcDayStart(now);
            var rangeStart = today.AddDays(-(days - 1));
            var rangeEnd = today.AddDays(1);

            // Only check-ins matter here, and only the earliest one per day.
            var checkIns = await context.AttendanceEvents
                .Where(e => profileIds.Contains(e.EmployeeProfileId)
                    && e.Type == AttendanceEventType.CheckIn
                    && e.At >= rangeStart && e.At < rangeEnd)
                .Select(e => new { e.EmployeeProfileId, e.At })
                .ToListAsync(cancellationToken);

            var earliestPerDay = checkIns
                .GroupBy(e => (e.EmployeeProfileId, Day: AttendanceDay.UtcDayStart(e.At)))
                .ToDictionary(g => g.Key, g => g.Min(x => x.At));

            var members = profiles.Select(profile =>
            {
                var dayList = new List<MemberCheckInDayDto>(capacity: days);
                for (var i = days - 1; i >= 0; i--)
                {
                    var day = today.AddDays(-i);
                    int? minutes = earliestPerDay.TryGetValue((profile.Id, day), out var at)
                        ? schedule.LocalMinutesFromMidnight(at)
                        : null;

                    dayList.Add(new MemberCheckInDayDto(day.ToString("yyyy-MM-dd"), minutes));
                }

                return new TeamMemberHistoryDto(profile.Id, AttendanceDay.DisplayNameOf(profile), dayList);
            }).ToList();

            return Result<TeamHistoryDto>.Success(new TeamHistoryDto(members));
        }
    }
}
