using Application.SystemErrors.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.SystemErrors.Queries;

/// <summary>
/// The most recent faults, for the System Administrator's notification bell.
/// Newest by <see cref="Domain.SystemError.LastOccurredAtUtc"/>, so a bug that
/// started days ago but is still being hit stays at the top.
/// </summary>
public class GetSystemErrorList
{
    public const int DefaultTake = 20;
    public const int MaxTake = 100;

    public class Query : IRequest<List<SystemErrorDto>>
    {
        public int Take { get; set; } = DefaultTake;
    }

    public class Handler(AppDbContext context) : IRequestHandler<Query, List<SystemErrorDto>>
    {
        public async Task<List<SystemErrorDto>> Handle(Query request, CancellationToken cancellationToken)
        {
            var take = Math.Clamp(request.Take, 1, MaxTake);
            return await context.SystemErrors
                .AsNoTracking()
                .OrderByDescending(e => e.LastOccurredAtUtc)
                .ThenByDescending(e => e.Id)
                .Take(take)
                .Select(e => new SystemErrorDto
                {
                    Id = e.Id,
                    Source = e.Source,
                    ExceptionType = e.ExceptionType,
                    Message = e.Message,
                    CorrelationId = e.CorrelationId,
                    OccurredAtUtc = e.OccurredAtUtc,
                    LastOccurredAtUtc = e.LastOccurredAtUtc,
                    Occurrences = e.Occurrences
                })
                .ToListAsync(cancellationToken);
        }
    }
}
