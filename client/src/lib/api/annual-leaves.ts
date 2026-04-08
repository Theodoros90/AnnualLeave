import apiClient from './client'
import type { AnnualLeave, CreateAnnualLeaveRequest, EditAnnualLeaveRequest } from '../types'

export async function getAnnualLeaves() {
    const response = await apiClient.get<AnnualLeave[]>('/annualleaves')
    return response.data
}

export async function getTeamAwayThisWeekCount() {
    const response = await apiClient.get<number>('/annualleaves/team-away-this-week/count')
    return response.data
}

export async function getAnnualLeaveDetails(id: string) {
    const response = await apiClient.get<AnnualLeave>(`/annualleaves/${id}`)
    return response.data
}

export async function uploadLeaveEvidence(file: File) {
    const formData = new FormData()
    formData.append('file', file)

    const response = await apiClient.post<{ evidenceUrl: string; fileName: string }>(
        '/annualleaves/evidence-upload',
        formData,
        {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        }
    )

    return response.data
}

export async function createAnnualLeave(request: CreateAnnualLeaveRequest) {
    const response = await apiClient.post<string>('/annualleaves', request)
    return response.data
}

export async function editAnnualLeave(request: EditAnnualLeaveRequest) {
    await apiClient.put('/annualleaves', request)
}

export async function deleteAnnualLeave(id: string) {
    await apiClient.delete(`/annualleaves/${id}`)
}

export async function updateLeaveStatus(
    id: string,
    status: 'Approved' | 'Rejected' | 'Cancelled',
    statusComment?: string
) {
    await apiClient.patch(`/annualleaves/${id}/status`, { status, statusComment })
}
