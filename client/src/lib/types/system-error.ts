/** One fault the API could not recover from — the stored twin of the system-error email. */
export interface SystemError {
    id: number
    /** Where it happened: `GET /api/timesheets`, `reminder 'daily-attendance-report'`. */
    source: string
    /** The exception's full type name. */
    exceptionType: string
    message: string
    /** The request's correlation id, which finds the log lines. Null outside a request. */
    correlationId: string | null
    /** First seen (ISO, UTC). */
    occurredAtUtc: string
    /** Last seen; equals occurredAtUtc until a repeat. */
    lastOccurredAtUtc: string
    /** How many times this row was hit, including the first. */
    occurrences: number
}
