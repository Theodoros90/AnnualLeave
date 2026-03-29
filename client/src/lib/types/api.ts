export interface ApiMessageResponse {
    message: string
}

export interface ApiErrorResponse {
    message: string
    errors?: string[]
}
