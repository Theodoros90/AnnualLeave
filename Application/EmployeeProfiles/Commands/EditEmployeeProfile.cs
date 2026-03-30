using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;
using Application.EmployeeProfiles.DTOs;

namespace Application.EmployeeProfiles.Commands;

public class EditEmployeeProfile
{
    public class Command : IRequest
    {
        public required EditEmployeeProfileRequest EmployeeProfile { get; set; }
    }

    public class Handler(AppDbContext context) : IRequestHandler<Command>
    {
        public async Task Handle(Command request, CancellationToken cancellationToken)
        {
            var employeeProfile = await context.EmployeeProfiles
                .FirstOrDefaultAsync(ep => ep.Id == request.EmployeeProfile.Id, cancellationToken)
                ?? throw new Exception("Cannot find employee profile");

            employeeProfile.DepartmentId = request.EmployeeProfile.DepartmentId;
            employeeProfile.ManagerId = request.EmployeeProfile.ManagerId;
            employeeProfile.AnnualLeaveEntitlement = request.EmployeeProfile.AnnualLeaveEntitlement;
            employeeProfile.LeaveBalance = request.EmployeeProfile.LeaveBalance;
            employeeProfile.JobTitle = request.EmployeeProfile.JobTitle;

            await context.SaveChangesAsync(cancellationToken);
        }
    }
}