export interface EmployeeProfile {
    id: string
    userId: string
    displayName: string
    /**
     * Null for an Admin, who sits outside the department structure. Anything
     * grouping profiles by department has to skip these rather than treat the
     * absence as a department of its own.
     */
    departmentId: number | null
    managerId: string | null
    annualLeaveEntitlement: number
    /**
     * What this employee may take in the current leave year. The stored
     * `annualLeaveEntitlement` except for somebody who joined during this leave
     * year while the balance type pro-rates the first year, when it is the scaled
     * figure. Computed by the server on every read, never stored, so next year
     * reads whole on its own. The employee pages quote this through
     * `currentYearEntitlement()` in `lib/leave-allowance.ts`; the carryover preview
     * keeps the stored one, next year being a full year. Optional because an API
     * built before the field sends none, which has to read as the stored figure.
     */
    currentYearEntitlement?: number
    leaveBalance: number
    jobTitle: string | null
    /**
     * The day this person started working here, `yyyy-MM-dd`. Null for an Admin,
     * who is never asked, and for any profile predating the column — nothing
     * backfills it, so an older record is given one the next time it is saved.
     *
     * Not `createdAt`, which is when the row was written.
     */
    employmentStartDate: string | null
    createdAt: string
}

/** Colleague card returned by /employeeprofiles/teammates — no balance data. */
export interface Teammate {
    userId: string
    displayName: string
    jobTitle: string | null
    departmentId: number | null
}

/**
 * Deliberately carries no leave numbers. `annualLeaveEntitlement` and `leaveBalance`
 * are not edited per person any more — the allowance on Leave Types governs everyone,
 * and the server writes both columns from it (see UpdateLeaveType and CreateAdminUser).
 * Sending them from here is what let a dialog echo a stale figure back and override
 * the allowance for one employee.
 */
export interface EditEmployeeProfileRequest {
    id: string
    /** Null only for an Admin; required for every other role. */
    departmentId: number | null
    managerId: string | null
    jobTitle: string | null
    /**
     * Null only for an Admin, same as `departmentId` — and, unlike the leave
     * numbers above, this one does belong on the request: the dialog shows it, so
     * a full replace that omitted it would clear a start date already on file.
     */
    employmentStartDate: string | null
}