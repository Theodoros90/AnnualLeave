export type UserRole = 'System Administrator' | 'Manager' | 'Employee'

/**
 * Recorded HR data an admin maintains. A string union rather than a number
 * because the API serialises enums by name (`JsonStringEnumConverter`), same as
 * `AttachmentPolicy`. Required on both admin dialogs and refused as null by the
 * API — see `genderError` in `lib/validation/person.ts`. A stored null can
 * still be *read*: it is the state of every account created before the field
 * existed, and both the leave picker and the server treat it as "offer both
 * parental types" rather than neither, until the account is next saved. See
 * `lib/parental-leave.ts`.
 */
export type Gender = 'Male' | 'Female'

export interface UserInfo {
    id: string
    userName: string
    email: string
    displayName: string
    imageUrl: string
    phoneNumber?: string | null
    dateOfBirth?: string | null // ISO date "yyyy-MM-dd"
    /**
     * Decides whether Maternity and Paternity Leave are offered on the leave
     * forms. Optional only for an account created before the field existed and
     * not saved since — such a null is offered both, subject to the
     * eligible-child half of the rule.
     */
    gender?: Gender | null
    departmentId?: number | null
    departmentName?: string | null
    roles: UserRole[]
    hasChildren?: boolean | null
    /**
     * When the employee started, ISO date "yyyy-MM-dd". Decides whether a leave
     * type wanting a minimum length of service is offered on the leave forms
     * (`minServiceError` in `lib/leave-limits.ts`). Null for a System Administrator, who has no
     * employee profile, and for an account predating the field — either reads as
     * "not recorded" and passes, as it does on the server.
     */
    employmentStartDate?: string | null
}
