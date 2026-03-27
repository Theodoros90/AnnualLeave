using System;
using Domain;
using MediatR;
using Persistence;


namespace Application.Annualleaves.Commands;

public class CreateAnnualLeave
{
    public class Command : IRequest<string>
    {
        public required AnnualLeave AnnualLeave { get; set; }
    }

    public class Handler(AppDbContext context) : IRequestHandler<Command, string>
    {
        public async Task<string> Handle(Command request, CancellationToken cancellationToken)
        {
            context.AnnualLeaves.Add(request.AnnualLeave);

            await context.SaveChangesAsync(cancellationToken);

            return request.AnnualLeave.Id;
        }
    }
}
