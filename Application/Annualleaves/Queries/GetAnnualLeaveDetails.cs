using System;
using Application.Core;
using Application.Annualleaves.DTOs;
using AutoMapper;
using MediatR;
using Persistence;

namespace Application.Annualleaves.Queries;

public class GetAnnualLeaveDetails
{
    public class Query : IRequest<Result<AnnualLeaveDto>>
    {
        public required string Id { get; set; }
    }
    public class Handler(AppDbContext context, IMapper mapper) : IRequestHandler<Query, Result<AnnualLeaveDto>>
    {
        public async Task<Result<AnnualLeaveDto>> Handle(Query request, CancellationToken cancellationToken)
        {
            var annualLeave = await context.AnnualLeaves.FindAsync([request.Id], cancellationToken);
            if (annualLeave == null) return Result<AnnualLeaveDto>.Failure("Annual leave not found");

            var annualLeaveDto = mapper.Map<AnnualLeaveDto>(annualLeave);
            return Result<AnnualLeaveDto>.Success(annualLeaveDto);
        }
    }
}
