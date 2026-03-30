using System;
using Application.Annualleaves.DTOs;
using AutoMapper;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;


namespace Application.Annualleaves.Commands;

public class CreateAnnualLeave
{
    public class Command : IRequest<string>
    {
        public required CreateAnnualLeaveRequest AnnualLeave { get; set; }
    }

    public class Handler(AppDbContext context, IMapper mapper) : IRequestHandler<Command, string>
    {
        public async Task<string> Handle(Command request, CancellationToken cancellationToken)
        {
            var annualLeave = mapper.Map<AnnualLeave>(request.AnnualLeave);

            var employeeProfile = await context.EmployeeProfiles
                .Where(ep => ep.UserId == request.AnnualLeave.EmployeeId)
                .Select(ep => new { ep.Id, ep.DepartmentId })
                .FirstOrDefaultAsync(cancellationToken);

            if (employeeProfile is null)
                throw new InvalidOperationException("Employee profile not found for the selected user.");

            annualLeave.EmployeeProfileId = employeeProfile.Id;
            annualLeave.DepartmentId = employeeProfile.DepartmentId;

            context.AnnualLeaves.Add(annualLeave);

            await context.SaveChangesAsync(cancellationToken);

            return annualLeave.Id;
        }
    }
}
