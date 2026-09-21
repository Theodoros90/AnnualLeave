using System.Text.RegularExpressions;
using FluentValidation;

namespace Application.Core;

/// <summary>
/// The rules for the identity fields an admin records about a person, in one
/// place because more than one validator asks for them —
/// <c>CreateAdminUserValidator</c>, <c>UpdateAdminUserValidator</c>, and the
/// employee's own profile update.
///
/// Each has a mirror on the client (<c>client/src/lib/validation/person.ts</c>),
/// which is what the dialogs show as you type. Keep the two in step: a
/// disagreement shows up as a field that saves in the browser and then 400s.
/// </summary>
public static partial class PersonFieldRules
{
    /// <summary>Matches <c>MaximumLength(30)</c>, which these rules keep.</summary>
    public const int PhoneNumberMaxLength = 30;

    public const string PhoneNumberMessage = "Phone number can only contain numbers.";

    /// <summary>
    /// Digits, plus the punctuation a written number carries: a leading <c>+</c>,
    /// spaces, dashes, and the parentheses around a dialling code. "+357 99 123456"
    /// is how people write a number, so "only numeric" cannot mean digits alone.
    /// What this refuses is letters, which is what was getting through.
    /// </summary>
    [GeneratedRegex(@"^[0-9+\s()-]*$")]
    private static partial Regex PhoneNumberPattern { get; }

    /// <summary>
    /// An optional phone number: blank is fine, letters are not. Trims before
    /// judging, as the handlers do before storing. The length cap stays a
    /// separate <c>MaximumLength</c> rule beside this one — it is a different
    /// complaint and deserves its own message.
    /// </summary>
    public static IRuleBuilderOptions<T, string?> ValidPhoneNumber<T>(this IRuleBuilder<T, string?> rule) =>
        rule.Must(value =>
            {
                var trimmed = value?.Trim();
                return string.IsNullOrEmpty(trimmed) || PhoneNumberPattern.IsMatch(trimmed);
            })
            .WithMessage(PhoneNumberMessage);

    /// <summary>The youngest anyone may be recorded as.</summary>
    public const int MinimumAgeYears = 16;

    public const string DateOfBirthRequiredMessage = "Date of birth is required.";
    public const string DateOfBirthFutureMessage = "Date of birth must be in the past.";
    public static readonly string DateOfBirthTooYoungMessage = $"Must be at least {MinimumAgeYears} years old.";

    /// <summary>
    /// The latest date of birth that is already old enough: the same day and
    /// month, <see cref="MinimumAgeYears"/> earlier. Someone born exactly then
    /// turns the minimum age today and is allowed.
    /// </summary>
    public static DateOnly LatestAllowedDateOfBirth(DateOnly asOf) => asOf.AddYears(-MinimumAgeYears);

    /// <summary>
    /// A required date of birth, at least <see cref="MinimumAgeYears"/> ago.
    /// The field was checked nowhere before, so the date picker's own default —
    /// today — saved as a new hire's date of birth, and an account could carry
    /// no date at all.
    ///
    /// Required means every account predating the field now has to be given one
    /// before it can be saved again. That is the backfill, and it is deliberate:
    /// birthday reminders and the age checks around parental leave both read a
    /// null as "not recorded" and quietly do nothing.
    ///
    /// The three messages are separate because they mean different things: an
    /// absent date is a gap, a future one a slip, an under-age one a refusal.
    /// All are reported against the same property, so the dialog shows whichever
    /// applies.
    /// </summary>
    public static IRuleBuilderOptions<T, DateOnly?> ValidDateOfBirth<T>(this IRuleBuilder<T, DateOnly?> rule) =>
        rule.Must(value =>
                value is not null
                && value.Value <= LatestAllowedDateOfBirth(DateOnly.FromDateTime(DateTime.UtcNow)))
            .WithMessage((_, value) =>
            {
                if (value is null) return DateOfBirthRequiredMessage;

                return value.Value > DateOnly.FromDateTime(DateTime.UtcNow)
                    ? DateOfBirthFutureMessage
                    : DateOfBirthTooYoungMessage;
            });

    public const string EmploymentStartDateRequiredMessage = "Employment start date is required.";

    public const string EmploymentStartDateNotForAdminMessage =
        "An Admin has no employment start date.";

    public static readonly string EmploymentStartDateTooYoungMessage =
        $"Employment start date must be on or after their {MinimumAgeYears}th birthday.";

    /// <summary>
    /// Whether <paramref name="startDate"/> is old enough for somebody born on
    /// <paramref name="dateOfBirth"/>. A start date before their sixteenth birthday
    /// is a typed year rather than a career, and <see cref="MinimumAgeYears"/> is
    /// already the youngest anyone may be recorded as.
    ///
    /// True when either date is missing: a profile predating the date-of-birth
    /// column has no age to disagree with, and refusing would strand it. The start
    /// date being absent is a separate complaint with its own message.
    ///
    /// The boundary belongs to the employee — starting on the day they turn sixteen
    /// is allowed, matching <see cref="LatestAllowedDateOfBirth"/>. A start date in
    /// the future is deliberately fine: an administrator keys a new hire in before
    /// their first day, unlike a date of birth, which cannot be ahead of us.
    /// </summary>
    public static bool IsOldEnoughToStart(DateOnly? startDate, DateOnly? dateOfBirth) =>
        startDate is not { } start
        || dateOfBirth is not { } born
        || start >= born.AddYears(MinimumAgeYears);
}
