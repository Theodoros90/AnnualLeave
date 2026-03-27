using System;
using MediatR;
using Persistence;

namespace Application.Annualleaves.Commands;

public class DeleteAnnualLeave
{
    public class Command : IRequest
    {
        public required string Id { get; set; }
    }
    public class Handler(AppDbContext context) : IRequestHandler<Command>
    {
        public async Task Handle(Command request, CancellationToken cancellationToken)
        {
            var annualLeave = await context.AnnualLeaves
             .FindAsync([request.Id], cancellationToken)
             ?? throw new Exception("Cannot find the annual leave");

            context.Remove(annualLeave);

            await context.SaveChangesAsync(cancellationToken);
        }
    }
}
