import apiClient from './client';
import type { TimesheetEntry } from '../types/timesheet-entry';

export async function createTimesheetEntry(timesheetId: string, entry: Omit<TimesheetEntry, 'id'>) {
  const response = await apiClient.post<TimesheetEntry>(`/timesheets/${timesheetId}/entries`, entry);
  return response.data;
}

export async function updateTimesheetEntry(timesheetId: string, entryId: string, entry: TimesheetEntry) {
  const response = await apiClient.put(`/timesheets/${timesheetId}/entries/${entryId}`, entry);
  return response.data;
}

export async function deleteTimesheetEntry(timesheetId: string, entryId: string) {
  const response = await apiClient.delete(`/timesheets/${timesheetId}/entries/${entryId}`);
  return response.data;
}
