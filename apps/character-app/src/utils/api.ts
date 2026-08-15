// All API calls go through /api — proxied to Flask in dev, same-origin in prod.
const API_URL = "/api"

type RequestOptions = {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
    body?: unknown
    headers?: Record<string, string>
}

export const AUTH_UNAUTHORIZED_EVENT = "progeny:auth-unauthorized"

export type ApiError = Error & { status?: number }

const notifyAuthUnauthorized = () => {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT))
    }
}

const apiRequest = async <T>(endpoint: string, options: RequestOptions = {}): Promise<T> => {
    const { method = "GET", body, headers = {} } = options

    const requestHeaders: Record<string, string> = { ...headers }
    if (body) {
        requestHeaders["Content-Type"] = "application/json"
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers: requestHeaders,
        credentials: "include",
        ...(body ? { body: JSON.stringify(body) } : {})
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error" }))
        const errorMessage = error.message || error.error || `HTTP ${response.status}`
        const httpError = new Error(errorMessage) as ApiError
        httpError.status = response.status
        if (response.status === 401) {
            notifyAuthUnauthorized()
        }
        throw httpError
    }

    if (response.status === 204) {
        return undefined as T
    }

    return response.json()
}

// Discord user returned by Flask's /api/auth/me
export type CurrentUser = {
    id: string           // discord_id
    username: string     // discord username
    display_name: string // display name
    is_staff: boolean

    // Fields the upstream Progeny/WorkOS user object carried. MCbN's
    // /api/auth/me (character_creator.auth_me) returns only the four above, so
    // these are ALWAYS undefined here. They are declared optional rather than
    // removed because leftover template UI still reads them — AuthButton
    // rendered `user.firstName || user.email` and so showed a blank label
    // until it was pointed at display_name. Anything still reading these is
    // dead UI; do not add new reads.
    firstName?: string
    lastName?: string
    email?: string
    nickname?: string
    actorIsSuperadmin?: boolean
    impersonation?: { targetUserId: string } | null
}

/** Upstream admin-console user shape. See the impersonation note below. */
export type AdminUser = {
    id: string
    email?: string
    isSuperadmin?: boolean
}

// MCbN character draft
export type CharacterDraft = {
    id: string
    player_discord_id: string
    character_name: string | null
    name: string | null  // alias for Progeny sidebar compatibility
    status: "draft" | "submitted" | "revision_requested" | "approved"
    is_spc: boolean
    ticket_channel_id: string | null
    character_data: unknown | null
    created_at: string | null
    updated_at: string | null
    submitted_at: string | null
    approved_at: string | null
}

export type EligibilityResult = {
    eligible: boolean
    earliest_approved_at: string | null
}

// MCbN character creator (CC) API
export const cc = {
    getDrafts: () =>
        apiRequest<CharacterDraft[]>("/cc/characters"),

    createDraft: (data: {
        character_name?: string
        character_data?: unknown
        ticket_channel_id?: string
        is_spc?: boolean
    }) =>
        apiRequest<CharacterDraft>("/cc/characters", { method: "POST", body: data }),

    getDraft: (id: string) =>
        apiRequest<CharacterDraft>(`/cc/characters/${id}`),

    saveDraft: (id: string, data: { character_name?: string; character_data?: unknown }) =>
        apiRequest<CharacterDraft>(`/cc/characters/${id}`, { method: "PUT", body: data }),

    submitDraft: (id: string) =>
        apiRequest<CharacterDraft>(`/cc/characters/${id}/submit`, { method: "POST" }),

    deleteDraft: (id: string) =>
        apiRequest<void>(`/cc/characters/${id}`, { method: "DELETE" }),

    getEligibility: () =>
        apiRequest<EligibilityResult>("/cc/eligibility"),

    getRestrictions: () =>
        apiRequest<{ loresheets: string[] }>("/cc/restrictions"),
}

