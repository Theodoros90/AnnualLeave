import type { TimesheetStatusHistory } from './timesheet-status-history';

export type TimesheetStatus =
  | 'Draft'
  | 'Submitted'
  | 'Approved'
  | 'Rejected'
  | 'Resubmitted';

export interface Timesheet {
  id: string;
  employeeId: string;
  employeeName: string; // Added for display
  departmentId: number;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  status: TimesheetStatus;
  approverId?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  entries?: any[];
  statusHistory?: TimesheetStatusHistory[];
}
