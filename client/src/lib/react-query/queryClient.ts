import { QueryClient } from '@tanstack/react-query'

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
        },
        mutations: {
            retry: 0,
        },
    },
})

export default queryClient