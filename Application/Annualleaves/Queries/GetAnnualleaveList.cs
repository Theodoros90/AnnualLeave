using System;
using System.Threading.Tasks;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Annualleaves.Queries;

public class GetAnnualleaveList
{
    public class Query : IRequest<List<AnnualLeave>>
    {

    }

    public class Handler(AppDbContext context) : IRequestHandler<Query, List<AnnualLeave>>
    {
        public async Task<List<AnnualLeave>> Handle(Query request, CancellationToken cancellationToken)
        {
            return await context.AnnualLeaves.ToListAsync(cancellationToken);
        }
    }
}
