import apiClient from './client'
import type { LeaveStatusHistory } from '../types'

export async function getLeaveStatusHistories() {
    const response = await apiClient.get<LeaveStatusHistory[]>('/leavestatushistories')
    return response.data
}
