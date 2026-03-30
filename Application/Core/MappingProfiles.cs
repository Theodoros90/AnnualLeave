using System;
using Application.Annualleaves.DTOs;
using AutoMapper;
using Domain;

namespace Application.Core;

public class MappingProfiles : Profile
{
    public MappingProfiles()
    {
        CreateMap<AnnualLeave, AnnualLeave>();
        CreateMap<AnnualLeave, AnnualLeaveDto>()
            .ForMember(d => d.Status, opt => opt.MapFrom(s => s.Status.ToString()))
            .ForMember(d => d.EmployeeName, opt => opt.MapFrom(s => s.Employee != null ? s.Employee.DisplayName : string.Empty))
            .ForMember(d => d.DepartmentName, opt => opt.MapFrom(s => s.Department != null ? s.Department.Name : string.Empty));
        CreateMap<CreateAnnualLeaveRequest, AnnualLeave>()
            .ForMember(d => d.Status, opt => opt.MapFrom(s => AnnualLeaveStatus.Pending))
            .ForMember(d => d.CreatedAt, opt => opt.MapFrom(s => DateTime.UtcNow));
        CreateMap<EditAnnualLeaveRequest, AnnualLeave>();
    }
}
