import axios from 'axios'

export const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL?.trim() || 'https://localhost:5001/api'

const apiClient = axios.create({
    baseURL: apiBaseUrl,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
})

export default apiClient