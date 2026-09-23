using System.Security.Claims;
using API.Controllers;
using API.Hubs;
using Application.AdminUsers.Queries;
using Application.AnnualLeaves.Queries;
using Application.Attendance.Queries;
using Application.Core;
using Application.Timesheets.Queries;
using Domain;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Persistence;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// The flags a read action hands its query are the whole department scope: the
/// handlers decide correctly only if <c>IsAdmin</c> means "System Administrator"
/// and <c>IsManager</c> means "department-scoped". Nothing pinned that, so a
/// refactor putting <c>User.IsAdministrator()</c> back on a read would hand an HR
/// Administrator the unfiltered company with every handler test still green.
///
/// These capture the request each action sends rather than exercising the handler
/// behind it — the mapping is the subject, and the handlers have their own tests.
/// </summary>
public class ControllerScopeFlagTests
{
    /// <summary>
    /// Records the one request the action sent and answers with an empty result of
    /// the right shape, so <c>HandleResult</c> and <c>Paged</c> have something to
    /// render rather than dereferencing a null.
    /// </summary>
    private sealed class CapturingMediator : IMediator
    {
        public object? Captured { get; private set; }

        public Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken = default)
        {
            Captured = request;
            return Task.FromResult(Empty<TResponse>());
        }

        public Task<TResponse> Send<TRequest, TResponse>(TRequest request, CancellationToken cancellationToken = default)
            where TRequest : IRequest<TResponse>
        {
            Captured = request;
            return Task.FromResult(Empty<TResponse>());
        }

        public Task Send<TRequest>(TRequest request, CancellationToken cancellationToken = default)
            where TRequest : IRequest
        {
            Captured = request;
            return Task.CompletedTask;
        }

        public Task<object?> Send(object request, CancellationToken cancellationToken = default)
        {
            Captured = request;
            return Task.FromResult<object?>(null);
        }

        private static TResponse Empty<TResponse>()
        {
            var type = typeof(TResponse);

            // Result<T>: a success carrying no value, which HandleResult answers as a
            // 404 — harmless here, and it keeps the null out of the property reads.
            if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(Result<>))
            {
                return (TResponse)type.GetMethod(nameof(Result<object>.Success))!.Invoke(null, [null])!;
            }

