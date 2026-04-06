export interface LoginRequest {
    email: string
    password: string
    rememberMe: boolean
}

export interface RegisterRequest {
    email: string
    password: string
    displayName: string
    departmentId: number
}

export interface ForgotPasswordRequest {
    email: string
}

export interface ResetPasswordRequest {
    email: string
    token: string
    newPassword: string
    confirmPassword: string
}

export interface UpdateProfileRequest {
    displayName: string
    email: string
    departmentId: number
}
