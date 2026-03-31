import apiClient from './client'
import type { LeaveType } from '../types'

export interface UpsertLeaveTypeRequest {
    name: string
    requiresApproval: boolean
    isActive: boolean
}

export async function getLeaveTypes() {
    const response = await apiClient.get<LeaveType[]>('/leavetypes')
    return response.data
}

export async function createLeaveType(request: UpsertLeaveTypeRequest) {
    const response = await apiClient.post<LeaveType>('/leavetypes', request)
    return response.data
}

export async function updateLeaveType(id: number, request: UpsertLeaveTypeRequest) {
    const response = await apiClient.put<LeaveType>(`/leavetypes/${id}`, request)
    return response.data
}

export async function deleteLeaveType(id: number) {
    await apiClient.delete(`/leavetypes/${id}`)
}