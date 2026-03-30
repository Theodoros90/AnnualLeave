using Application.Core;
using MediatR;
using Persistence;

namespace Application.Departments.Commands;

public class DeleteDepartment
{
    public class Command : IRequest<Result<Unit>>
    {
        public int Id { get; set; }
    }

    public class Handler(AppDbContext context) : IRequestHandler<Command, Result<Unit>>
    {
        public async Task<Result<Unit>> Handle(Command request, CancellationToken cancellationToken)
        {
            var department = await context.Departments.FindAsync([request.Id], cancellationToken);
            if (department is null)
                return Result<Unit>.Failure("Department not found.");

            var hasUsers = context.UserDepartments.Any(ud => ud.DepartmentId == request.Id)
                        || context.EmployeeProfiles.Any(ep => ep.DepartmentId == request.Id);

            if (hasUsers)
                return Result<Unit>.Failure("Cannot delete a department that has users or employee profiles assigned to it.");

            context.Departments.Remove(department);
            await context.SaveChangesAsync(cancellationToken);

            return Result<Unit>.Success(Unit.Value);
        }
    }
}
