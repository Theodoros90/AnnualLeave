using System;
using Domain;
using MediatR;
using Persistence;

namespace Application.Annualleaves.Queries;

public class GetAnnualLeaveDetails
{
    public class Query : IRequest<AnnualLeave>
    {
        public required string Id { get; set; }
    }
    public class Handler(AppDbContext context) : IRequestHandler<Query, AnnualLeave>
    {
        public async Task<AnnualLeave> Handle(Query request, CancellationToken cancellationToken)
        {
            var annualLeave = await context.AnnualLeaves.FindAsync(request.Id, cancellationToken);
            if (annualLeave == null) throw new Exception("Annual leave not found");
            return annualLeave;
        }
    }
}
