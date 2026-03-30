export interface LeaveStatusHistory {
    id: string
    annualLeaveId: string
    changedByUserId: string
    oldStatus: string | null
    newStatus: string
    comment: string | null
    changedAt: string
}
