using Application.Core;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;
using Application.EmployeeProfiles.DTOs;

namespace Application.EmployeeProfiles.Commands;

public class EditEmployeeProfile
{
    public class Command : IRequest<Result<Unit>>
    {
        public required EditEmployeeProfileRequest EmployeeProfile { get; set; }
    }

    public class Handler(AppDbContext context) : IRequestHandler<Command, Result<Unit>>
    {
        public async Task<Result<Unit>> Handle(Command request, CancellationToken cancellationToken)
        {
            var employeeProfile = await context.EmployeeProfiles
                .FirstOrDefaultAsync(ep => ep.Id == request.EmployeeProfile.Id, cancellationToken);

            if (employeeProfile is null)
                return Result<Unit>.Failure("Cannot find employee profile.");

            employeeProfile.DepartmentId = request.EmployeeProfile.DepartmentId;
            employeeProfile.ManagerId = request.EmployeeProfile.ManagerId;
            employeeProfile.JobTitle = request.EmployeeProfile.JobTitle;
            // Assigned unconditionally, like every field above it: the dialog shows
            // the start date, so a null arriving here is a promotion to Admin
            // clearing it rather than a client that forgot to send it.
            employeeProfile.EmploymentStartDate = request.EmployeeProfile.EmploymentStartDate;

            await context.SaveChangesAsync(cancellationToken);

            return Result<Unit>.Success(Unit.Value);
        }
    }
}