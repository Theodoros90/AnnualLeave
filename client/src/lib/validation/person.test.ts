import { describe, expect, it } from 'vitest'
import {
    MINIMUM_AGE_YEARS,
    PHONE_MAX_LENGTH,
    dateOfBirthError,
    employmentStartDateError,
    emailError,
    phoneNumberError,
} from './person'

describe('phoneNumberError', () => {
    it('accepts a blank number, because the field is optional', () => {
        expect(phoneNumberError('')).toBeUndefined()
        expect(phoneNumberError('   ')).toBeUndefined()
    })

    it('accepts digits and the punctuation a written number carries', () => {
        expect(phoneNumberError('99123456')).toBeUndefined()
        expect(phoneNumberError('+357 99 123456')).toBeUndefined()
        expect(phoneNumberError('(00357) 22-123456')).toBeUndefined()
    })

    it('rejects letters', () => {
        expect(phoneNumberError('cvbcvb')).toBe('Phone number can only contain numbers.')
        expect(phoneNumberError('99123456 ext 4')).toBe('Phone number can only contain numbers.')
    })

    it('rejects a number longer than the column allows', () => {
        expect(phoneNumberError('9'.repeat(PHONE_MAX_LENGTH))).toBeUndefined()
        expect(phoneNumberError('9'.repeat(PHONE_MAX_LENGTH + 1))).toBe('Phone number is too long.')
    })
})

describe('emailError', () => {
    it('reports a blank address as required, since every account needs one', () => {
        expect(emailError('')).toBe('Email is required.')
        expect(emailError('   ')).toBe('Email is required.')
    })

    it('accepts an ordinary address', () => {
        expect(emailError('theodoros@jenus.com.cy')).toBeUndefined()
        expect(emailError('new.joiner+leave@example.co.uk')).toBeUndefined()
    })

    it('rejects something that is not an address at all', () => {
        expect(emailError('ZXzx')).toBe('Enter a valid email address.')
        expect(emailError('theodoros@')).toBe('Enter a valid email address.')
        expect(emailError('@jenus.com.cy')).toBe('Enter a valid email address.')
        expect(emailError('theodoros jenus.com.cy')).toBe('Enter a valid email address.')
    })
})

describe('dateOfBirthError', () => {
    /* Fixed, so "16 years ago" does not drift with the clock the suite runs on. */
    const TODAY = '2026-09-11'

    it('reports a blank date as required', () => {
        expect(dateOfBirthError('', TODAY)).toBe('Date of birth is required.')
    })

    it('accepts somebody comfortably over the minimum age', () => {
        expect(dateOfBirthError('1990-03-04', TODAY)).toBeUndefined()
    })

    it('accepts somebody who turned the minimum age today', () => {
        expect(dateOfBirthError('2010-09-11', TODAY)).toBeUndefined()
    })

    it('rejects somebody one day short of the minimum age', () => {
        expect(dateOfBirthError('2010-09-12', TODAY)).toBe(`Must be at least ${MINIMUM_AGE_YEARS} years old.`)
    })

    it('rejects a date in the future, which is what an empty picker scrolls to', () => {
        expect(dateOfBirthError('2026-09-12', TODAY)).toBe('Date of birth must be in the past.')
        // Today itself is a newborn, so the age rule is what catches it.
        expect(dateOfBirthError(TODAY, TODAY)).toBe(`Must be at least ${MINIMUM_AGE_YEARS} years old.`)
    })
})

describe('employmentStartDateError', () => {
    /* Fixed, so "16 years after" does not drift with the clock the suite runs on.
       There is no `asOf` here: unlike the date of birth, a start date has no
       relationship with today — a future one is a hire keyed in early. */
    const BORN = '2006-04-20'

    it('reports a blank date as required, since the field is mandatory', () => {
        expect(employmentStartDateError('', BORN)).toBe('Employment start date is required.')
    })

    it('accepts an ordinary start date', () => {
        expect(employmentStartDateError('2024-01-15', BORN)).toBeUndefined()
    })

    it('accepts a start date in the future, for a hire keyed in before their first day', () => {
        expect(employmentStartDateError('2026-12-01', BORN)).toBeUndefined()
    })

    it('accepts starting on the day they turn the minimum age', () => {
        expect(employmentStartDateError('2022-04-20', BORN)).toBeUndefined()
    })

    it('rejects starting the day before they turn the minimum age', () => {
        expect(employmentStartDateError('2022-04-19', BORN)).toBe(
            `Employment start date must be on or after their ${MINIMUM_AGE_YEARS}th birthday.`,
        )
    })

    it('rejects a start date before they were born, which is a typed year', () => {
        expect(employmentStartDateError('1999-06-01', BORN)).toBe(
            `Employment start date must be on or after their ${MINIMUM_AGE_YEARS}th birthday.`,
        )
    })

    it('has no age to check against when no date of birth is on file', () => {
        expect(employmentStartDateError('1999-06-01', '')).toBeUndefined()
        expect(employmentStartDateError('1999-06-01', null)).toBeUndefined()
    })

    it('still requires the date when no date of birth is on file', () => {
        expect(employmentStartDateError('', '')).toBe('Employment start date is required.')
    })
})
