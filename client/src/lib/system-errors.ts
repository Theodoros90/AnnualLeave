/**
 * Shared between the System Administrator's bell (Topbar) and the System Log page:
 * the bell links to a row by this id, and both name the exception the short way.
 */

/** The DOM id of one System Log row, which the bell's link scrolls to and highlights. */
export const systemErrorRowId = (id: number) => `system-error-${id}`

/** The hash the bell navigates with; the page reads the id back out of it. */
export const systemErrorHashPrefix = '#system-error-'

/** The exception's short name: `System.InvalidCastException` → `InvalidCastException`. */
export function shortExceptionType(fullName: string): string {
    const lastDot = fullName.lastIndexOf('.')
    return lastDot >= 0 ? fullName.slice(lastDot + 1) : fullName
}
