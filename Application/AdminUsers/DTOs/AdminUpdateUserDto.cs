using System.ComponentModel.DataAnnotations;
using Domain;

namespace Application.AdminUsers.DTOs;

/// <summary>
/// A full replace, not a patch: <c>UpdateAdminUser</c> assigns every field
/// unconditionally, so a null here genuinely clears the stored value. Anything
/// added must follow that — the "null leaves the stored answer alone" rule used
/// by <c>HasChildrenDeclaration</c> would give a field that refuses to be cleared.
/// </summary>
public class AdminUpdateUserDto
{
    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    [StringLength(100, MinimumLength = 2)]
    public string DisplayName { get; set; } = string.Empty;

    [Phone]
    [StringLength(30)]
    public string? PhoneNumber { get; set; }

    public DateOnly? DateOfBirth { get; set; }

    /// <summary>
    /// Required for an Employee or a Manager and refused for a System Administrator —
    /// <c>UpdateAdminUserValidator</c> reads the stored role to decide which. So
    /// an account that predates the column has to be given one the next time it
    /// is saved, as with <see cref="DateOfBirth"/>, and a promotion to System Administrator sends
    /// a null that, this being a full replace, clears the stored answer. Nullable
    /// so the binder can report "missing" rather than defaulting a real person to
    /// <c>Male</c>, and so a System Administrator has something to send.
    /// </summary>
    public Gender? Gender { get; set; }
}