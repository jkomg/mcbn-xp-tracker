export type LoresheetDot = {
    dot: 1 | 2 | 3 | 4 | 5
    name: string
    description: string
}

export type Loresheet = {
    id: string
    name: string
    requiresStPermission: boolean
    dots: LoresheetDot[]
}

/** Cost in XP for a single loresheet dot at the given level. */
export const loresheetDotCost = (dot: number): number => dot * 3

export const LORESHEETS: Loresheet[] = [
    {
        id: "castoff-court",
        name: "Castoff Court",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Forgotten Face",
                description: "Placeholder — fill in with actual dot text.",
            },
            {
                dot: 2,
                name: "Among the Discarded",
                description: "Placeholder — fill in with actual dot text.",
            },
            {
                dot: 3,
                name: "Strength in Numbers",
                description: "Placeholder — fill in with actual dot text.",
            },
            {
                dot: 4,
                name: "Court's Ear",
                description: "Placeholder — fill in with actual dot text.",
            },
            {
                dot: 5,
                name: "Voice of the Castoffs",
                description: "Placeholder — fill in with actual dot text.",
            },
        ],
    },
    {
        id: "langford-plantation",
        name: "Warden of the Langford Line",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Langford's Legacy",
                description: "Placeholder — fill in with actual dot text.",
            },
            {
                dot: 2,
                name: "Keeper of Secrets",
                description: "Placeholder — fill in with actual dot text.",
            },
            {
                dot: 3,
                name: "Old Debts",
                description: "Placeholder — fill in with actual dot text.",
            },
            {
                dot: 4,
                name: "Blood of the Line",
                description: "Placeholder — fill in with actual dot text.",
            },
            {
                dot: 5,
                name: "Warden's Authority",
                description: "Placeholder — fill in with actual dot text.",
            },
        ],
    },
    {
        id: "nashville-sewers",
        name: "Nashville Sewers",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Rat Paths",
                description: "Placeholder — fill in with actual dot text.",
            },
            {
                dot: 2,
                name: "Below the City",
                description: "Placeholder — fill in with actual dot text.",
            },
            {
                dot: 3,
                name: "Old Bones",
                description: "Placeholder — fill in with actual dot text.",
            },
            {
                dot: 4,
                name: "Tunnels' Memory",
                description: "Placeholder — fill in with actual dot text.",
            },
            {
                dot: 5,
                name: "Master of the Deep",
                description: "Placeholder — fill in with actual dot text.",
            },
        ],
    },
]

export const getLoresheetById = (id: string): Loresheet | undefined =>
    LORESHEETS.find((l) => l.id === id)
