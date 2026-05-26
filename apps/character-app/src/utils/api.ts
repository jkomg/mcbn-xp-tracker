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

    getEligibility: () =>
        apiRequest<EligibilityResult>("/cc/eligibility"),

    getRestrictions: () =>
        apiRequest<{ loresheets: string[] }>("/cc/restrictions"),
}

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
    deleteCharacter: (_id: string) => Promise.resolve(undefined as void),
}

export { API_URL }
