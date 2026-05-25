export type LoresheetDot = {
    dot: 1 | 2 | 3 | 4 | 5
    name: string
    description: string
    /** If set, only characters of one of these clans may purchase this specific dot. */
    clanRestriction?: string[]
}

export type Loresheet = {
    id: string
    name: string
    requiresStPermission: boolean
    dots: LoresheetDot[]
    /** If set, only characters of one of these clans may take this loresheet at all. */
    clanRestriction?: string[]
    /** Source book: 'core' | 'camarilla' | 'anarch' | 'chicago' | 'gehenna-war' | 'custom' etc. */
    source: string
}

/** Cost in XP for a single loresheet dot at the given level. */
export const loresheetDotCost = (dot: number): number => dot * 3

export const LORESHEETS: Loresheet[] = [
    // ── V5 Core Book Loresheets ──────────────────────────────────────────────
    {
        id: "bahari",
        name: "The Bahari",
        source: "core",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Whispers of Lilith",
                description:
                    "You know of Lilith, the Path of Lilith, and the Bahari who follow it. You can identify other Bahari by their signs and seek out their hidden communities.",
            },
            {
                dot: 2,
                name: "Lilith's Way",
                description:
                    "You are accepted into Bahari circles and know their rituals and networks. Once per story, call on a Bahari contact for information or minor aid without cost.",
            },
            {
                dot: 3,
                name: "Path of Blood",
                description:
                    "Recognized as a genuine follower of Lilith's path, you gain a Bahari elder as Mentor 3, as well as access to their dangerous lore and ritual spaces.",
            },
            {
                dot: 4,
                name: "Lilith's Veil",
                description:
                    "You are trusted with the Bahari's most sensitive secrets. You share access to a Bahari safe house (Haven 2) and may request significant assistance from the inner circle once per story.",
            },
            {
                dot: 5,
                name: "Chosen of Lilith",
                description:
                    "Lilith's legacy moves through you. A Bahari elder of great power will intercede on your behalf once per chronicle, even at considerable personal risk.",
            },
        ],
    },
    {
        id: "theo-bell",
        name: "Theo Bell",
        source: "core",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Bell's Reputation",
                description:
                    "You know who Theo Bell is, what he did, and how to get word to him. His name opens doors among Anarchs and disaffected Camarilla alike.",
            },
            {
                dot: 2,
                name: "Bell's Nod",
                description:
                    "Bell has acknowledged you. Add two dice to Social rolls involving Anarchs and former Camarilla members who respect his defection.",
            },
            {
                dot: 3,
                name: "Bell's Word",
                description:
                    "Bell will speak on your behalf to other Anarchs and sympathetic elders. Gain Allies (Anarch Movement) 2.",
            },
            {
                dot: 4,
                name: "Bell's Backing",
                description:
                    "Bell will personally intercede once per chronicle to pull you from danger, broker a significant deal, or lend his considerable physical prowess to your cause.",
            },
            {
                dot: 5,
                name: "Bell's Chosen",
                description:
                    "Bell considers you a trusted companion. Once per chronicle he will take significant personal risk — including violence — to act in your interest.",
            },
        ],
    },
    {
        id: "cainite-heresy",
        name: "Cainite Heresy",
        source: "core",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "The Word of Caine",
                description:
                    "You know of the Cainite Heresy and can identify its members and find their congregations. Add two dice to Lore rolls about Caine or Gehenna theology.",
            },
            {
                dot: 2,
                name: "Hidden Congregation",
                description:
                    "You know the secret meeting places of Heresy cells. Once per story, seek refuge or information from a congregation without prior introduction.",
            },
            {
                dot: 3,
                name: "Scholar of Caine",
                description:
                    "You have studied the Heresy's texts in depth. Add two dice to any roll to recall lore about Caine, the Antediluvians, or pre-Camarilla vampire history.",
            },
            {
                dot: 4,
                name: "True Believer",
                description:
                    "A senior member of the Heresy sponsors you, granting you Mentor (Heresy Elder) 3 and access to their restricted rituals and relics.",
            },
            {
                dot: 5,
                name: "Voice of the Dark Father",
                description:
                    "You are recognized as a significant voice within the Heresy. Once per chronicle, call on the entire local congregation for meaningful aid — information, sanctuary, or coordinated action.",
            },
        ],
    },
    {
        id: "carna",
        name: "Carna",
        source: "core",
        requiresStPermission: true,
        clanRestriction: ["Tremere"],
        dots: [
            {
                dot: 1,
                name: "Carna's Circle",
                description:
                    "You know of Carna's break from the Tremere Pyramid and can contact her followers, who share knowledge freely rather than hoarding it behind oaths.",
            },
            {
                dot: 2,
                name: "Liberated Magic",
                description:
                    "Carna's followers share their knowledge without the usual Tremere restrictions. Learn one Blood Sorcery ritual of level 1 or 2 outside your normal prerequisites.",
            },
            {
                dot: 3,
                name: "Carna's Trust",
                description:
                    "A member of Carna's inner circle mentors you. Gain Mentor (Carna's circle) 3, with access to her stolen Tremere library.",
            },
            {
                dot: 4,
                name: "Forbidden Texts",
                description:
                    "You have access to Carna's archive of reclaimed Tremere knowledge. Once per story, research any Blood Sorcery ritual without the usual extended time cost.",
            },
            {
                dot: 5,
                name: "Carna's Blessing",
                description:
                    "Carna herself regards you as an ally. She will intercede once per chronicle in matters involving the Tremere Pyramid — a significant intervention from a powerful elder.",
            },
        ],
    },
    {
        id: "circulatory-system",
        name: "The Circulatory System",
        source: "core",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Blood Routes",
                description:
                    "You know the Circulatory System exists and have accessed its basic services — safe passage between cities for vampires who need to move discreetly.",
            },
            {
                dot: 2,
                name: "Safe Houses",
                description:
                    "You know the locations of Circulatory System safe houses across the region. Gain Haven 2 shared with the System — reliable, if never truly private.",
            },
            {
                dot: 3,
                name: "The Network",
                description:
                    "You are a trusted participant in the System. Gain Contacts 3 spanning multiple cities, all connected to the Circulatory System's web of couriers and stewards.",
            },
            {
                dot: 4,
                name: "Blood Trade",
                description:
                    "You can access the System's blood trading network. Once per story, source rare or exotic blood types — animal, specific resonances, even bagged hospital stock — without personal exposure.",
            },
            {
                dot: 5,
                name: "System Operator",
                description:
                    "You are a significant node in the Network. Once per chronicle, call on the full logistical might of the Circulatory System in your region — transport, safe houses, intelligence, blood supply.",
            },
        ],
    },
    {
        id: "convention-of-thorns",
        name: "Convention of Thorns",
        source: "core",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Scholar of Thorns",
                description:
                    "You know the history and precise terms of the Convention of Thorns. Add two dice to Social or Lore rolls involving Camarilla founding history or the Traditions.",
            },
            {
                dot: 2,
                name: "Ancient Precedent",
                description:
                    "You can invoke the Convention's clauses in Camarilla courts. Once per story, cite a specific provision to gain a legal advantage or pause proceedings against you.",
            },
            {
                dot: 3,
                name: "Original Witness",
                description:
                    "A vampire who attended the Convention mentors you. Gain Mentor (Elder) 3, with firsthand historical knowledge of the Camarilla's founding that no book can provide.",
            },
            {
                dot: 4,
                name: "Founding Privilege",
                description:
                    "Some of the Convention's original protections nominally apply to you. Once per chronicle, invoke founder's privilege to request sanctuary from any Camarilla court.",
            },
            {
                dot: 5,
                name: "Living History",
                description:
                    "You are recognized as a keeper of the Convention's true meaning. Tradition-respecting elders will grant you audiences and concessions unavailable to ordinary Kindred.",
            },
        ],
    },
    {
        id: "first-inquisition",
        name: "The First Inquisition",
        source: "core",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Old Wounds",
                description:
                    "You know the history of the First Inquisition and recognize its modern inheritors. Add two dice to rolls to identify Second Inquisition tactics, agents, and methods.",
            },
            {
                dot: 2,
                name: "Survivor's Network",
                description:
                    "Your line survived the Inquisition. Gain Contacts 2 among vampires who share this historical trauma — a bond forged in the worst persecution Kindred have known.",
            },
            {
                dot: 3,
                name: "Tactics of the Hunters",
                description:
                    "You have studied Inquisitional methods from both sides. Add two dice to rolls to evade, counter, or predict mortal hunter operations.",
            },
            {
                dot: 4,
                name: "Preserved Records",
                description:
                    "You have access to Inquisitional archives, identifying hunter lineages across centuries. Once per story, research any hunter's organization or background with three additional dice.",
            },
            {
                dot: 5,
                name: "The Long Memory",
                description:
                    "You are a keeper of hunter history spanning six hundred years. Once per chronicle, predict and counter a major hunter offensive before it lands — your foreknowledge is invaluable.",
            },
        ],
    },
    {
        id: "golconda",
        name: "Golconda",
        source: "core",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Seeker",
                description:
                    "You know Golconda may be real and have made contact with others who seek it. Your sincere pursuit adds one die to all Remorse rolls.",
            },
            {
                dot: 2,
                name: "Spiritual Discipline",
                description:
                    "Your search for Golconda has given you unusual mastery over the Beast. Once per session, reroll one bestial failure.",
            },
            {
                dot: 3,
                name: "Mentor in Redemption",
                description:
                    "You know a vampire who has come close to Golconda, or possibly achieved it. Gain Mentor (Near-Golconda) 3, a guide unlike any other.",
            },
            {
                dot: 4,
                name: "Approaching Peace",
                description:
                    "Your long pursuit has brought you closer. Reduce the difficulty of one Remorse roll per story by 1.",
            },
            {
                dot: 5,
                name: "The Threshold",
                description:
                    "You stand at the threshold of Golconda. Once per chronicle, automatically succeed on one Remorse check without rolling.",
            },
        ],
    },
    {
        id: "descendant-of-hardestadt",
        name: "Descendant of Hardestadt",
        source: "core",
        requiresStPermission: true,
        clanRestriction: ["Ventrue"],
        dots: [
            {
                dot: 1,
                name: "Hardestadt's Legacy",
                description:
                    "You are known as a descendant of the Camarilla's chief architect. Add two dice to Social rolls with Camarilla traditionalists who revere the founders.",
            },
            {
                dot: 2,
                name: "Venerable Blood",
                description:
                    "Your lineage commands respect in any Camarilla court. Gain Status (Camarilla) 2.",
            },
            {
                dot: 3,
                name: "Hardestadt's Influence",
                description:
                    "You can invoke your ancestor's name to call in debts. Once per story, request a significant Camarilla boon from a respected elder who owes deference to Hardestadt's line.",
            },
            {
                dot: 4,
                name: "Blood Memory",
                description:
                    "You have inherited fragments of Hardestadt's centuries of memory. Once per story, recall a specific historical detail or political connection as if you were present for it.",
            },
            {
                dot: 5,
                name: "True Heir",
                description:
                    "You are recognized as Hardestadt's chosen successor within the Camarilla. Princes must grant you audience; your word carries weight that shapes court decisions.",
            },
        ],
    },
    {
        id: "descendant-of-helena",
        name: "Descendant of Helena",
        source: "core",
        requiresStPermission: true,
        clanRestriction: ["Toreador"],
        dots: [
            {
                dot: 1,
                name: "Helena's Art",
                description:
                    "Your lineage traces to Helena of Troy. Add two dice to Craft or Performance rolls in any artistic or aesthetic pursuit.",
            },
            {
                dot: 2,
                name: "Aesthetic Network",
                description:
                    "Your connection to Helena's legacy opens doors in mortal high society and Toreador circles. Gain Contacts 2 in the art world — collectors, curators, patrons.",
            },
            {
                dot: 3,
                name: "Helena's Touch",
                description:
                    "Your works carry something of Helena's legendary power. Once per story, create or perform a piece of art that profoundly moves all who experience it, adding dice equal to your Blood Potency.",
            },
            {
                dot: 4,
                name: "Ancient Muse",
                description:
                    "You can access Helena's memories of the ancient world. Once per story, recall a historical event from classical antiquity as if you witnessed it firsthand.",
            },
            {
                dot: 5,
                name: "The Face That Launched Ships",
                description:
                    "Your presence carries Helena's legendary, world-shaking charisma. Once per chronicle, entrance an entire audience, rendering them profoundly susceptible to your influence for the scene.",
            },
        ],
    },
    {
        id: "sect-war-veteran",
        name: "Sect War Veteran",
        source: "core",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Battle-Hardened",
                description:
                    "You survived the Sect Wars and carry those lessons in every sinew. Add two dice to Composure rolls when facing violence, chaos, or coordinated aggression.",
            },
            {
                dot: 2,
                name: "Veteran's Network",
                description:
                    "You know other survivors on both sides of the war. Gain Contacts 2 among veterans of Camarilla and Anarch forces alike.",
            },
            {
                dot: 3,
                name: "Combat Wisdom",
                description:
                    "Your experience in sect warfare is encyclopedic. Add two dice to rolls involving tactics or coordinated violence, and once per story predict an enemy's military move before it happens.",
            },
            {
                dot: 4,
                name: "War Cache",
                description:
                    "You have stashed weapons, blood supplies, and resources from the war. Gain Resources 3 (untraceable) and Haven 2 representing a fallback position.",
            },
            {
                dot: 5,
                name: "Living Legend",
                description:
                    "Your deeds in the Sect Wars are famous. Once per chronicle, invoke your reputation to halt a conflict in its tracks or command instant respect from veterans on either side.",
            },
        ],
    },
    {
        id: "the-trinity",
        name: "The Trinity",
        source: "core",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Theological Foundations",
                description:
                    "You know the history and agreements of the three clans that founded the Camarilla. Add two dice to Social rolls in Camarilla political contexts.",
            },
            {
                dot: 2,
                name: "Inner Circle Access",
                description:
                    "You have connections to those near the Inner Circle. Gain Contacts 2 among Camarilla Justicars or their agents.",
            },
            {
                dot: 3,
                name: "Keeper of Traditions",
                description:
                    "You are recognized as a defender of the Traditions. Once per story, invoke a Tradition to legally compel a Camarilla member to follow it in the presence of Elysium witnesses.",
            },
            {
                dot: 4,
                name: "Inner Circle Debtor",
                description:
                    "One member of the Inner Circle owes you a favor. Gain one Major Boon from an Inner Circle member, usable once per chronicle.",
            },
            {
                dot: 5,
                name: "Inner Circle Trust",
                description:
                    "You are trusted by the Inner Circle itself. Once per chronicle, request a significant intervention from them — they will act, though the debt incurred may be steep.",
            },
        ],
    },
    {
        id: "voerman-twins",
        name: "Jeanette/Therese Voerman",
        source: "core",
        requiresStPermission: true,
        clanRestriction: ["Malkavian"],
        dots: [
            {
                dot: 1,
                name: "Anarch Celebrity",
                description:
                    "You know of the Voerman twins and can navigate their domains. Add two dice to Social rolls in Anarch-controlled Los Angeles.",
            },
            {
                dot: 2,
                name: "The Twins' Notice",
                description:
                    "Jeanette or Therese has taken a genuine interest in you. Gain Allies (Voerman interests) 2 — though their interest can be unpredictable.",
            },
            {
                dot: 3,
                name: "Asylum Access",
                description:
                    "You have legitimate access to the Asylum nightclub as a safe haven. Gain Haven 3 (shared, the Asylum) — well-secured but never entirely private.",
            },
            {
                dot: 4,
                name: "Twin Favor",
                description:
                    "One of the twins will personally intervene on your behalf in a significant situation once per story — whether by social maneuvering or Jeanette's other methods.",
            },
            {
                dot: 5,
                name: "The Other Face",
                description:
                    "You understand the twins' duality in a way few others can. Once per chronicle, both Jeanette AND Therese act in your favor simultaneously, each from within their own sphere of influence.",
            },
        ],
    },
    {
        id: "week-of-nightmares",
        name: "The Week of Nightmares",
        source: "core",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Survivor's Trauma",
                description:
                    "You witnessed the Week of Nightmares firsthand. Add two dice to Lore rolls about the Ravnos clan or Antediluvian activity.",
            },
            {
                dot: 2,
                name: "What Was Seen",
                description:
                    "Your witness has given you a visceral sense of true Antediluvian power. Add two dice to Awareness rolls for signs of Antediluvian or methuselah-level activity.",
            },
            {
                dot: 3,
                name: "Network of Survivors",
                description:
                    "You are connected to others who were affected by the Week of Nightmares. Gain Allies 2 among vampires scarred and changed by the event.",
            },
            {
                dot: 4,
                name: "Terrible Knowledge",
                description:
                    "You know things about what truly happened that the public account omits. Once per story, reveal a truth about the Week of Nightmares that provides a decisive advantage in negotiations or intelligence.",
            },
            {
                dot: 5,
                name: "The Dream Remains",
                description:
                    "Something of the Ravnos Antediluvian touched you in those days. Once per chronicle, receive a prophetic vision of coming catastrophe before it strikes, giving your coterie time to prepare.",
            },
        ],
    },
    {
        id: "rudi",
        name: "Rudi",
        source: "core",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Rudi's Trail",
                description:
                    "You know of Rudi and can follow her movements through rumor and animal messenger. Add two dice to Survival rolls in the wilderness.",
            },
            {
                dot: 2,
                name: "Gangrel Respect",
                description:
                    "Your connection to Rudi is known to elder Gangrel. Add two dice to Social rolls with Gangrel who revere the old ways.",
            },
            {
                dot: 3,
                name: "Rudi's Teaching",
                description:
                    "Rudi has shared something of her hard-won knowledge with you. Gain one free Specialty in Survival or Animal Ken.",
            },
            {
                dot: 4,
                name: "Rudi's Pack",
                description:
                    "Rudi acknowledges you as part of her extended family. Gain Allies (Gangrel) 3 — rough company, but fiercely loyal.",
            },
            {
                dot: 5,
                name: "Elder's Bond",
                description:
                    "Rudi considers you worthy of her direct mentorship. Gain Mentor (Rudi) 5 — an elder whose wilderness survival and knowledge of Gangrel elder lore is unmatched.",
            },
        ],
    },
    {
        id: "descendant-of-tyler",
        name: "Descendant of Tyler",
        source: "core",
        requiresStPermission: true,
        clanRestriction: ["Brujah"],
        dots: [
            {
                dot: 1,
                name: "Tyler's Legacy",
                description:
                    "You are known as descended from the Brujah who killed Hardestadt the Elder. Add two dice to Social rolls with Anarchs who revere the deed.",
            },
            {
                dot: 2,
                name: "Revolutionary Blood",
                description:
                    "Your lineage inspires others. Once per story, a speech or act of defiance grants all witnesses two additional dice to resist coercion or submission for the scene.",
            },
            {
                dot: 3,
                name: "Tyler's Rage",
                description:
                    "You have inherited something of Tyler's legendary fury. Gain one free dot of Potence, or add two dice to frenzy rolls made to resist submission rather than contain the Beast.",
            },
            {
                dot: 4,
                name: "Symbol of Revolution",
                description:
                    "Your name carries genuine weight in Anarch circles. Gain Status (Anarch Movement) 3.",
            },
            {
                dot: 5,
                name: "The Deed Lives On",
                description:
                    "Once per chronicle, invoke Tyler's deed to inspire mass Anarch action. A significant number of Anarchs will stand with you in direct, coordinated defiance of authority.",
            },
        ],
    },
    {
        id: "descendant-of-zelios",
        name: "Descendant of Zelios",
        source: "core",
        requiresStPermission: true,
        clanRestriction: ["Nosferatu"],
        dots: [
            {
                dot: 1,
                name: "Architect's Eye",
                description:
                    "You carry Zelios's intuitive mastery of constructed spaces. Add two dice to rolls to understand, navigate, or exploit any building or underground structure.",
            },
            {
                dot: 2,
                name: "Hidden Ways",
                description:
                    "You know of Zelios's secret passages in major cities. In any city he visited, you can find a concealed route — effectively Haven 2 in hidden passages.",
            },
            {
                dot: 3,
                name: "The Grand Design",
                description:
                    "Zelios's notes or direct teachings have reached you. Once per story, intuit the purpose, weaknesses, or secret chambers of any building as if you designed it yourself.",
            },
            {
                dot: 4,
                name: "Zelios's Network",
                description:
                    "Nosferatu who revere Zelios's architectural legacy respect you as a custodian of his work. Gain Allies (Nosferatu) 3.",
            },
            {
                dot: 5,
                name: "Master Builder",
                description:
                    "You have inherited Zelios's complete architectural legacy. Once per chronicle, design a refuge or trap of such perfection that it functions as Haven 5 or guarantees one clean escape from any structure.",
            },
        ],
    },
    {
        id: "descendant-of-vasantasena",
        name: "Descendant of Vasantasena",
        source: "core",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Vasantasena's Insight",
                description:
                    "You carry something of this ancient Malkavian's wisdom. Add two dice to Awareness or Insight rolls, particularly when reading a situation or person.",
            },
            {
                dot: 2,
                name: "Eastern Mysteries",
                description:
                    "You have access to vampire knowledge from outside Western tradition. Gain two dice to Lore rolls about non-Western Kindred history, practices, or bloodlines.",
            },
            {
                dot: 3,
                name: "The Oracle's Gift",
                description:
                    "Your connection to Vasantasena sharpens your prophetic abilities. Once per story, ask the Storyteller one direct question about the current situation that they must answer honestly.",
            },
            {
                dot: 4,
                name: "Vasantasena's Circle",
                description:
                    "You are connected to Vasantasena's descendants and students across the world. Gain Contacts 3 among Kindred scholars and seers.",
            },
            {
                dot: 5,
                name: "Full Inheritance",
                description:
                    "You have fully manifested Vasantasena's gift. Once per chronicle, receive a vision so precise and actionable that it grants an automatic success on one roll of your choice.",
                clanRestriction: ["Malkavian"],
            },
        ],
    },
    {
        id: "high-clan",
        name: "High Clan",
        source: "core",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Noble Blood",
                description:
                    "Your clan's position at the top of the Cainite feudal order is recognized. Gain Status (Camarilla) 1 and add one die to Social rolls asserting your clan's authority.",
            },
            {
                dot: 2,
                name: "Old Privilege",
                description:
                    "You invoke high clan privilege openly. Add two dice to Social rolls with Camarilla members who respect the old traditions of hierarchy.",
            },
            {
                dot: 3,
                name: "Feudal Debt",
                description:
                    "A lower-clan vampire owes your clan a significant debt by ancient custom. Gain Allies 2 (low-clan member bound by tradition) or call in a notable boon.",
            },
            {
                dot: 4,
                name: "Clan Authority",
                description:
                    "You can speak with acknowledged authority within your clan's hierarchy. Gain Status (Clan) 2 and the right to convene clan meetings.",
            },
            {
                dot: 5,
                name: "True Nobility",
                description:
                    "Your high-clan status is beyond question even among the most jaded elders. Once per chronicle, invoke it to demand obedience from low-clan Kindred or extract a major concession from Camarilla courts.",
            },
        ],
    },
    {
        id: "low-clan",
        name: "Low Clan",
        source: "core",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Survivor's Cunning",
                description:
                    "Your clan's lower standing has made you resourceful and alert. Add two dice to Subterfuge or Streetwise rolls when navigating power structures that discount you.",
            },
            {
                dot: 2,
                name: "Underground Network",
                description:
                    "Low-clan Kindred look out for each other. Gain Contacts 2 among low-clan vampires who share your position in the hierarchy.",
            },
            {
                dot: 3,
                name: "What They Overlook",
                description:
                    "High-clan Kindred chronically underestimate you. Once per story, go entirely unnoticed in a social situation where a high-clan vampire would face immediate scrutiny.",
            },
            {
                dot: 4,
                name: "Low Clan Solidarity",
                description:
                    "The low clans stand together when it truly matters. Gain Allies 3 (low-clan solidarity network) across clan boundaries.",
            },
            {
                dot: 5,
                name: "Their Mistake",
                description:
                    "Once per chronicle, exploit the high clans' habitual underestimation of you to gain a decisive political or tactical advantage at a critical moment.",
            },
        ],
    },
    {
        id: "ambrus-maropis",
        name: "Ambrus Maropis",
        source: "core",
        requiresStPermission: true,
        clanRestriction: ["Nosferatu"],
        dots: [
            {
                dot: 1,
                name: "Maropis's Files",
                description:
                    "You know of Ambrus Maropis and have accessed the edges of his intelligence network. Gain Contacts 1 within his information web.",
            },
            {
                dot: 2,
                name: "The Spy's Trade",
                description:
                    "Maropis has shared some of his craft. Add two dice to Stealth or Subterfuge rolls and to any roll to surveil or tail a target.",
            },
            {
                dot: 3,
                name: "Information Broker",
                description:
                    "Maropis will share a detailed dossier on one specific target. Once per story, gain comprehensive background intelligence on any individual in the chronicle.",
            },
            {
                dot: 4,
                name: "Maropis's Network",
                description:
                    "You are connected to Maropis's extensive spy network. Gain Contacts 4 across a broad information web.",
            },
            {
                dot: 5,
                name: "The Grand Archive",
                description:
                    "Maropis trusts you with access to his most sensitive intelligence. Once per chronicle, access compromising or decisive information on any named Kindred in the chronicle.",
            },
        ],
    },
    {
        id: "carmelita-neillson",
        name: "Carmelita Neillson",
        source: "core",
        requiresStPermission: true,
        clanRestriction: ["Toreador"],
        dots: [
            {
                dot: 1,
                name: "Neillson's Circle",
                description:
                    "You know Carmelita Neillson and move in her social circles. Gain Contacts 1 in the mortal art world — galleries, auction houses, collectors.",
            },
            {
                dot: 2,
                name: "Patron's Notice",
                description:
                    "Carmelita has noticed your talent and begun to cultivate it. Add two dice to Craft or Performance rolls in any serious artistic endeavor.",
            },
            {
                dot: 3,
                name: "Artistic Collaboration",
                description:
                    "Carmelita collaborates with you on a public project. Gain Fame 2 in mortal artistic circles as a recognized emerging talent.",
            },
            {
                dot: 4,
                name: "Neillson's Patronage",
                description:
                    "Carmelita publicly endorses your work. Gain Resources 2 and Status (Toreador) 2 — your name is known and your talent is vouched for.",
            },
            {
                dot: 5,
                name: "The Muse's Gift",
                description:
                    "Carmelita considers you her finest protégé. Once per chronicle, she will deploy her full influence — Resources 5, Allies 4 — on your behalf without reservation.",
            },
        ],
    },
    {
        id: "fiorenza-savona",
        name: "Fiorenza Savona",
        source: "core",
        requiresStPermission: true,
        clanRestriction: ["Ventrue"],
        dots: [
            {
                dot: 1,
                name: "Savona's Sphere",
                description:
                    "You know of Fiorenza Savona and have basic access to her financial networks. Add one die to Finance or Resources rolls conducted within her sphere of influence.",
            },
            {
                dot: 2,
                name: "Investment Access",
                description:
                    "Savona has allowed you into her legitimate investment opportunities. Gain Resources 2 from returns on Savona-directed ventures.",
            },
            {
                dot: 3,
                name: "Political Connections",
                description:
                    "Savona's mortal political contacts are available to you when needed. Gain Contacts 2 in mortal politics — city officials, party organizers, lobbyists.",
            },
            {
                dot: 4,
                name: "Savona's Backing",
                description:
                    "Fiorenza will vouch for you in Ventrue financial and political circles. Gain Status (Ventrue) 2 and Resources 3.",
            },
            {
                dot: 5,
                name: "Power Broker",
                description:
                    "Savona has made you a junior partner in her operations. Gain Resources 4 and the ability to move significant capital or political will once per chronicle at her direction.",
            },
        ],
    },
    {
        id: "descendant-of-karl-schrekt",
        name: "Descendant of Karl Schrekt",
        source: "core",
        requiresStPermission: true,
        clanRestriction: ["Tremere"],
        dots: [
            {
                dot: 1,
                name: "Schrekt's Legacy",
                description:
                    "You are known as descended from the legendary Tremere Inquisitor. Add two dice to Social rolls involving vampire hunters — mortal or Kindred — who respect that legacy.",
            },
            {
                dot: 2,
                name: "Hunter's Knowledge",
                description:
                    "You have inherited Schrekt's forensic insight into hunter methodology. Add two dice to rolls to identify, counter, or disrupt mortal hunter operations.",
            },
            {
                dot: 3,
                name: "The Inquisitor's Files",
                description:
                    "Schrekt's records have passed to you through your lineage. Once per story, access historical intelligence on any known vampire hunter organization or bloodline.",
            },
            {
                dot: 4,
                name: "Schrekt's Authority",
                description:
                    "Within the Tremere, your lineage carries the weight of the Inquisitor. Gain Status (Tremere) 2 among those who value the protection of Kindred from mortal hunters.",
            },
            {
                dot: 5,
                name: "The Grand Hunt",
                description:
                    "Once per chronicle, call on a network of Tremere-aligned inquisitors to locate, analyze, and dismantle a mortal hunter cell targeting Kindred.",
            },
        ],
    },
    {
        id: "descendant-of-xaviar",
        name: "Descendant of Xaviar",
        source: "core",
        requiresStPermission: true,
        clanRestriction: ["Gangrel"],
        dots: [
            {
                dot: 1,
                name: "Xaviar's Warning",
                description:
                    "You know what Xaviar saw and why he left the Camarilla. Add two dice to Lore rolls about Antediluvians, the Gehenna War, or the Gangrel departure from the Ivory Tower.",
            },
            {
                dot: 2,
                name: "Elder's Sight",
                description:
                    "Xaviar's bloodline has sharpened your instincts for supernatural threats at the highest levels. Add two dice to Awareness rolls when sensing Antediluvian or methuselah-level influence.",
            },
            {
                dot: 3,
                name: "Gangrel Elder's Network",
                description:
                    "Your lineage is respected among elder Gangrel who remember Xaviar. Gain Allies (Gangrel elders) 2.",
            },
            {
                dot: 4,
                name: "What Was Seen",
                description:
                    "You have inherited a fragment of what Xaviar truly witnessed. Once per story, sense the presence or recent passage of an Antediluvian or their direct agents.",
            },
            {
                dot: 5,
                name: "The Truth of Xaviar",
                description:
                    "You carry the full, terrible weight of what Xaviar saw. Once per chronicle, receive a vision of Antediluvian activity — precise enough to give your coterie a decisive advantage before it strikes.",
            },
        ],
    },

    // ── Custom Game Loresheets ───────────────────────────────────────────────
    {
        id: "castoff-court",
        name: "Castoff Court",
        source: "custom",
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
        source: "custom",
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
        source: "custom",
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
