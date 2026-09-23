using System.Security.Claims;

namespace Domain;

public static class AppRoles
{
    public const string Employee = "Employee";
    public const string Manager = "Manager";
    public const string SystemAdministrator = "System Administrator";

    /// <summary>
    /// The administrator's <b>reach</b> without the administrator's <b>hand on the
    /// configuration</b>. An HR Administrator sees every department — Leave
    /// Management, Attendance and Timesheets company-wide, filing leave on somebody's
    /// behalf — and carries the same role-scoped rules as a System Administrator (no
    /// department, gender or employment start date, no coverage on their own leave,
    /// excluded from attendance, mailed the admin reports). What they cannot touch is
    /// system administration: Users, Departments, Projects and their catalogues,
    /// Leave Types, Organization, Notification Settings and Data Maintenance.
    ///
    /// So there are two questions, and a gate has to ask the right one:
    /// <list type="bullet">
    ///   <item><b>Reach</b> — <see cref="Administrators"/> / <see cref="AdministratorRoles"/> /
    ///   <see cref="IsAdministrator(string?)"/>. Both roles.</item>
    ///   <item><b>System administration</b> — <see cref="SystemAdministrator"/> by name,
    ///   on the configuration controllers' write actions and the <c>EmployeeProfileUpdate</c>
    ///   policy. That role alone.</item>
    /// </list>
    /// </summary>
    public const string HrAdministrator = "HR Administrator";

    public static readonly string[] All = { SystemAdministrator, HrAdministrator, Manager, Employee };

    /// <summary>
    /// The roles with an administrator's reach over every department. Query with
    /// <c>Contains</c> — and keep it typed as a list, not an array: on C# 14 an array's
    /// <c>Contains</c> inside an EF expression binds to the <c>ReadOnlySpan</c> overload,
    /// which the query evaluator cannot interpret, and every query that reads it throws
    /// at runtime.
    /// </summary>
    public static readonly IReadOnlyList<string> Administrators = new[] { SystemAdministrator, HrAdministrator };

    /// <summary>
    /// <see cref="Administrators"/> as the comma-separated list <c>[Authorize(Roles = ...)]</c>
    /// takes. A <c>const</c> so it can sit in an attribute. For the reach, not the
    /// configuration — a write on a catalogue names <see cref="SystemAdministrator"/>.
    /// </summary>
    public const string AdministratorRoles = SystemAdministrator + "," + HrAdministrator;

    /// <summary>
    /// Who decides leave and time for other people: an HR Administrator company-wide,
    /// a Manager within their department. For <c>[Authorize(Roles = ...)]</c> on the
    /// approve/reject actions. The System Administrator is deliberately absent — they
    /// configure the workspace and neither file nor decide leave — which is also why
    /// the leave controllers ask <see cref="IsHrAdministrator"/>, not
    /// <see cref="IsAdministrator(ClaimsPrincipal)"/>, before treating a caller as
    /// acting on somebody's behalf. Reads keep the wider gate: the Users and
    /// Departments panels quote leave and attendance figures.
    /// </summary>
    public const string LeaveAndTimeDecisionRoles = HrAdministrator + "," + Manager;

    /// <summary>Whether the signed-in principal is the HR Administrator — the one administrator who runs Leave &amp; Time.</summary>
    public static bool IsHrAdministrator(this ClaimsPrincipal user) => user.IsInRole(HrAdministrator);

    /// <summary>Whether <paramref name="role"/> is one of the administrator roles. Case-insensitive, like Identity.</summary>
    public static bool IsAdministrator(string? role) =>
        role is not null && Administrators.Contains(role.Trim(), StringComparer.OrdinalIgnoreCase);

    /// <summary>Whether the signed-in principal holds any administrator role.</summary>
    public static bool IsAdministrator(this ClaimsPrincipal user) =>
        Administrators.Any(user.IsInRole);
}
