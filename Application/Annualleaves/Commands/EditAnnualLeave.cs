using System;
using Application.Annualleaves.DTOs;
using AutoMapper;
using Domain;
using MediatR;
using Persistence;

namespace Application.Annualleaves.Commands;

public class EditAnnualLeave
{
    public class Command : IRequest
    {
        public required EditAnnualLeaveRequest AnnualLeave { get; set; }
    }
    public class Handler(AppDbContext context, IMapper mapper) : IRequestHandler<Command>
    {
        public async Task Handle(Command request, CancellationToken cancellationToken)
        {
            var annualLeave = await context.AnnualLeaves
            .FindAsync([request.AnnualLeave.Id], cancellationToken)
            ?? throw new Exception("Cannot find the annual leave");
            mapper.Map(request.AnnualLeave, annualLeave);
            await context.SaveChangesAsync(cancellationToken);


        }
    }
}