            // PagedResult<T>, List<T>: Paged() and Ok() read them straight away.
            return type.IsValueType || type.GetConstructor(Type.EmptyTypes) is null
                ? default!
                : (TResponse)Activator.CreateInstance(type)!;
        }

        public IAsyncEnumerable<TResponse> CreateStream<TResponse>(IStreamRequest<TResponse> request, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public IAsyncEnumerable<object?> CreateStream(object request, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task Publish(object notification, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task Publish<TNotification>(TNotification notification, CancellationToken cancellationToken = default)
            where TNotification : INotification => Task.CompletedTask;
    }

    private sealed class Harness : IDisposable
    {
        private readonly AppDbContext _db = TestDb.Create();
        private readonly ServiceProvider _provider;
        private readonly CapturingMediator _mediator = new();
        private readonly string _role;

        public Harness(string role)
        {
            _role = role;
            _provider = new ServiceCollection()
                .AddSingleton(_db)
                .AddSingleton<IMediator>(_mediator)
                .BuildServiceProvider();
        }

        public void Dispose()
        {
            _provider.Dispose();
            _db.Dispose();
        }

        private ControllerContext Context()
        {
            var claims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, "caller"),
                new(ClaimTypes.Role, _role),
            };

            return new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    RequestServices = _provider,
                    User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test")),
                },
            };
        }

        private T Wire<T>(T controller) where T : ControllerBase
        {
            controller.ControllerContext = Context();
            return controller;
        }

        /// <summary>Runs one action and returns the query it sent.</summary>
        public async Task<TQuery> Sent<TQuery>(Func<Task> action) where TQuery : class
        {
            await action();
            return Assert.IsType<TQuery>(_mediator.Captured);
        }

        // The hub is only touched by the write actions; a null fails loudly if a read
        // ever starts notifying.
        public AnnualLeavesController Leaves() => Wire(new AnnualLeavesController((IHubContext<NotificationsHub>)null!, _db));
        public TimesheetsController Timesheets() => Wire(new TimesheetsController(_db, null!));
        public AttendanceController Attendance() => Wire(new AttendanceController());
        public AdminUsersController AdminUsers() => Wire(new AdminUsersController());
    }

    /// <summary>
    /// The HR Administrator: never the unscoped <c>IsAdmin</c>, always
    /// department-scoped, and flagged as HR wherever the department-less reach
    /// depends on it.
    /// </summary>
    [Fact]
    public async Task An_HR_Administrator_reads_scoped_on_every_list()
    {
        using var harness = new Harness(AppRoles.HrAdministrator);

        var leaves = await harness.Sent<GetAnnualLeaveList.Query>(() => harness.Leaves().GetAnnualLeaves());
        Assert.False(leaves.IsAdmin);
        Assert.True(leaves.IsManager);
        Assert.True(leaves.IsHrAdministrator);

        var timesheets = await harness.Sent<GetTimesheetList.Query>(() => harness.Timesheets().GetTimesheets());
        Assert.False(timesheets.IsAdmin);
        Assert.True(timesheets.IsManager);
        Assert.True(timesheets.IsHrAdministrator);

        var company = await harness.Sent<GetCompanyAttendance.Query>(() => harness.Attendance().GetCompany(CancellationToken.None));
        Assert.True(company.ScopeToCaller);

        var team = await harness.Sent<GetTeamAttendance.Query>(() => harness.Attendance().GetTeam(CancellationToken.None));
        Assert.False(team.IsAdmin);

        var users = await harness.Sent<GetAdminUserList.Query>(() => harness.AdminUsers().GetUsers());
        Assert.True(users.ScopeToCaller);
        Assert.Equal("caller", users.RequestingUserId);
    }

    /// <summary>The one role that reads unfiltered.</summary>
    [Fact]
    public async Task A_System_Administrator_reads_unscoped()
    {
        using var harness = new Harness(AppRoles.SystemAdministrator);

        var leaves = await harness.Sent<GetAnnualLeaveList.Query>(() => harness.Leaves().GetAnnualLeaves());
        Assert.True(leaves.IsAdmin);
        Assert.False(leaves.IsHrAdministrator);

        var timesheets = await harness.Sent<GetTimesheetList.Query>(() => harness.Timesheets().GetTimesheets());
        Assert.True(timesheets.IsAdmin);
        Assert.False(timesheets.IsHrAdministrator);

        var company = await harness.Sent<GetCompanyAttendance.Query>(() => harness.Attendance().GetCompany(CancellationToken.None));
        Assert.False(company.ScopeToCaller);

        var team = await harness.Sent<GetTeamAttendance.Query>(() => harness.Attendance().GetTeam(CancellationToken.None));
        Assert.True(team.IsAdmin);

        var users = await harness.Sent<GetAdminUserList.Query>(() => harness.AdminUsers().GetUsers());
        Assert.False(users.ScopeToCaller);
    }

    /// <summary>
    /// A Manager is department-scoped like an HR Administrator and nothing more —
    /// in particular not the HR flag, which is what opens the department-less rows
    /// an administrator files for themselves.
    /// </summary>
    [Fact]
    public async Task A_Manager_is_department_scoped_and_not_an_HR_Administrator()
    {
        using var harness = new Harness(AppRoles.Manager);

        var leaves = await harness.Sent<GetAnnualLeaveList.Query>(() => harness.Leaves().GetAnnualLeaves());
        Assert.False(leaves.IsAdmin);
        Assert.True(leaves.IsManager);
        Assert.False(leaves.IsHrAdministrator);

        var timesheets = await harness.Sent<GetTimesheetList.Query>(() => harness.Timesheets().GetTimesheets());
        Assert.False(timesheets.IsAdmin);
        Assert.True(timesheets.IsManager);
        Assert.False(timesheets.IsHrAdministrator);

        var team = await harness.Sent<GetTeamAttendance.Query>(() => harness.Attendance().GetTeam(CancellationToken.None));
        Assert.False(team.IsAdmin);
    }
}
