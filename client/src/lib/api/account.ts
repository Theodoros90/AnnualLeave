import apiClient from './client'
import type { ApiMessageResponse, LoginRequest, RegisterRequest, UserInfo } from '../types'

export async function login(request: LoginRequest) {
    const response = await apiClient.post<ApiMessageResponse>('/account/login', request)
    return response.data
}

export async function register(request: RegisterRequest) {
    const response = await apiClient.post<ApiMessageResponse>('/account/register', request)
    return response.data
}

export async function getCurrentUser() {
    const response = await apiClient.get<UserInfo>('/account/user-info')
    return response.data
}

export async function logout() {
    const response = await apiClient.post<ApiMessageResponse>('/account/logout')
    return response.data
}