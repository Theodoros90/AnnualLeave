import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SystemError } from '../../lib/types'
import { shortExceptionType } from '../../lib/system-errors'
import SystemLogPanel from './SystemLogPanel'

/**
 * The System Log is where the System Administrator's bell points: the faults the
 * system hit, each as it was emailed, with the count of repeats and the correlation
 * id that finds the log lines.
 */
vi.mock('../../lib/api', () => ({ getSystemErrors: vi.fn() }))

const api = vi.mocked(await import('../../lib/api'))

const ERRORS: SystemError[] = [
    { id: 7, source: 'GET /api/timesheets', exceptionType: 'System.InvalidCastException', message: 'Specified cast is not valid.', correlationId: 'abc123', occurredAtUtc: '2026-09-22T08:00:00', lastOccurredAtUtc: '2026-09-24T08:00:00', occurrences: 3 },
    { id: 8, source: "reminder 'daily-attendance-report'", exceptionType: 'System.IO.IOException', message: 'smtp down', correlationId: null, occurredAtUtc: '2026-09-24T09:00:00', lastOccurredAtUtc: '2026-09-24T09:00:00', occurrences: 1 },
]

function renderPanel(hash = '') {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
        <MemoryRouter initialEntries={[`/admin/system-log${hash}`]}>
            <QueryClientProvider client={queryClient}>
                <SystemLogPanel />
            </QueryClientProvider>
        </MemoryRouter>,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

describe('System Log', () => {
    it('lists each error with its source, short exception name, repeat count and correlation id', async () => {
        api.getSystemErrors.mockResolvedValue(ERRORS)
        renderPanel()

        const rows = await screen.findAllByTestId('system-error-row')
        expect(rows).toHaveLength(2)

        const first = within(rows[0])
        expect(first.getByText('GET /api/timesheets')).toBeInTheDocument()
        expect(first.getByText('InvalidCastException')).toBeInTheDocument()
        expect(first.getByText('×3')).toBeInTheDocument()
        expect(first.getByText('abc123')).toBeInTheDocument()
        expect(first.getByText(/^First .* · Last /)).toBeInTheDocument()

        const second = within(rows[1])
        expect(second.getByText('IOException')).toBeInTheDocument()
        expect(second.queryByText(/×/)).not.toBeInTheDocument()
        // No request, no correlation id: shown as a dash, not "null".
        expect(second.getByText('—')).toBeInTheDocument()
    })

    it('gives each row the id the bell links to and scrolls to the one in the hash', async () => {
        api.getSystemErrors.mockResolvedValue(ERRORS)
        renderPanel('#system-error-8')

        const rows = await screen.findAllByTestId('system-error-row')
        expect(rows[0]).toHaveAttribute('id', 'system-error-7')
        expect(rows[1]).toHaveAttribute('id', 'system-error-8')
        expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
    })

    it('says so when nothing has gone wrong', async () => {
        api.getSystemErrors.mockResolvedValue([])
        renderPanel()

        expect(await screen.findByText('No errors recorded')).toBeInTheDocument()
    })
})

describe('shortExceptionType', () => {
    it('keeps the last segment of a dotted name and a bare name whole', () => {
        expect(shortExceptionType('System.IO.IOException')).toBe('IOException')
        expect(shortExceptionType('Boom')).toBe('Boom')
    })
})
