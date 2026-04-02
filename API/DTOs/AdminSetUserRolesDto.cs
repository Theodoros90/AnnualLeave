using System.ComponentModel.DataAnnotations;

namespace API.DTOs;

public class AdminSetUserRolesDto
{
    [MinLength(1)]
    public List<string> Roles { get; set; } = new();
}