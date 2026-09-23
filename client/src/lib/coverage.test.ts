import { describe, expect, it } from 'vitest'
import { COVERAGE_REQUIRED_MESSAGE, coverageError, isCoverageRequired } from './coverage'

/**
 * Mirror of `CoverageRule.cs`: coverage is mandatory for an Employee and a
 * Manager, and an administrator's own leave — System or HR — is exempt.
 */
describe('isCoverageRequired', () => {
    it('is required for an Employee', () => {
        expect(isCoverageRequired(['Employee'])).toBe(true)
    })

    it('is required for a Manager', () => {
        expect(isCoverageRequired(['Manager'])).toBe(true)
    })

    it('is not required for a System Administrator', () => {
        expect(isCoverageRequired(['System Administrator'])).toBe(false)
    })

    it('is not required for an HR Administrator, a copy of System Administrator', () => {
        expect(isCoverageRequired(['HR Administrator'])).toBe(false)
    })

    it('reads unknown roles as not required, so the mirror never over-refuses', () => {
        expect(isCoverageRequired(undefined)).toBe(false)
        expect(isCoverageRequired(null)).toBe(false)
    })
})

describe('coverageError', () => {
    it('refuses an employee naming nobody, and treats whitespace as nobody', () => {
        expect(coverageError(['Employee'], null)).toBe(COVERAGE_REQUIRED_MESSAGE)
        expect(coverageError(['Employee'], '')).toBe(COVERAGE_REQUIRED_MESSAGE)
        expect(coverageError(['Employee'], '   ')).toBe(COVERAGE_REQUIRED_MESSAGE)
    })

    it('passes an employee naming somebody', () => {
        expect(coverageError(['Employee'], 'u-2')).toBeNull()
    })

    it('passes an admin naming nobody', () => {
        expect(coverageError(['System Administrator'], null)).toBeNull()
        expect(coverageError(['HR Administrator'], null)).toBeNull()
    })
})
