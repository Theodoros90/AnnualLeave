import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserInfo } from '../../lib/types'
import Sidebar from './Sidebar'

/**
 * The children block on the sidebar's own Edit profile dialog exists for one
 * reason: `HasChildren` and the rows behind it are what decide whether Maternity
 * and Paternity Leave are offered to that person. A System Administrator is never offered
 * either — the role's navigation carries no "Request Leave" and no "My Leave" —
 * so the question asked them about their own family and then fed nothing.
 *
 * These tests fail if the block comes back for a System Administrator, or if hiding it ever
 * costs an employee theirs.
 */
vi.mock('../../lib/api')
vi.mock('../../lib/mobx')

const mobx = vi.mocked(await import('../../lib/mobx'))

const ADMIN: UserInfo = {
    id: 'u-admin',
    userName: 'admin@worktrack.com',
    email: 'admin@worktrack.com',
    displayName: 'Admin User',
    imageUrl: '',
    // Null, not false — a System Administrator has no department, which is what makes the
    // department field below the children block hidden for them too.
    departmentId: null,
    roles: ['System Administrator'],
}

const EMPLOYEE: UserInfo = {
    ...ADMIN,
    id: 'u-emp',
    userName: 'maria@worktrack.com',
    email: 'maria@worktrack.com',
    displayName: 'Maria Georgiou',
    departmentId: 2,
    departmentName: 'Finance',
    roles: ['Employee'],
}

beforeEach(() => {
    vi.clearAllMocks()
})

/** Renders the sidebar as `user` and opens the Edit profile dialog. */
function openEditProfile(user: UserInfo) {
    mobx.useStore.mockReturnValue({
        authStore: { user },
        uiStore: { sidebarMode: 'light' },
    } as never)

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
        <MemoryRouter initialEntries={['/dashboard']}>
            <QueryClientProvider client={queryClient}>
                <Sidebar />
            </QueryClientProvider>
        </MemoryRouter>,
    )

    fireEvent.click(screen.getByText(user.displayName))
    fireEvent.click(screen.getByText('Edit profile'))
}

describe('Edit profile asks about children only where the answer is used', () => {
    it('does not ask a System Administrator about their own children', () => {
        openEditProfile(ADMIN)

        expect(screen.getByRole('dialog')).toBeTruthy()
        expect(screen.queryByText('Do you have children?')).toBeNull()
    })

    it('still asks an employee', () => {
        openEditProfile(EMPLOYEE)

        expect(screen.getByText('Do you have children?')).toBeTruthy()
    })
})
