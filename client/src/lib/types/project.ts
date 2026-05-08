import type { Department } from './department';

export interface Project {
    id: number;
    name: string;
    code: string;
    description?: string;
    isActive: boolean;
    departmentId?: number | null;
    department?: Department | null;
}

export interface UpsertProjectRequest {
    id?: number;
    name: string;
    code?: string;
    description?: string;
    isActive?: boolean;
    departmentId?: number | null;
}
