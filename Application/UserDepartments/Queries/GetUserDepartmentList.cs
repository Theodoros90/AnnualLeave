using Application.UserDepartments.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.UserDepartments.Queries;

public class GetUserDepartmentList
{
    public class Query : IRequest<List<UserDepartmentDto>>
    {
    }

    public class Handler(AppDbContext context) : IRequestHandler<Query, List<UserDepartmentDto>>
    {
        public async Task<List<UserDepartmentDto>> Handle(Query request, CancellationToken cancellationToken)
        {
            return await context.UserDepartments
                .AsNoTracking()
                .OrderBy(ud => ud.UserId)
                .ThenBy(ud => ud.DepartmentId)
                .Select(ud => new UserDepartmentDto
                {
                    UserId = ud.UserId,
                    DepartmentId = ud.DepartmentId,
                    AssignedAt = ud.AssignedAt,
                    AssignedByUserId = ud.AssignedByUserId
                })
                .ToListAsync(cancellationToken);
        }
    }
}
