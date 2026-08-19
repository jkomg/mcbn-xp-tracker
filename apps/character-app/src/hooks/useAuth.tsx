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

    // Profile editing is an upstream Progeny/WorkOS feature. MCbN's
    // /api/auth/me returns id/username/display_name/is_staff and there is no
    // profile-update endpoint, so `user.nickname` is always undefined and this
    // can never succeed. MePage still renders a nickname editor against it.
    // Surfaced explicitly so the failure says what is wrong instead of
    // "updateProfile is not a function"; the editor should be removed (along
    // with the coterie and sharing panes) or pointed at a real endpoint.
    const updateProfile = (
        _data: { nickname: string | null },
        options?: { onSuccess?: () => void; onError?: (error: unknown) => void }
    ) => {
        options?.onError?.(
            new Error("Profile editing is not implemented in MCbN — there is no profile endpoint.")
        )
    }

    return {
        user: currentUser,
        isLoading,
        isAuthenticated: !!currentUser,
        signIn,
        signOut,
        refreshAuth,
        updateProfile,
        isUpdatingProfile: false
    }
}
