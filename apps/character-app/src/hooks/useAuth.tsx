import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type ApiError } from "../utils/api"

export const useAuth = () => {
    const queryClient = useQueryClient()

    const {
        data: user,
        isLoading,
        refetch
    } = useQuery({
        queryKey: ["auth", "me"],
        queryFn: () => api.getCurrentUser(),
        retry: (failureCount, error) => {
            const status = (error as ApiError)?.status
            if (status && status >= 400 && status < 500) {
                return false
            }
            return failureCount < 2
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000),
        staleTime: 5 * 60 * 1000,
        refetchOnMount: "always",
        refetchOnWindowFocus: true
    })

    const currentUser = user ?? null

    const refreshAuth = async () => {
        queryClient.invalidateQueries({ queryKey: ["auth", "me"] })
        return refetch()
    }

    const signIn = () => {
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`
        window.location.href = `/login?next=${encodeURIComponent(returnTo)}`
    }

    const signOut = () => {
        queryClient.setQueryData(["auth", "me"], null)
        window.location.href = "/logout"
    }

    return {
        user: currentUser,
        isLoading,
        isAuthenticated: !!currentUser,
        signIn,
        signOut,
        refreshAuth
    }
}
