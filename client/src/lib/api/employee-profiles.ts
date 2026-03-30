import apiClient from './client'
import type { EditEmployeeProfileRequest, EmployeeProfile } from '../types'

export async function getEmployeeProfiles() {
    const response = await apiClient.get<EmployeeProfile[]>('/employeeprofiles')
    return response.data
}

export async function updateEmployeeProfile(request: EditEmployeeProfileRequest) {
    await apiClient.put('/employeeprofiles', request)
}