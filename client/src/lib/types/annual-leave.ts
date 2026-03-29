export type AnnualLeaveStatus =
    | 'Pending'
    | 'Approved'
    | 'Rejected'
    | 'Cancelled'

export interface AnnualLeaveBase {
    startDate: string
    endDate: string
    reason: string
}

export interface AnnualLeave extends AnnualLeaveBase {
    id: string
    employeeId: string
    status: AnnualLeaveStatus
    createdAt: string
    approvedAt: string | null
    totalDays: number
}

export interface CreateAnnualLeaveRequest extends AnnualLeaveBase {
    employeeId: string
}

export interface EditAnnualLeaveRequest extends AnnualLeaveBase {
    id: string
}
