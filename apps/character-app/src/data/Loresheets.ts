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

    // ── Tattered Facade Loresheets ────────────────────────────────────────────
    {
        id: "descendant-of-the-ankou",
        name: "Descendant of the Ankou",
        source: "tattered-facade",
        requiresStPermission: true,
        clanRestriction: ["Malkavian"],
        dots: [
            {
                dot: 1,
                name: "Bleed Them Dry",
                description: "You gain three of the following specialties: a fangs specialty for Brawl, a blades specialty for Melee, a blood specialty for Occult, or a hematology specialty for Science. These ignore the normal specialty limits and you benefit even if you have no dots in the Skill. Your penchant for bloody work leaves every Haven you occupy with the Creepy Flaw.",
            },
            {
                dot: 2,
                name: "Crimson Visionary",
                description: "You learn Oblivion at the in-clan rate without needing to drink another Kindred's Blood. However, your first Oblivion power must relate to perception or gaining information (e.g., Oblivion's Sight, Fatal Prediction, Shadow Perspective). You must have two such powers by your third, and three by your fifth. Upon learning your first dot of Oblivion, you gain a one-dot Folkloric Bane or Block Flaw.",
            },
            {
                dot: 3,
                name: "Bloody Work",
                description: "Add a two-die bonus to any Auspex dice pool or Occult dice pools for Rituals or Ceremonies designed to gain information, so long as you spill at least two additional Rouse Check's worth of human blood or kill an animal. The spilled blood cannot slake any Hunger. You may still use a Blood Surge on the same test.",
            },
            {
                dot: 4,
                name: "Focus of Clarity",
                description: "You have an object — high quality, antique, or cutting edge — that helps you focus on your craft and resist the Beast. Choose one Skill. Once per session when you use that object in conjunction with that Skill, you may change a single 1 or 10 on a Hunger die to a failure, potentially avoiding a Messy Critical or Bestial Failure. A suitable replacement cannot be found until the start of the next story if it is lost or destroyed.",
            },
            {
                dot: 5,
                name: "The Prophet of Death Reborn",
                description: "Your visions have brought you local renown. Luminaries — mortal and Kindred alike — seek you out for your prophecies. At the start of each story, you can temporarily gain two dots of Contacts, Influence, Resources, or a minor Boon from a local Kindred, callable once during that story.",
            },
        ],
    },
    {
        id: "descendant-of-baron-vollgirre",
        name: "Descendant of Baron Vollgirre",
        source: "tattered-facade",
        requiresStPermission: true,
        clanRestriction: ["Toreador"],
        dots: [
            {
                dot: 1,
                name: "The Seven Arts",
                description: "Your curriculum of study has been passed down from Baron Vollgirre's love of the classics. Choose three specialties for Academics, Crafts, Etiquette, Performance, Persuasion, Science, or Subterfuge related to grammar, logic, rhetoric, geometry, mathematics, astronomy, or music. These do not count towards the standard specialty limits and benefit you even without dots in the Skill. You also gain the Disliked Flaw.",
            },
            {
                dot: 2,
                name: "Prodigy of Flesh",
                description: "Vollgirre's Blood is infused with fleshcrafting. You learn Protean at in-clan costs without needing to drink another Kindred's Blood, and may use Presence in lieu of Dominate or Blood Sorcery when selecting Protean amalgams. Upon learning your second dot of Protean you must select the Vicissitude Power; at your fourth dot you must select a Power with Vicissitude as a prerequisite. You gain Dark Secret (•): Vicissitude upon learning it.",
            },
            {
                dot: 3,
                name: "Sadistic Hunger",
                description: "Pain and fear help sustain you. Sadism slakes one additional Hunger so long as you deal 3 levels of damage to a vessel's Health or Willpower immediately before or during your feeding. This cannot reduce Hunger below your Blood Potency's limit, or below 1 unless you also drain the victim.",
            },
            {
                dot: 4,
                name: "Unusual Connections",
                description: "You maintain connections with one of those distrusted by the city. Gain a five-dot Mawla that is a current Sabbat member, another descendant of Vollgirre, or a Tzimisce. This connection awakens a yearning in your Blood to be bound — you gain either the Bondslave, Bond Junkie, or Long Bond Flaw, or lose any Bonding Merits you have.",
            },
            {
                dot: 5,
                name: "Voice of Treachery",
                description: "Your Blood causes those of similar bloodlines to cower before you. Once per story, while determining success in a social dice pool related to intimidation, torture, or influencing Sabbat members, Toreador, Tzimisce, or anyone possessing Vicissitude, you may set any one die you just rolled to a 10, even a Hunger die.",
            },
        ],
    },
    {
        id: "little-siblings",
        name: "Little Siblings (Rossellini)",
        source: "tattered-facade",
        requiresStPermission: true,
        clanRestriction: ["Hecata"],
        dots: [
            {
                dot: 1,
                name: "Grave Attitude",
                description: "Your experience commanding wraiths has led you to believe that even Kindred may eventually cross the Shroud. This certainty gives you peace. In any attempt to intimidate or manipulate you, your aggressors always suffer a one-die penalty, which stacks with other penalties.",
            },
            {
                dot: 2,
                name: "Ghostly Dominance",
                description: "You brook no tolerance for the pleas and threats of the intangible dead. When you damage a wraith's fetter, loved ones, or intangible form, you receive three bonus dice to any tests to command them.",
            },
            {
                dot: 3,
                name: "Necromantic Expertise",
                description: "You know Oblivion is more than a means to an end — it is a wondrous art that rewards patience and ruthlessness. When you perform an Oblivion Ceremony, decrease the Difficulty level by one.",
            },
            {
                dot: 4,
                name: "Stolen Will",
                description: "When you bite into the fetter of a ghost under your command hard enough to damage it or cause it injury, the fetter bleeds raw passions drawn from the ghost's corpus. Consuming this bitter substance heals a level of Aggravated or Superficial Willpower damage.",
            },
            {
                dot: 5,
                name: "Purge",
                description: "You shred ephemeral bodies with ease. Any attack made on a ghost always causes Aggravated Health damage, even outside of the lands of the dead. You are also capable of striking them when they are intangible.",
            },
        ],
    },

    // ── Blood Sigils Loresheets ───────────────────────────────────────────────
    {
        id: "descendant-of-al-ashrad",
        name: "Descendant of Al-Ashrad",
        source: "blood-sigils",
        requiresStPermission: true,
        clanRestriction: ["Banu Haqim"],
        dots: [
            {
                dot: 1,
                name: "Stories of Old",
                description: "You've learned from the stories passed down from al-Ashrad, and know how to apply those lessons in these nights. When you invoke the legacy of al-Ashrad and Haqim to motivate others, you receive a two-dice bonus to Leadership tests and contests.",
            },
            {
                dot: 2,
                name: "Sight Beyond Sight",
                description: "A fraction of al-Ashrad's legendary diamond eye power passed to you. Once per session, you (or your Storyteller) may use the Auspex power Sense the Unseen as if you had the Discipline, using your Blood Potency in place of Auspex when actively using it. If you already possess this power, you receive a +2 dice bonus when actively using it.",
            },
            {
                dot: 3,
                name: "Vengeful Sorcery",
                description: "You've never forgiven your clanmates for the Schism, and you channel your rage into your sorcery. Once per session, in a violent conflict you may take a two-dice bonus to use any Blood Sorcery power intended to harm another vampire.",
            },
            {
                dot: 4,
                name: "Banish the Intangible",
                description: "Al-Ashrad's hatred for malevolent spirits is legendary. Though incorporeal beings are not necessarily malevolent, they still cower when they realize whose blood you share. Any Blood Sorcery power or Ritual that brings harm to corporeal things also affects incorporeal creatures with the same effect.",
            },
            {
                dot: 5,
                name: "Amr-in-Waiting",
                description: "Al-Ashrad has chosen you to succeed him as Amr should he face final death before the schism is resolved and the sorcerers regain their place in the clan. Gain Status ••••• (Banu Haqim) and one free Ritual at your Blood Sorcery level or below. Gain Adversary ••• in the form of a leader of Ur-Shulgi's blood sorcerers and your brother-in-blood.",
            },
        ],
    },
    {
        id: "student-of-kirin-taunk",
        name: "Student of Kirin Taunk",
        source: "blood-sigils",
        requiresStPermission: true,
        clanRestriction: ["Thin-Blood"],
        dots: [
            {
                dot: 1,
                name: "Stunning Efficiency",
                description: "Kirin Taunk's brewing speed was legendary. You've matched it, and surpassing it is within sight. All distillation times for formulae are halved.",
            },
            {
                dot: 2,
                name: "Professional Mindset",
                description: "Studying Taunk's life taught you to let your work speak for itself. Once per session and at the Storyteller's discretion, you may use your dot rating in Thin-Blood Alchemy in lieu of any Social skill at a lower rating.",
            },
            {
                dot: 3,
                name: "A Taunk Formula",
                description: "Through hard work or a great deal, you've obtained a sliver of Kirin Taunk's alchemical notes. Choose one formula of any level — you may purchase it with no experience cost, though you cannot use it until your Thin-Blood Alchemy reaches its level. Add two dice to your Distillation roll for that formula.",
            },
            {
                dot: 4,
                name: "Diplomatic Power",
                description: "Kirin Taunk was a social force of nature, capable of fitting in amongst Camarilla and Anarch alike. You carry yourself with enough grace and charm that these divisions mean little to you. You have Status •• (Camarilla) and Status •• (Anarch).",
            },
            {
                dot: 5,
                name: "Taunk's Patron",
                description: "Kirin's mysterious benefactor took an interest in you, and still has it to this night. Gain Mawla ••••• (Taunk's Patron). Every story, pick three formulae you know — if your Mawla approves of your actions, they send rare or magically potent ingredients that give each formula a two-dice bonus to the Distillation roll. Your Storyteller creates the patron's identity and may reveal it at their leisure.",
            },
        ],
    },
    {
        id: "veins-of-the-earth",
        name: "Veins of the Earth",
        source: "blood-sigils",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Seeking a Vein",
                description: "You've developed a knack for finding weird things, and you now realize it's because you just know where the planet's blood converges. Once per story at the Storyteller's discretion, you may declare that the location you are on is a furcus — a place of converging earth energy.",
            },
            {
                dot: 2,
                name: "Drawing the Flies",
                description: "Some kine are drawn to the venae terrae just like you are. You've gotten to know quite a few people seeking out the planet's energies, and they seek your knowledge for a small price in return. Gain Herd ••• representing this group — but without new and interesting information about Tiamat's coils, they could fall away.",
            },
            {
                dot: 3,
                name: "Revelations of the Earth",
                description: "You listen to the veins of the Earth and hear who passes along them. Once per session, when you meditate for at least a half hour on a furcus, you may ask the Storyteller one question about one Kindred's location, direction of movement, and speed at that moment. The Storyteller answers truthfully. The venae cannot locate a Kindred who is in the air at that moment.",
            },
            {
                dot: 4,
                name: "Channeling the Earth",
                description: "You know how to use the planet's power for your own benefit. Once per session, when you meditate for at least a half hour on a furcus, add one die to a Discipline pool in addition to any provided by Blood Potency.",
            },
            {
                dot: 5,
                name: "Tiamat's Exchange",
                description: "Your knowledge of the veins of the Earth is so great that it feels like the Blood Serpent itself blesses you — for a price. Once per story, if you provide a large (human-sized or larger) offering of flesh or blood to a furcus at the beginning of the story, you may automatically gain three additional successes on a test or contest of your choosing.",
            },
        ],
    },
    {
        id: "vienna-zero",
        name: "Vienna Zero",
        source: "blood-sigils",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Inside Knowledge",
                description: "Requires Blood Sorcery. The knowledge you picked up from scavenging Vienna Zero is invaluable. When rolling Occult for anything related to blood craft, or when rolling Politics for anything related to the Tremere, you always have a +2 dice bonus.",
            },
            {
                dot: 2,
                name: "Off the Back of a Truck",
                description: "Some of the material officially destroyed from Vienna Zero ends up in your hands. Gain Contacts ••• (The Slow Drip), a disgruntled contractor from Vienna Zero who can sometimes source the good stuff if you've got something to offer.",
            },
            {
                dot: 3,
                name: "Instrument of Power",
                description: "Through a friend of a friend, you've gotten your hands on something special from Vienna Zero. Agree with the Storyteller on one Artifact, and add a one-die bonus to your pool for whatever tests it requires. However, every session you use it, succeed on a Wits + Stealth test against Difficulty 3 or higher to avoid attracting attention from the Leopoldites, FIRSTLIGHT, or another Coalition force.",
            },
            {
                dot: 4,
                name: "The Very Last Copy",
                description: "By chance or incredible heist, you own the last remaining copy of a Tremere grimoire. Name the grimoire and name four rituals you do not yet know — these may be at any level. You can learn these rituals without a teacher at half the learning time. Experience cost remains the same.",
            },
            {
                dot: 5,
                name: "Deep Clearance",
                description: "You're not just read in on Vienna Zero — you're a valued member of the team. Gain Mask ••• (Zeroed) and describe your place on the excavation project. Once per story, you may take one artifact from the Vienna Zero site and use it as you wish, though the team will notice it's gone. You also have Enemy ••• (Effectiveness 3, Reliability 2) — a FIRSTLIGHT or St. Leopold team member who suspects your true nature.",
            },
        ],
    },

    // ── Cults of the Blood Gods Loresheets ───────────────────────────────────
    {
        id: "criminal-puttanesca",
        name: "The Criminal Puttanesca",
        source: "cults-of-the-blood-gods",
        requiresStPermission: true,
        clanRestriction: ["Hecata"],
        dots: [
            {
                dot: 1,
                name: "Friends in Low Places",
                description: "Puttanesca Kindred have close ties to the street and usually have a few side hustles happening at any one time. You get two dots to spread between Allies and Resources, and you can reallocate those two dots at the start of each story. These Advantages are immediately subject to police scrutiny.",
            },
            {
                dot: 2,
                name: "Show Your Belly",
                description: "Some members of your family survive by looking as harmless as possible to those more powerful than them. It's not dignified, but it buys time for revenge. You get three bonus dice to rolls to convince people not to hurt, endanger, or act against you.",
            },
            {
                dot: 3,
                name: "Show Your Fists",
                description: "On the other hand, it's not all being pushed around. Against mortals you get two bonus dice for rolls to intimidate, and your unarmed damage modifier increases by one.",
            },
            {
                dot: 4,
                name: "Get the Squad Together",
                description: "Occasionally you just need to get some people together for a good old ass-beating. Once per story, you can get a gang together for a brawl — any local Puttanesca Kindred plus mortals equivalent to five dots of Allies. You also get an automatic success in rolls to convince other characters that this beatdown is necessary.",
            },
            {
                dot: 5,
                name: "The Don",
                description: "Against all odds, you've kissed and kicked ass in equal measure to earn respect, wealth, and influence. You have three additional dots each in Contacts, Influence, and Resources, but they must be assigned to criminal enterprise and require careful maintenance to avoid drawing FBI attention — agents of which can become potent versions of the Enemy Flaw.",
            },
        ],
    },
    {
        id: "the-gorgons",
        name: "The Gorgons (Lamiae)",
        source: "cults-of-the-blood-gods",
        requiresStPermission: true,
        clanRestriction: ["Hecata"],
        dots: [
            {
                dot: 1,
                name: "The Serpent's Kiss",
                description: "The bite of the Lamiae was once believed fatal, spreading disease like the Black Death. These nights it is no longer fatal, but some remnants of the disease remain in your system. Once per story, you can choose to infect your mortal prey with disease, causing them one Aggravated Health damage every night for three nights. This ability has no effect on vampires.",
            },
            {
                dot: 2,
                name: "Protection",
                description: "You embody the original purpose of the Lamiae — protection of your charges, by any means necessary. You gain a two-dice bonus when using the Block maneuver to protect someone else.",
            },
            {
                dot: 3,
                name: "Four Humours",
                description: "Many ancient Lamiae practiced manipulation of the four humors to control a victim's body or mind. Once per story you may bite a mortal and inflict a two-dice penalty on all actions which don't immediately further their current resonance, until the end of the night or their resonance changes humors. If their blood contains a Dyscrasia, increase this penalty to three dice.",
            },
            {
                dot: 4,
                name: "Controlling the Beast",
                description: "Chaos and pain are key aspects of the Bahari faith, but mindless chaos does not lead to education. Once per session, you can convert a messy critical in combat into a critical.",
            },
            {
                dot: 5,
                name: "Medusa's Gaze",
                description: "Once per session after you win an Intimidation or conflict roll, those who lost become unable to act on the following conflict turn. Outside combat, they become unable to move for a scene unless they spend 1 Willpower.",
            },
        ],
    },
    {
        id: "calling-the-family-reunion",
        name: "Calling the Family Reunion",
        source: "cults-of-the-blood-gods",
        requiresStPermission: true,
        clanRestriction: ["Hecata"],
        dots: [
            {
                dot: 1,
                name: "The Kids' Table",
                description: "You were present at the dinner where the final details of the Reunion were discussed. You didn't significantly impact the discussion, but you know what was debated — all the old animosities and arguments. You get two dice on any Persuasion checks against another Hecata who tries to resurrect old disagreements.",
            },
            {
                dot: 2,
                name: "Updating the Rolodex",
                description: "Not everyone gets along in the new-and-improved Hecata, but since you were present during the initial dealmaking, you now have access to a lot of new contacts. When asking for information or small favors, you have the equivalent of three dots of Status within the Hecata clan.",
            },
            {
                dot: 3,
                name: "Hiding the Bodies",
                description: "You were involved in the cleanup of a key murder, and a Hecata elder is greatly in your debt as a result. Once per story, you may remind them of that debt to cash in the effects of a minor boon or less. Once per chronicle, you may clear the debt in return for the effects of a major boon. Call upon them more often than that and they will become a persistent Adversary once your business concludes.",
            },
            {
                dot: 4,
                name: "Dealmaker",
                description: "You were part of one of the backroom deals that made the Hecata reunification possible, and an influential elder owes you as a result. That elder counts as a five-dot Mawla Background but will become a potent Adversary if the secrets are ever revealed.",
            },
            {
                dot: 5,
                name: "Spiritual Assault",
                description: "You were involved in the murder of Augustus Giovanni, the methuselah responsible for the alleged destruction of the Cappadocians — and you know it was his death that unleashed the maelstrom of wraiths coming after the Hecata. Anytime you or someone who consults you uses an Oblivion Ceremony to deal with a spectre or other antagonistic ghost, you gain two automatic successes.",
            },
        ],
    },
    {
        id: "child-of-the-angel-michael",
        name: "Child of the Angel Michael",
        source: "cults-of-the-blood-gods",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "The Great and the Good",
                description: "Note: Unavailable to Nosferatu characters. Even just being around perfect and beautiful people has its advantages. You have two free dots to distribute between the Contacts, Fame, Herd, and Influence Backgrounds, though the kinds of followers you attract verge on the fanatical and dangerous to you and your loved ones.",
            },
            {
                dot: 2,
                name: "Outer Beauty",
                description: "Your trips to the local Nephilim temple and accentuation of your inner beauty lead to outer effects — clear skin, lustrous hair, long and firm limbs. You get the Looks Merit at four dots, even after character creation. The downside is you must really disguise your appearance if you want to avoid attention; your face will be the one witnesses remember.",
            },
            {
                dot: 3,
                name: "Hedonistic Pleasure",
                description: "Lots of long nights of excess have taught you a thing or two about having a good time. You gain two dice on any rolls to score drugs, get a date or sexual partner, or get yourself invited to a party. In addition, your exploits are legendary — take either two dots in Fame or two dots in Status.",
            },
            {
                dot: 4,
                name: "Michael's Calling",
                description: "You've been in past cults worshiping the childer of Michael and see all of these fringe cults as the sham they are — but that won't stop you from leveraging them for your own gain. Once per story, you can use all of a cult member's appropriate Backgrounds as if they were your own.",
            },
            {
                dot: 5,
                name: "Wiping Away the Stains",
                description: "You haven't lost the true path toward inner beauty and enlightenment. Once per story, you can spend a Willpower to remove a Stain from another vampire. The vampire must have sex with you, do drugs with you, or engage in some other hedonistic activity for at least an hour.",
            },
        ],
    },
    {
        id: "servitor-of-irad",
        name: "Servitor of Irad",
        source: "cults-of-the-blood-gods",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Shield of Irad",
                description: "You can't do the work of the Antediluvians if you get discovered. You have a lot of experience shielding your true intentions from the gaze of outsiders. You gain an additional die on rolls involving lying to other Kindred.",
            },
            {
                dot: 2,
                name: "Sword of Irad",
                description: "Sometimes you must act decisively in the name of the Third Generation, and that conviction adds strength to your act. Once per story, you can add three dice to a roll that is integral to your cult's plans.",
            },
            {
                dot: 3,
                name: "Know the Will of the Ancients",
                description: "You are firmly convinced you know the will of the Antediluvians — perhaps you hear their voices or gain prophetic dreams. As long as you are a member of the cult, you can take an additional Conviction directly related to the goals of your infiltration (your membership acts as your Touchstone for this Conviction). If you infiltrate a new group, you can change your Conviction to reflect the new assignment.",
            },
            {
                dot: 4,
                name: "Do the Will of the Ancients",
                description: "All actions are in service to the Third Generation. You have devoted your entire existence to fulfilling their goal. The blood you have inherited from your clan founder is secondary to this higher purpose — your clan Bane can be ignored once per story while you are a Servitor of Irad.",
            },
            {
                dot: 5,
                name: "Kill Thy Brother",
                description: "Killing another vampire in the name of the Antediluvians just makes the Third Generation's job a little easier. Once per story, when using a weapon or power that inflicts Aggravated Health damage on a vampire, your attack inflicts two additional damage, and you don't need to roll to resist frenzy if that weapon or power involves fire.",
            },
        ],
    },
    {
        id: "promise-of-1528",
        name: "The Promise of 1528",
        source: "cults-of-the-blood-gods",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Legal Scholar",
                description: "You are an active student of the Promise. You don't know much, but that's more than most Kindred know — even knowing such a document exists gives you leverage. In legal disputes with Camarilla Kindred or members of the Hecata, you gain two dice on Persuasion rolls.",
            },
            {
                dot: 2,
                name: "Scrap of Information",
                description: "You saw a scrap of a transcript of the Promise once — and you're reasonably sure this one is genuine. Once per story, if you allow Kindred access to your notes on the Promise fragment for research, you gain a temporary dot in Contacts, Herd, Influence, or Resources for the remainder of the story, and may call in a major boon from the vampire in future.",
            },
            {
                dot: 3,
                name: "Tick Tock",
                description: "You know, or believe you know, the consequences of allowing the Promise to expire — and they aren't good. Once per story, you can give advice to members of your local faction and expect to be taken seriously. You will get an audience, and two automatic successes on any rolls which leverage your knowledge during the meeting.",
            },
            {
                dot: 4,
                name: "Faulty Memory",
                description: "You read the Promise once, but for some reason you can never recall the text in full, even with powers that would normally unlock buried memories. But once in a while, snippets surface at just the right time. Once per story, you can add three dice to an appropriate roll where memory of the Promise would help you.",
            },
            {
                dot: 5,
                name: "Signatory",
                description: "You are directly related to one of the signatories of the Promise — or you are a signatory yourself. Once per chronicle, you can leverage your knowledge of the Promise to force a Camarilla Prince or a Hecata anziani to permanently change a ruling or local law in your favor. However, you must decide why you are unable to ever speak of the details of the Promise — perhaps a thaumaturgical compulsion, a loved one's spirit held hostage, or extensive Dominate.",
            },
        ],
    },

    // ── Chicago Folios Loresheets ────────────────────────────────────────────
    {
        id: "archons",
        name: "Archons",
        source: "chicago-folios",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Undercover",
                description:
                    "You perform your work undercover, assuming a false identity to get close to your prey. You maintain a false identity as a minor member of the faction you are investigating and gain one bonus die to all rolls related to maintaining your cover. This advantage may be purchased multiple times to represent a range of false identities.",
            },
            {
                dot: 2,
                name: "Watcher in the Dark",
                description:
                    "You have access to a vast repository of Camarilla contacts, records, and informants when prosecuting your duties. Once per chapter, you gain two automatic successes on any Investigation or Academics test concerning the subject of your investigation.",
            },
            {
                dot: 3,
                name: "Red Phone",
                description:
                    "You have a reliable way of contacting your patron Justicar. Their response varies depending on their current workload and can range from silence, to providing valuable information, exerting political influence, or even deployment of further Archons. The precise game effects are up to the Storyteller.",
            },
            {
                dot: 4,
                name: "Color of Authority",
                description:
                    "Your Status as a duly appointed Archon of the Camarilla gives you sweeping powers, including the right of destruction. You may sit in, and pronounce formal judgement over, any Camarilla Kindred without retaliation from your fellow sect members. You hold the equivalent of four dots of Status in most Camarilla domains, but stand the risk of earning Adversaries if you judge other Kindred arbitrarily.",
            },
            {
                dot: 5,
                name: "Justicar's Blood",
                description:
                    "You have access to the potent vitae of the Justicar you serve and are authorized to use it in the line of duty. You gain three bonus dice for rolls related to one of the three clan Disciplines (player's choice) of your patron Justicar for the remainder of the night. You may use this once per story.",
            },
        ],
    },
    {
        id: "convention-of-chicago",
        name: "The Convention of Chicago",
        source: "chicago-folios",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Rabble Rouser",
                description:
                    "You managed to disrupt one of the convention's important after parties, embarrassing the host and damaging the status of multiple Kindred. Once per story, you can assemble a small group of fledgling Anarchs to your cause. They count as a three-dot Ally group that will perform one dangerous action for you once per story.",
            },
            {
                dot: 2,
                name: "Convention Attendee",
                description:
                    "You attended the convention and navigated its web of intrigue successfully. Gain two dots to distribute between Allies and Contacts, and once per story ask the Storyteller for a piece of information related to the convention — either public record or a behind-the-scenes detail.",
            },
            {
                dot: 3,
                name: "Troubleshooter",
                description:
                    "You are an agent of Prince Jackson, the Archons, or some other group whose best interests were served by the convention's success. Gain two dots of Status among the Kindred of Chicago and a 'get out of jail free' card from the Prince. Once per chronicle, the authorities of your domain turn a blind eye toward a minor violation of the Traditions.",
            },
            {
                dot: 4,
                name: "Formal Delegate",
                description:
                    "You were one of the formal delegates to the convention and successfully prosecuted the objectives of your patron Prince or Primogen. Gain four dots to distribute among Allies, Contacts, Retainers, and Resources related to the convention. You also have a standing invitation to Elysium events in Chicago or your home domain.",
            },
            {
                dot: 5,
                name: "Mover and Shaker",
                description:
                    "You played an active role in the Convention of Chicago's success and know who sleeps with who, which closets hide skeletons, and why that BMW trunk is moaning. Once per story, you can collect a Major Boon from a convention attendee in your debt. Work with the Storyteller to determine the identity of the Kindred and the nature of their aid.",
            },
        ],
    },
    {
        id: "descendant-of-menele",
        name: "Descendant of Menele",
        source: "chicago-folios",
        requiresStPermission: true,
        clanRestriction: ["Brujah"],
        dots: [
            {
                dot: 1,
                name: "Symposium",
                description:
                    "Menele always liked a good argument and sired many childer after debating the mysteries of life. All of your Persuasion rolls gain the ability of a single die reroll.",
            },
            {
                dot: 2,
                name: "Carthago Delenda Est",
                description:
                    "Menele maintained an elaborate network of spies, informants, and retainers. His network fragmented upon his destruction, but you managed to claim a portion for your own. You have three dots to split between Retainers, Influence, Allies, and Resources — with the absolute certainty that Helena and her agents will attempt to take them from you.",
            },
            {
                dot: 3,
                name: "Know Thyself",
                description:
                    "Menele believed the Brujah needed to return to their roots as thinkers and positive agents of change. You are trained to resist the pull of your Brujah fury. Once per session, you can spend a Willpower point to re-roll a frenzy check affected by your Brujah clan bane.",
            },
            {
                dot: 4,
                name: "Knowledge is Power",
                description:
                    "Menele was impossibly old and held many secrets about the Kindred of Chicago and beyond. You were the steward of those secrets before the Beckoning drew him away. Once per story, you may request a single secret from the Storyteller about a clan or Kindred in Chicago or a similar domain that felt Menele's influence.",
            },
            {
                dot: 5,
                name: "The Greater Mysteries",
                description:
                    "Menele spent years learning meditative practices to perceive the astral plane. You inherited a portion of his ability and remain fully cognizant of your surroundings during your daily slumber. Reduce the difficulty of all Humanity tests to awaken during the day by two. Once per session, you may roll Resolve + Occult to interpret daytime visions; each success brings the vision into greater focus and the Storyteller may offer one cryptic hint relevant to your character.",
            },
        ],
    },
    {
        id: "goblin-roads",
        name: "Goblin Roads",
        source: "chicago-folios",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Night Rider",
                description:
                    "You are a frequent passenger on the Goblin Roads and have become accustomed to their nature. Your knowledge grants you two additional dice to all Survival tests related to surviving the Goblin Roads if you become isolated in the Weird.",
            },
            {
                dot: 2,
                name: "Summon the Ferryman",
                description:
                    "You have arranged passage on the Goblin Roads with Prince Decker, Rosa Hernandez, or one of their Psychopomps. The price can take the form of cash, a minor boon, or something else entirely (Storyteller's discretion). Once per story, you can enlist a Psychopomp to ferry yourself and your coterie between Chicago and Milwaukee.",
            },
            {
                dot: 3,
                name: "Psychopomp",
                description:
                    "You are a Psychopomp and travel the Goblin Roads at will. This journey requires 24 hours of preparation to attune yourself to the proper rites and sacrifices necessary for safe passage. You gain two dots of Status reflecting your occupation.",
            },
            {
                dot: 4,
                name: "Weird Ally",
                description:
                    "You led an expedition into the Weird or were separated from your Psychopomp for a protracted period. During that time you encountered and formed a pact with a supernatural denizen of the Weird. You gain a four-dot Ally that is a werewolf, mage, wraith, changeling, or something stranger still. Once per game, your Ally will come to your aid within 10 hours of your summons.",
            },
            {
                dot: 5,
                name: "One with the Weird",
                description:
                    "You spent many nights looking into the Weird, and one evening, it looked back. You have unraveled one of the deeper mysteries of the Weird — perhaps the hidden nature of the Goblin Roads oasis, the true name of a powerful spirit, a potent ritual, the dark secret of a mist-shrouded town, or the location of an artifact of great power. Work with the Storyteller to define its exact nature. The Weird does not reveal its secrets casually, and there will be a price.",
            },
        ],
    },
    {
        id: "justicar-lucinde",
        name: "Justicar Lucinde",
        source: "chicago-folios",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Snake Charmer",
                description:
                    "Lucinde bears a unique ire for members of the Ministry and knows them well. You gain one additional die for all Investigation rolls related to the Ministers.",
            },
            {
                dot: 2,
                name: "Patient Hunter",
                description:
                    "Lucinde's investigation skills are legendary, skills she imparted to you. Once per story, you automatically succeed on one Investigation test related to a member of the Anathema or other Kindred who poses a threat to the Camarilla. This success will point you in the right direction, though it may not reveal an immediate location.",
            },
            {
                dot: 3,
                name: "Legend Killer",
                description:
                    "You have destroyed, or participated in the destruction, of a member of the Red List. This fame (or notoriety) precedes you wherever you go and allows you to automatically succeed on one test per chronicle where the tale of this event might be of assistance.",
            },
            {
                dot: 4,
                name: "Lucinde's Revenge",
                description:
                    "Lucinde has begun instructing chosen Kindred in her astonishing resistance to Presence. Once per story, Lucinde's Revenge renders you immune to a single use of Presence wielded against you, as long as the vampire assailing you is of equal or higher generation. Vampires of a lower generation than you are unaffected by this ability.",
            },
            {
                dot: 5,
                name: "Alastor",
                description:
                    "You have joined Lucinde as an Alastor and hunt Kindred on the Red List. You operate under deep cover and enjoy immunity from prosecution by any Prince, reporting solely to the Camarilla's Inner Circle. You have a two-dot Mask and are Zeroed, plus three additional dice to resist all attempts to uncover your identity. Revealing your identity grants the equivalent of four dots of Status — but you have also earned the undying enmity of those who oppose the Camarilla, and an Anathema designated by the Storyteller hunts you as their Adversary.",
            },
        ],
    },
    {
        id: "khalid-al-rashid",
        name: "Khalid Al-Rashid",
        source: "chicago-folios",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Safe Haven",
                description:
                    "Khalid's tutelage provides two dots to divide between the Haven Merits of Postern and Security System.",
            },
            {
                dot: 2,
                name: "Deadly Stroke",
                description:
                    "Khalid was a master swordsman in life, and more so in death. You may have fought beside him during the War of Chicago or studied at his feet as your Mawla. Whenever you wield a sword, its damage rating increases by one.",
            },
            {
                dot: 3,
                name: "Khalid's Notebook",
                description:
                    "Khalid recorded his suspicions about the eternal war between Helena and Menele in a coded notebook, secreting pages about Chicago and beyond. You have acquired pages from this book. Once per story, you may ask the Storyteller for one secret Khalid would have access to about Helena, Menele, or the identity of a Kindred under their control.",
            },
            {
                dot: 4,
                name: "Wicked Garden",
                description:
                    "You learned from Khalid or discovered his notes about strange entities in Lake Michigan, including oblique references to the creature known as Nerissa Blackwater. Once per story, this knowledge reduces the difficulty of all Investigation tests involving Nerissa Blackwater or the being she serves by four. Total Failure means Nerissa becomes aware of your inquiry.",
            },
            {
                dot: 5,
                name: "Unbeholden",
                description:
                    "Khalid assembled a coterie of 'wild card' Kindred free from the influence of Helena and Menele. You are not presently under the control or dominion of Helena, Menele, or a similarly ancient vampire. Once per chronicle, you automatically escape one attempt by an ancient to ensnare you in their Jyhad. Work with the Storyteller to determine exactly how this feat occurs.",
            },
        ],
    },
    {
        id: "kindred-dueling",
        name: "Kindred Dueling",
        source: "chicago-folios",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Honorable Combatant",
                description:
                    "You are familiar with the rules, strictures, and customs of Kindred Dueling. You gain +2 dice to all Etiquette tests related to Kindred Dueling.",
            },
            {
                dot: 2,
                name: "Fight Club",
                description:
                    "You have established a flourishing Kindred dueling society in your domain. This society is a lucrative venture and excellent way for Kindred to settle their differences, but is frowned upon by the Prince and/or Primogen. Gain three dots to distribute between Resources, Allies, or Contacts reflecting the profits and connections made through your society.",
            },
            {
                dot: 3,
                name: "Stake Fighter",
                description:
                    "You honed your stake fighting skills to a razor's edge through years of Camarilla honor duels or Anarch street fights. You ignore the −2 penalty for called shots when attempting to stake another vampire.",
            },
            {
                dot: 4,
                name: "Fire Eater",
                description:
                    "Duels with torches and flaming brands are increasingly popular and have become a rite of passage for many Anarchs. Once per chapter, you can call upon your experience with fire duels, ignoring the regular provocation to terror frenzy provided by a bonfire. The difficulty to resist terror frenzy induced by being burned is also reduced by one for the scene.",
            },
            {
                dot: 5,
                name: "Trials of Death",
                description:
                    "You are a veteran of countless Trials of Death or learned at the feet of a true master. You suffer no called shot penalty when making bite attacks outside of grapples. Opponents directing bite attacks against you without a grapple suffer a called shot penalty of two. After a successful bite attack, your opponent increases their Hunger by two instead of one.",
            },
        ],
    },
    {
        id: "malkavian-family",
        name: "Malkavian Family",
        source: "chicago-folios",
        requiresStPermission: true,
        clanRestriction: ["Malkavian"],
        dots: [
            {
                dot: 1,
                name: "Family Secrets",
                description:
                    "Attending Son's mandatory therapy sessions gives you glimpses into your clanmates' schemes and goals. Gain two dice on an Awareness or Insight roll involving another Malkavian.",
            },
            {
                dot: 2,
                name: "Sibling Bond",
                description:
                    "You've grown extremely close to another member of your clan, someone who is like a favorite sibling. You share a two-dot Haven and a one-dot Herd, and once per story can call on this person for a significant favor. However, they will ask for your assistance in turn and may lay their burdens at your door.",
            },
            {
                dot: 3,
                name: "Tangled Web",
                description:
                    "Your frequent contact with other Oracles has heightened your ability to sense and use the Cobweb. Once per story, you may extend your perceptions along it to locate a specific clan member in the city — either catching a short glimpse of where they are and who they're with, or delivering one short sentence into their mind.",
            },
            {
                dot: 4,
                name: "A Little Peace and Quiet",
                description:
                    "With Son constantly forcing you to share space and secrets, you've carved out creative ways to get some alone time. Once per story, you may use an Auspex, Dominate, or Obfuscate power you haven't yet learned (at your current level or below) to hide in plain sight, escape a crowded area, or avoid detection.",
            },
            {
                dot: 5,
                name: "Favorite Childe",
                description:
                    "A respected elder member of the clan has taken a shine to you and appointed themselves your surrogate parent, favorite aunt or uncle, or doting grandparent. Gain them as a five-dot Mawla. Once per story, this person will act as a buffer between you and Son, relieving you of whatever obligation the Primogen was attempting to impose.",
            },
        ],
    },
    {
        id: "occult-artifacts",
        name: "Occult Artifacts",
        source: "chicago-folios",
        requiresStPermission: true,
        clanRestriction: ["Tremere", "Banu Haqim"],
        dots: [
            {
                dot: 1,
                name: "Rowan Ring",
                description:
                    "A feared tool of assassination employed by elder members of the Banu Haqim or their trusted neonates. After making a Rouse Check, the ring mystically sharpens and elongates into a wooden stake that can be used to make a stake attack. The stake detaches after use and the ring falls off its wielder's finger.",
            },
            {
                dot: 2,
                name: "Cloak of Abalone",
                description:
                    "Woven by the Tremere as a powerful weapon against Toreador, the Cloak of Abalone appears dull black on the outside but opens to reveal a scintillating, mesmerizing lining. After a Rouse Check, the targeted Toreador is immediately treated as if they rolled a Bestial Failure and their Toreador Obsession is in effect. The cloak only works on one target at a time.",
            },
            {
                dot: 3,
                name: "Powder of Rigidity",
                description:
                    "An uncommon mixture of rare herbs, Gangrel blood, and wolfsbane hurled at a target in an opposed Dexterity + Athletics test. On success, the tube shatters and coats them in viscous purple dust. The target — whether a user of Protean, a Lupine, or other shape changer — loses all ability to change shape for the next four hours.",
            },
            {
                dot: 4,
                name: "Monocle of Clarity",
                description:
                    "Designed by the Tremere to detect Obfuscated spies. After a Rouse Check, roll Wits or Resolve + three dice against the target's Wits + Obfuscate. Success pierces the target's Obfuscate. Total Failure pierces the veil between worlds, exposing the user to things best left unseen and inflicting one point of aggravated Willpower damage.",
            },
            {
                dot: 5,
                name: "Tapestry of Blood",
                description:
                    "A rare and powerful artifact said to have graced the halls of the Vienna Chantry. The user must make five Rouse Checks and spend a full evening contemplating the weave. As the first rays of dawn strike, roll Wits or Resolve + Occult — each success grants greater clarity of vision directly related to the user's fate. Total Failure triggers an immediate compulsion as detailed in the V5 core book.",
            },
        ],
    },
    {
        id: "pony-express",
        name: "The Pony Express",
        source: "chicago-folios",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Access to the Network",
                description:
                    "You have access to the Express and can send or receive a secure message or packet to or from any domain the Express operates in. Delivery will arrive within three nights to a week (Storyteller's discretion).",
            },
            {
                dot: 2,
                name: "Station Agent",
                description:
                    "You collect the mail in your domain and facilitate the handoff to a driver. You have two dots in Mask and are Zeroed. You also have access to the local Express station — a two-dot Haven with a one-dot Postern, owned by Praxton but available to you while on official Express business. Expect accountability if expected deliveries do not reach their recipients.",
            },
            {
                dot: 3,
                name: "Driver",
                description:
                    "You are a driver for the Express, granting you access to a wide array of vehicles and bolt holes across the nation. Once per story, you can acquire a vehicle appropriate to your journey's needs (car, truck, boat, small aircraft, or motorcycle). You also have access to the full Pony Express station network — a collection of two-dot Havens within one night's travel of each other.",
            },
            {
                dot: 4,
                name: "World Tour",
                description:
                    "Praxton recently took the Pony Express international, and you are at the forefront of this new initiative. Once per story, you gain access to an international mode of travel tailored to the unique needs of Kindred — likely something fast like a Lear jet or slow and clandestine like a berth on a freighter. Two-dot Haven stations anchor each end of your journey.",
            },
            {
                dot: 5,
                name: "Passenger Service",
                description:
                    "Always the innovator, Praxton operates a clandestine passenger service for special clients. Once per story, you and your coterie obtain passage from your domain to any destination the Express operates in (Storyteller's discretion).",
            },
        ],
    },
    {
        id: "sheriff-damien",
        name: "Sheriff Damien",
        source: "chicago-folios",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Fan Club",
                description:
                    "You've been a Baby Chorus fan for decades, collecting their albums and bootlegged recordings. Damien recognizes you as a frequent face in the front row, and other fans see you as an authority on the band. Gain two dots of Influence among other Baby Chorus devotees.",
            },
            {
                dot: 2,
                name: "Patroller",
                description:
                    "Damien frequently taps you for patrol duty, sending you out among Chicago's feeding grounds to keep an eye on Kindred activity. Your reports are clear and concise, alerting the Sheriff to trouble before it lands on the Prince's plate. Once per story, add three dice to an Insight, Intimidation, or Streetwise roll. While this position grants some authority, others consider you a snitch.",
            },
            {
                dot: 3,
                name: "Guest Artist",
                description:
                    "You played with Baby Chorus in one of its interim incarnations, and Damien occasionally invites you to open for them or play a set. Once per story, you may use Damien as a three-dot Mawla in the entertainment world.",
            },
            {
                dot: 4,
                name: "Postcards From the Road",
                description:
                    "You've made a deep connection with Damien — perhaps bonded over music or had his back in an ugly brawl. Damien acts as your four-dot Mawla. Once per story, you may also ask him to put you in touch with one of his contacts around the country.",
            },
            {
                dot: 5,
                name: "Loyal Hound",
                description:
                    "Prince Jackson handed Damien a crew full of wannabe diplomat Hounds, but the Sheriff wants fighters — and you've got a reputation for solving problems with your fists. Gain Contacts: Hound's Agents (••••) and Status: Camarilla (••). You may act with the Sheriff's authority on Kindred matters, and must respond when Damien requires your assistance.",
            },
        ],
    },
    {
        id: "wolf-pack",
        name: "The Wolf Pack",
        source: "chicago-folios",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Prospect",
                description:
                    "Surviving Tyrus' initiation into the Wolf Pack requires a certain degree of resilience. Reduce the difficulty of all Survival rolls related to travel and outdoorsmanship by one.",
            },
            {
                dot: 2,
                name: "Member",
                description:
                    "Rule one of joining the Wolf Pack is that you have to be able to ride. Your association with the Pack grants you a two-die bonus to all Drive tests while riding a motorcycle.",
            },
            {
                dot: 3,
                name: "White Line Nightmare",
                description:
                    "The Wolf Pack lives frugally but spares no expense on its bikes. Once per chapter, you can call on the Wolf Pack's contacts in the motorcycle community to obtain immediate access to a custom motorcycle that conveys three dots of Influence among biker gangs and two dots of Resources should the bike be sold (and the gang's ire earned).",
            },
            {
                dot: 4,
                name: "Dread Riders",
                description:
                    "Your association with Anthius gives you access to a veritable army of Midwestern motorcycle gangs. Once per story, you can call on Anthius' influence to assemble hundreds of Hell's Angels anywhere in the continental United States within three nights (with the first groups arriving within hours). These bikers provide a five-dot Ally group directed toward a single objective of your choosing — with high potential for collateral damage and government involvement.",
            },
            {
                dot: 5,
                name: "Gives No...",
                description:
                    "Tyrus infuses you with a measure of his hard-headed, hard-hearted, hard-riding personality. You never take anything from anybody and are willing to stare down Caine himself. Once per session, you can ignore even the most formidable attempt to intimidate you — becoming immune to any single attempt to intimidate, cow, or make you back down or retreat (mundane or supernatural). This ability disappears at the start of the next scene.",
            },
        ],
    },

    // ── Children of the Blood Loresheets ────────────────────────────────────
    {
        id: "grudge-masters",
        name: "Grudge Masters (Milliner)",
        source: "children-of-the-blood",
        requiresStPermission: true,
        clanRestriction: ["Hecata"],
        dots: [
            {
                dot: 1,
                name: "You Know Who I Am",
                description:
                    "The Milliners are a true American dynasty, and the name carries power even now and outside the United States. Once per story, when you invoke the legacy of the Milliner line, you may add three dice to a Social roll.",
            },
            {
                dot: 2,
                name: "Family Bank",
                description:
                    "Once per story, you may borrow money from a new or existing Milliner SPC. You have Resources 5 for the rest of the story but owe that SPC a favor that must be fulfilled before the story ends. Your Storyteller will tell you the favor, and the consequences if the debt isn't repaid.",
            },
            {
                dot: 3,
                name: "Perfect Grudges",
                description:
                    "The Milliners are known for their grudges, but you're the true poster child. When you are slighted or beaten on a roll by an SPC, you may create a Project dedicated to taking revenge. Its Launch Roll automatically succeeds, and you may add two dice to any Goal Rolls. You can have as many grudge Projects as your dots in Composure; any beyond that limit are regular Projects.",
            },
            {
                dot: 4,
                name: "You Owe Me",
                description:
                    "The Milliners always get their due, even at the worst possible times. Once per story, you may spend a Willpower and declare an SPC in the scene owes you a favor in secret, and it's now due. The SPC must fulfill that favor to the best of their ability by the end of the story, as decided by the Storyteller.",
            },
            {
                dot: 5,
                name: "Friends in High Places",
                description:
                    "The Milliners' connections in law enforcement turned them onto would-be vampire hunters. Pick a faction within the Second Inquisition (FIRSTLIGHT, the Entity, a local intelligence agency, etc.). Once per story, when that faction acts against you, you may automatically redirect that action onto any enemy Kindred SPC. If they survive, that SPC will know you are to blame.",
            },
        ],
    },
    {
        id: "ashfinders",
        name: "The Ashfinders",
        source: "children-of-the-blood",
        requiresStPermission: true,
        clanRestriction: ["Thin-Blood"],
        dots: [
            {
                dot: 1,
                name: "Influencer",
                description:
                    "As a member of the Cinder Institute, the Ashfinders' mortal-facing front, you've developed some sway among mortals. Pick a local subculture. You receive two dots of Influence over that subculture.",
            },
            {
                dot: 2,
                name: "Shard Defense",
                description:
                    "Beast Shards — the monstrous remains of dead vampires used in the Ashe creation process — flicker in and out of existence and manipulate human emotions. You've become an expert at hunting and destroying Shards. When you are hit by spectral claws or other forms of semi-material weaponry, you always take −1 damage.",
            },
            {
                dot: 3,
                name: "Addiction Resistance",
                description:
                    "Ashe addiction drives a Duskborn into a vicious cycle of hunger and frenzy. You've developed a natural resistance to that cycle. When you use Ashe, you no longer make a Rouse Check.",
            },
            {
                dot: 4,
                name: "Strange New Forms",
                description:
                    "Ashfinder alchemists quickly become versatile in multiple forms of distillation, and you're no different. When you learn an additional Thin-Blood Alchemy distillation, you may choose up to four formulae to carry over to that new form without spending experience points. Ashfinder Blood Alchemy cannot carry over to other forms of distillation.",
            },
            {
                dot: 5,
                name: "Cook",
                description:
                    "As an important part of the Ashfinders' supply line, you've had plenty of opportunities to hone your craft. It's improved your overall prowess with Thin-Blood Alchemy. All times to research formulae are halved.",
            },
        ],
    },
    {
        id: "amaranthan",
        name: "Amaranthan",
        source: "children-of-the-blood",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Judge",
                description:
                    "You know time and supernatural forces hide the telltale black veins in a diablerist's aura. You've been taught to look for psychological signs instead. Whenever you interrogate suspected diablerists, you receive three dice to all relevant rolls.",
            },
            {
                dot: 2,
                name: "Jury",
                description:
                    "You are capable of granting clemency. Once per story, when you catch a diablerist, expose their crime beyond any doubt, and argue truly for the sparing of their life, you may take that vampire (if they survive sentencing) as a two-dot Mawla until you feel their crime has been repaid.",
            },
            {
                dot: 3,
                name: "Executioner",
                description:
                    "While you may take pleasure in turning diablerists to ash, there is a process to the execution that must be obeyed. When you deliver a diablerist's final message or complete their final wish, you may erase one Stain from your Humanity tracker.",
            },
            {
                dot: 4,
                name: "Tense Respect",
                description:
                    "Your refusal to acquiesce to sect and domain traditions regarding diablerie doesn't make you well-liked, but it does bring about grudging admiration. Even if you hold no position in your domain, you have a Status equivalent to three dots in the eyes of any Kindred who view diablerie negatively. Conversely, you earn a one-dot Adversary who holds diablerie as sacred.",
            },
            {
                dot: 5,
                name: "The Final Hunt",
                description:
                    "Unlike other Amaranthans, you're dedicated to hunting down and consuming the cannibalistic descendants of Amarantha's murderer. When you perform diablerie on a confirmed descendant of Amarantha's diablerist, you do not suffer an automatic drop in Humanity, but may still lose Humanity if you roll poorly in the contest between souls. All other effects still apply.",
            },
        ],
    },
    {
        id: "cleopatras",
        name: "Cleopatras",
        source: "children-of-the-blood",
        requiresStPermission: true,
        clanRestriction: ["Nosferatu"],
        dots: [
            {
                dot: 1,
                name: "Close Examination",
                description:
                    "You remember things the woman told you at just the right time. Once per story, you may select an SPC and tell the Storyteller you want to discover their deepest flaw. You gain three bonus dice to a Wits + Insight roll against that individual, with a critical success conveying the desired information. Revealing this knowledge is a certain way to earn a long-term Adversary.",
            },
            {
                dot: 2,
                name: "Clothed in Power",
                description:
                    "You know how to make the ideal self in your dreams a reality. Pick an outfit, perfume, hair style, make-up routine, or skin-care routine. When you use this, you may reroll a Social roll failure or roll to resist fury frenzy once per story.",
            },
            {
                dot: 3,
                name: "Dream Appearance",
                description:
                    "Your Bane fades while you experience daysleep, allowing you to look like you did as a mortal until you wake — though you still bear wounds if suffering damage. The return of your horrific appearance is incredibly traumatic; if anyone witnesses your Bane return, they undoubtedly know what you are.",
            },
            {
                dot: 4,
                name: "Figure-in-Waiting",
                description:
                    "Following your dreams paid off. Name a titled position in the domain. The current titleholder considers you next in line should something happen to them, granting four dots to spread between Mawla (the present titleholder) and Status. However, this also earns you a one-dot Adversary in the form of a vampire who also wants the position.",
            },
            {
                dot: 5,
                name: "The Beauty Within",
                description:
                    "You are destined to rule the Kindred, and not even Caine's curse hinders you. Once per story, when you are dressed in your finest clothes, you may negate your clan's Bane entirely for the duration of a session for the purposes of interaction with other vampires. Your appearance has not changed, but your intense confidence radiates and negates your blemishes. This Lore has no effect on kine.",
            },
        ],
    },
    {
        id: "meneleans",
        name: "Meneleans",
        source: "children-of-the-blood",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Mortal Empathy",
                description:
                    "You believe in the importance of cleaving to humanity and ensure you see mortals as people, not just as food. Once per session, you may reroll up to three dice on a Social roll involving mortals without spending Willpower.",
            },
            {
                dot: 2,
                name: "Peacemaker",
                description:
                    "Menele's school taught you the importance of conflict resolution. Once per session, when you are involved in a social or physical conflict, you gain two bonus dice in an attempt to resolve things through diplomacy. If one of your allies then breaks the terms of your negotiation, you must roll to resist fury frenzy.",
            },
            {
                dot: 3,
                name: "Show of Defiance",
                description:
                    "Tyranny is the enemy of peace. Once per story, when you chastise or humiliate someone in a higher position of authority than you, you may add the number of dots you possess in Status as bonus dice to your roll. The outcome is a likely Adversary possessing dots equivalent to your target's power level.",
            },
            {
                dot: 4,
                name: "Becoming the Mask",
                description:
                    "You've assimilated into humanity so well that you have a separate, almost mortal life. You receive an identity represented by Mask 2 and may split two dots between Contacts, Resources, and Influence. When you take on this Mask, you take on mortal connections including family and friends, though they pose risks to your security and privacy.",
            },
            {
                dot: 5,
                name: "Bond Breaker",
                description:
                    "The dissipation of Menele's Blood Bond permanently changed you. You've become Unbondable, and feeding a Rouse Check's worth of vitae to a thrall immediately breaks the regent's hold. However, you are incapable of creating your own Blood Bonds.",
            },
        ],
    },
    {
        id: "one-true-way",
        name: "The One True Way",
        source: "children-of-the-blood",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Trust Me",
                description:
                    "Showing vulnerability is dangerous among Kindred, but it's necessary for the One True Way. You know how to sidestep a vampire's hesitance and get them to say things they'd never tell their closest friends. When you speak to a vampire with genuine empathy, the Difficulty of any roll to get them to tell the truth is lowered by one.",
            },
            {
                dot: 2,
                name: "Secret Keeper",
                description:
                    "Attending or running meetings let you in on so many secrets the Nosferatu consider you a trusted source. Once per story, when you act on a secret, a single roll concerning that secret gains two extra dice.",
            },
            {
                dot: 3,
                name: "Beast Communion",
                description:
                    "You see your Beast as a separate persona. When it comes to the surface, it finds details you've missed. Whenever you roll a Messy Critical or a Bestial Failure, you may ask one question about the situation to your character's Beast. Your Storyteller gives you a truthful answer in the voice of the Beast.",
            },
            {
                dot: 4,
                name: "Calling the Wave",
                description:
                    "You see your Beast as a companion, and it'd be wrong to keep a companion locked away forever. Once per story, you spend a point of Willpower to immediately enter frenzy and Ride the Wave.",
            },
            {
                dot: 5,
                name: "The Road from Hunedoara",
                description:
                    "When the Master of Ravens himself invited you to journey to Hunedoara, Romania to meet him, you accepted. He taught you much, and you have returned a near apex predator. No matter what heinous acts you commit in frenzy, you never suffer more than 1 Stain. This can only be applied once per story, and Convictions cannot further reduce these Stains.",
            },
        ],
    },
    {
        id: "starfall-ranch",
        name: "Starfall Ranch",
        source: "children-of-the-blood",
        requiresStPermission: true,
        clanRestriction: ["Malkavian"],
        dots: [
            {
                dot: 1,
                name: "Herd Mindset",
                description:
                    "Your time on the ranch brought you closer to your fellow wayward Malkavians — sometimes a bit too close, and parts of their identities still linger within you. Once per session, you may either take two dots in a Skill you do not know for a single roll, or ask the Storyteller for one fact about an SPC that you do not know.",
            },
            {
                dot: 2,
                name: "Clarity of Mind",
                description:
                    "Starfall Ranch is a peaceful place where Malkavians from all levels of society can rest and reflect. When you start a Project at Starfall Ranch, you receive three bonus dice to the Launch roll.",
            },
            {
                dot: 3,
                name: "New Perspectives",
                description:
                    "You understand some basics of the One Moon and are starting to discover how you are only a single aspect of a greater person. Once per story, you may take one Skill rating and replace it with that of another One Moon cultist (another player's character or an SPC). This Lore is in effect for the remainder of that story.",
            },
            {
                dot: 4,
                name: "Starr and Marta",
                description:
                    "You've had the chance to see Marta with your own eyes, and it changed you forever. You may take Dr. Starr as a four-dot Mawla. Once per story, Marta will speak through him — you may ask her any question relevant to the story, and she answers truthfully to the best of her knowledge.",
            },
            {
                dot: 5,
                name: "But I Saw You Die",
                description:
                    "Starr is infamous for cheating death, and he's shared his secret with you. Once, when you undergo final death, you may select another One Moon cultist SPC. This SPC is now you, even taking on your physical likeness if possible. Your Skills, Advantages, Flaws, and any out-of-clan Discipline dots remain, but you must redistribute your Attributes and your in-clan Discipline dots.",
            },
        ],
    },

    // ── Book of Nod Apocrypha Loresheets ────────────────────────────────────
    {
        id: "book-of-nod",
        name: "The Book of Nod",
        source: "book-of-nod-apocrypha",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Precis",
                description:
                    "You are familiar with the broader concepts of the Book of Nod and some of the more commonly known prophecies. Once per story, add two dice to an Academics roll related to ancient Cainite history.",
            },
            {
                dot: 2,
                name: "Well-Versed",
                description:
                    "Your sire or Mawla taught you certain passages from the book, and may even have physical fragments in their possession. Once per story, you may seek their input on a matter regarding Noddist lore, gaining a two-dice bonus to any Occult test related to the book.",
            },
            {
                dot: 3,
                name: "Scholar",
                description:
                    "You've dedicated significant time and study to the Book of Nod and are familiar with at least one complete version of the text. You can support your theories with quotes and are aware of counterarguments and alternative interpretations. Once per session, add three dice to a Persuasion roll when debating the Book of Nod's finer points.",
            },
            {
                dot: 4,
                name: "Collector",
                description:
                    "You own several fragments from the book or have memorized sections of Caine's history. Noddists seek you out hoping to examine your copies or hear you recite the tales. Once per story, when you grant someone access to your collection, gain three temporary dots in Resources (or other appropriate Background as approved by your Storyteller) for the remainder of the story, or the ability to call in a future favor from the Noddist.",
            },
            {
                dot: 5,
                name: "Noddist Master",
                description:
                    "Other Noddists look to you for insight and interpretation on the texts, and your theses are regarded as must-reads. Once per story, you may derive a fact or prophecy from the Book of Nod that your character can apply to sway a decision, automatically succeeding at a Persuasion test at the Storyteller's discretion.",
            },
        ],
    },
    {
        id: "gehenna-cults",
        name: "Gehenna Cults",
        source: "book-of-nod-apocrypha",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Mark the Bloody Trail",
                description:
                    "Once per session when you begin investigating or researching the presence of a blood cult you've not previously used this lore for, the Storyteller gives you one free clue to help locate the cult or to understand their current plans.",
            },
            {
                dot: 2,
                name: "Faithful Bloodhound",
                description:
                    "You've exposed and taken down at least one Gehenna cult already and shown your mettle. Either the Camarilla or the Anarchs trust you as an expert on Gehenna cults. You wield three dots of Status while taking action to investigate or persecute a cult on behalf of that sect.",
            },
            {
                dot: 3,
                name: "Dogma",
                description:
                    "You're steeped in the lore of Gehenna and have learned many permutations of warped faiths. Once per session, when you discuss a vampire's faith with them or observe them practicing it, you can extrapolate the rough nature of the doctrines, Convictions, or code the religion focuses on. The Storyteller must convey the primary themes, limitations, and beliefs, even those not evident in what the vampire has said or done.",
            },
            {
                dot: 4,
                name: "Cult Breaker",
                description:
                    "You know how to shatter the illusions of millenarian cults and tear apart the foundations of their faith. Once per story for a scene, while socially interacting with you, cult members do not benefit from any dots in Status they may have within their own cult. If they are unable to overcome you in a conflict, they lose any such Status dots for the rest of the story.",
            },
            {
                dot: 5,
                name: "Red Truths",
                description:
                    "Investigating the rising tide of blood cults has put you in a prime position to sift precious grains of truth from the lies at the heart of most misbegotten faiths. Once you have studied the practices or texts of any blood cult, you are able to learn any Rituals or other unusual supernatural capabilities they possess without need of a teacher, although you must pay any experience point costs as normal.",
            },
        ],
    },
    {
        id: "machinations-of-saulot",
        name: "Machinations of Saulot",
        source: "book-of-nod-apocrypha",
        requiresStPermission: true,
        clanRestriction: ["Salubri", "Tremere"],
        dots: [
            {
                dot: 1,
                name: "Rumors and Signs",
                description:
                    "Those aware of the age-old conflicts of the Salubri are on the lookout for signs of their recurrence. You can ask the Storyteller if an event or location shows signs of Salubri or Tremere influence. You can ask this question once per session.",
            },
            {
                dot: 2,
                name: "Prolonged Conflict",
                description:
                    "While Saulot's words were gentle, his actions are said to have spurred on conflict between the Salubri and Tremere. You have learned to defend from these forces. Once per session, gain two bonus dice when resisting Auspex, Blood Sorcery, Dominate, or Oblivion powers.",
            },
            {
                dot: 3,
                name: "Saulot's Smile",
                description:
                    "When Tremere committed diablerie on Saulot, the sire of all Salubri smiled. Once per story when witnessing another Kindred perform an action, you can ask the Storyteller what their motivation was for doing so.",
            },
            {
                dot: 4,
                name: "The Madness of Blood",
                description:
                    "When Saulot was destroyed, his childer supposedly went mad, drawn to the site of Saulot's awakening. Once per story, you can summon your sire or one of your childer or someone who has tasted your Blood as per the Presence power Summon, using your Auspex or Dominate rating instead of Presence. You can also ignore such a summons yourself, once per story.",
            },
            {
                dot: 5,
                name: "Ultimate Disguise",
                description:
                    "Your expertise in Saulot's ways gives you an advantage few others have. You possess traits of both Clans Salubri and Tremere. You may learn Blood Sorcery or Fortitude as if they were a Clan Discipline if they weren't already, but suffer both Clan Banes and Compulsions.",
            },
        ],
    },
    // ── The Fall of London Loresheets ────────────────────────────────────────
    {
        id: "court-of-shadows",
        name: "Court of Shadows",
        source: "fall-of-london",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Free Meals",
                description:
                    "The King of Shadows is aware their Kindred associates need to remain well-fed, and to this end they employ mortals across the city as willing vessels. Once per game session you may approach the Court of Shadows for sustenance. The vessel will be willing, of a random Resonance with no Dyscrasias, and compatible with your feeding restrictions.",
            },
            {
                dot: 2,
                name: "Rumor Mill",
                description:
                    "The Court of Shadows encourages a lively trade of information and rumors. Once each game session you may approach the network to exchange useful information. The veracity and accuracy of what you receive is left to the Storyteller's discretion, but should reflect the value of information you trade in return. If you cannot pay in kind, you may be asked to perform a service for the King instead.",
            },
            {
                dot: 3,
                name: "Contraband",
                description:
                    "The Court of Shadows is a place where you can find illegal narcotics, weapons, explosives, and other contraband. Once per story you may approach the Court for what you need. They will be willing to provide, but always at a price — paid in hard currency, information, or other goods of equivalently high value.",
            },
            {
                dot: 4,
                name: "Sanctuary",
                description:
                    "The Court has access to many buildings above ground and structures below ground, all claimed by the King as their domain. Once per story you may approach the Court of Shadows to request sanctuary. You will be blindfolded and not know where you are taken, but you can be sure you will be kept safe for as long as you need.",
            },
            {
                dot: 5,
                name: "Favored by the King",
                description:
                    "You are one of the few Kindred in London who has ever been in the presence of the King of Shadows. For some reason they have taken an interest in you and regularly correspond and meet with you. The King wears a mask and remains enigmatic, but you know more about them than most. Once per story you may call upon the King directly for aid — the manner and degree to which they respond is left to the Storyteller, but it should materially serve your needs in some way.",
            },
        ],
    },
    {
        id: "hunt-club",
        name: "Hunt Club",
        source: "fall-of-london",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Huntsman's Newsletter",
                description:
                    "As a fledgling member of the Hunt Club, you are notified when important events occur, including when Blood Hunts are declared in the various Kindred domains in Avalon and the cities of western Europe. You can expect to receive such a notice once per story, but exactly when is left to the Storyteller's discretion.",
            },
            {
                dot: 2,
                name: "Experienced Diablerist",
                description:
                    "You have previously participated in a hunt and committed the act of diablerie on another vampire. Due to your prior experience, you may add one die to your pool in all future Strength + Resolve tests when attempting the same act again. This also means the signs of diablerie may be visible in your aura, and you would be wise to avoid this being detected.",
            },
            {
                dot: 3,
                name: "Huntsman's Dossier",
                description:
                    "The Hunt Club devotes significant resources to watching and researching elder vampires, assessing their defenses and suitability as targets. Once per story you may contact the organization to ask for information regarding the current whereabouts or favorite haunts of a named Kindred in the local domain.",
            },
            {
                dot: 4,
                name: "Huntsman's Steed",
                description:
                    "You have acquired and adapted a modern vehicle to perfectly complement your hunting pursuits. It will be a plain-colored van or truck with blacked-out windows, subtly armor-plated on the exterior, and with a sound-proofed interior reinforced with a metal cage strong enough to contain an angry Kindred. The vehicle can be registered to your name or one of your Masks.",
            },
            {
                dot: 5,
                name: "Leader of the Hunt",
                description:
                    "Your good standing within the Hunt Club gives you the right to name any Kindred as the next quarry for the organization's sport. Once per story you may circulate the name of your target, causing them to be taunted, harassed, and attacked by members of the organization. This will prove a significant inconvenience and distraction, but whether they survive is left to the Storyteller's discretion.",
            },
        ],
    },
    {
        id: "london-under-london",
        name: "London Under London",
        source: "fall-of-london",
        requiresStPermission: true,
        clanRestriction: ["Nosferatu"],
        dots: [
            {
                dot: 1,
                name: "Tube Safety",
                description:
                    "Your knowledge of the Tube system places you at an advantage. You know the layout of each station and where all CCTV cameras are placed — including their blind spots. You may attempt a Wits + Stealth test at Difficulty 3 to pass through or hunt in any tube station undetected. Anyone traveling with you can benefit from your knowledge should you choose to share it.",
            },
            {
                dot: 2,
                name: "Somewhere to Hide",
                description:
                    "Your knowledge of London's underground infrastructure lets you hide in desperate situations — whether being pursued or caught too far from your haven near dawn. Attempt a Wits + Larceny test at Difficulty 3 to find a suitable hiding place below ground overlooked by anyone without similar knowledge: an old sewer pipe, a maintenance hatch, or an unused section of Underground tunnel.",
            },
            {
                dot: 3,
                name: "Network of Vermin",
                description:
                    "You have spent enough time below ground to become familiar with the multitudes of vermin and other creatures that live there. Your chances of finding useful creatures in any underground scene are increased, and you may add one die to your pool when using any Animalism powers concerning the interaction with bestial creatures below the surface of London, including Bond Famulus, Feral Whispers, Unliving Hive, and Animal Dominion.",
            },
            {
                dot: 4,
                name: "Personal Bolt-Hole",
                description:
                    "In addition to your regular haven aboveground, you maintain a secret underground hideout where no other Kindred can find you, and where you can store valuable items you dare not leave elsewhere. You do not use it frequently, as doing so would risk its discovery, but here you are safe from traditional means of discovery and the harmful rays of the sun. Note that this mundane location will not conceal you from supernatural tracking such as Auspex or Blood Sorcery.",
            },
            {
                dot: 5,
                name: "Freedom of the City",
                description:
                    "Your knowledge of London's subterranean landscape lets you travel between locations without ever stepping above ground. Once per story you may transit between two surface locations using underground routes in a manner undetected by anyone watching at ground level. This could mean illicitly accessing a private building — a bank vault, a secure office, or another Kindred's Haven — but will not protect you from any security measures you encounter inside.",
            },
        ],
    },
    {
        id: "operation-antigen",
        name: "Operation Antigen",
        source: "fall-of-london",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Early Warning",
                description:
                    "You have a trusted insider who has made you a simple promise: if Antigen ever identifies you or plans your capture, they will give you advanced warning. This is a one-time thing — they won't stop or delay the agents, but they will do you the courtesy of letting you know they are coming.",
            },
            {
                dot: 2,
                name: "Tactical Dossier",
                description:
                    "You have acquired or been leaked a dossier covering typical Antigen operating procedures: surveillance protocols, how to plan raids, and tactical advice for engaging ICOs. During a scene involving Operation Antigen, you can use the dossier to predict and outwit their behavior. If the outcome reveals they have been outmaneuvered (agents killed, mission objectives thwarted), they will change their methods and the dossier becomes useless.",
            },
            {
                dot: 3,
                name: "Sympathetic Insider",
                description:
                    "You have a relationship with someone placed high up in Antigen's apparatus who knows a great deal about current operational activities and targets. Cautious and paranoid about being caught, they will share information through suitably clandestine methods. You may reach out to this four-dot Contact once per story to ask questions about Antigen's current activities.",
            },
            {
                dot: 4,
                name: "Get Out of Jail Free",
                description:
                    "You have leverage over someone in the upper echelons of Operation Antigen. They don't know it yet, and it can only be used once — once the organization knows this person is compromised, they will be cycled out. You can contact them and successfully blackmail them into performing one service: securing your release if captured, deflecting resources, or deleting sensitive information. Once used, your leverage is valueless and you will be placed on Antigen's watch list.",
            },
            {
                dot: 5,
                name: "Official Credentials",
                description:
                    "You have obtained or manufactured false credentials giving you temporary access to Antigen resources. You can briefly take command of Antigen personnel at a location under surveillance or at the scene of a raid. You can also use this identity to take custody of prisoners or evidence, or to infiltrate a location currently under Antigen control. How long your cover lasts depends on how well you can blend in. Once used, the cover is blown and cannot be used again.",
            },
        ],
    },
    {
        id: "oskar-anasov",
        name: "Oskar Anasov",
        source: "fall-of-london",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Messaging Service",
                description:
                    "You are acquainted with Anasov well enough to use his messaging network — a reliable method for contacting other Kindred in London without risk of the communication being intercepted by Operation Antigen. Anasov promises successful delivery, regardless of how elusive the recipient might otherwise be.",
            },
            {
                dot: 2,
                name: "Personal Introduction",
                description:
                    "For a higher fee, Anasov can arrange a face-to-face meeting with any Kindred resident in London. Once per story you can name any Kindred known to be in London and the Nosferatu will arrange the meeting after receiving payment. Anasov facilitates the introduction but cannot vouch for the Kindred's behavior. If a meeting turns violent or ends badly for the Kindred you named, Anasov will refuse all future requests.",
            },
            {
                dot: 3,
                name: "Safe Passage",
                description:
                    "Anasov has the means to smuggle mortals and Kindred in and out of London without fear of detection by vampires or Antigen agents. Once each story you may call upon him to perform this service for a group of up to six individuals. If entering the city, they will be delivered to an address of your choice. If leaving, you may name a destination outside London's borders. International transit is possible for a higher fee.",
            },
            {
                dot: 4,
                name: "Mentor",
                description:
                    "You are personally acquainted with Anasov and your interactions are more than just business. You may count him as a four-dot Mawla and receive a significant discount when paying for his services. However, this also means he may call on you at least once per story to help with message delivery, people-smuggling, or another activity that furthers his interests.",
            },
            {
                dot: 5,
                name: "Landlord Council",
                description:
                    "Through Anasov, you will be notified and invited to any meeting of London's Kindred Landlords. Once per story, if you have a suitable justification, you may also ask Anasov to use his influence to call the Landlords of London to a meeting. Note that these Kindred are paranoid, fickle, and prideful — they will mark you as a fool or an enemy if they decide you are wasting their time.",
            },
        ],
    },

    // ── Forbidden Religions Loresheets ───────────────────────────────────────
    {
        id: "chamber-1444",
        name: "1444 Chamber",
        source: "forbidden-religions",
        requiresStPermission: true,
        clanRestriction: ["Hecata"],
        dots: [
            {
                dot: 1,
                name: "Shadow of the Chamber",
                description:
                    "Other Hecata know that at least one member of the Chamber trusts you to carry out their will — and no one wants to cross one of the ancient monsters who sit at the heart of the Clan of Death's web. You have the equivalent of two additional dots of Status within the Hecata clan, but only for the purposes of forcing compliance or intimidating other Hecata.",
            },
            {
                dot: 2,
                name: "Mercenary Work",
                description:
                    "When outsiders need the Clan of Death's expertise, you're a go-between trusted to pursue the Chamber's agenda. Once per story, you can arrange the mercenary services of your fellow Hecata for a vampire who is not part of your coterie or clan, calling up to three dots in any appropriate Background that represents the mercenaries' talents.",
            },
            {
                dot: 3,
                name: "Gilded Promises",
                description:
                    "If there's one thing the Hecata aren't short of, it's money. If you satisfy the Chamber with your performance, you have access to four dots of Resources. The Clan of Death has little patience for talented students who fail to live up to their promise, however — disappoint your patron, and you lose these dots until you make things right.",
            },
            {
                dot: 4,
                name: "Deathly Slave",
                description:
                    "Never forget that the Chamber comprises the most powerful concentration of vampiric necromancers in existence. Once per story, you can request the service of a spectre or another form of wraith, naming a specific task. Unless it contravenes your patron's agenda, they will compel a single such ghost to perform that service for you.",
            },
            {
                dot: 5,
                name: "Anziani Patron",
                description:
                    "You directly serve one of the anziani who sits on the Board of Directors, making you one of the trusted few they confide in. Once per chronicle, you can call upon your patron to push the 1444 Chamber into action and call all loyal Hecata in the region to your aid regardless of their other priorities, as long as it does not contravene the agenda of your patron or the Chamber. The Chamber will expect you to repay this debt.",
            },
        ],
    },
    {
        id: "blood-asceticism",
        name: "Blood Asceticism",
        source: "forbidden-religions",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "The Starveling Path",
                description:
                    "You're not quiet about your dedication to blood asceticism and your desire to conquer the red thirst. Other Kindred may think you're mad or a fool, but they can't doubt your devotion. Once per session, providing you've not fed that night, you may add two dice to any roll to prove your strength of will or to convince others of your dedication.",
            },
            {
                dot: 2,
                name: "Glade of the Sleeping Beast",
                description:
                    "You have found a place of quiet solitude to contemplate the shackles of your immortal hunger — your haven, if you have one, or a more remote location. While in your place of contemplation, as long as you are alone, you can re-roll one Rouse Check per session.",
            },
            {
                dot: 3,
                name: "Lesser Vessels",
                description:
                    "To subdue your thirst for human blood, you have learned to subsist on the lesser vitae of base animals. While you are alone, feeding from animals rather than humans slakes one more point of Hunger than it usually would for you, but never more than one level per scene. You also gain the Infamy Flaw: (•) Animal Drinker if news of your reliance on animal vitae gets out.",
            },
            {
                dot: 4,
                name: "Bloodless Pedestal",
                description:
                    "Whether or not you've really managed to conquer your hunger, your displays of ascetic self-denial have attracted other Kindred who desperately want your claims to be true. This provides you with the equivalent of five dots of Status solely among vampires who see you as some sort of holy figure. You lose the benefits of these dots for the duration of any scene in which they witness you drinking blood, and the following scene thereafter.",
            },
            {
                dot: 5,
                name: "Leash the Beast",
                description:
                    "You've starved your Beast so often that it's a weakened, feeble thing, bound beneath the chains of your willpower. Few other Kindred possess this level of self-control. The Difficulty of your Hunger frenzy rolls is always 2, regardless of the provocation.",
            },
        ],
    },
    {
        id: "plagues-of-gehenna",
        name: "Plagues of Gehenna",
        source: "forbidden-religions",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Blister Marks",
                description:
                    "You're a member of a loose association of Kindred keeping vigil for any signs of blisters — those Kindred who willingly or ignorantly spread disease among the kine. Whenever you succeed on a Medicine roll to examine the health of a mortal, living or postmortem, you also discern whether any disease they may have was inflicted on them by a Kindred.",
            },
            {
                dot: 2,
                name: "Autoclave",
                description:
                    "Fearful of becoming a disease vector, you have three dots in Herd that will remain clean and uninfected even should sickness run rampant through the local population. You must maintain the purity of this blood source carefully — no one can draw upon the Herd more than once per story. If you share it with anyone, even once, you lose access to it yourself for the remainder of the story.",
            },
            {
                dot: 3,
                name: "Fire in the Blood",
                description:
                    "Strange diseases once wracked even your Kindred physiology with fever and bizarre phantasmagoria. While the sickness passed, it left its mark. Once per scene when you feed on a mortal and contract a disease you could spread to future victims, you mend one Superficial Health damage and one Superficial Willpower damage. You also immediately become aware whenever the blood of a vessel you feed from bears infectious disease.",
            },
            {
                dot: 4,
                name: "Firebreak",
                description:
                    "You've studied disease outbreaks in mortals and vampires alike and understand how far an infection can slither through Kindred society before being detected. You possess five dots in Influence solely for the purpose of controlling and quelling disease outbreaks among the kine that would affect the Kindred. When you exercise this Influence and succeed, you gain two dots in Status with your sect for the remainder of the story.",
            },
            {
                dot: 5,
                name: "Plague Sample",
                description:
                    "In your possession is a phial of blood drawn from a sick, maddened elder while in the throes of the Beckoning. It seethes with the contagious power of a plague that will affect Kindred with lethal results. What exactly it does to vampire victims, how it spreads, and what link it has to the Beckoning is up to the Storyteller — if you are ever desperate, brave, or mad enough to unleash it upon your fellow undead.",
            },
        ],
    },
    {
        id: "praepositor",
        name: "Praepositor",
        source: "forbidden-religions",
        requiresStPermission: true,
        clanRestriction: ["Tremere"],
        dots: [
            {
                dot: 1,
                name: "Chastise the Wayward",
                description:
                    "You embrace the cult's ideology of war against those who oppose the clan — including renegades within the Tremere. You may reroll a single die in any dice pool to cause direct harm to another Tremere character if you believe them to be a renegade.",
            },
            {
                dot: 2,
                name: "Discreet Professionalism",
                description:
                    "You've been at the cutting edge of Praesidium efforts to build a network of clients and contracts to prop up a reinvigorated Clan Tremere. Once per story, you can draw on favors due or debts yet to be paid to acquire two dots in Status with any sect or clan for a single interaction. You can expect the person you leverage to want something in return in the next story, if not before.",
            },
            {
                dot: 3,
                name: "Guard the Clan",
                description:
                    "You joined this cult because you wanted to rebuild and protect what had gone before. Whenever you Rouse the Blood to protect your clan's members and secrets, you may roll two dice and pick the highest result.",
            },
            {
                dot: 4,
                name: "Expert Security",
                description:
                    "You're one of the cult's top experts in security and protection and have a team of Praepositor specialists on speed-dial. Once per story, you can spend a scene establishing a safehouse or strong-point to grant yourself or another character up to five dots of Haven that lasts until the end of the scene. This drains three dots of Resources for the remainder of the story, requiring outside funding if you do not possess these dots yourself.",
            },
            {
                dot: 5,
                name: "Blood Loyalty",
                description:
                    "The Praesidium's early experiments to rebuild the clan's Blood Bond bear unexpected discoveries. If you and another participant (mortal or vampire) sign a contract written using their blood or vitae, make one Rouse Check per level of Blood Bond you intend to initiate. Once signed, treat the contracted service as if the co-signee was Blood Bound to it — to breach the contract, they must succeed in a contest of Resolve + Intelligence vs. Bond Strength. Once the contract is complete or you destroy it, the simulated Blood Bond immediately ends.",
            },
        ],
    },
    {
        id: "spear-of-orthia",
        name: "Spear of Orthia",
        source: "forbidden-religions",
        requiresStPermission: true,
        clanRestriction: ["Ventrue"],
        dots: [
            {
                dot: 1,
                name: "Tip of the Spear",
                description:
                    "You are a member of the new wave of Shattered Spear adherents spreading through Clan Ventrue. Once per session, when interacting with another Ventrue character, you may ask the Storyteller whether that Ventrue will be receptive to your faith, tolerant of it, or opposed to it should you reveal your allegiance.",
            },
            {
                dot: 2,
                name: "Soldier's Code",
                description:
                    "You have embraced the liturgy of the Spear with ardent zeal. Choose one of the Convictions of the Spear. Once per story, you may use it to mitigate Stains as if it was one of yours.",
            },
            {
                dot: 3,
                name: "The Enduring Faith",
                description:
                    "You know one or more Ventrue in the region are secretly followers of Orthia. If you can contact them and enlist their aid, they will provide you with four dots of either Allies or Mawla.",
            },
            {
                dot: 4,
                name: "Witness to Orthia",
                description:
                    "You went down beneath Lisbon with Elena and saw the revelation of Orthia with your own undead eyes. You speak with the conviction of the Voice herself, and your testimony stirs those of Ventrue Blood. Once per scene, after rolling the dice to convince one or more Ventrue of your beliefs, exhort them to violence, or lead them in battle, you may turn all 1s rolled into 10s.",
            },
            {
                dot: 5,
                name: "Splinter of the Spear",
                description:
                    "You possess a splinter of the spear of Orthia itself. As long as you have it about your person, channeling the power of Artemis Orthia grants you two automatic successes on Melee rolls when wielding spears or other piercing weapons — including stakes. However, committing an act of cowardice such as retreating before a foe or falling to terror frenzy is an insult to its legacy, and you suffer one point of Aggravated Willpower damage should such happen. Losing the splinter would be an utter disaster for you and for the Shattered Spear.",
            },
        ],
    },

    // ── Trails of Ash and Bone Loresheets ───────────────────────────────────
    {
        id: "ruby-throat",
        name: "The Ruby Throat",
        source: "trails-of-ash-and-bone",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Rubbing Shoulders",
                description:
                    "You've sat at the table for a game or two at the Ruby Throat. You didn't win, but you picked up a little knowledge on the other Kindred at the table. By name-dropping a significant individual around Atlantic City, you gain one die on rolls to get into places or acquire information otherwise out of your league — but pick the wrong name and it's likely to get back to them.",
            },
            {
                dot: 2,
                name: "What's in Your Sleeves",
                description:
                    "Someone accused you of cheating at the Ruby Throat and you publicly put them in their place. You dealt with the situation so well, you were offered work as a bouncer. This role allows a two-dice bonus to all Intimidation rolls when dealing with Kindred in the criminal scene, and you can put names to faces of almost any Kindred who might frequent Atlantic City night spots.",
            },
            {
                dot: 3,
                name: "Chicken Dinner",
                description:
                    "A hand went your way recently and you got your choice of coveted prizes. Once per story, you gain a human vessel with a Dyscrasia of your choice to feed from as desired. Unless specified, the Dyscrasia does not fade after use. You are responsible for this retainer for the time you use them, and if anything happens to them, you will owe the house significant reparations.",
            },
            {
                dot: 4,
                name: "High Roller",
                description:
                    "You've had a string of luck at the Ruby Throat that got attention — some even said it was unrealistic. Any existing Resources Background is increased by two (to a maximum of four), and you gain access to Herd (••) whenever you are within Atlantic City, each vessel with a resonance of your choosing. You also suffer Adversary (•), as a fellow Kindred thinks you're gaming the house.",
            },
            {
                dot: 5,
                name: "Dead Man's Hand",
                description:
                    "You've been invited to play at the Johnson table, the highest risk game the Ruby Throat offers. The annual event draws spectators and is the talk of the Kindred underworld. Word gets out about the players involved, and up until the game comes to pass, you benefit from Status (•••) among Kindred in Atlantic City and the ability to access any lesser games and gambits without a roll.",
            },
        ],
    },
    {
        id: "descendant-of-de-camden",
        name: "Descendant of Roger de Camden",
        source: "trails-of-ash-and-bone",
        requiresStPermission: true,
        clanRestriction: ["Hecata"],
        dots: [
            {
                dot: 1,
                name: "Proud Childe",
                description:
                    "Your grandsire is among the most storied and respected of any to walk among the Clan of Death. While within any Hecata controlled domain, haven, or social gathering, you have two dots of Status (••).",
            },
            {
                dot: 2,
                name: "Corpsense",
                description:
                    "You follow in your ancestor's footsteps with a fascination and understanding of the deceased. You gain two dice to any pool for investigating the cause of injury or death of a body. At any time, if a nearby wraith chooses to, they can always communicate with you with ease.",
            },
            {
                dot: 3,
                name: "Eye to Eye",
                description:
                    "Roger de Camden's relationship with the Ventrue Mithras was deep, complex, and the gossip of generations. While the Blue Bloods respect little outside their own clan, they recognize how significant de Camden was to one of their greatest. You receive two dice to all Persuasion or Intimidation pools when dealing with Kindred of Clan Ventrue, and careful mentions of your lineage could get you through doors non-Ventrue might never pass.",
            },
            {
                dot: 4,
                name: "The Way of All Flesh",
                description:
                    "The bloodline of de Camden screams out to the spirits of the recently deceased, dragging them back to the physical realm long after they should have departed forever. You can perform the Embrace as normal on an old corpse so long as it has not rotted beyond recognition. This rebirth is far more traumatic than usual, and the fledgling is deeply affected by whatever they experienced in their brief time between lives.",
            },
            {
                dot: 5,
                name: "Perchance to Dream",
                description:
                    "Like your forefather before you, you are forever preoccupied with the world of the dead, their souls so close you can almost reach out to touch them. Occasionally during your daily rest or torpor, your spirit wanders into the Shadowlands. What you may see there, or what wraiths may be drawn to your presence, is anyone's guess. If you are attacked while in the Shadowlands, you are immediately returned to your physical form, suffering one level of Superficial Willpower damage.",
            },
        ],
    },
    {
        id: "relics-of-the-veil",
        name: "Relics of the Veil",
        source: "trails-of-ash-and-bone",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Torn Shroud",
                description:
                    "This small fragment of torn material resembles a frail, semi-translucent shroud — cold to the touch, with a fleshy, almost biological consistency. While holding the shroud, you gain one die to your pools to use any Oblivion Discipline. The shroud is delicate, and with constant use it simply dissolves to nothing.",
            },
            {
                dot: 2,
                name: "Burning Effigy",
                description:
                    "The origin of this odd little doll is unknown — made of nothing more than a jumble of sticks and colored string, yet it looks a little like you. Once, you can ignite the doll and burn it to ashes. Upon waking next dusk, you heal up to two extra levels of Aggravated Health damage. Somewhere, possibly far away, this pain is felt by something else. After a story, you find the effigy in your haven untouched by flames.",
            },
            {
                dot: 3,
                name: "The Gaunt Robe",
                description:
                    "The plain gray robe has existed in your family for generations. Threadbare and falling apart, it needs careful care to keep together. When the robe is around your shoulders, it's oddly comforting, like being held closely. While wearing the robe, you can spend one Willpower point to gain two automatic successes in any roll to resist the abilities of wraiths.",
            },
            {
                dot: 4,
                name: "The Nails of Dismus",
                description:
                    "Three of these 8-inch gnarled lengths of unidentifiable metal are known to exist, usually on display in old-world cathedrals. Somehow you possess one. They function as a light piercing weapon with a +2 damage value and can incapacitate a vampire as if made of wood. Any Kindred staked with the Nail of Dismus suffers a level of Aggravated Willpower damage at dawn every night they remain staked, as the nail drives their waking moments into constant visions of suffering and horror.",
            },
            {
                dot: 5,
                name: "Codex Caecitus",
                description:
                    "Bound in white flesh from a pig fed on human remains, this massive book is held shut with a locking brass latch. Page after page is filled with maddened scrawling, nightmarish biological sketching, and blocks of text in an unknown cipher. Allegedly penned by a blind monk under the service of Cappadocius. Once per story, the current owner can — after long hours of meditation — decipher one coded passage, revealing powerful secrets of the dead: the names of significant wraiths, the fetter of a particular wraith, or the knowledge of any chosen Oblivion ritual. If held by a non-Hecata, the Necromancers aggressively seek to reclaim it.",
            },
        ],
    },

    // ── Live From the Succubus Club Loresheets ───────────────────────────────
    {
        id: "descendant-of-idder",
        name: "Descendant of Idder",
        source: "succubus-club",
        requiresStPermission: true,
        clanRestriction: ["Banu Haqim"],
        dots: [
            {
                dot: 1,
                name: "Animal Affinity",
                description:
                    "Idder's descendants have a knack for animal ghouls. You may reroll any Rouse checks to maintain animal ghouls. If you possess the Bond Famulus power, you may have two Famuli.",
            },
            {
                dot: 2,
                name: "Shepherd",
                description:
                    "Your sire passed down collected wisdom related to maintaining a Herd. This wisdom allows you to slake one additional Hunger from your Herd per session.",
            },
            {
                dot: 3,
                name: "Never Unprepared",
                description:
                    "Your Blood tells you where mortals may be and when they are easy pickings. The first time you hunt mortals in a new city or environment, you gain a two-dice bonus to the attempt.",
            },
            {
                dot: 4,
                name: "Safe Haven",
                description:
                    "Fear of the Sun doesn't drive you like it does other Kindred, as your Blood knows where to find shelter. If you ever need sanctuary from the sun, so long as you are not restrained and you have 30 minutes before sunrise, your Beast finds you shelter from the sun at the cost of gaining one Hunger.",
            },
            {
                dot: 5,
                name: "Haqim's Justice",
                description:
                    "Your Blood drives you to protect your own. Whenever your Herd, Contacts, Allies, Touchstones, or other close Relationship Map connections are threatened, you gain a two-dice bonus to all actions in a scene to defend them or seek retribution. Once per story, you can declare a vendetta and gain a two-dice bonus against one specific target until justice or vengeance has been served.",
            },
        ],
    },
    {
        id: "descendant-of-kerwiya",
        name: "Descendant of Kerwiya",
        source: "succubus-club",
        requiresStPermission: true,
        clanRestriction: ["Gangrel"],
        dots: [
            {
                dot: 1,
                name: "Hidden Predator",
                description:
                    "Kerwiya's vitae cloaks you from others. You do not need to drink the Blood of another Kindred who knows Obfuscate to learn it, though it is still counted as a non-clan Discipline for the purpose of experience cost.",
            },
            {
                dot: 2,
                name: "Politically Adept",
                description:
                    "You develop an instinctive sense for Kindred politics. You gain a specialty for Politics, Insight, and Subterfuge usable against other vampires (or the first dot in any of these you lack). Your focus on the politics of the dead has made you ignore the nuances of mortal assembly — you can't take specialties related to mortal politics or social customs.",
            },
            {
                dot: 3,
                name: "Actions Have Consequences",
                description:
                    "Your Blood warns you before you make foolish mistakes. Once per story, you can ask the Storyteller if the decision you're making increases the danger you're in regarding other Kindred. The Storyteller gives a yes or no answer. You can use this again if the Storyteller cannot answer clearly.",
            },
            {
                dot: 4,
                name: "The Boon Economy",
                description:
                    "You leverage prestation better than most, noting minor causes for Boons that others might miss. Once per story, you may upgrade a trivial or minor boon owed to you by one degree (e.g., trivial to minor, minor to major).",
            },
            {
                dot: 5,
                name: "Echoes of Constantinople",
                description:
                    "The Greek Gangrel of Constantinople were renowned for their political insight, and you have the same knack for winning political battles with one decisive move. When your dice pool involves Insight, Subterfuge, or Politics, you can set any single die to a 10 after rolling.",
            },
        ],
    },
    {
        id: "descendant-of-phaedyme",
        name: "Descendant of Phaedyme",
        source: "succubus-club",
        requiresStPermission: true,
        clanRestriction: ["Ravnos"],
        dots: [
            {
                dot: 1,
                name: "Skilled Traveler",
                description:
                    "Your Blood has given you an instinct to keep you safe on your travels. Select a specialty for Athletics, Brawl, or Melee, and another for Drive or Stealth (or gain the first dot if you lack a rating). These do not count against your specialty limit. All your time on the road has kept you from delving into realms of knowledge — you can't take specialties in Academics, Science, or Medicine.",
            },
            {
                dot: 2,
                name: "Safe Routes",
                description:
                    "You keep track of your options and don't need a map app to tell you which routes will likely be blocked or under construction. Once per session, you can evade roadblocks and obstacles by taking the longer route, possibly suffering the consequences of arriving late instead.",
            },
            {
                dot: 3,
                name: "Renown Guardian",
                description:
                    "The name of your ancestors carries weight. Once per story, if you ask the Prince, Baron, Justicar, or other local authority for responsibility in security, they'll grant it to you — possibly with minor conditions, without reward, or even officially deputizing you as a temporary Hound or Archon.",
            },
            {
                dot: 4,
                name: "Honor Among the Honorless",
                description:
                    "The blood of your ancestor offers succor through honor and duty. Choose one additional Conviction related to duty, honor, or chivalry. You can maintain this Conviction without recourse to a Touchstone.",
            },
            {
                dot: 5,
                name: "Defender",
                description:
                    "Phaedyme's Blood drives you to defend your charges, quickening your limbs and strengthening your attacks. Once per story, when defending someone or something important to you (a Touchstone, coterie-mate, or other Relationship Map connection — not merely yourself), you reroll all Rouse checks for Blood Surges for any dice pools related to defending your charge for the entire scene.",
            },
        ],
    },
    {
        id: "descendant-of-the-fallen-lord",
        name: "Descendant of the Fallen Lord",
        source: "succubus-club",
        requiresStPermission: true,
        clanRestriction: ["Salubri"],
        dots: [
            {
                dot: 1,
                name: "Instinct for Death",
                description:
                    "The Fallen Lord's Blood gives you a knack for violence. You gain two combat-related specialties divided among Athletics, Brawl, Firearms, or Melee (or gain the first dot if you have no existing rating). These do not count against your specialty maximum. Unfortunately your violent demeanor increases the Difficulty of Social tests with Kindred of Humanity 9 or 10 or particularly humane mortals by 1.",
            },
            {
                dot: 2,
                name: "Tracker's Mark",
                description:
                    "The Fallen Lord's Blood sings to you a sacred rite to hunt your enemies. You gain a two-dice bonus on all checks to track any opponent you have attacked in combat.",
            },
            {
                dot: 3,
                name: "Fury's Strike",
                description:
                    "You embody the warriors of old, feeding your Beast on violence. Once per scene, you may activate a Discipline Power against one target immediately after hitting them in close combat. You are considered to have eye contact or touch them if required by the power.",
            },
            {
                dot: 4,
                name: "What Must Be Done",
                description:
                    "You possess a righteous anger and the right to do what must be done, whether in combat or cold-blooded murder. You gain an additional Conviction that cannot be lost and is not tied to a Touchstone. This Conviction must be related to destroying your enemies.",
            },
            {
                dot: 5,
                name: "Vengeful Eye",
                description:
                    "Your gaze terrifies your enemies and helps your blade strike true. When you spend Willpower to re-roll dice in melee combat, you can reroll one additional die, which can be a Hunger die. Your third eye reveals itself to your adversary, which may violate the Masquerade or draw unwanted attention.",
            },
        ],
    },
    {
        id: "succubus-club-copycat",
        name: "Succubus Club Copycat",
        source: "succubus-club",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Finger on the Pulse",
                description:
                    "The club acts as the nexus point for anyone who's anyone, and as the owner, you know them all. You receive a one-die bonus to Social pools involving important mortals, as they seek to curry your favor (or discretion).",
            },
            {
                dot: 2,
                name: "Energizing Beat",
                description:
                    "A success owes much to the club's hedonistic vibe and world-class set lists. For the Kindred guests, this makes for a rich hunting ground. All blood Resonance is considered Intense for you when hunting in the club.",
            },
            {
                dot: 3,
                name: "Damage Control",
                description:
                    "Trained staff are on standby to negate the worst impacts of a feed gone wrong, no questions asked. Once per session while hunting in the club, if you get a Messy Critical on a test or fail a Frenzy test, you can reroll all dice.",
            },
            {
                dot: 4,
                name: "Loyalty",
                description:
                    "Your staff are dedicated to you in a way that's hard to explain, almost as if the club itself had its hooks into them to ensure their unwavering loyalty. Any attempts by other Kindred to blood bond, Dominate, or sway your staff with Presence automatically fail if it would negatively impact you or the club.",
            },
            {
                dot: 5,
                name: "Destination of Choice",
                description:
                    "The reputation and mystique of the Succubus Club is legendary, so much so that even its clones carry that same seductive atmosphere of excess, edge, and danger. If the city's undead leaders are hosting a gathering, you can successfully petition to have it hosted in your club, should you wish, once per session.",
            },
        ],
    },
    {
        id: "temple-of-boom-contract",
        name: "Temple of Boom Contract",
        source: "succubus-club",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Chocolate Drop",
                description:
                    "You're the newest employee of Temple of Boom, either as a performer or promoter in your city. Gain a dot in Fame and a dot in Contacts. Your newfound status has a downside: gain the Stalker Flaw.",
            },
            {
                dot: 2,
                name: "Got Connections",
                description:
                    "Temple of Boom is always looking for new talent and is not above poaching from competitors. At the Storyteller's discretion, you may request an advance on your salary and add two dots of Resources or Contacts for the rest of the current story, in exchange for procuring new talent for Temple of Boom.",
            },
            {
                dot: 3,
                name: "This is Fine",
                description:
                    "Once per story, you may name-drop Victor Temple and gain three extra dice to Social tests in a business or entertainment environment (such as gaining entrance to a nightclub) for the remainder of the scene. Should you do this, you will automatically become a person of interest to someone who has beef with Victor Temple or Temple of Boom. Gain the Enemy Flaw at one dot for the rest of the current story.",
            },
            {
                dot: 4,
                name: "Maharaja/Maharani",
                description:
                    "Temple of Boom isn't just a recording label, but also a coveted name in the nightclub business. By demonstrating loyalty to the Temple of Boom business family, Victor Temple has granted you the right to open one of his clubs as a franchise in your city. Your Haven, Fame, Resources, and Herd all increase by one dot, and you receive a specialty in either Finance (Accounting) or Performance (Showmanship). Due to Victor Temple's tactic of hiding in plain sight, your association with the club grants the Compromised Haven Flaw.",
            },
            {
                dot: 5,
                name: "If Not Now, When?",
                description:
                    "Victor Temple owes you a Major Boon. Whether you obtained this from him personally or through transfers, it is the most valuable currency you own. At Storyteller discretion, you may personally request something significant from the wealthy, influential Ventrue — such as access to Hunter weapons or even the phone number of a local Werewolf. Should you do this, the Ivory Tower will not be able to ignore your connection to the Anarch Movement. Gain the Shunned (Camarilla) Flaw.",
            },
        ],
    },

    // ── Download / Choice of Games Loresheets ───────────────────────────────
    {
        id: "stories-of-the-daughters",
        name: "Stories of the Daughters",
        source: "download",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Aspiring Idol",
                description:
                    "Whether trained daily before your Embrace or naturally gifted, your voice carries power. Receive two additional dice to any roll involving singing, but if you fail, suffer an immediate Compulsion for the shame you brought on yourself.",
            },
            {
                dot: 2,
                name: "Surprise Performance",
                description:
                    "The talent lies dormant within you and comes to light in the most unexpected moments. Once per story, receive two extra successes on a roll involving public speaking. This can be done after the roll has been made and can be paired with using Presence.",
            },
            {
                dot: 3,
                name: "Wayward Daughter",
                description:
                    "Whatever you've heard about Daughters of Cacophony, you turned it into your identity. You successfully (so far) pretend to be a Daughter in your domain and have convinced local Kindred society to treat you like a big deal. Receive four dots to distribute among Status, Herd, and Mawla. However, someone — like your sire — knows your secret and might use it against you. If exposed, lose your gained advantages and gain Flaw: Suspect among the faction you're most acquainted with.",
            },
            {
                dot: 4,
                name: "Songstress Supreme",
                description:
                    "Whether vitae of the Daughters really flows in your veins or you're just exceptionally talented, your voice surpasses most mortal singers. Gain four additional dice to any vocal performances. Your talent has earned unwanted attention — gain the Stalkers Flaw and a single powerful Adversary who feels either jealous or possessive of you.",
            },
            {
                dot: 5,
                name: "Rejuvenating Voice",
                description:
                    "Your voice is almost supernaturally soothing. Gain two additional dice to non-intimidation Presence rolls and while using Quell the Beast or Obeah. Once per story, you can restore three levels of Superficial Willpower damage to everyone capable of hearing your voice. This performance must last for one scene — if interrupted, all listeners suffer one point of Superficial Willpower damage instead.",
            },
        ],
    },
    {
        id: "road-courier",
        name: "Road Courier",
        source: "download",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Bucket",
                description:
                    "As long as you're in an urban area or along a major road, you rarely have problems finding a ride for the night. Add two extra dice to your Intelligence + Streetwise rolls while looking for a temporary vehicle. Every success above the margin of difficulty gives some extra comfort and ensures you won't instantly alert the police.",
            },
            {
                dot: 2,
                name: "Six in the Morning",
                description:
                    "You know a hundred forgotten caves, empty garages, and abandoned warehouses. Once per story, receive a four-dice bonus to a Survival test to find shelter, as long as you're on a road or street and have a vehicle. Your temporary haven is big enough for a large van.",
            },
            {
                dot: 3,
                name: "Ride or Die",
                description:
                    "Unlife is filled with uncertainties, but at least there's one thing you know you can always count on. Select one vehicle that you've had for at least one entire story; the bonus for operating and working on this vehicle is three dice.",
            },
            {
                dot: 4,
                name: "Highway Harbinger",
                description:
                    "You've been delivering bad news long enough that vampires know your arrival spells trouble. For the first three nights in a new city after you announce yourself, you gain a three-dice bonus to all Intimidation, Investigation, and Streetwise tests with vampires. However, a paranoid Prince or other notable vampire makes it their business to end you or drive you out — gain a two-dot Adversary for as long as you stay in the city.",
            },
            {
                dot: 5,
                name: "Midnight Express",
                description:
                    "You know spotters, scouts, and fellow couriers across the country. They function as two dots in Contacts. Once per story, you can order them to watch and clear the roads ahead of you for a single night, letting you maintain highway speed in even the worst bucket and 150 mph in a high-end vehicle. Your spotters clear mundane problems but can't protect you from vampires, Lupines, or other supernatural threats — though they can warn you or provide alternate routes.",
            },
        ],
    },
    {
        id: "amanda-chastain",
        name: "Amanda Chastain",
        source: "download",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "The Pulse",
                description:
                    "In frequent talks with Chastain, you receive stock tips, insider trading offers, and invitations to investment clubs, all of which prove fruitful. Once per story, gain three extra dice in any Finance dice pools.",
            },
            {
                dot: 2,
                name: "Boss Lady",
                description:
                    "You have a personal relationship with Chastain. Not only does she consider you an associate, but she has taken you under her wing and acts as your mentor. You possess Mawla (••) (Amanda Chastain). If you're too public with this relationship, you may risk attracting the attention of one of Amanda's enemies (•).",
            },
            {
                dot: 3,
                name: "Hacking the System",
                description:
                    "Having access to many of Chastain's contacts, you have made acquaintance with a group of mortal hackers. This grants you a permanent Contact (•). The group can help you out for the right price, and once per story you can add three extra dice to your pool while hacking. Each hack comes with risks — failing may result in compromising your Mask or Haven at the Storyteller's discretion.",
            },
            {
                dot: 4,
                name: "Blood Work",
                description:
                    "Chastain has access to the Circulatory System and is willing to share the blood for a favor or two. You can perform long-distance tasks for her (no more than twice per story, difficulty 4). Upon succeeding, you receive a vessel bearing a resonance of your choice. Failing at fulfilling Amanda's orders may pose additional risks depending on the nature of the task.",
            },
            {
                dot: 5,
                name: "Learning the System",
                description:
                    "Chastain considers you a close personal friend and has taught you her system of setting up a domain. She has given you the tools of her rather ruthless and influential trade. Gain Influence (••). When dealing with mortal politicians, law enforcement, or the media, add two extra dice to all Social dice pools. Once per story, you may ask for Chastain's assistance and receive it (at the Storyteller's discretion).",
            },
        ],
    },
    {
        id: "sheriff-qui",
        name: "Sheriff Qui",
        source: "download",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Ally of an Ally",
                description:
                    "You've worked for Qui in the past — but not directly. You've never actually met the Sheriff, but that doesn't stop you from using the association to your advantage. Once per story, you may successfully talk your way out of (or into) trouble by invoking Qui's name at the Storyteller's discretion.",
            },
            {
                dot: 2,
                name: "He Calls His Car 'She'",
                description:
                    "Before his appointment as Sheriff, Qui was known as a discreet and reliable fixer. You were one of his favored suppliers, gaining his gratitude for procuring a silver sedan he still favors for stakeouts. Gain a two-dice bonus on Finance, Streetwise, or Persuasion tests involving selling or obtaining vehicles and vehicle parts.",
            },
            {
                dot: 3,
                name: "Private Eye",
                description:
                    "You were tutored by Qui in the subtle art of sleuthing and have spent years honing your skills. In a rare moment of candor, the Sheriff professed you were one of the most capable students he'd ever trained. Gain Specialty (Sleuthing) to either Investigation or Streetwise, and once per story, add four dice to a roll using this specialty.",
            },
            {
                dot: 4,
                name: "Comrades in Arms",
                description:
                    "Many years ago, you assisted Qui in the successful defense of Ottawa against Montreal's Sabbat raiders. Those few who survived regard you as an ally. These comrades count as a three-dot Mawla and will fight on your behalf once per story (with 24 hours' notice). In addition to battle prowess, they give one automatic success in any conflict involving the Sabbat.",
            },
            {
                dot: 5,
                name: "Dangerous Secrets",
                description:
                    "You've worked closely with Qui and learned a key piece of the secret to his subversion of the Nosferatu curse. Powerful Kindred believe it's true and will offer a major boon in exchange for everything you know. If you choose to sell, gain six dots to spend on any combination of Contacts, Influence, Haven, and Resources — but Qui becomes a four-dot Adversary. Keeping the secret earns Qui's respect, and you may call on him once per chronicle as a four-dot Mawla.",
            },
        ],
    },
    {
        id: "parthenon-troupe",
        name: "The Parthenon Troupe",
        source: "download",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Silent Actor",
                description:
                    "Your life as a ghoul is over, but your silent years allowed you to cultivate extraordinary powers of observation. It's amazing what one can discover if they can keep their mouth shut. Once per story, you can ask the Storyteller for a piece of information that is hidden from everyone else but obvious to you.",
            },
            {
                dot: 2,
                name: "It Speaks",
                description:
                    "You proved yourself to the Prince and were finally given speaking parts in the troupe, performing in front of Kindred and mortals. Gain Fame (•) and two extra dice whenever performing plays you learned with the troupe. One of the troupe ghouls is jealous of you, earning you Enemy (•).",
            },
            {
                dot: 3,
                name: "No Longer in the Shadows",
                description:
                    "Years spent on stage made you crave attention, and you know you shine best when all the lights are on you. Whenever members of your coterie make a significant attempt to stay low (using Stealth or Composure rolls) with you present, you can automatically cause them to fail in exchange for three additional dice to your next Charisma roll.",
            },
            {
                dot: 4,
                name: "Diva",
                description:
                    "You have been part of the Prince's troupe for as long as you can remember, surviving long years of hard work, abusive impresarios, and the jealousy of fellow players. Distribute three dots among Fame and Herd, and gain two additional dice to your performances while on stage. Gain Enemy (••) Stalker.",
            },
            {
                dot: 5,
                name: "Impresario",
                description:
                    "Long gone are the days of stage fright before a dead-hearted audience. You know the ins and outs of the Prince's court and exactly how to put together a show that brings results. Gain three dots to distribute among Influence and Status. Once per story, gain three dice to a Performance roll meant to sway the minds of others to your gain. A Messy Critical or Bestial Failure may end in disastrous consequences to your cause.",
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
