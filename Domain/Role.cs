using Microsoft.AspNetCore.Identity;

namespace Domain;

public class Role : IdentityRole
{
    public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
}