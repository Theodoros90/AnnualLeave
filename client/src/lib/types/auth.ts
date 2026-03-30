export interface LoginRequest {
    email: string
    password: string
    rememberMe: boolean
}

export interface RegisterRequest {
    email: string
    password: string
    displayName: string
}
