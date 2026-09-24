/**
 * The API stores DateTime.UtcNow but ASP.NET drops the offset on the wire when EF
 * reads the value back with Kind=Unspecified. Append 'Z' so the browser reads the
 * timestamp as UTC instead of local time.
 */
export function parseServerDate(value: string | null | undefined): Date | null {
    if (!value) return null
    const hasTz = /(Z|[+-]\d{2}:\d{2})$/.test(value)
    const date = new Date(hasTz ? value : `${value}Z`)
    return Number.isNaN(date.getTime()) ? null : date
}

/** "Sep 24, 2:30 PM" in the viewer's locale, or "Recently" for an unreadable value. */
export function formatServerDateTime(value: string | null | undefined): string {
    const date = parseServerDate(value)
    if (!date) return 'Recently'
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(date)
}
