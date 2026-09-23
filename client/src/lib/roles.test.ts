import { describe, expect, it } from 'vitest'
import { ADMINISTRATOR_ROLES, SYSTEM_ADMINISTRATOR_ROLES, isAdministrator, isAdministratorRole, isSystemAdministrator } from './roles'

/**
 * Mirror of `AppRoles.Administrators`: HR Administrator is a copy of System
 * Administrator, and every client gate reads both through these helpers.
 */
describe('isAdministratorRole', () => {
    it('recognises both administrator roles', () => {
        expect(isAdministratorRole('System Administrator')).toBe(true)
        expect(isAdministratorRole('HR Administrator')).toBe(true)
    })

    it('does not recognise Manager, Employee, or nothing', () => {
        expect(isAdministratorRole('Manager')).toBe(false)
        expect(isAdministratorRole('Employee')).toBe(false)
        expect(isAdministratorRole(null)).toBe(false)
        expect(isAdministratorRole(undefined)).toBe(false)
    })

    it('lists exactly the two', () => {
        expect([...ADMINISTRATOR_ROLES]).toEqual(['System Administrator', 'HR Administrator'])
    })
})

describe('isAdministrator', () => {
    it('is true when any held role is an administrator role', () => {
        expect(isAdministrator(['HR Administrator'])).toBe(true)
        expect(isAdministrator(['System Administrator'])).toBe(true)
        expect(isAdministrator(['Employee', 'HR Administrator'])).toBe(true)
    })

    it('is false for a Manager, an Employee, an empty list, or no roles at all', () => {
        expect(isAdministrator(['Manager'])).toBe(false)
        expect(isAdministrator(['Employee'])).toBe(false)
        expect(isAdministrator([])).toBe(false)
        expect(isAdministrator(null)).toBe(false)
        expect(isAdministrator(undefined)).toBe(false)
    })
})

describe('isSystemAdministrator', () => {
    it('is true for a System Administrator only', () => {
        expect(isSystemAdministrator(['System Administrator'])).toBe(true)
        expect(isSystemAdministrator(['Employee', 'System Administrator'])).toBe(true)
    })

    it('is false for an HR Administrator — the reach without the configuration', () => {
        expect(isSystemAdministrator(['HR Administrator'])).toBe(false)
        expect(isAdministrator(['HR Administrator'])).toBe(true)
    })

    it('is false for a Manager, an Employee, an empty list, or no roles at all', () => {
        expect(isSystemAdministrator(['Manager'])).toBe(false)
        expect(isSystemAdministrator(['Employee'])).toBe(false)
        expect(isSystemAdministrator([])).toBe(false)
        expect(isSystemAdministrator(null)).toBe(false)
        expect(isSystemAdministrator(undefined)).toBe(false)
    })

    it('lists System Administrator alone', () => {
        expect([...SYSTEM_ADMINISTRATOR_ROLES]).toEqual(['System Administrator'])
    })
})