const notImplemented = (name: string): Promise<never> =>
    Promise.reject(
        new Error(
            `${name} is not implemented in MCbN — this is an upstream Progeny feature with no backend here.`
        )
    )

export const api = {
    // Auth — Flask Discord OAuth session
    getCurrentUser: async (): Promise<CurrentUser | null> => {
        const response = await fetch(`${API_URL}/auth/me`, { credentials: "include" })
        if (response.status === 401) {
            notifyAuthUnauthorized()
            return null
        }
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: "Unknown error" }))
            const errorMessage = error.message || error.error || `HTTP ${response.status}`
            const httpError = new Error(errorMessage) as ApiError
            httpError.status = response.status
            throw httpError
        }
        return response.json()
    },

    // Characters — routed through CC drafts so Sidebar character-switch still works
    getCharacters: () =>
        cc.getDrafts().then((drafts) =>
            drafts.map((d) => ({ id: d.id, name: d.character_name || "Untitled Draft" }))
        ),

    getCharacter: (id: string) =>
        cc.getDraft(id).then((draft) => ({
            id: draft.id,
            name: draft.character_name,
            data: draft.character_data,
        })),

    // These are no-ops; the CC auto-save handles persistence instead.
    createCharacter: (_data: unknown) => Promise.resolve({ id: "" }),
    updateCharacter: (_id: string, _data: unknown) => Promise.resolve({ id: _id }),
    deleteCharacter: (id: string) => cc.deleteDraft(id),

    // ── Not implemented in MCbN ─────────────────────────────────────────────
    // Coteries and character sharing come from the upstream Progeny template
    // and were never wired to a backend here — MCbN runs its own coterie
    // system in the Flask app (apps/web/app/blueprints/coteries.py), which
    // this SPA does not talk to. The hooks in src/hooks/useCoteries.tsx and
    // useShares.tsx still call these, so MePage's coterie and sharing panes
    // are non-functional.
    //
    // Declared explicitly so the calls type-check against something real and
    // fail with a message that says what is going on, instead of the bare
    // "api.getCoteries is not a function" they produce today. The UI should
    // either be removed or pointed at the Flask coterie API; until that is
    // decided, failing legibly beats failing mysteriously.
    getCoteries: (): Promise<unknown[]> => notImplemented("getCoteries"),
    getCoterie: (_id: string) => notImplemented("getCoterie"),
    createCoterie: (_data: unknown) => notImplemented("createCoterie"),
    updateCoterie: (_id: string, _data: unknown) => notImplemented("updateCoterie"),
    deleteCoterie: (_id: string) => notImplemented("deleteCoterie"),
    addCharacterToCoterie: (_coterieId: string, _payload: { characterId: string }) =>
        notImplemented("addCharacterToCoterie"),
    removeCharacterFromCoterie: (_coterieId: string, _characterId: string) =>
        notImplemented("removeCharacterFromCoterie"),
    // Admin console / impersonation, also upstream-only. MCbN does staff
    // "View As" in the Flask app, not here, and nothing in this SPA links to
    // /admin/impersonation — that route is reachable only by typing the URL
    // and every action on it fails. It should probably be deleted along with
    // the coterie and sharing panes; see the note above.
    getAdminUsers: () => notImplemented("getAdminUsers"),
    updateSuperadmin: (_userId: string, _isSuperadmin: boolean) =>
        notImplemented("updateSuperadmin"),
    startImpersonation: (_userId: string) => notImplemented("startImpersonation"),
    getPreferences: (): Promise<{ colorTheme?: string | null; backgroundImage?: string | null }> =>
        notImplemented("getPreferences"),
    updatePreferences: (_prefs: unknown) => notImplemented("updatePreferences"),

    getCharacterShares: (_characterId: string): Promise<unknown[]> =>
        notImplemented("getCharacterShares"),
    shareCharacter: (_characterId: string, _data: unknown) => notImplemented("shareCharacter"),
    unshareCharacter: (_characterId: string, _userId: string) =>
        notImplemented("unshareCharacter"),
}

export { API_URL }
