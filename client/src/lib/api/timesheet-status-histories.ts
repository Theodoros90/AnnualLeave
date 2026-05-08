import apiClient from './client'
import type { TimesheetStatusHistory } from '../types'

export async function getTimesheetStatusHistories() {
    const response = await apiClient.get<TimesheetStatusHistory[]>('/timesheetstatushistories')
    return response.data
}
