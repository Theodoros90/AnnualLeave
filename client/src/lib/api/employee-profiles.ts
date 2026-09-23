import apiClient from './client'
import type { EditEmployeeProfileRequest, EmployeeProfile, Teammate } from '../types'

export async function getEmployeeProfiles() {
    const response = await apiClient.get<EmployeeProfile[]>('/employeeprofiles')
    return response.data
}

// Colleagues in the caller's own department. Unlike getEmployeeProfiles this is
// readable by plain employees, so pickers can offer real people to choose from.
// `forUserId` asks for somebody else's colleagues instead — for an admin filing
// leave on that person's behalf. The server honours it for a System Administrator only.
export async function getTeammates(forUserId?: string) {
    const response = await apiClient.get<Teammate[]>('/employeeprofiles/teammates', {
        params: forUserId ? { forUserId } : undefined,
    })
    return response.data
}

export async function updateEmployeeProfile(request: EditEmployeeProfileRequest) {
    await apiClient.put('/employeeprofiles', request)
}