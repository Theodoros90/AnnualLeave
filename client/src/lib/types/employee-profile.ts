export interface EmployeeProfile {
    id: string
    userId: string
    departmentId: number
    managerId: string | null
    annualLeaveEntitlement: number
    leaveBalance: number
    jobTitle: string | null
    createdAt: string
}

export interface EditEmployeeProfileRequest {
    id: string
    departmentId: number
    managerId: string | null
    annualLeaveEntitlement: number
    leaveBalance: number
    jobTitle: string | null
}