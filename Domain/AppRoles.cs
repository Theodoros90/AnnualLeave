namespace Domain;

public static class AppRoles
{
    public const string Employee = "Employee";
    public const string Manager = "Manager";
    public const string SystemAdministrator = "System Administrator";

    public static readonly string[] All = { SystemAdministrator, Manager, Employee };
}