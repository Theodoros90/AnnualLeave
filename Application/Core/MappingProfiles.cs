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
            .ForMember(d => d.Status, opt => opt.MapFrom(s => s.Status.ToString()));
        CreateMap<CreateAnnualLeaveRequest, AnnualLeave>()
            .ForMember(d => d.Status, opt => opt.MapFrom(s => AnnualLeaveStatus.Pending))
            .ForMember(d => d.CreatedAt, opt => opt.MapFrom(s => DateTime.UtcNow));
        CreateMap<EditAnnualLeaveRequest, AnnualLeave>();
    }
}
