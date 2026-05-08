import type { Project } from './project';

export interface TimesheetEntry {
    id: string;
    timesheetId: string;
    projectId: number;
    project?: Project;
    date: string;
    hoursWorked: number;
    notes?: string | null;
}
