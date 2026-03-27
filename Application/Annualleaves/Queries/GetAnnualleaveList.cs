using System;
using System.Threading.Tasks;
using Application.Annualleaves.DTOs;
using AutoMapper;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Annualleaves.Queries;

public class GetAnnualleaveList
{
    public class Query : IRequest<List<AnnualLeaveDto>>
    {

    }

    public class Handler(AppDbContext context, IMapper mapper) : IRequestHandler<Query, List<AnnualLeaveDto>>
    {
        public async Task<List<AnnualLeaveDto>> Handle(Query request, CancellationToken cancellationToken)
        {
            var annualLeaves = await context.AnnualLeaves.ToListAsync(cancellationToken);
            return mapper.Map<List<AnnualLeaveDto>>(annualLeaves);
        }
    }
}
