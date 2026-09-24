import apiClient from './client'
import type { SystemError } from '../types'

// The faults the system hit, newest first — what a System Administrator's bell
// lists and the System Log page shows. System Administrator only on the server.
// Zero-arg so it stays safe to pass directly as a React Query queryFn.
export async function getSystemErrors() {
    const response = await apiClient.get<SystemError[]>('/systemerrors')
    return response.data
}
