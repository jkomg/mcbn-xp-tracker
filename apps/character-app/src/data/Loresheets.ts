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

    // ── V5 Camarilla Book Loresheets ─────────────────────────────────────────
    {
        id: "fatima-al-faqadi",
        name: "Fatima al-Faqadi",
        source: "camarilla",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Weapons Locker",
                description:
                    "Your connection to Fatima or her network gives you access to a hidden weapons locker somewhere in your domain or the domain you are visiting. Once per chronicle, use this knowledge to equip yourself with a hand-held weapon of your choice, subject to Storyteller approval.",
            },
            {
                dot: 2,
                name: "Extended Web",
                description:
                    "You are a member of the Extended Web — former Web of Knives cultists who followed Fatima toward the Camarilla. Gain three dots to allocate among Allies, Contacts, and Mentor representing Extended Web members. Unlike regular Backgrounds, use of these dots requires payment, often severe.",
            },
            {
                dot: 3,
                name: "Missed Hit",
                description:
                    "You survived an assassination attempt by the Hand of Vengeance. Your reputation as someone Fatima couldn't bring down grants you two dots in Status and one bonus die to Social rolls when your survival story can be used for good effect.",
            },
            {
                dot: 4,
                name: "Recognized Judge",
                description:
                    "Trained in the Banu Haqim ways of judgement — by Fatima or by Ur-Shulgi's dictates — in any non-Camarilla domain you may formally announce judgement and execute a Kindred without open retaliation from the ruling sect. Subtle reprisals are not prevented.",
            },
            {
                dot: 5,
                name: "Open Contract",
                description:
                    "Fatima has agreed to eliminate any one opponent of your choice and will not ask questions. Her success is not guaranteed, but is likely. This favor reflects trust, care, or a debt she owes you. Usable once per chronicle.",
            },
        ],
    },
    {
        id: "pure-ventrue-lineage",
        name: "Pure Ventrue Lineage",
        source: "camarilla",
        requiresStPermission: true,
        clanRestriction: ["Ventrue"],
        dots: [
            {
                dot: 1,
                name: "Sire of Renown",
                description:
                    "Your sire is a Ventrue notable for nobility and adherence to clan values. Gain one die on appropriate Social checks where naming your sire could have impact. If your sire still exists, they may resent being used as a line of credit.",
            },
            {
                dot: 2,
                name: "A Lineage of Title",
                description:
                    "You come from a line of Princes, Primogen, or Barons. When you attempt to acquire title in any domain, Ventrue — even those you've never met — will automatically support your claim unless they have sufficient reason to oppose you.",
            },
            {
                dot: 3,
                name: "Recitation",
                description:
                    "You can name your ancestors all the way to a methuselah of the Fourth Generation. Reciting the full lineage (30+ minutes) gives you one bonus die to all Social-based tests against Kindred for the rest of the scene. Once per story.",
            },
            {
                dot: 4,
                name: "Legendary Lineage",
                description:
                    "Choose one legendary Ventrue line: the Line of Alexander (add two dice to Persuasion and Performance in crowds; fury frenzy check Diff 3 if interrupted), the Line of Antonius (add two dice to Academics and Leadership when planning domain defense or construction; fury frenzy check Diff 3 if disrupted mid-plan), or the Line of Mithras (reduce Difficulty to resist fear frenzy from fire by two; suffer two dice penalty to resist Dominate from older Mithras-line vampires).",
            },
            {
                dot: 5,
                name: "Name the Antediluvian",
                description:
                    "You know one of the true names or titles of the Ventrue Antediluvian. Once per chronicle, announce yourself as its descendant to force all Ventrue in the vicinity to stop what they are doing, fall silent, and sometimes drop to their knees. The name vanishes from the minds of all who hear it.",
            },
        ],
    },
    {
        id: "cult-of-mithras",
        name: "The Cult of Mithras",
        source: "camarilla",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Neophyte",
                description:
                    "Your service to Mithras is in its infancy, but you have learned to manipulate mortals with talk of religion and grandeur. You can effectively lead a small mortal cult, gaining one bonus die to all Social rolls when interacting with your herd or retainers.",
            },
            {
                dot: 2,
                name: "Nymphus",
                description:
                    "Mithraists award the title of Nymphus to new sires within the cult. You gain knowledge of Ventrue lineage and customs of Embrace, two bonus dice to all rolls in which Ventrue or Mithraic customs are discussed or studied, and the equivalent of two dots in Status among Ventrue.",
            },
            {
                dot: 3,
                name: "Leo",
                description:
                    "Among the most honored members of the cult, a Leo is entrusted to carry clandestine messages between Mithraists and sometimes beyond the order. Mithraists trust you without hesitation, and you gain one die to all non-Discipline rolls when getting other vampires to trust you.",
            },
            {
                dot: 4,
                name: "Perses",
                description:
                    "The Perses is the master of ritual bloodletting and sacrifice in the cult. A vampire declared Perses receives a short sword and the authority to murder cult enemies, with guaranteed protection (alibis, safe havens, resources) if their identity becomes known. Gain three Background dots to allocate in any domain where the Cult of Mithras is present.",
            },
            {
                dot: 5,
                name: "Unconquered",
                description:
                    "You carry the spark of Mithras within you — perhaps from his diablerist Monty Coven, or from Mithras himself during a Blood Bond. Mithras occasionally speaks to you in command or guidance, though not powerfully enough to compel. When you please him, gain three additional dice in Dominate, Fortitude, or Presence tests (choose one) for the remainder of the night.",
            },
        ],
    },
    {
        id: "the-pyramid",
        name: "The Pyramid",
        source: "camarilla",
        requiresStPermission: true,
        clanRestriction: ["Tremere"],
        dots: [
            {
                dot: 1,
                name: "Apprentice",
                description:
                    "Most Tremere sires still readily award their fledglings the rank of Apprentice. You are one such Apprentice, or the master of one, granting you the equivalent of a one-dot Mawla within the clan hierarchy.",
            },
            {
                dot: 2,
                name: "Savant",
                description:
                    "You have drawn the attention of greater members through a successful experiment, the creation of a new minor ritual, or the recovery of lost clan lore. Once per chronicle, call in a major boon from a Regent and remain on good terms with them afterward, provided the request is not insulting.",
            },
            {
                dot: 3,
                name: "Regent",
                description:
                    "You are the Regent of a chantry, responsible for the tutelage and protection of all Tremere in your domain, and sometimes their Primogen representation. Gain one dot in Tremere Status and three dots in Haven representing the chantry, along with the duties that come with them.",
            },
            {
                dot: 4,
                name: "Pontifex",
                description:
                    "You are a Pontifex — appointed as the clan's foremost expert in a particular field (art, economics, supernatural studies, etc.). Gain three bonus dice to any information-gathering roll relating to your field when you have access to your library, plus three dots in Tremere Status.",
            },
            {
                dot: 5,
                name: "The New Council",
                description:
                    "You are considered one of the potential members of the new Council of Seven, assembled after the Second Inquisition's devastating attack on Vienna. What you uniquely offer the Tremere and how you wield your power is for you and the Storyteller to determine. Gain four dots in Tremere Status.",
            },
        ],
    },
    {
        id: "victoria-ash",
        name: "Victoria Ash",
        source: "camarilla",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Ashen Kiss",
                description:
                    "At some point you have danced, kissed, or slept with Victoria Ash — you are not a rarity, but you are remembered. Victoria has a perfect memory for faces and intimate encounters going back centuries. Reduce the difficulty of Social rolls involving Victoria Ash or those connected to her by 1.",
            },
            {
                dot: 2,
                name: "Vermilion Invitation",
                description:
                    "You attended or know an attendee of the Vermilion Wedding, including who was there, their function, and where they stood on Camarilla-Ashirra union. Once per story, use this knowledge to blackmail, spin tale, or relate to other attendees, gaining three bonus dice to a Social test with a plausible explanation.",
            },
            {
                dot: 3,
                name: "What Makes Them Tick",
                description:
                    "Victoria Ash is an expert at reading people and exploiting their vulnerabilities, and she has taught you her methods. Gain two extra dice to Insight rolls when scrutinizing a target for their weaknesses.",
            },
            {
                dot: 4,
                name: "Celebrity Affectations",
                description:
                    "Emulating Victoria Ash's methods, you maintain a well-stocked tour bus for ease of transit between domains and a small crew of roadies, whatever your cover as an entertainer. Gain the equivalent of two dots in Haven (Mobile Home) and two dots in Herd or Retainers (Roadies).",
            },
            {
                dot: 5,
                name: "Patron, Lover, Companion",
                description:
                    "You occupy an important place in Victoria's heart. Once per chronicle she will move heaven and earth to protect you — potentially cashing in her considerable goodwill with the Camarilla for egregious crimes. For an entire session she counts as a five-dot Mawla and provides three dots of Status.",
            },
        ],
    },

    // ── Anarch Loresheets ────────────────────────────────────────────────────
    {
        id: "salvador-garcia",
        name: "Salvador Garcia",
        source: "anarch",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "The Garcia Network",
                description: "You have connections to Anarch movements across the Americas. Once per story, you may call in a favor from an Anarch baron or gang in a city you are visiting, gaining temporary Haven (1) or a single piece of street-level information.",
            },
            {
                dot: 2,
                name: "Barrio Tactics",
                description: "Garcia's street-fighting legacy lives in you. You gain a specialty in Brawl: Street Fighting, and once per session you may reroll one failed die on an unarmed or improvised-weapon attack.",
            },
            {
                dot: 3,
                name: "Voice of the Revolution",
                description: "Your words carry the weight of the Anarch cause. Add two dice to Social rolls when appealing to Anarchs or mortals sympathetic to anti-establishment causes.",
            },
            {
                dot: 4,
                name: "Garcia's Chosen",
                description: "Salvador Garcia himself acknowledges your efforts. You may contact him directly once per chronicle for guidance or support; he will provide meaningful assistance, though never at personal risk.",
            },
            {
                dot: 5,
                name: "Heir to the Anarch Revolt",
                description: "You are recognized as a living symbol of the Anarch Movement. Anarchs worldwide will extend hospitality and aid without question. Camarilla and Sabbat agents will mark you as a significant target.",
            },
        ],
    },
    {
        id: "agata-starek",
        name: "Agata Starek",
        source: "anarch",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Burner Phone Network",
                description: "Starek's network of disposable contacts and prepaid phones is at your disposal. Once per session, you can reach any mortal or Anarch contact without leaving a traceable call record.",
            },
            {
                dot: 2,
                name: "Counter-Surveillance",
                description: "Starek trained you to spot and defeat electronic monitoring. Add two dice to rolls to detect or evade surveillance technology, and gain a specialty in Technology: Counter-Surveillance.",
            },
            {
                dot: 3,
                name: "Dead Drop Mastery",
                description: "You know Starek's global network of dead drops and safe houses. Once per story you may access a safe house in any major city, stocked with basic Haven (2) amenities and a cached set of false identities.",
            },
            {
                dot: 4,
                name: "Starek's Trust",
                description: "Agata Starek considers you a genuine ally. She will share intelligence about Camarilla movements in your region and can arrange access to Anarch cells in Europe once per chronicle.",
            },
            {
                dot: 5,
                name: "Ghost in the Machine",
                description: "Starek has woven you into her information blackout. Your digital footprint is effectively erased — Camarilla hunters and Second Inquisition analysts cannot locate you through electronic means without exceptional effort.",
            },
        ],
    },
    {
        id: "hesha-ruhadze",
        name: "Hesha Ruhadze",
        source: "anarch",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Eye of Haroueris",
                description: "You have studied the lore surrounding the Eye of Haroueris and related Set artifacts. Add two dice to Occult rolls related to Egyptian mythology, Setite history, or ancient artifacts.",
            },
            {
                dot: 2,
                name: "Ruhadze's Contacts",
                description: "Hesha's network of mortal antiquarians, museum curators, and black-market dealers is partially at your disposal. Once per story you may arrange access to a rare artifact or occult document through these contacts.",
            },
            {
                dot: 3,
                name: "Serpent's Patience",
                description: "Hesha has taught you the discipline of waiting and watching. You may spend a Willpower to perfectly conceal your emotional state and intentions for the rest of a scene; no supernatural power short of Dominate can read your surface thoughts.",
            },
            {
                dot: 4,
                name: "Heir to the Eye",
                description: "Ministry characters only. You are entrusted with fragments of Ruhadze's research into the Eye. Once per chronicle, you may attempt to use this knowledge to unlock a single dot of a Setite ritual or power you do not possess, with Storyteller approval.",
                clanRestriction: ["Ministry"],
            },
            {
                dot: 5,
                name: "Ruhadze's Chosen",
                description: "Ministry characters only. Hesha Ruhadze names you his successor in the hunt for the Eye. He provides you with direct mentorship, access to his full network, and will intervene once per chronicle on your behalf — at significant personal cost to himself.",
                clanRestriction: ["Ministry"],
            },
        ],
    },
    {
        id: "church-of-set",
        name: "The Church of Set",
        source: "anarch",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Temple Initiate",
                description: "You are recognized as an initiate of the Church of Set's outer mysteries. You may attend public ceremonies and have access to the church's mortal congregants as a minor resource pool.",
            },
            {
                dot: 2,
                name: "Inner Mysteries",
                description: "You have been granted access to the Church's inner teachings. Add two dice to Occult rolls related to Setite theology, and once per story you may call on a mortal true believer for a significant favor.",
            },
            {
                dot: 3,
                name: "Temple Network",
                description: "The Church of Set maintains hidden temples across the world. You may request sanctuary or resources at any Church temple once per story; the local priests will provide Haven (2) and basic support.",
            },
            {
                dot: 4,
                name: "Voice of Set",
                description: "Ministry characters only. You speak with the authority of Set's teachings. Once per session, you may add three dice to a Manipulation or Persuasion roll when speaking to mortals or Kindred who are susceptible to religious or philosophical influence.",
                clanRestriction: ["Ministry"],
            },
            {
                dot: 5,
                name: "High Priest",
                description: "Ministry characters only. You hold a position of genuine authority within the Church of Set. Mortal followers will sacrifice significantly for you, and Ministry elders treat you as a peer. You may issue directives to the mortal congregation once per chronicle.",
                clanRestriction: ["Ministry"],
            },
        ],
    },
    {
        id: "ruins-of-carthage",
        name: "Ruins of Carthage",
        source: "anarch",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Carthaginian Lore",
                description: "You have studied the history and legends of the Kindred utopia of Carthage. Add two dice to Occult or Academics rolls related to ancient Carthage, Brujah history, or pre-Roman Mediterranean civilization.",
            },
            {
                dot: 2,
                name: "Dream of Carthage",
                description: "The ideal of Carthage inspires your rhetoric. Once per session you may invoke the Dream of Carthage in a speech or argument; add two dice to Social rolls when rallying Anarchs or idealists to a common cause.",
            },
            {
                dot: 3,
                name: "Carthaginian Relics",
                description: "You possess or have access to artifacts from ancient Carthage. Once per story you may draw on these relics for a bonus: either a two-die bonus to an Occult roll or a prop that impresses or intimidates a Kindred with historical knowledge.",
            },
            {
                dot: 4,
                name: "Blood Memory",
                description: "The blood memories of Carthage flow through you. Once per chronicle, you may enter a trance and access a vision of ancient Carthage — gaining a specific piece of historical knowledge or a clue relevant to the current story.",
            },
            {
                dot: 5,
                name: "Heir of Carthage",
                description: "You are acknowledged as a keeper of Carthage's legacy. Brujah and Banu Haqim elders who venerate Carthage will treat you with deep respect. Once per chronicle, you may call on one such elder for significant aid.",
            },
        ],
    },
    {
        id: "blood-plagued",
        name: "Blood Plagued",
        source: "anarch",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Plagued Blood",
                description: "Your blood carries a subtle taint that can be sensed by those who know what to look for. You are known in certain circles as someone who has survived or carries blood-borne illness; gain a two-die bonus to rolls to contact thin-bloods or other marginalized Kindred.",
            },
            {
                dot: 2,
                name: "Carrier",
                description: "You can pass a supernatural infection through your vitae. Once per story, you may deliberately taint a feeding or blood bond attempt; the target must make a Stamina roll or suffer a mild illness lasting a week.",
            },
            {
                dot: 3,
                name: "Plague Immunity",
                description: "Your body has adapted to the taint. You are immune to blood-borne supernatural diseases and gain two dice to resist mundane illnesses and poisons.",
            },
            {
                dot: 4,
                name: "Virulent Blood",
                description: "Your blood is a potent vector. Once per session, you may use your vitae as a weapon — anyone ingesting it without your consent suffers a serious supernatural illness at Storyteller discretion.",
            },
            {
                dot: 5,
                name: "Patient Zero",
                description: "You are the source. The supernatural plague in your blood is uniquely virulent and may have chronicle-level implications. Kindred hunters of supernatural diseases will seek you out — for cure or destruction.",
            },
        ],
    },
    {
        id: "anarch-revolt",
        name: "Anarch Revolt",
        source: "anarch",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Revolutionary History",
                description: "You have studied the history of the Anarch Revolt in depth. Add two dice to Academics or Occult rolls related to Kindred political history, the Convention of Thorns, or the founding of the Camarilla.",
            },
            {
                dot: 2,
                name: "Revolt Contacts",
                description: "You are connected to Anarchs who trace their lineage or ideology to the original Revolt. Once per story, you may call on one of these elders or their childer for a significant favor or piece of historical information.",
            },
            {
                dot: 3,
                name: "Spirit of Revolt",
                description: "The fire of the Revolt burns in you. Add two dice to Intimidation or Leadership rolls when confronting or rallying against authority figures — Camarilla Princes, Sheriff's deputies, and similar.",
            },
            {
                dot: 4,
                name: "Thorns Knowledge",
                description: "You know the hidden clauses and betrayals of the Convention of Thorns. Once per chronicle, you may use this knowledge to expose or shame a Camarilla elder, imposing a two-die penalty on their Social rolls against Anarchs for the remainder of the story.",
            },
            {
                dot: 5,
                name: "Voice of the First Revolt",
                description: "You are a living symbol of Kindred rebellion. Your reputation among Anarchs worldwide is legendary. Anarchs will follow your lead in dangerous situations, and your words carry the weight of centuries of struggle.",
            },
        ],
    },

    // ── Chicago by Night Loresheets ──────────────────────────────────────────
    {
        id: "annabelle",
        name: "Annabelle",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Intern",
                description: "Fledglings who want to learn Kindred politics often spend time working for Annabelle. Once per story, you may ask for Annabelle's guidance on a particular matter. She may decide to help you, though whether that's to your benefit or detriment is questionable.",
            },
            {
                dot: 2,
                name: "Glitterati",
                description: "Your fame or name makes Annabelle's parties more interesting. Once per story, you can get on the guest list for an event to which you weren't previously invited by simply asking \"Do you know who I am?\"",
            },
            {
                dot: 3,
                name: "With Thanks to Our Donors",
                description: "Annabelle knows someone at every museum and recording studio in town. Once per story, she will pull strings to get you a meeting with someone in charge, but the rest is up to you.",
            },
            {
                dot: 4,
                name: "Patronage",
                description: "Your exceptional talents have drawn Annabelle's eye. When you perform for her associates or she brokers a deal for your artwork, your Resources increase by one dot until the end of the story. Once per story.",
            },
            {
                dot: 5,
                name: "Inner Circle",
                description: "You've proven indispensable to Annabelle. She heeds your judgment and entrusts you with sensitive information. Once per story, she will present an issue of your choice before the Primogen council.",
            },
        ],
    },
    {
        id: "ballard-industries",
        name: "Ballard Industries",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Deep Pockets",
                description: "Once per story, after any event that causes a reduction in your Resources, you may choose to immediately restore your Resources to their original value.",
            },
            {
                dot: 2,
                name: "Where the In-Crowd Goes",
                description: "Once per story, you may invoke one of Ballard's false identities to receive three extra dice on a Social test in a corporate environment. If you invoke Ballard's real name instead, you automatically succeed, but it may be declared a Masquerade breach.",
            },
            {
                dot: 3,
                name: "I Fought the Law, and I Won",
                description: "Ballard Industries owns top law firms and has law enforcement in its pocket. No matter what crimes you commit, you will always have access to Influence: Police (•••) in your home state or district.",
            },
            {
                dot: 4,
                name: "Favors for Favors",
                description: "If you spend your resources for an SPC's benefit, you may declare they owe you a debt and add two dice to Intimidation or Persuasion if they resist. Once agreed, you may call in the debt at any time. You can hold as many debts as your total Status.",
            },
            {
                dot: 5,
                name: "The View from the Top",
                description: "Ballard places you in charge of a piece of his empire. Name your company and choose two Backgrounds (one at ••••, one at •••) from: Haven, Herd, Influences, Resources, or Retainers. You also gain Enemy (••) and Enemy (•) from business rivals.",
            },
        ],
    },
    {
        id: "blacksite-24",
        name: "Blacksite 24",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Rumors",
                description: "You know a lick who knows a lick who knows somebody that got scooped up by well-armed MIB-looking dudes in unmarked vehicles. Once per story, you may ask the Storyteller to feed you one rumor — which may or may not be based in reality.",
            },
            {
                dot: 2,
                name: "No, Really!",
                description: "You are the lick the other lick knows. Whether a recent arrival who witnessed something in your travels or part of a Kindred operation helping ferry the desperate, you know what you've seen. Once per story, ask the Storyteller for a solid piece of information about the weirdness you've witnessed.",
            },
            {
                dot: 3,
                name: "Paranoia Strikes Deep",
                description: "You know about the existence of FIRSTLIGHT and know they're active somewhere near — possibly inside — Chicago. You possess Contacts (••••) related to FIRSTLIGHT or government-sponsored vampire hunting operations; use them once per story before they go dark.",
            },
            {
                dot: 4,
                name: "It's My Job To Know This Stuff",
                description: "As a security specialist for the Chicago Domain, you've uncovered considerable information about the government's vampire hunters, including that they have a permanent installation near Chicago. Grants Status (••) among Kindred and Influence (••) among kine.",
            },
            {
                dot: 5,
                name: "The One That Got Away",
                description: "You escaped from Blacksite 24. You are likely being hunted by your former captors. Rötschreck and near-torpid starvation have clouded your memories — once per story, you may ask the Storyteller for one clear snippet of memory from your incarceration. You are immune to FIRSTLIGHT-induced Rötschreck.",
            },
        ],
    },
    {
        id: "the-blue-velvet",
        name: "The Blue Velvet",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Est. 1972",
                description: "The club's history is your history. You're considered an authority on it — bands whose rise started here, Kindred rivalries that played out in the VIP lounge. Add two dice to any roll related to recalling and using the club's history.",
            },
            {
                dot: 2,
                name: "Who's Who",
                description: "Everyone who's anyone stops in at the Blue Velvet. You know them all by name and keep tabs on who comes and goes. Once per story, ask your Storyteller for information on a fellow club-goer's movements — when they last visited, how they acted, and who they were with.",
            },
            {
                dot: 3,
                name: "Standing Gig",
                description: "You've played or DJed at the club and appear on its calendar regularly. Once per story, when you perform, choose between gaining a three-dot Resource Background (until end of story) or a three-dot Herd from fans who attend your every performance.",
            },
            {
                dot: 4,
                name: "VIP Club",
                description: "Your fame or influence draws others to the club. Bronwyn appreciates your patronage and acts as a four-dot Mawla. A table is always ready for you, and you have access to a private room in the VIP lounge for meetings and feedings.",
            },
            {
                dot: 5,
                name: "Backstage Pass",
                description: "You are a trusted, high-level employee at The Blue Velvet. Ian Gibson relies on you for night-to-night operations and you're a member of Bronwyn's inner circle. Once per story, you may request and receive her aid — via influence, financial backing, or use of the club for a private endeavor.",
            },
        ],
    },
    {
        id: "the-book-of-nod",
        name: "The Book of Nod",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Precis",
                description: "You are familiar with the broader concepts of the Book of Nod and some of the more commonly known prophecies. Once per story, add two dice to an Academics roll related to ancient Cainite history.",
            },
            {
                dot: 2,
                name: "Well-versed",
                description: "Your sire or Mawla taught you certain passages from the book and may even have physical fragments. Once per story, you may seek their input on a matter regarding Noddist lore, gaining a two-dice bonus to any Occult test related to the book.",
            },
            {
                dot: 3,
                name: "Scholar",
                description: "You've dedicated significant time to the Book of Nod and are familiar with at least one complete version. You can support theories with quotes and are aware of counterarguments. Once per session, add three dice to a Persuasion roll when debating its finer points.",
            },
            {
                dot: 4,
                name: "Collector",
                description: "You own several fragments from the book or have memorized sections of Caine's history. Noddists seek you out hoping to examine your copies or hear you recite the tales. Once per story, when you grant someone access, gain three temporary dots in Resources or another appropriate Background, or the ability to call in a future favor.",
            },
            {
                dot: 5,
                name: "Noddist Master",
                description: "Other Noddists look to you for insight and your theses are regarded as must-reads. Once per story, you may derive a fact or prophecy from the Book of Nod that automatically succeeds at a Persuasion test at the Storyteller's discretion.",
            },
        ],
    },
    {
        id: "capone-gang",
        name: "Capone Gang",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "A Favor for a Favor",
                description: "The Capone Gang will do something for you if you do something for them. Favors include procuring drugs, weapons, information, or other illegal goods. Gain Contacts: Capone Gang (•) and Allies: Capone Gang (•) for one use each per story.",
            },
            {
                dot: 2,
                name: "In Debt",
                description: "You've got a big ask of the Capone Gang — someone gone, cash laundered, or a clean-up job. No problem. Now you're in Eddie's debt. Once per story you can utilize this to fix some sort of problem, but at some point Eddie will call on you for a favor in return.",
            },
            {
                dot: 3,
                name: "Just One Job",
                description: "When you help the Capone Gang with a heist, you get a cut. They plan the job and leave you to walk in, grab what's good, and walk out. Gain Resources (•••) from a successful completion of the job.",
            },
            {
                dot: 4,
                name: "One of Us",
                description: "You've become an official member of the Capone Gang via a making ceremony. Gain Resources (••) and Allies: Capone Gang (••), allowing you to hire members for work — with Eddie Wu's permission. You gain one additional die to Streetwise rolls concerning organized crime.",
            },
            {
                dot: 5,
                name: "Prodigal Child",
                description: "Eddie Wu has made you a trusted lieutenant. You're in on organizational meetings and help influence big decisions. Gain Allies: Capone Gang (••••), Mawla: Eddie Wu (••), and Haven: Capone Gang Safehouse (••). If you put your interests before the gang's, you lose all benefits — and possibly gain Eddie as an Enemy.",
            },
        ],
    },
    {
        id: "the-cobweb",
        name: "The Cobweb",
        source: "chicago",
        requiresStPermission: true,
        clanRestriction: ["Malkavian"],
        dots: [
            {
                dot: 1,
                name: "A Break in the Static",
                description: "The Cobweb is just barely perceptible to you. You catch sporadic snatches of conversation — a few distinct words or images. Enough to piece together a call for aid, though you cannot respond.",
            },
            {
                dot: 2,
                name: "Shared Condition",
                description: "You recognize your own. As soon as an individual is introduced to you as a vampire, you can tell whether they are of Clan Malkavian.",
            },
            {
                dot: 3,
                name: "Across the Web",
                description: "Your voice is one of the strongest on the Cobweb. You can hold more involved conversations with Malkavians in your city. Once per story you may initiate the Call, sending impressions of a time and gathering place to all who can hear — this does not guarantee obedience.",
            },
            {
                dot: 4,
                name: "Pluck the Strands",
                description: "Once per story, you may use the Cobweb to piggyback on your sire's or one of your childer's senses. You are only an observer and cannot control their responses or movements.",
            },
            {
                dot: 5,
                name: "Malkav's Will",
                description: "The entity in the Cobweb is awake and aware. It knows your name and tells you its secrets. Once per story, you may ask the Storyteller to divulge a secret about another Malkavian or reveal what orders the mind in the Cobweb wants you to follow.",
            },
        ],
    },
    {
        id: "cultivar",
        name: "Cultivar",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Dark Seedling",
                description: "You are newly connected to the Cultivar movement and its promise of ancient power and stability. Once per story you may use two dots in Allies: Cultivars representing mortal cultists who come to your aid.",
            },
            {
                dot: 2,
                name: "Fresh Cutting",
                description: "Under a current Cultivar's sponsorship, you are tested and pushed beyond your limits. You gain a free Skill Specialty in Occult (Bahari, Lilith, or the Ancestor) and a ritual scar conveying one dot in Status: Cultivar.",
            },
            {
                dot: 3,
                name: "Suppressing the Beast",
                description: "Your sponsor grants you access to feeding grounds where mortal devotees spill blood in service to the Mother. This grants you a three-dot Herd and a one-dot Haven accessible once per story. You may never again feed from animals.",
            },
            {
                dot: 4,
                name: "Newly Made Initiate",
                description: "A month of isolation and endurance earns you the title of Initiate. You enjoy Status: Cultivar (•••). Once per story, you may add two extra dice to a Willpower roll when calling to mind the harsh fasting endured during your initiation.",
            },
            {
                dot: 5,
                name: "Jewel in the Garden",
                description: "Three drops of a methuselah's blood now sing within your veins. You are expected to maintain your own Garden and come when summoned by the Ancestor or the Blackwaters. As a Jewel, you receive four additional dice on rolls to resist frenzy.",
            },
        ],
    },
    {
        id: "cult-of-shalim",
        name: "Cult of Shalim",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Dark Whispers",
                description: "You have heard rumors of the cult from those returning from the Gehenna Crusade. Once per story, gain two additional dice to either Insight or Investigation to look into the cult's myths or to identify if someone is a member.",
            },
            {
                dot: 2,
                name: "Cult Initiate",
                description: "As an initiate, you know the Semitic phrase \"Shin-Lamedh-Mem\" as the identifier of other members. Speaking it to an initiated member immediately grants two dice on any Persuasion roll to gain their assistance. Speaking it to the uninitiated may expose you as a cult member.",
            },
            {
                dot: 3,
                name: "Power of Faith",
                description: "The cult's reach extends deepest into the religious community. In the peace of any church or temple, your zeal allows you to ignore the negative effects of Impairment.",
            },
            {
                dot: 4,
                name: "Crush the Dreams of Life",
                description: "When you succeed on an Insight roll against any character, the Storyteller reveals their foremost ambition. You may then reroll any failed dice in a Persuasion roll per scene against them. You may also roll Manipulation + Persuasion vs. Composure + Insight to plunge them into despair, inflicting one Aggravated Willpower damage. A total failure turns them against you.",
            },
            {
                dot: 5,
                name: "Shalim Is",
                description: "You are a true servant of Shalim. Your position grants Herd (••) for your followers and Influence (•••) in the religious community of your choice. You gain the Dark Secret Flaw (•). You automatically pass any Composure-based roll to hide your membership in the cult.",
            },
        ],
    },
    {
        id: "descendant-of-lodin",
        name: "Descendant of Lodin",
        source: "chicago",
        requiresStPermission: true,
        clanRestriction: ["Ventrue"],
        dots: [
            {
                dot: 1,
                name: "Baby of the Family",
                description: "You are the youngest member of the lineage, embraced within the last decade and still treated with some indulgence. With other members of Clan Ventrue in Chicago, you always have a Mawla rating of at least one dot.",
            },
            {
                dot: 2,
                name: "Responsible Middle Childe",
                description: "A steadfast and proud member of Lodin's bloodline, just coming into your own. Other Kindred of similar age and Generation look to you for leadership. With them you always carry a minimum of Status (••).",
            },
            {
                dot: 3,
                name: "Black Sheep of the Family",
                description: "You are a descendant of Lodin who has split with the bloodline in some dramatic way. You have a little bit of dirt on every one of Lodin's childer. The Storyteller will reveal a secret about any one of them you encounter, once per story.",
            },
            {
                dot: 4,
                name: "Like Sire, Like Childe",
                description: "Like your ancestor, you are a virtually unkillable cockroach of a vampire. Add two dice to your dice pools when making tests to avoid physical or supernatural injury outside of direct physical conflict.",
            },
            {
                dot: 5,
                name: "Long-Lost Relative",
                description: "You are a descendant of one of the childer Lodin sired between his departure from Veracruz and his arrival in Chicago. Your arrival has sent a shockwave through the city. You enjoy Status (••••) among Ventrue and court officials, and a definite seat at the Prince's table.",
            },
        ],
    },
    {
        id: "descendant-of-montano",
        name: "Descendant of Montano",
        source: "chicago",
        requiresStPermission: true,
        clanRestriction: ["Lasombra"],
        dots: [
            {
                dot: 1,
                name: "The Shadow of Yesterday",
                description: "Once per story, you may write a letter to Montano asking for a single piece of information about either the Camarilla or Clan Lasombra. From his distant haven, he will respond with truth or clues leading to it.",
            },
            {
                dot: 2,
                name: "Siblings in Darkness",
                description: "Montano's deeds and the honor of his line afford you respect even from clanmates in the Sabbat and elsewhere. Your Status: Lasombra (••) applies to Lasombra across all sects.",
            },
            {
                dot: 3,
                name: "Abyssal Apprentice",
                description: "Montano cannot teach you everything due to the comparative weakness of your blood, but you've picked up a few tricks. Once per story, you may use an Oblivion power you do not already know that is at your current level or lower.",
            },
            {
                dot: 4,
                name: "Word of Mouth",
                description: "You held fast to your place in the Camarilla even when the rest of your clan served the Sabbat. Your allies in the Camarilla have not forgotten. Your status among non-Lasombra Camarilla members remains constant no matter where you travel in your home country, even without a formal position.",
            },
            {
                dot: 5,
                name: "Purity of Remorse",
                description: "Inspired by Montano's profound guilt and grief, you aspire to mourn for your sins as deeply as he does. Whenever you roll for Remorse, you never roll with fewer than two dice.",
            },
        ],
    },
    {
        id: "fires-and-floods",
        name: "Fires and Floods and Devil's Night",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Trivia Buff",
                description: "Your knowledge of Chicago disasters is rock solid — dates, details, strange-but-true facts. Add two dice to Academics or Investigation rolls pertaining to the topic.",
            },
            {
                dot: 2,
                name: "Old Bones",
                description: "New parts of the city were rebuilt on top of the old. Perhaps you've studied architectural records, or your old haunts were in the path of destruction. Parts of them still stand, and you know how to get into them. Once per story, you may hide in one of these places to throw off a pursuer.",
            },
            {
                dot: 3,
                name: "Devil's Night Survivor",
                description: "You lived through the Great Fire and Devil's Night, and may have participated in Lodin's purges. Once per story, add three dice to a Social roll involving another person who survived the fire or their childer.",
            },
            {
                dot: 4,
                name: "Local Hero",
                description: "You helped rebuild after disaster struck, or were one of the rescuers at the scene, and mortals remember you fondly. Once per story, you may leverage this goodwill to sway mortal opinion, granting you Influence: Goodwill (•••••) for a single session, once per chronicle.",
            },
            {
                dot: 5,
                name: "Puppetmaster",
                description: "You were one of the primary orchestrators of a disaster. Work with the Storyteller to determine how you were involved and what resulted — your goals, who died, who knows, what rumors surround it, and what you gained.",
            },
        ],
    },
    {
        id: "firstlight",
        name: "FIRSTLIGHT",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Evasion Tactics",
                description: "You know basic surveillance tactics and simple ways to avoid being followed or spied upon. You keep your online footprint minimal and own a white-noise generator, cell-phone jammer, or burner phone. Add one die on rolls to avoid being tailed or listened in on.",
            },
            {
                dot: 2,
                name: "Branch Office",
                description: "Someone slipped up and you've got their scent. Whether through overheard conversation, a thinly disguised trap of a URL you hacked back, or another method — you know where FIRSTLIGHT's closest base of operations is located.",
            },
            {
                dot: 3,
                name: "What Do They Know",
                description: "You've intercepted some communications between agencies — learned a dead drop location, decrypted their signal. Once per story, you may ask the Storyteller for a piece of information FIRSTLIGHT has on you or a coterie-mate that you've managed to seize.",
            },
            {
                dot: 4,
                name: "No Records Found",
                description: "Through bribes, break-ins, and paranoia, you've erased yourself from FIRSTLIGHT's records. Your slate is clean — for now. Add three dice to Larceny, Stealth, or Survival rolls when handling FIRSTLIGHT operations.",
            },
            {
                dot: 5,
                name: "Friend on the Inside",
                description: "You've got a mole on FIRSTLIGHT's payroll — controlled through supernatural coercion, threats, or a hefty periodic bribe. The mole alerts you if the organization is coming after you and once per story will commit an act of minor sabotage on your orders.",
            },
        ],
    },
    {
        id: "kevin-jackson",
        name: "Kevin Jackson",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "New Blood",
                description: "A newcomer to the Prince's service, you have access to a specially constructed Mask worth two dots for use once per story, created using Jackson's Influence. If you cause a Masquerade breach using that Mask, you suffer no adverse consequences beyond a stern talking-to.",
            },
            {
                dot: 2,
                name: "Recent Graduate",
                description: "You have emerged from one of the Prince's finishing schools, ready to help him achieve his goals. You have been granted the assistance of one of his ghouls equivalent to Retainers (••) who schools you in Chicago and assists you in whatever duties the Prince assigns.",
            },
            {
                dot: 3,
                name: "Up and Comer",
                description: "The Prince has granted you provisional access to one of his non-criminal areas of interest, equivalent to Influence (•••). Once per story, you may invoke Jackson's name to automatically succeed in a Social test with a Kindred SPC whose interests overlap with the Prince's.",
            },
            {
                dot: 4,
                name: "Adjutant",
                description: "The Prince knows your capabilities and values them. Once per story, you may call upon the Bloods to assist in an upcoming scene, where they count as Allies (Bloods) ••• and Contacts (Bloods) •• Background.",
            },
            {
                dot: 5,
                name: "The Prince's Lieutenant",
                description: "You are the Prince's strong right hand, the vampire he turns to for decisive action and wise counsel. You possess Mawla •••• (Kevin Jackson). Once per story, you may request the opportunity to gift the mortal of your choosing the Embrace and the Prince will approve that request.",
            },
        ],
    },
    {
        id: "kindred-iconography",
        name: "Kindred Iconography",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Iconographer",
                description: "You're versed in Kindred symbols, able to identify someone's clan by the motifs in their clothing and could lecture neonates on how the imagery has changed over the centuries. Add two dice to relevant Academics rolls.",
            },
            {
                dot: 2,
                name: "The Writing on the Wall",
                description: "You've learned to look for marks other Kindred have left behind. Gain three dice on relevant Streetwise rolls when looking for information on local domains and vampires available in graffiti, posted flyers, or other artwork in the area.",
            },
            {
                dot: 3,
                name: "Trendsetter",
                description: "Your style catches eyes in Elysium, and other Kindred look to see what you're wearing. Add two dice to Social rolls when decked out in the imagery of your clan or chosen affiliation.",
            },
            {
                dot: 4,
                name: "Graffiti Artist",
                description: "Your murals are works of art and have drawn the eye of coteries and Toreador alike. You may even have attracted the attention of Annabelle herself. Craft rolls regarding your art receive three extra dice when involving Kindred iconography.",
            },
            {
                dot: 5,
                name: "Giorgio Who?",
                description: "You've dressed Princes and Primogen, subtly weaving clan iconography into the lines of a suit or the cut of a dress. Once per story, an outfit of your design grants two dots of Status to a character of your choosing for the session. Alternatively, your scathing critique removes one dot of Status for the same period.",
            },
        ],
    },
    {
        id: "the-labyrinth",
        name: "The Labyrinth",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Tunnel Access",
                description: "A Kindred from the Labyrinth has shown you which turns to take and markers to follow through its tunnels. If you follow that path, none in the Labyrinth will harm you, but if you stray you risk death or worse. Useful when escaping pursuers or hiding for a night.",
            },
            {
                dot: 2,
                name: "Boxcar Blues",
                description: "The Labyrinth's inhabitants spread news through coded folk songs with double meanings representing political figures currently in power. You've been taught how to decipher these lyrics. Gain free Skill Specialties in Performance (Folk Song) and Streetwise (Labyrinth Rumors).",
            },
            {
                dot: 3,
                name: "Church",
                description: "Once a month, a small club night is hosted in one of the larger concrete rooms — kitted out with lights, speakers, and bars, pumping dungeon synth and witch house music. You know its location and are welcome to bring a plus one anytime.",
            },
            {
                dot: 4,
                name: "Lydia's Lair",
                description: "There's a blind Tremere oracle named Lydia who lives in the abandoned train ruins. She reads the future through Blood Sorcery with uncanny accuracy. If you bring her something to eat, she'll tell you one specific thing about the future. She counts as a Mawla (••••).",
            },
            {
                dot: 5,
                name: "Hideout",
                description: "The Kindred living in the Labyrinth trust you enough to shelter you when you need to hide. It's a safe haven with no judgment — unless you commit crimes against the community, in which case you're quickly ousted. Gain Allies: Labyrinth Kindred Community (••••).",
            },
        ],
    },
    {
        id: "lupine-expert",
        name: "Lupine Expert",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Huntsman",
                description: "You've developed a keen eye for tracking Lupines, even when they're pretending to be human. Once per session, you may receive three extra dice to any Mental test to pursue Lupines.",
            },
            {
                dot: 2,
                name: "Tactician",
                description: "You've survived enough Lupine attacks to keep a cool head. When you and your allies use Teamwork against Lupines, the group can always assist each other — every character can contribute one die to the Teamwork roll, no matter what Skill the test requires.",
            },
            {
                dot: 3,
                name: "Soldier",
                description: "A werewolf's ability for combat should never be underestimated. You know that more than anyone, but it won't stop you. When engaging you in Physical combat, a shifted Lupine only has a +2 damage modifier when using its claws and teeth.",
            },
            {
                dot: 4,
                name: "Trophy",
                description: "You have slain a Lupine and have the evidence to prove it. Once per story, when you reveal this trophy to a werewolf, you may choose its initial reaction: it flees from you, or only targets you for Physical conflict. Revealing it more than once per story lets the Storyteller choose the reaction instead.",
            },
            {
                dot: 5,
                name: "Ambassador",
                description: "Your knowledge of werewolves allows you to parley with them. Whenever you try to heal the rift between individual vampires and werewolves, or stir them to unite, receive two extra dice to Social tests. With sufficient effort and sacrifice, you may convince Kindred and Lupines of a city to act as one to accomplish a task once per chronicle.",
            },
        ],
    },
    {
        id: "nathaniel-bordruff",
        name: "Nathaniel Bordruff",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Recruit",
                description: "Something about you has attracted Bordruff's attention. He has extended his hand in friendship in the form of Mawla (••) but requires you accept a one-step Blood Bond with him.",
            },
            {
                dot: 2,
                name: "Collaborator",
                description: "You have accepted Bordruff's friendship or patronage in what seems like a reasonable quid pro quo arrangement. You have developed Resources (•) and Status (•) and a reputation as ambitious and hardworking, but with a certain stench clinging to you from your associations.",
            },
            {
                dot: 3,
                name: "Accomplice",
                description: "Bordruff has begun offering greater favors in return for greater risks. You are beginning to comprehend the dimensions of his larger goals. His largesse has granted you Haven: Secured Room (•) in a parishioner's basement and Contacts: CoC Consistory (••).",
            },
            {
                dot: 4,
                name: "Conspirator",
                description: "Bordruff has brought you fully into his confidence and asked you to join his conspiracy to bring down Kindred society from within. He has granted you access to his principal human minions — the pastor and consistory, all his ghouls with a virulent hatred of the undead — as Allies (••••).",
            },
            {
                dot: 5,
                name: "Betrayer",
                description: "What course will you choose: betray the Kindred as a whole, or betray the one who chose to trust you to the Prince and the justice of the damned? Choose wisely. Either way you stand to gain (Status and potentially Mawla with the Prince) and lose.",
            },
        ],
    },
    {
        id: "the-painted-lady",
        name: "The Painted Lady",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Plus One",
                description: "By a stroke of luck, your companion secured an invitation and asked you to be their plus one. You could only observe, but being there raised your social capital. Gain two dice to Persuasion and Status (••) in any encounter with a fan or regular of the Painted Lady who sees you during the week following the visit.",
            },
            {
                dot: 2,
                name: "Engraved Invitation",
                description: "You hold a glossy, ruby-red business card inviting you to come and play. You receive Influence: Painted Lady Enthusiasts (••) and may participate in BDSM scenes, feeding upon any mortal willing to engage in blood play.",
            },
            {
                dot: 3,
                name: "Schedule an Appointment",
                description: "Your slim matte metal membership card entitles you to attend one party per week and schedule appointments for standard tattoos or piercings. You attract the particular regard of one regular as Retainers (••), and a piercing or tattoo improves your Status among domain counter-culturalists by one dot.",
            },
            {
                dot: 4,
                name: "VIP",
                description: "You may attend the salon on whatever nights you prefer and access more enticing scenes involving considerable pain and blood. Your character has access to Herd: Painted Lady Enthusiasts (•••) and gains Contacts: BDSM Community (••).",
            },
            {
                dot: 5,
                name: "A Beaubien Original",
                description: "You have received a commissioned piece executed by Edith Beaubien herself in the Japanese tebori style — a tattoo that never disappears upon waking. A Beaubien original adds two dice to all Streetwise rolls, grants permanent Status (•••) among Painted Lady enthusiasts and art lovers, and permanent Status (••) among other Chicago Kindred.",
            },
        ],
    },
    {
        id: "revenant-family-ducheski",
        name: "Revenant Family: Ducheski",
        source: "chicago",
        requiresStPermission: true,
        clanRestriction: ["Tremere"],
        dots: [
            {
                dot: 1,
                name: "Nourishing Blood",
                description: "When you feed from your Ducheski revenant, they are not subject to the Human slake penalty of your Blood Potency. Feeding from them never risks a Blood Bond. The revenant is still harmed by your feeding like a human would be.",
            },
            {
                dot: 2,
                name: "Personal Library",
                description: "Your revenant has added their personal library of ancient texts to yours. Choose two of these three Skills: Academics, Investigation, or Occult. Whenever you make a test with any Specialty in your chosen Skills, receive one extra die.",
            },
            {
                dot: 3,
                name: "Research Team",
                description: "You have a tight-knit family unit of three to five Ducheski revenants in your care, represented by Retainer (••). Once per story, when you task your research team with studying a new Ritual, their dedication allows you to learn it in half the usual time.",
            },
            {
                dot: 4,
                name: "Ritual Assistant",
                description: "Your Ducheski revenant has a special aptitude for Blood Sorcery. When your revenant is present and helps you prepare a known Ritual, the Difficulty of the roll to activate it is reduced by 1. If more than one Ritual Assistant is present, the Ritual pool increases by one die for every two additional Assistants.",
            },
            {
                dot: 5,
                name: "Ducheski Invention",
                description: "You own a one-of-a-kind Ducheski creation — a clockwork device or modern technological marvel. Name it and choose a Skill; the Storyteller will name up to three components that make its function possible. It is a Specialty of that Skill providing three extra dice. If damaged, any Ducheski in your service knows how to fix it if all components are available.",
            },
        ],
    },
    {
        id: "society-of-st-leopold",
        name: "The Society of St. Leopold",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Postulant",
                description: "You once seriously considered taking Holy Orders and dove deep into the history of the archdiocese, which may have included an office associated with the Society of St. Leopold. Once per story, you may ask the Storyteller for a piece of known information about the Society.",
            },
            {
                dot: 2,
                name: "Novice",
                description: "Your interest in a profession of faith went deeper than most — you were on the verge of your novitiate when that life was torn away. You retain considerable potential contact with members of the local church. These Contacts (equivalent of ••) include your confessor, overseers, fellow novices, or congregational volunteers.",
            },
            {
                dot: 3,
                name: "Brother or Sister",
                description: "Before your Embrace you were a member of the Church, sworn to a religious community. You possess detailed knowledge of the local diocese — members, properties, meeting schedules, and Society affiliates — granting two extra dice to Academics and Occult rolls related to the religious district. Once per story, find a safe Haven (•) among Church properties.",
            },
            {
                dot: 4,
                name: "Father or Mother",
                description: "You were a fully professed and ordained priest or senior canoness prior to your Embrace. You know exactly who the Society members are in the city and where they meet, and have strategies to avoid or misdirect them — amounting to Influence (•••) with the diocese. You retain access to church properties as a permanent Haven (••). Comes with Infamy Flaw (•).",
            },
            {
                dot: 5,
                name: "Inquisitor",
                description: "You are a former, fallen member of the Society of St. Leopold or one of its constituent organizations (the Condottieri, the Gladius Dei, the Office of the Censor, or the Order of St. Joan). Once per story, ask the Storyteller for one piece of true information about the Society's current activities. You gain Influence (••••) over any one branch of the Society — misuse it and it is lost until you regain their favor.",
            },
        ],
    },
    {
        id: "talley",
        name: "Talley",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Recognize the Signs",
                description: "Like Talley, you have a sense of when danger approaches and it's time to change allegiance or flee a domain. Once per chapter, if an action is likely to cause severe social backlash, the Storyteller will tell you at your request.",
            },
            {
                dot: 2,
                name: "Secret Communications",
                description: "You know Talley's mastery over sub-channels of Kindred communication. You can claim a prominent Camarilla member (such as a Prince) as a three-dot Mawla for use in a single session per story. How you treat this contact is up to you, but blackmail or warm relations will produce different results.",
            },
            {
                dot: 3,
                name: "Tangled Strings",
                description: "You do not fight the elders like the Sabbat or the Anarchs; instead you manipulate the masters from beneath. Gain two bonus dice to Intelligence and Wits dice pools when determining whether you're being manipulated, and two additional bonus dice to Social rolls when directly manipulating the person attempting to control you.",
            },
            {
                dot: 4,
                name: "Trained Killer",
                description: "Talley acts as your mentor in the art of killing. Once per story, Talley counts as a Mawla (••••) and can supply you with access to his transportable armory on the same night, allowing you to purchase automatic weapons, explosives, blades, and even flamethrowers if you have the cash.",
            },
            {
                dot: 5,
                name: "Personal Defender",
                description: "Talley is your bodyguard. You have arranged payment — in cash, favors, or blood — and for the time being Talley is your loyal defender. He will accompany you anywhere, casting no judgment and offering no counsel unless requested. Once the contract ends at the end of the session, Talley will speak of no sins he witnessed you perpetrate.",
            },
        ],
    },
    {
        id: "wauneka",
        name: "Wauneka",
        source: "chicago",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Secluded Meetup",
                description: "Wauneka has decided you're okay enough to meet up with occasionally. Once per story, meet with him in a secluded place of his choosing and he'll dish on one secret you're after, as relayed through his underground whisper network.",
            },
            {
                dot: 2,
                name: "Spy Paths",
                description: "You've proven you don't mind hanging out with the outcasts of society, and Wauneka's outsider family has noticed. Once per story they'll allow you access to their secret pathways to spy on someone from a hard-to-detect vantage point. Loud noise or excessive motion loses you your cover.",
            },
            {
                dot: 3,
                name: "Insider Connections",
                description: "Wauneka knows someone inside almost every industry in Chicago — usually the people that go unnoticed, like janitors, sanitation workers, or food workers. Once per story, Wauneka can hook you up with someone to get you inside or get you the info you need. This individual counts as Retainers (••) for one session, but remains Contacts (•) if you spend the required Experience.",
            },
            {
                dot: 4,
                name: "Spy Skills",
                description: "You've spent enough time with the underground that you've begun to pick up their subtle skills of going unnoticed. Once per story, gain three pieces of secret information through your learned spy skills or close bonds with the underground. Gain free Skill Specialties in Investigation (Espionage) and Insight (Secrets).",
            },
            {
                dot: 5,
                name: "Darkest Whispers",
                description: "Wauneka has come to trust you like one of his family — a thing he does rarely. He welcomes you into his most secret places and confides the darkest things he learns about the Kindred in the city. Wauneka counts as Allies: Wauneka (•••) and his underground associates. Once per story he'll ask your advice on what move to make to influence Chicago's politics, and take it.",
            },
        ],
    },

    // ── Players Guide Loresheets ─────────────────────────────────────────────
    {
        id: "bankers-of-dunsirn",
        name: "Bankers of Dunsirn",
        source: "players-guide",
        requiresStPermission: true,
        clanRestriction: ["Hecata"],
        dots: [
            {
                dot: 1,
                name: "Money Obfuscates",
                description: "The Dunsirn have worked in the shadows for centuries. You've spread some of your family's money around to create an alternate identity for yourself. You get two dots of the Mask Background for free, though you must maintain this Mask at least once per story.",
            },
            {
                dot: 2,
                name: "Money Talks",
                description: "The Dunsirn find information in the most interesting places. Once per story, you can find information as if you had the Contacts Background with a number of dots equal to your Resources. This ability lasts for a single scene.",
            },
            {
                dot: 3,
                name: "Money Enhances",
                description: "You always have access to the best that money can buy. When making a roll in which you can use your own equipment, you get a bonus die to the roll.",
            },
            {
                dot: 4,
                name: "Money Multiplies",
                description: "You are (or are directly related to) a legitimate investment banker. Gain three dots (up to five) in Resources. In addition, anyone in your coterie loses the Destitute Flaw and can purchase dots in Resources at 2 XP per dot instead of the usual 3.",
            },
            {
                dot: 5,
                name: "Money Dictates",
                description: "You are the head of the Dunsirn family accounts, with your undead finger on the pulse of the Hecata's finances. Gain three free dots of Status in the Hecata. Once per chronicle, you can either give every Hecata two additional dots of Resources or remove all Resource dots from every Hecata — lasting a single story; removals generate a chronicle-length Adversary Flaw.",
            },
        ],
    },
    {
        id: "children-of-tenochtitlan",
        name: "Children of Tenochtitlan",
        source: "players-guide",
        requiresStPermission: true,
        clanRestriction: ["Hecata"],
        dots: [
            {
                dot: 1,
                name: "Hiding from the Wolf",
                description: "The remaining Pisanob survived because they are very good at hiding. You've learned all manner of techniques to remain out of sight of those that would hunt you — and those you would hunt. You get one extra die on any roll to hide, including via the use of Disciplines or Ceremonies.",
            },
            {
                dot: 2,
                name: "Ghostly Instincts",
                description: "The original Kindred embraced in Tenochtitlan were extremely talented necromancers who carried on a wide variety of tips, tricks, and secrets. You've learned some of those secrets, granting two additional dice on any Oblivion Ceremony roll involving the summoning, control, or destruction of ghosts.",
            },
            {
                dot: 3,
                name: "Forward Thinking",
                description: "After years of being hunted down by the Harbingers of Skulls, you've learned to always plan ahead. Once per story, you can reroll any Skill roll. You also get one free Skill reroll in any scene in which you work against another Hecata. If the Hecata is a Harbinger of Skulls, you get an additional success on that reroll.",
            },
            {
                dot: 4,
                name: "Necromantic Prodigy",
                description: "The secrets of Oblivion are yours to command through study, your ancient bloodline, or secrets acquired from your cousins. Your mastery of necromantic ceremonies is unparalleled. You get two automatic successes on any roll necessary for activating a necromantic Oblivion Ceremony.",
            },
            {
                dot: 5,
                name: "Next in Line",
                description: "Now that Pochtli has sacrificed himself, it is time for another to lead the Pisanob to future glory. You are one such individual, wielding a balance of necromantic skill and political savvy. You have an additional two dots of Status within the Hecata, and an ally among the Hecata leadership who acts as a five-dot Mawla once every other story.",
            },
        ],
    },
    {
        id: "flesh-eaters",
        name: "Flesh-Eaters (Nagaraja)",
        source: "players-guide",
        requiresStPermission: true,
        clanRestriction: ["Hecata"],
        dots: [
            {
                dot: 1,
                name: "Viscus",
                description: "You can still eat flesh in lieu of drinking blood — biting a mortal and causing an Aggravated wound acts in all other ways like drinking blood for you. You can also eat fresh corpses, though the taste is not as good.",
            },
            {
                dot: 2,
                name: "Unseen Spirit",
                description: "Some Nagaraja can make themselves unseen to ghosts and spirits. If you do not have Obfuscate, gain Cloak of Shadows at no cost — but only effective against spirits and ghosts. If you have (or later acquire) Obfuscate, all your Obfuscate powers work against ghosts and spirits in addition to their usual effects.",
            },
            {
                dot: 3,
                name: "The Perfect Murder",
                description: "You have extensive experience planning murders. As long as you have at least a night to plan a cold-blooded, intentional murder, you get one extra success on all rolls for that murder scene. These successes are negated by someone who possesses the Send a Murderer bloodline ability.",
            },
            {
                dot: 4,
                name: "Send a Murderer",
                description: "You're a serial killer, or have spent a lot of time studying them. You get two extra dice on rolls to study murder scenes or track down killers. You have three dots to spend between Contacts with the police force, Contacts with investigators in Kindred society, and Status.",
            },
            {
                dot: 5,
                name: "Monstrous Bite",
                description: "When ready to attack or feed, your teeth extend to lengthy, splayed, and vicious daggers that protrude from your mouth. When attacking with your bite, you suffer no called shot penalty, gain one extra success on all Intimidation rolls, and increase your bite damage to 3.",
            },
        ],
    },
    {
        id: "nasyon-san-an",
        name: "Nasyon san an",
        source: "players-guide",
        requiresStPermission: true,
        clanRestriction: ["Hecata"],
        dots: [
            {
                dot: 1,
                name: "CSI Shit",
                description: "As an aspiring gede, you've learned a few tricks about death. By carefully examining a mortal corpse you can immediately know the cause of death. If the cause of death is supernaturally concealed, you gain the ability to roll despite that.",
            },
            {
                dot: 2,
                name: "Pound of Flesh",
                description: "Something of your bloodline's original weakness remains with you. If you accept a gift freely given, you and whoever gave it to you receive a three-dice penalty from any pools used for any actions against one another for the remainder of that night.",
            },
            {
                dot: 3,
                name: "Treat Yourself",
                description: "Once a night, you can indulge in a meal, a cigar, an alcoholic drink, or a sexual tryst just as a human would, regardless of any penalties Humanity might inflict and incurring no negative effects in terms of Hunger. Your consumption appears convincingly human to anyone paying attention.",
            },
            {
                dot: 4,
                name: "My Setite Friend",
                description: "Your bloodline has a strange relationship with the Ministry, with a lot of overlap in interest. You have a connection with the Ministry, whether it's a wayward member or another Follower of Set. You can ask your friend for a favor once per story, equivalent to three dots in appropriate Backgrounds such as Allies, Influence, and Resources.",
            },
            {
                dot: 5,
                name: "The Silk Hat",
                description: "No one is entirely sure who the Bloody Doctor is, but they know you have his favor and are next in line to his practice. Before you accept the role, you have the effect of Mawla at five dots, though the help comes in cryptic ways and via mysterious actions.",
            },
        ],
    },
    {
        id: "harbingers-of-ashur",
        name: "Harbingers of Ashur",
        source: "players-guide",
        requiresStPermission: true,
        clanRestriction: ["Hecata"],
        dots: [
            {
                dot: 1,
                name: "The Ashen Mask",
                description: "You don a plain mask made of ash wood — you respect the Harbinger traditions but care more about studying death than status or revenge. If a Touchstone of yours is dead or dies after purchase, studying their corpse allows you to transfer the Conviction they represent to another mortal. If they actually died peacefully, gain a one-die bonus to the Humanity test. If anyone else interferes with the corpse, test against fury frenzy at Difficulty 3.",
            },
            {
                dot: 2,
                name: "The Gold Mask",
                description: "You don a rose gold mask, striving to balance existence between the living and the dead. You have the capacity to hide your actions and those of your coterie as you explore death. You have the equivalent of four dots of Influence when attempting to cover up a death.",
            },
            {
                dot: 3,
                name: "The White Mask",
                description: "You don a bone-white mask, the mask of a respected Harbinger lost in a historic purge. You speak for the elders of your bloodline, and most Harbingers — and even other Hecata — listen to you. You add three dice to any social roll against another Harbinger, and two dice to any social roll against another Hecata.",
            },
            {
                dot: 4,
                name: "The Obsidian Mask",
                description: "You don a polished black mask — you are truly half-dead, a wraith that has inhabited a vampire's body. You may learn Oblivion Ceremonies without a teacher (half the training time if you have one) due to your experience in the Underworld. You are vulnerable to effects targeting ghosts, suffering a two-dice penalty to resist them, but gain a two-dice bonus resisting effects that control your physical shell such as Dominate.",
            },
            {
                dot: 5,
                name: "The Lazarene Mask",
                description: "You don the mask engraved in the image of one of the clan founders, for you know the true secret of the Harbingers: their crusade was never solely about destroying the Giovanni, but annihilating all who serve the Clan of Death. You incur no stains for any action taken in the pursuit of killing another Hecata Kindred or any character who serves the Hecata.",
            },
        ],
    },
    {
        id: "la-famiglia-giovanni",
        name: "La Famiglia Giovanni",
        source: "players-guide",
        requiresStPermission: true,
        clanRestriction: ["Hecata"],
        dots: [
            {
                dot: 1,
                name: "A Cousin's Ear",
                description: "Even if family members hate each other, they live by a code to share information — that's how they've survived everything from the fall of the Roman Empire to the Second Inquisition. Once per session, you can ask a direct question of another Giovanni family member and get a straight answer, though you must answer a question in return. Once per story, ask a favor of mortal family members as if you had the Allies Background at three dots.",
            },
            {
                dot: 2,
                name: "Faded Glamor",
                description: "Being a Giovanni still means something, even if it's no longer your clan's name. Old habits die hard, and the instinct to obey is still ingrained in much of the Clan of Death. Once per session, you can add one automatic success to any social roll against another Hecata Kindred, ghoul, or retainer.",
            },
            {
                dot: 3,
                name: "Petty Cash",
                description: "The Giovanni started as merchants and still know the power of cold, hard cash. As one of the favored childer of the family, you have access to a substantial bank account. You get four dots to spread among the Resources and Retainers Backgrounds for free, though these dots can be pulled back by elder members of the family at any time, especially if you cross them.",
            },
            {
                dot: 4,
                name: "Spectre Servant",
                description: "The family excels at enslaving the spirits of the dead to their will. You have inherited or personally captured a spectre to act as your servant. This Ally uses the spectre stats. The spectre wants nothing more than to break the leash and devour your spirit — until then, it can be summoned once per session and arrives within 10 hours.",
            },
            {
                dot: 5,
                name: "Aspiring Anziano",
                description: "You have worked your way through the hidden politics of the Family Reunion and come out on top — through political skill, ruthless zeal, and knowing where the bodies are buried in every sense. You get five dots of Status among the Hecata and can get a private audience with the Capuchin every few stories. Don't push your luck.",
            },
        ],
    },

    // ── Gehenna War Loresheets ────────────────────────────────────────────────
    {
        id: "tegyrius-the-vizier",
        name: "Tegyrius the Vizier",
        source: "gehenna-war",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "The Art of Negotiation",
                description: "As a skilled diplomat, advisor, or negotiator reflecting the legacy of Tegyrius, when you mediate between two opposing individuals or groups you receive a two-dice bonus to Intimidation or Persuasion skill tests.",
            },
            {
                dot: 2,
                name: "The Pen is Mightier",
                description: "Following in the footsteps of Tegyrius, you value knowledge and hone your mental abilities as much as your fighting skills. You have access to a Banu Haqim library transplanted from Alamut during the Schism — a two-dot Haven (••) with a two-dot Library (••) — but its contents are sought by one of the Shepherds of Ur-Shulgi, counting as a two-dot Adversary.",
            },
            {
                dot: 3,
                name: "Hear My Words",
                description: "You are a known ally of Tegyrius, and when you speak, others listen. As a source of wisdom and restraint, you get three additional dice for any social test against a Banu Haqim of the same sect, and two additional dice for any social test against a Banu Haqim of a different sect.",
            },
            {
                dot: 4,
                name: "Perception is Power",
                description: "You sat on the Council of Scrolls in Alamut, and under Tegyrius' guidance learned that one cannot fight what one cannot see. You have access to the Auspex Discipline and may buy dots using experience points as if it were one of your clan Disciplines.",
            },
            {
                dot: 5,
                name: "A Matter of Honor",
                description: "Not only were you a guest of honor at the Vermillion Wedding, but Tegyrius himself owes you a debt of gratitude. Once per chronicle, Tegyrius functions as a five-dot Mawla and uses his lofty position to aid you as best he can, short of violating the alliance between the Camarilla and the Ashirra.",
            },
        ],
    },
    {
        id: "the-eternal-arena",
        name: "The Eternal Arena",
        source: "gehenna-war",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Bloody Ancestry",
                description: "You trail methuselahs by tracking their descendants. You own and maintain notes on vampiric ancestry concerning vampires in your region in physical or digital form. You receive a +2 dice bonus to all Occult tests when investigating the ancestry of any vampire.",
            },
            {
                dot: 2,
                name: "Bring It On",
                description: "You've fought at the Eternal Arena or a similar Kindred blood tournament. Once per story, you can goad a target into a physical fight with you — for the rest of the scene, they'll engage in combat with only you. Targets that would put themselves in lethal danger by doing this must first be bested in a Charisma + Brawl vs. Composure + Insight test.",
            },
            {
                dot: 3,
                name: "Combat Analysis",
                description: "Blood sports require a tactical mind. Once per session during a physical conflict, you may make an Intelligence + Awareness test at Difficulty 3 before making an attack. On a win, you receive two additional dice on your next physical attack action.",
            },
            {
                dot: 4,
                name: "Talented Manager",
                description: "You're an organizer or coach in an underground fight club or gathering of Kindred pugilists. Once per session, when you lead a group through a fight involving Brawl or Melee, you gain four bonus dice on any Leadership tests.",
            },
            {
                dot: 5,
                name: "Die Hard",
                description: "In your time in the pit, you've brushed up against final death many times. Once per story, when you face final death due to violent conflict or act, you survive — as long as you can describe how it happened and the Storyteller agrees it is plausible. This does not mend any more damage than is absolutely required to survive, nor does it guarantee you won't end up in worse hands.",
            },
        ],
    },
    {
        id: "beckett",
        name: "Beckett",
        source: "gehenna-war",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Bloody Ancestry",
                description: "You trail methuselahs by tracking their descendants. You own and maintain notes on vampiric ancestry concerning vampires in your region in physical or digital form. You receive a +2 dice bonus to all Occult tests when investigating the ancestry of any vampire.",
            },
            {
                dot: 2,
                name: "Dream Interpreter",
                description: "Methuselahs and older vampires sometimes communicate to their progeny through the daysleep. Once per story, when a character tells you a dream, you may make an Intelligence + Occult test at Difficulty 2. On a win, you receive a number of actionable facts from your Storyteller equivalent to one plus the margin of win.",
            },
            {
                dot: 3,
                name: "Perks of Youth",
                description: "From your contact with Beckett, you've learned that those with knowledge are targets for manipulation by older Kindred. Once per session, when a vampire of higher Blood Potency uses a supernatural coercive power on you, you receive a two-dice bonus to resist it.",
            },
            {
                dot: 4,
                name: "Ancestor Cult's Favor",
                description: "You've entered the good graces of a cult worshiping a methuselah. Assign six dots in any way you like to the following Backgrounds: Influence, Haven, Herd, Resources, Retainers, or Status. You keep these benefits as long as you obey at least one of their requests once per story.",
            },
            {
                dot: 5,
                name: "Face to Face",
                description: "If you seek out the Ancients, you risk finding them. Once per story, when facing a methuselah or elder, you can make an Intelligence + Occult test at Difficulty 4. On a success, you recollect a detail that prompts the vampire to answer a single question about their own past or the Kindred of bygone eras truthfully — at least from their own perspective — as long as it doesn't significantly jeopardize them or their plans.",
            },
        ],
    },

    // ── In Memoriam Loresheets ────────────────────────────────────────────────
    {
        id: "birth-of-the-anarch-free-states",
        name: "Birth of the Anarch Free States",
        source: "in-memoriam",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Fake Revolutionary",
                description: "You've been telling people stories of your exploits in Los Angeles in the first nights of the Revolt — they're not true, but you'll take the status that comes with it. Gain a bonus die to all attempts to rally, cajole, and manipulate Anarchs. However, if you meet someone who genuinely was in Los Angeles at that time, you must succeed at a Manipulation + Subterfuge test (Difficulty 4) to convince them of your claim.",
            },
            {
                dot: 2,
                name: "Connections",
                description: "You were not there for the Revolt, but you know someone who was. Once per story, you can contact them and ask a question related to Anarch politics or the history of the Free States and get an honest answer.",
            },
            {
                dot: 3,
                name: "Original Rebel",
                description: "You were in Los Angeles at the time of the Second Anarch Revolt and fought to free your city from Camarilla oppression. You know how to rebel and receive a bonus die to all tests involving a revolution against Camarilla hegemony.",
            },
            {
                dot: 4,
                name: "Hero of the Revolution",
                description: "You were pivotal to the success of the Revolt and your compatriots know it. Once per story, you may call on former allies to summon an Anarch gang to your aid — five neonates, each with 4 dots in Disciplines (no power higher than level three) and a General Difficulty of 4/3. They only help if the action can be presented as part of the righteous struggle against the Camarilla.",
            },
            {
                dot: 5,
                name: "Legacy of the Revolution",
                description: "What has happened before can happen again. Once per chronicle, you can ignite a proper, domain-wide Anarch Revolt in any city you visit, subject to Storyteller approval. The Revolt has a decent chance of success, but you will need to participate in decisive battles and risk your unlife to see it through.",
            },
        ],
    },
    {
        id: "childe-of-the-revolution",
        name: "Childe of the Revolution",
        source: "in-memoriam",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Rousing Speech",
                description: "You underwent a time of unique political change and breathed an atmosphere of contestation. When arguing in favor of going against the established order, you can add two dice to a Persuasion or Leadership test.",
            },
            {
                dot: 2,
                name: "Under the Guillotine",
                description: "You participated in frantic celebrations under the Guillotine, where people slathered themselves with blood, and learned to keep a cool head amid complete crowd chaos. Once per story, you may reroll a failed Hunger Frenzy test.",
            },
            {
                dot: 3,
                name: "Bal des Victimes",
                description: "You attended the famed Bal des Victimes, where mourners of revolutionary violence connected over shared grief. You get +2 dice on social tests if you find a way to connect to your target through grief, or +3 if the target was another Bal des Victimes participant.",
            },
            {
                dot: 4,
                name: "Friend of Beaumont",
                description: "You were close to Félicien Beaumont and helped him advance his political agenda in the heat of the Revolution, remaining in his circle of proteges ever since. Beaumont counts as a five-dot Mawla, but once per story he'll request something from you in return, the equivalence of one minor boon.",
            },
            {
                dot: 5,
                name: "Bohemian Affinities",
                description: "Your influence with the reformist Revolutionary faction is extensive — you provided help to their cause or were Embraced in their group. You get five dots to distribute among Haven, Contacts, and Resources, and can access the Halls of Montmartre as a hideout from time to time.",
            },
        ],
    },
    {
        id: "descendant-of-dracula",
        name: "Descendant of Dracula",
        source: "in-memoriam",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Blood of the Dragon",
                description: "Your vitae carries a hint of Dracula's legendary strength. Once per story, you can amplify your physical prowess, gaining an additional die to all Physical tests for one scene.",
            },
            {
                dot: 2,
                name: "Of the Earth",
                description: "Your connection to the land is profound. Once per story, you can dig yourself down in the ground to mend all levels of Aggravated Willpower or Physical damage over 48 hours. The use of Earth Meld is optimal, though a shovel is permissible.",
            },
            {
                dot: 3,
                name: "Charisma of the Count",
                description: "Your lineage grants you an otherworldly charm. You gain a free specialty in Persuasion and receive a bonus die to all tests involving seduction or charm.",
            },
            {
                dot: 4,
                name: "Whispers in the Blood",
                description: "Vlad has taught himself countless Disciplines, and your Blood is full of potential and unawakened powers. Once per story, you may use any power you don't already know as long as it is at a current or lower level of a Discipline you already have levels in.",
            },
            {
                dot: 5,
                name: "Dracula's Chosen",
                description: "Among the descendants of the Dragon, you're considered the main heir. You gain the grudging respect and jealousy of your bloodline. Once per story, you can call in a favor equivalent to up to a major boon from your relations — though your relatives will expect you to favor them in turn, or at least prove yourself worthy of the title.",
            },
        ],
    },
    {
        id: "order-of-repentants",
        name: "The Order of Repentants",
        source: "in-memoriam",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Sponsorship",
                description: "Repenting is easier with someone to support you and keep you focused on the horrors you've committed. You gain a three-dot Mawla from the Order who'll help you once per story. They may also interfere in other ways if they hear of you straying from your path.",
            },
            {
                dot: 2,
                name: "Surface Empathy",
                description: "Being part of a community that requires you to lay bare your worst regrets has taught you to look beyond the surface. Once per session, you get +2 dice in an Insight or Persuasion test.",
            },
            {
                dot: 3,
                name: "Flagellation",
                description: "Self-punishment is the key to keeping the Beast in check. You get one extra die to resist Frenzy but must severely punish yourself for it later that night, inflicting 1 Aggravated damage. If you forget, you automatically fail your next Frenzy test.",
            },
            {
                dot: 4,
                name: "Superior Focus",
                description: "Monastic methods of self-regulation have taught you to focus on what you want, whether obsessing over your own evil or moving toward a goal. You can reroll one bestial failure roll per story without sacrificing Willpower.",
            },
            {
                dot: 5,
                name: "Benevolence",
                description: "You are devoted to saving your immortal soul, or at least acting as though you could. You can reroll one failed Remorse test per story, or let another player reroll theirs.",
            },
        ],
    },
    {
        id: "the-red-lady",
        name: "The Red Lady",
        source: "in-memoriam",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "You Gotta Know Somebody",
                description: "You have a contact who can get you into one of the Red Lady's famous parties.",
            },
            {
                dot: 2,
                name: "Person of Interest",
                description: "The Red Lady is known for her tastes in younger Kindred, and you happen to possess some quality she currently favors. Add one die in Charisma tests when in her presence or toward her partygoers.",
            },
            {
                dot: 3,
                name: "A Pretty Pet",
                description: "To be one of the Red Lady's favorites comes with a long list of perks, as she happily shares her vast resources. You are one of her current pets. She is the equivalent of a two-dot Mawla, and you also gain a dot in Herd and one in Resources. These dots stay as long as you have her good graces.",
            },
            {
                dot: 4,
                name: "A Trusted Friend",
                description: "You are one of her recruiters and a trusted enforcer of her will. Once per story, the Red Lady will attend one of your gatherings and grant you a favor as a token of your glorious mutual history. When this occurs, also add one dot in Status (Camarilla).",
            },
            {
                dot: 5,
                name: "Red Haze",
                description: "The Red Lady's tastes range from the pedestrian to the forbidden — the amaranth. Not wanting to display telltale signs of a murderous appetite, she has had a devoted acolyte develop a method to remove these pesky marks. Once per story, the Red Lady will cleanse your Blood and aura of any evidence of diablerie.",
            },
        ],
    },
    {
        id: "the-vanderbilt-ventrue",
        name: "The Vanderbilt Ventrue",
        source: "in-memoriam",
        requiresStPermission: true,
        clanRestriction: ["Ventrue"],
        dots: [
            {
                dot: 1,
                name: "Well-connected",
                description: "You are a cousin or descendant of the Vanderbilt Ventrue. Once per story, you can call upon a distant relative for a minor favor — access to a social event, a small financial loan, or a recommendation from someone influential.",
            },
            {
                dot: 2,
                name: "Financial Problem-solving",
                description: "Gain an additional dot in Resources. Additionally, you can spend a level of Willpower to gain a temporary Retainer (such as a private investigator, legal counsel, or mortal bodyguard) for the duration of the story.",
            },
            {
                dot: 3,
                name: "Someone of Worth",
                description: "You were one of the Four Hundred, the crème de la crème of fashionable New York society. Gain an extra die in Social tests when interacting with high society figures, both mortal and Kindred. Additionally, you have a knack for reading social situations, allowing an extra die to gauge someone's intentions regardless of their status.",
            },
            {
                dot: 4,
                name: "In the Know",
                description: "You became privy to some of the most closely guarded secrets in the Vanderbilt inner circle. Once per story, you can blackmail a suitable ancilla or elder Storyteller character — even antagonists. You can attempt an additional victim but must succeed at Manipulation + Intimidation or Persuasion at Difficulty 5. The consequence of failure is never mild.",
            },
            {
                dot: 5,
                name: "Ancient Pact",
                description: "You know the occult ritual William Henry and Alva Vanderbilt performed to double the family fortune and can perform it yourself. It requires the sacrifice of a mortal of great promise (a rare Dyscrasia). If performed, you gain +2 successes on any test connected to finances or financial crime. However, you get −1 die to all tests that would incur final death if failed. The pact lasts for a story and must then be renewed.",
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
