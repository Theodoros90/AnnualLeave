export interface LeaveStatusHistory {
    id: string
    annualLeaveId: string
    employeeId: string
    employeeName: string
    changedByUserId: string
    changedByUserName: string
    oldStatus: string | null
    newStatus: string
    comment: string | null
    changedAt: string
}
