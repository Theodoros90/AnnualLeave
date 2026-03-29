export type UserRole = 'Admin' | 'Author' | 'Viewer'

export interface UserInfo {
    id: string
    userName: string
    email: string
    displayName: string
    roles: UserRole[]
}
