namespace Domain;

public static class AppRoles
{
    public const string Employee = "Employee";
    public const string Manager = "Manager";
    public const string Admin = "Admin";

    public static readonly string[] All = { Admin, Manager, Employee };
}