import apiClient from './client'
import type { LeaveType } from '../types'

export async function getLeaveTypes() {
    const response = await apiClient.get<LeaveType[]>('/leavetypes')
    return response.data
}