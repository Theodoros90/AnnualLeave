using Application.Core;
using Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace API.Hubs;

[Authorize]
public class NotificationsHub : Hub
{
    // The unscoped audience: System Administrators. An HR Administrator is in the
    // per-department groups below instead.
    public const string AdminGroup = "role:administrators";

    public static string DepartmentManagerGroup(int departmentId) => $"dept-mgr:{departmentId}";

    private readonly UserManager<User> _userManager;
    private readonly AppDbContext _context;

    public NotificationsHub(UserManager<User> userManager, AppDbContext context)
    {
        _userManager = userManager;
        _context = context;
    }

    // When a client connects, register them into the audience groups whose
    // events they're allowed to receive. Connection→group membership is
    // ephemeral; SignalR removes the connection from all groups on disconnect.
    public override async Task OnConnectedAsync()
    {
        var principal = Context.User;
        if (principal is null)
        {
            await base.OnConnectedAsync();
            return;
        }

        var user = await _userManager.GetUserAsync(principal);
        if (user is null)
        {
            await base.OnConnectedAsync();
            return;
        }

        var roles = await _userManager.GetRolesAsync(user);

        // The admin group is the unscoped audience: System Administrators only.
        if (roles.Contains(AppRoles.SystemAdministrator))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, AdminGroup);
        }

        // A Manager and an HR Administrator hear about their departments — the same
        // set every query scopes them to, from the same resolver.
        if (roles.Any(role => AppRoles.DepartmentScopedRoles.Contains(role)))
        {
            var scope = await ManagerAccessScopeResolver.ResolveAsync(_context, user.Id, Context.ConnectionAborted);
            foreach (var deptId in scope.ManagedDepartmentIds)
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, DepartmentManagerGroup(deptId));
            }
        }

        await base.OnConnectedAsync();
    }
}
