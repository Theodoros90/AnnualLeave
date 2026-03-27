using System;
using AutoMapper;
using Domain;
using MediatR;
using Persistence;

namespace Application.Annualleaves.Commands;

public class EditAnnualLeave
{
    public class Command : IRequest
    {
        public required AnnualLeave AnnualLeave { get; set; }
    }
    public class Handler(AppDbContext context, IMapper mapper) : IRequestHandler<Command>
    {
        public async Task Handle(Command request, CancellationToken cancellationToken)
        {
            var customer = await context.AnnualLeaves
            .FindAsync([request.AnnualLeave.Id], cancellationToken)
            ?? throw new Exception("Cannot find the annual leave");
            mapper.Map(request.AnnualLeave, customer);
            await context.SaveChangesAsync(cancellationToken);


        }
    }
}
