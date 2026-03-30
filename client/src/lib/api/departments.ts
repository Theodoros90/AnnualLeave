import apiClient from './client'
import type { Department } from '../types'

export interface UpsertDepartmentRequest {
    name: string
    code: string
    isActive: boolean
}

export async function getDepartments() {
    const response = await apiClient.get<Department[]>('/departments')
    return response.data
}

export async function createDepartment(request: UpsertDepartmentRequest) {
    const response = await apiClient.post<Department>('/departments', request)
    return response.data
}

export async function updateDepartment(id: number, request: UpsertDepartmentRequest) {
    const response = await apiClient.put<Department>(`/departments/${id}`, request)
    return response.data
}

export async function deleteDepartment(id: number) {
    await apiClient.delete(`/departments/${id}`)
}