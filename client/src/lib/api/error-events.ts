export const API_ERROR_EVENT = 'annualleave:api-error'

type ApiErrorEventDetail = {
    message: string
    status?: number
    url?: string
}

export function emitApiError(detail: ApiErrorEventDetail) {
    window.dispatchEvent(new CustomEvent<ApiErrorEventDetail>(API_ERROR_EVENT, { detail }))
}
