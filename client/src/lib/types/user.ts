export type UserRole = 'Admin' | 'Manager' | 'Employee'

export interface UserInfo {
    id: string
    userName: string
    email: string
    displayName: string
    roles: UserRole[]
}
