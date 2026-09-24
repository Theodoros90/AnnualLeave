import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { getSystemErrors } from '../../lib/api'
import { formatServerDateTime } from '../../lib/server-date'
import { shortExceptionType, systemErrorHashPrefix, systemErrorRowId } from '../../lib/system-errors'
import { softBg } from '../../lib/theme-tokens'
import type { SystemError } from '../../lib/types'

/**
 * The faults the system hit — an unhandled 500 in a request, or a reminder whose
 * dispatch threw. Each row is what the System Administrators were emailed about
 * (`SystemErrorNotifier`), stored so the bell can list it and this page can keep it.
 *
 * Two things about it that are deliberate:
 *
 * - **Newest by last occurrence, not first.** A bug that started three days ago and is
 *   still being hit is the one to look at, so it stays at the top with its count.
 * - **The correlation id is the handle, not the stack trace.** The email quotes the
 *   first frames; the log has everything. The id is what finds those lines, so it is
 *   rendered in monospace to be copied, and nothing longer is kept in the database.
 */
export default function SystemLogPanel() {
    const location = useLocation()
    const highlightedId = location.hash.startsWith(systemErrorHashPrefix) ? location.hash.slice(systemErrorHashPrefix.length) : null

    const { data: errors, isLoading, isError } = useQuery({
        queryKey: ['systemErrors'],
        queryFn: getSystemErrors,
    })

    // The bell navigates here with the row's hash; scroll to it once the rows exist.
    useEffect(() => {
        if (!highlightedId || !errors) return
        document.getElementById(systemErrorRowId(Number(highlightedId)))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, [highlightedId, errors])

    return (
        <Stack spacing={2}>
            <Box>
                <Typography sx={{ fontSize: 22, fontWeight: 700, color: 'text.primary' }}>🐞 System Log</Typography>
                <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
                    Errors the system could not recover from. Each was emailed to every System Administrator when it happened; the same error in the same place is counted, not repeated.
                </Typography>
            </Box>

            {isLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.secondary', fontSize: 13 }}>
                    <CircularProgress size={16} /> Loading the log...
                </Box>
            )}

            {isError && (
                <Typography sx={{ fontSize: 13, color: 'error.main' }}>Could not load the system log.</Typography>
            )}

            {!isLoading && !isError && errors && errors.length === 0 && (
                <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '10px', p: 3, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary' }}>No errors recorded</Typography>
                    <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>
                        When a request ends in an unhandled error or a scheduled reminder fails, it is listed here.
                    </Typography>
                </Box>
            )}

            {errors?.map((error) => (
                <SystemErrorRow key={error.id} error={error} highlighted={String(error.id) === highlightedId} />
            ))}
        </Stack>
    )
}

function SystemErrorRow({ error, highlighted }: { error: SystemError; highlighted: boolean }) {
    const repeated = error.occurrences > 1
    return (
        <Box
            id={systemErrorRowId(error.id)}
            data-testid="system-error-row"
            sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: highlighted ? 'error.main' : 'divider',
                boxShadow: highlighted ? (theme) => `0 0 0 3px ${theme.palette.error.light}` : 'none',
                borderRadius: '10px',
                overflow: 'hidden',
            }}
        >
            <Box sx={{ px: 2.25, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: softBg('error'), display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'error.dark' }}>{error.source}</Typography>
                <Chip size="small" label={shortExceptionType(error.exceptionType)} sx={{ fontSize: 11, height: 22 }} />
                {repeated && (
                    <Chip size="small" color="error" label={`×${error.occurrences}`} title={`Seen ${error.occurrences} times`} sx={{ fontSize: 11, height: 22, fontWeight: 700 }} />
                )}
                <Typography sx={{ fontSize: 12, color: 'text.secondary', ml: 'auto' }}>
                    {repeated
                        ? `First ${formatServerDateTime(error.occurredAtUtc)} · Last ${formatServerDateTime(error.lastOccurredAtUtc)}`
                        : formatServerDateTime(error.occurredAtUtc)}
                </Typography>
            </Box>
            <Box sx={{ p: 2.25 }}>
                <Typography sx={{ fontSize: 13, color: 'text.primary', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error.message}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1 }}>
                    Correlation ID:{' '}
                    <Box component="code" sx={{ fontFamily: 'monospace', fontSize: 12, bgcolor: 'action.hover', px: 0.75, py: 0.25, borderRadius: 1 }}>
                        {error.correlationId ?? '—'}
                    </Box>
                    {' '}· finds the lines in the server log
                </Typography>
            </Box>
        </Box>
    )
}
