import { isAxiosError } from 'axios'
import type { ApiErrorResponse } from '../types'

function flattenValidationErrors(errors: ApiErrorResponse['errors']) {
    if (!errors) return []

    if (Array.isArray(errors)) {
        return errors.filter(Boolean)
    }

    return Object.values(errors)
        .flatMap((fieldErrors) => fieldErrors)
        .filter(Boolean)
}

export function getApiErrorMessage(error: unknown, fallback: string) {
    if (isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
            return 'Request timed out. Please try again.'
        }

        if (!error.response) {
            return 'Unable to reach server. Check your connection and try again.'
        }

        const status = error.response.status
        const data = error.response.data as ApiErrorResponse | undefined
        const validationErrors = flattenValidationErrors(data?.errors)

        if (validationErrors.length > 0) {
            return validationErrors.join(' ')
        }

        if (data?.message && data.message.trim()) {
            return data.message
        }

        if (data?.details && data.details.trim()) {
            return data.details
        }

        if (status === 401) {
            return 'You are not authorized. Please sign in and try again.'
        }

        if (status === 403) {
            return 'You do not have permission to perform this action.'
        }

        if (status >= 500) {
            return 'Server error occurred. Please try again later.'
        }
    }

    if (error instanceof Error && error.message.trim()) {
        return error.message
    }

    return fallback
}
