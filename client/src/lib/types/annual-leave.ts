import type { LeaveDurationValue } from '../half-day'

export type AnnualLeaveStatus =
    | 'Pending'
    | 'Approved'
    | 'Rejected'
    | 'Cancelled'

export interface AnnualLeaveBase {
    startDate: string
    endDate: string
    /**
     * Whole days, or half of one. Omitted reads as `'Full'` on the server, which is
     * what every client sent before half days were persisted at all.
     */
    duration?: LeaveDurationValue
    leaveTypeId: number
    reason: string
    evidenceUrl?: string | null
    /**
     * User id of the colleague nominated to cover while the employee is away.
     * Required for an Employee or a Manager (`CoverageRule` on the server,
     * `lib/coverage.ts` here); an Admin's own request may leave it out.
     */
    delegateId?: string | null
    /** A handover note for the delegate. Mailed to them alone; dropped by the server when no delegate is named. */
    coverageNote?: string | null
    /** A handover document for the delegate: the path `uploadCoverageHandover` returned. */
    coverageAttachmentUrl?: string | null
    childId?: string | null
}

export interface AnnualLeave {
    id: string
    employeeId: string
    startDate: string
    endDate: string
    leaveTypeId: number | null
    reason: string
    evidenceUrl: string | null
    delegateId: string | null
    delegateName: string
    /** Optional for an API predating the handover columns. */
    coverageNote?: string | null
    coverageAttachmentUrl?: string | null
    status: AnnualLeaveStatus
    createdAt: string
    approvedAt: string | null
    /** Days charged, so 0.5 for a half day — not always a whole number. */
    totalDays: number
    duration: LeaveDurationValue
    employeeName: string
    departmentName: string
    childId: string | null
    childName: string
}

export interface CreateAnnualLeaveRequest extends AnnualLeaveBase {
    employeeId: string
}

export interface EditAnnualLeaveRequest extends AnnualLeaveBase {
    id: string
    status?: AnnualLeaveStatus
    statusComment?: string
}
