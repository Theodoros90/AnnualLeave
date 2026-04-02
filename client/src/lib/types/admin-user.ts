import type { UserRole } from './user'

export interface AdminUser {
    id: string
    userName: string
    email: string
    displayName: string
    imageUrl: string
    roles: UserRole[]
}

export interface AdminCreateUserRequest {
    email: string
    displayName: string
    password: string
    roles: UserRole[]
}

export interface AdminUpdateUserRequest {
    email: string
    displayName: string
}

export interface AdminSetUserRolesRequest {
    roles: UserRole[]
}