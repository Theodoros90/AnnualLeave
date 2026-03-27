namespace Application.Core;

public class Result<T>
{
    public bool IsSuccess { get; init; }
    public T? Value { get; init; }
    public string Error { get; init; } = string.Empty;
    public IDictionary<string, string[]>? ValidationErrors { get; init; }

    public static Result<T> Success(T value) => new()
    {
        IsSuccess = true,
        Value = value
    };

    public static Result<T> Failure(string error) => new()
    {
        IsSuccess = false,
        Error = error
    };

    public static Result<T> ValidationFailure(IDictionary<string, string[]> validationErrors, string error = "One or more validation errors occurred.") => new()
    {
        IsSuccess = false,
        Error = error,
        ValidationErrors = validationErrors
    };
}