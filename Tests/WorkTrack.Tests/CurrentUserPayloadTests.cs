using System.Text.Json;
using API.DTOs;
using Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;

namespace WorkTrack.Tests;

/// <summary>
/// What <c>GET /api/account/user-info</c> tells the signed-in client about itself.
///
/// <see cref="User.Gender"/> earns a test here because the client now decides
/// whether to offer Maternity and Paternity Leave from it. Drop the field from the
/// payload and nothing fails: gender simply arrives undefined, which the client
/// reads as "not specified" and fails open — every employee is offered both types
/// again, quietly, with the server still refusing whichever one they pick.
///
/// The payload was an anonymous object, which no test could name. It is a DTO
/// built by <see cref="CurrentUserPayload"/> for that reason; the property names
/// are unchanged, so the wire shape is the one the client already reads.
/// </summary>
[Collection(ApiRouteTableCollection.Name)]
public class CurrentUserPayloadTests(ApiRouteTableFixture fixture)
{
    private JsonSerializerOptions Options => fixture.Services
        .GetRequiredService<IOptions<JsonOptions>>()
        .Value
        .JsonSerializerOptions;

    private static User AUser(Gender? gender) => new()
    {
        Id = "user-1",
        UserName = "andreas@example.com",
        Email = "andreas@example.com",
        DisplayName = "Andreas Georgiou",
        Gender = gender,
    };

    private JsonElement Render(Gender? gender, EmployeeProfile? profile = null)
    {
        var payload = CurrentUserPayload.From(AUser(gender), profile, ["Employee"]);
        return JsonSerializer.SerializeToElement(payload, Options);
    }

    [Theory]
    [InlineData(Gender.Male, "Male")]
    [InlineData(Gender.Female, "Female")]
    public void The_recorded_gender_reaches_the_client_as_a_name(Gender gender, string expected)
    {
        var json = Render(gender);

        Assert.Equal(expected, json.GetProperty("gender").GetString());
    }

    /// <summary>
    /// Null is a value the client acts on, not an absence: it means "not
    /// specified", and the leave picker offers both parental types on it.
    /// </summary>
    [Fact]
    public void An_unspecified_gender_is_carried_as_null()
    {
        var json = Render(gender: null);

        Assert.Equal(JsonValueKind.Null, json.GetProperty("gender").ValueKind);
    }

    /// <summary>
    /// The leave forms hide a type wanting more service than the employee has,
    /// measured from this date — so like <c>gender</c> it is a field the client
    /// decides with, and like <c>gender</c> dropping it fails open: the client reads
    /// undefined as "not recorded" and offers every type, with the server refusing
    /// whichever one is pressed.
    /// </summary>
    [Fact]
    public void The_employment_start_date_reaches_the_client_as_an_iso_date()
    {
        var profile = new EmployeeProfile
        {
            Id = "profile-1",
            UserId = "user-1",
            EmploymentStartDate = new DateOnly(2024, 3, 18),
        };

        var json = Render(Gender.Female, profile);

        Assert.Equal("2024-03-18", json.GetProperty("employmentStartDate").GetString());
    }

    /// <summary>
    /// The fields the client's <c>UserInfo</c> type declares. Named one by one so
    /// that extracting the anonymous object into a DTO cannot quietly drop one.
    /// </summary>
    [Fact]
    public void The_payload_still_carries_everything_the_client_reads()
    {
        var profile = new EmployeeProfile { Id = "profile-1", UserId = "user-1", HasChildren = true };

        var json = Render(Gender.Female, profile);

        foreach (var field in new[]
                 {
                     "id", "userName", "email", "displayName", "imageUrl", "phoneNumber",
                     "dateOfBirth", "gender", "departmentId", "departmentName", "hasChildren", "roles",
                     "employmentStartDate",
                 })
        {
            Assert.True(json.TryGetProperty(field, out _), $"user-info is missing '{field}'.");
        }

        Assert.True(json.GetProperty("hasChildren").GetBoolean());
        Assert.Equal("Employee", Assert.Single(json.GetProperty("roles").EnumerateArray()).GetString());
    }

    /// <summary>
    /// A System Administrator has no employee profile at all, so the department fields and the
    /// children declaration have to survive its absence rather than throw.
    /// </summary>
    [Fact]
    public void A_user_with_no_employee_profile_reports_nulls_rather_than_failing()
    {
        var json = Render(Gender.Male, profile: null);

        Assert.Equal(JsonValueKind.Null, json.GetProperty("departmentId").ValueKind);
        Assert.Equal(JsonValueKind.Null, json.GetProperty("departmentName").ValueKind);
        Assert.Equal(JsonValueKind.Null, json.GetProperty("hasChildren").ValueKind);
    }

    [Fact]
    public void The_department_ids_union_the_profile_department_and_the_assigned_rows()
    {
        var profile = new EmployeeProfile { Id = "p", UserId = "user-1", DepartmentId = 4 };
        var payload = CurrentUserPayload.From(AUser(Gender.Male), profile, ["Manager"], [4, 7]);
        Assert.Equal(new[] { 4, 7 }, payload.DepartmentIds);

        var hr = CurrentUserPayload.From(AUser(null), new EmployeeProfile { Id = "h", UserId = "user-1", DepartmentId = null }, ["HR Administrator"], [2, 3]);
        Assert.Equal(new[] { 2, 3 }, hr.DepartmentIds);

        var json = JsonSerializer.SerializeToElement(hr, Options);
        Assert.Equal(2, json.GetProperty("departmentIds").GetArrayLength());
    }
}
