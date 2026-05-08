import apiClient from './client';
import type { Project, UpsertProjectRequest } from '../types/project';

export async function getProjects(): Promise<Project[]> {
    const res = await apiClient.get('/projects');
    return res.data;
}

export async function createProject(data: UpsertProjectRequest): Promise<Project> {
    const res = await apiClient.post('/projects', data);
    return res.data;
}

export async function updateProject(data: UpsertProjectRequest): Promise<Project> {
    const res = await apiClient.put(`/projects/${data.id}`, data);
    return res.data;
}

export async function deleteProject(id: number): Promise<void> {
    await apiClient.delete(`/projects/${id}`);
}
