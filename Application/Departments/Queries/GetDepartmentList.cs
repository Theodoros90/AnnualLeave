using Application.Departments.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Persistence;

namespace Application.Departments.Queries;

public class GetDepartmentList
{
    public class Query : IRequest<List<DepartmentDto>>
    {
    }

    public class Handler(AppDbContext context) : IRequestHandler<Query, List<DepartmentDto>>
    {
        public async Task<List<DepartmentDto>> Handle(Query request, CancellationToken cancellationToken)
        {
            return await context.Departments
                .AsNoTracking()
                .OrderBy(d => d.Name)
                .Select(d => new DepartmentDto
                {
                    Id = d.Id,
                    Name = d.Name,
                    Code = d.Code,
                    IsActive = d.IsActive,
                    CreatedAt = d.CreatedAt
                })
                .ToListAsync(cancellationToken);
        }
    }
}
