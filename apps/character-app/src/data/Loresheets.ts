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
                name: "Dangerous Reputation",
                description:
                    "Bahari intimidate vampires not of their order. Vampire believers in the Cainite mythos feel uncomfortable in your presence. Once per story, you may add two dice to Intimidation pools in tests against Caine-worshipers, assuming they know of your allegiance.",
            },
            {
                dot: 2,
                name: "Ritual Scarification",
                description:
                    "You know pain leads to enlightenment. Specifically, the Lilitu preach that bringing one's physical shell to the extremes of sensation grants greater insight. Once per session, you may scar yourself with one point of Aggravated damage to recover a level of Willpower damage: superficial or Aggravated.",
            },
            {
                dot: 3,
                name: "Sacrifice the Children",
                description:
                    "The Bahari believe both in siring childer and sacrifice. Faithful Bahari know the ultimate sacrifice is the murder of their own childe. If you diablerize your childe, you gain three extra dice in your Humanity + Blood Potency dice pool to absorb Disciplines (see Diablerie, p. 234).",
            },
            {
                dot: 4,
                name: "The Womb's Blood",
                description:
                    "Bahari consider fertility and sex sources of strength, with some factions placing special prominence on blood or vitae taken from the womb. Once per story, after drinking blood from the uterus, you receive an additional two dots in either Stamina or Resolve (thus increasing Health or Willpower by two) until the dawn.",
            },
            {
                dot: 5,
                name: "First-Cursed",
                description:
                    "Lilith's worshipers maintain that she was the first living being cursed by God, before Adam, Eve, or Caine. The Bahari strive to emulate Lilith's lesser curse, and in so doing find their Cainite weaknesses lessened. You retain your clan bane, but you can now walk in the first hour of daylight and final hour of dusk; you can also engage in intercourse without Rousing the Blood. However, you radiate danger: the equivalent of the Obvious Predator (●) Flaw. All Social tests to ostracize or slander you have their Difficulty reduced by one. Finally, any vampire assessing you with Auspex immediately suffers migraine-like headaches; their Resolve and Willpower drop by half your Resolve (rounded up) for one scene.",
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
                name: "Rebel Cell",
                description:
                    "You command a pack of rebellious mortals and fuel their fire with something that keeps them fighting. Perhaps you feed them vitae or maybe you embody their ideals. Either way, these rebels (a three-dot Ally group equivalent) perform a single dangerous task for you without your presence, before disbanding until the next story.",
            },
            {
                dot: 2,
                name: "True Anarch",
                description:
                    "You were an Anarch before Bell led an army of Camarilla Brujah into the Anarch Movement, and you resent these tagalongs joining the Anarchs just as they grow popular. You have records, names, places, and dates about who the rebels were and are, fed to you by the Man or gathered personally. Either way, you get two automatic successes on any Investigation test concerning vampires who defected to the Anarch Movement.",
            },
            {
                dot: 3,
                name: "Contact Information",
                description:
                    "Whether by dead drop, messenger, or arcane means, you can get word to Theo. Whether he responds, or even listens, depends on the message and your earlier interactions, but if he likes what you have to say, he might be able to move mountains. The precise game effects of a message to Theo are up to the Storyteller.",
            },
            {
                dot: 4,
                name: "Bell's Circle",
                description:
                    "Theo trusts you, perhaps because of your earlier revolutionary actions or because you manipulated your way into his good graces. Bell is equivalent to a five-dot Mawla, but your association with him also has many drawbacks.",
            },
            {
                dot: 5,
                name: "Sect Neutrality",
                description:
                    "Following Theo Bell's lead, you have a small contingent of a few Brujah loyal to your vision, and you can influence them in any direction: the Camarilla, the Anarchs, or even to form a smaller subsect neutral amidst the Jyhad. You may resent their existence or take pride in your following. Not mindless disciples, these Kindred keep track of favors granted. But until they rebel against you, you have five dots to spend among Contacts, Haven (safe houses), Mawla, and Retainers.",
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
                name: "Let He Who Hath Understanding",
                description:
                    "The Storyteller will give you one clue freely to understand, investigate, or detect the Heresy's actions or plans, now or in previous centuries. You can use this lore once per story.",
            },
            {
                dot: 2,
                name: "Hand of the Heresy",
                description:
                    "Take a total of three dots from among Allies, Herd, Mawla, or Retainers to represent your role in the city's Heretical deaconate. For example, if you took Herd and Mawla, you might bless a small cult of human worshipers and have a renowned scholar of the Heresy as your teacher. You also have the Dark Secret Flaw (Heresy) in some domains.",
            },
            {
                dot: 3,
                name: "Counter-Inquisition",
                description:
                    "You can smell True Faith on a human; if you need to test to do so, your pool is Resolve + your highest rating in Cainite Heresy. You might also oppose the Heresy, and instead use this gift to know who to trust.",
            },
            {
                dot: 4,
                name: "Red Celebrant",
                description:
                    "You know the rituals and the specific dosages to induce the Red Pentecost in a human congregation: a kind of ecstatic religious version of the frenzy. During the Red Pentecost, humans act according to their worst natures. You can procure enough herbs and fungi for one ceremony per story; the Red Ceremony requires a Hunger check and may trigger frenzy in Kindred participants.",
            },
            {
                dot: 5,
                name: "The One Named in Prophecy",
                description:
                    "You are a linchpin of the Heresy's plans: perhaps they consider you an avatar of Caine, you possess the only copy of the Testimony of St. Panteleimon, or your vitae is the only effective sacrifice to Ialdabaoth to propitiate or distract the Demiurge. Every informed member of the Heresy, and many who simply want to curry favor with the Anarchs, know your role. Once per story, you can use this fact to dictate the winner of a Social conflict if you can give a plausible reason for that outcome.",
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
                name: "Embrace the Vision",
                description:
                    "You are fully committed to Carna's vision for a new Tremere clan and find yourself possessed of a greater sense of self-belief in the presence of your fellow sub-faction Kindred. When around other members of House Carna, you have one additional die for all Willpower tests.",
            },
            {
                dot: 2,
                name: "The Rebel Trail",
                description:
                    "You followed Carna's trail after her initial breakage from Clan Tremere, soaking up the feelings of rebellion and freedom. You resolve to never be a Blood slave again. Whenever at risk of becoming Blood Bound, you may make a Willpower test (with a Difficulty equal to the Blood Potency of the ingested vitae) to ignore it.",
            },
            {
                dot: 3,
                name: "Unorthodox Rituals",
                description:
                    "Carna gives of her sanity or her soul to fuel her magic, instead of divesting her vitae in Hermetic orthodoxy. Your understanding of her process enables you to perform rituals in the same way. You can perform one known ritual per story without the need to expend Blood, but on a messy critical, you also become deranged in some way (typically becoming intensely paranoid or fearful of blood) until the end of the story.",
            },
            {
                dot: 4,
                name: "Reimagined Bond",
                description:
                    "You have studied Carna's magic and her unusual method of reimagining the vinculum, and you can extend the effects of her ritual to others. Having sex with a target, mortal or undead, creates a Blood Bond between the partner, yourself, and Carna, despite Carna's absence. Repeated sexual encounters strengthen the Blood Bond, as per the normal Bond. You can thus circumvent the Tremere clan bane, but the Bond only lasts until the conclusion of the story.",
            },
            {
                dot: 5,
                name: "Book of the Grave-War",
                description:
                    "According to rumor, the tome known as the Book of the Grave-War allowed Carna to break her Bond to Clan Tremere. You own a copy, granting you one automatic success on all Occult tests pertaining to Gehenna, its prevention, and breaking the shackles binding vampires to their elders. The book makes you unbondable for as long as you retain it and follow its arcane teachings. However, Tremere seek to destroy you and the book; the Storyteller can also penalize you one die on any Social or Mental test affected by your ongoing paranoia.",
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
                name: "Tap into the System",
                description:
                    "Once per story, you can request specific blood vessels from the Circulatory System to convey certain abilities – or to provide for a Ventrue who finds their feeding preference neglected in the domain.",
            },
            {
                dot: 2,
                name: "Little Black Book",
                description:
                    "You have come into the possession of one of the System's little black books. These books contain records of blood experiments and theories on the power of select vessels' blood. The Storyteller determines the book's accuracy on specific matters; in general, it adds one die to Investigation, Alchemy, Medicine, or Science tests to track down or test a specific vintage. It also cuts the time to research a new two-dot or three-dot thin-blood Alchemy formula in half.",
            },
            {
                dot: 3,
                name: "Farm Upstate",
                description:
                    "You know where the System keeps a farm of valuable vessels: mortals with blood potent enough to convey benefits to Kindred drinkers. You can raid the farm, lease specific vessels at cost, or try to muscle your way in. These vessels are equivalent to four dots of Herd, but you can only feed from them once per week unless you overtly take over the farm.",
            },
            {
                dot: 4,
                name: "Secure Transit",
                description:
                    "The Circulatory System uses armored vans and armed ghoul drivers to transport vessels from A to B. These protected modes of transit are more than simple security vans; they bristle with weapons and sometimes contain incredibly valuable vessels destined for important buyers. You have access to one of these vans. Whether you're riding up front as a legitimate driver or have successfully hijacked one of these vans, you may arrange secure travel for one or more Kindred with little effort.",
            },
            {
                dot: 5,
                name: "Blood Sommelier",
                description:
                    "You know the Circulatory System's secret methods for taste, analysis, and refinement, and you can replicate them. Perhaps you own a blood laboratory, have an alchemist or blood sorcerer on call, or you just stay au courant on aficionado gossip. You can add two dice to any test to discover the Resonance of blood, and you can select three dots of Contacts, Allies, or Haven Merits to explain your knowledge. Once per story, you can ask the Storyteller the properties of the most valuable vessel's blood.",
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
                name: "Thorns Historian",
                description:
                    "The Convention of Thorns was a complex, moving beast of diplomacy. Hundreds of small meetings took place between representatives of this clan or that, forging pacts that lasted years, decades, or centuries in some cases. You possess an encyclopedic knowledge of the convention's minor meetings, and you can call on this knowledge to apply legal pressures on the participants or their descendants, where pacts may still be in force but not practiced or revoked without consent of all parties. Once per story, you can ask the Storyteller for a piece of known information regarding the convention.",
            },
            {
                dot: 2,
                name: "Tradition Master",
                description:
                    "The six Traditions the Camarilla cling to tonight were first codified and agreed upon at the Convention of Thorns. Your knowledge of the convention extends to multiple apocryphal or proposed Traditions, some of which nearly passed. Once per chronicle, you can exercise fringe laws in domains where the ruling clans may still be sympathetic to the unaccepted Traditions of Thorns. Example pseudo-Traditions might include: Kindred in this domain are only permitted one Embrace; all law enforcement is forbidden as feeding stock; combat in Elysium is punishable by Final Death; diablerie is permitted against any Caitiff discovered in this domain; etc.",
            },
            {
                dot: 3,
                name: "Convention Secrets",
                description:
                    "The Ministry declined an invitation to join as the eighth pillar clan; the Lasombra rejected the Camarilla when it refused to acknowledge the existence of Antediluvians. You have uncovered still-more obscure secret proposals from the Convention: the Cappadocian petition to join, the Malkavians' symbol draft, and more. You can drop enough hints to always take a one-die bonus to Social tests involving Kindred who were present at the convention. You also know a number of major secrets, each worth a Major Boon to some powerful Cainite. Once per story, you can ask the Storyteller for the name of a Kindred who needs your knowledge.",
            },
            {
                dot: 4,
                name: "Prospective Justicar",
                description:
                    "The Camarilla Justicars first received appointment during the Convention of Thorns. No matter your political allegiance, somehow you (or your sire, if you are far too young) have powerful support to become the next Justicar of your clan. If your clan is not one represented widely in the Camarilla, perhaps this appointment signals a sea change among the sect's clans.",
            },
            {
                dot: 5,
                name: "New Traditions",
                description:
                    "Your knowledge of the Convention of Thorns is such that you can compile enough evidence and support to propose a new Tradition, or an amendment to an existing one, to the Camarilla's Inner Circle. This Tradition may be accepted if it sounds sensible and helps the increasingly strict Camarilla in the world tonight, or it may mark you as a firebrand and danger to the sect. Importantly, your voice will be heard without prior judgment.",
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
                name: "Mistakes of the Past",
                description:
                    "You know Kindred history and can cite chapter and verse of the domains and Princes the Inquisition destroyed in its original incarnation. You can educate any vampire on the Inquisition's historic dangers. Once per story, you can ask the Storyteller for one piece of information regarding the original Inquisition.",
            },
            {
                dot: 2,
                name: "Names of the Guilty",
                description:
                    "Your knowledge of vampire and Inquisition relations extends to include Kindred manipulators. Though most are dead by these nights, many of their descendants survive, and they are at risk of blackmail for their sires' treacheries. Once per story, you can ask the Storyteller for the name of one descendant of these traitors in your domain, if there is one.",
            },
            {
                dot: 3,
                name: "The Sect of St. James",
                description:
                    "You have contacts who consider themselves \"old Inquisitors.\" The Sectus Sancti Iacomi harbors a deep resentment for their fancy modern counterparts, acting with greater fanaticism and suicidal zeal than the more controlled Second Inquisition. Their abbé is a four-dot Contact, whom you can contact once per story.",
            },
            {
                dot: 4,
                name: "The Second Act",
                description:
                    "You have a Contact within the Second Inquisition or the local Catholic archdiocese: a file clerk, scout hunter, exorcist, armorer, etc. You have no power over them, but you know how to pump them for information – or prime them with disinformation – if need be.",
            },
            {
                dot: 5,
                name: "Black Spot",
                description:
                    "You have identified a location within your domain that the Second Inquisition fears to tread. Once per story, if you or anyone targeted by the Second Inquisition hides out at this location, the hunters call off the search. This anomaly seems to be a blessing, but it does throw up the question: What is so holy or unholy about this place that it deters the greatest threat to Kindred tonight?",
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
                name: "Seeds of Golconda",
                description:
                    "You have heard of Golconda and can educate others on its nature without seeming like a total amateur. Once per story, you can ask the Storyteller for guidance before taking an action, and they will tell you if that action will jeopardize the chance of pursuing Golconda.",
            },
            {
                dot: 2,
                name: "The One True Way",
                description:
                    "You own a copy of the Master of Ravens-penned \"One True Way:\" a treatise on the supposed realities of Golconda. This piece of work tells you that Golconda is a method to become an apex predator, rather than a spiritually redeemed monster. Once per story, this pamphlet gives you three extra dice in any Social test involving the nature of Golconda.",
            },
            {
                dot: 3,
                name: "Saulot's Disciple",
                description:
                    "You cling to the ideals of Saulot: the vampire who traveled to Asia and returned bearing a third eye and the enlightenment of Golconda. You believe in Saulot's teachings that Golconda is the ultimate way in which a Kindred can overcome their curse. You practice a dual existence, allowing your Beast and Hunger off the reins occasionally, so you can achieve serenity at other times. Whenever you willingly succumb to frenzy, make a note; you can automatically succeed on your next frenzy test.",
            },
            {
                dot: 4,
                name: "Satisfy the Hunger",
                description:
                    "You do not need to feed as often as other vampires. Your Golconda focus is to suppress your constant Hunger, potentially at the expense of other Traits. Your temperance acts as an inspiration to many other vampires. Once per session, you may lower your Hunger by one (but not below one) without feeding.",
            },
            {
                dot: 5,
                name: "Greet the Sun",
                description:
                    "You know Golconda's secrets. You may be incapable of walking the path forever, but for as long as you do, you can brave full daylight without suffering harm. However, the night after you walk in sunlight, you wake in a Hunger frenzy. You can do this once per story.",
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
                name: "Voice of Hardestadt",
                description:
                    "Hardestadt shouted often, punctuating his remarks with fist blows to tables, walls, or unfortunate ghouls. Your Blood allows you to speak over any noise and draw attention, whether in a buzzing meeting room or at a rave. Something in your voice allows others to hear you. Whether they go on to pay attention depends on what you say.",
            },
            {
                dot: 2,
                name: "Supreme Leader",
                description:
                    "Hardestadt's self-confidence as a leader was in many ways his undoing, but until his Final Death, it saw him rise to greatness. You can convince others to follow you into deadly situations or command from the rear, and you can send subjects to their doom to better your position. Once per story, you suffer no penalty to your dice pool for sending people into danger.",
            },
            {
                dot: 3,
                name: "Ventrue Pillar",
                description:
                    "Due to your prestigious lineage, other Ventrue look to you for guidance. Regardless of your Status with other groups, you always have three dots of Status (●●●) with Ventrue.",
            },
            {
                dot: 4,
                name: "Line to the Founders",
                description:
                    "Hardestadt ensured his entire line could reach him when endangered. He rarely answered communications unless the situation was dire, and he punished misuse severely, but his method still holds despite his death. Once per chronicle, you can call, write to, or arrange a meeting with one of the Camarilla's founders in lieu of Hardestadt. Whether they deign to respond depends upon the importance of your request.",
            },
            {
                dot: 5,
                name: "Hardestadt's Heir",
                description:
                    "You hold in your possession a signed document in which Hardestadt names you as his successor. You're not sure what you are a successor to: mere wealth and power, Ventrue kingship, or even the Inner Circle of the Camarilla. When you take the name of \"Hardestadt,\" the document claims that the Camarilla shall march to the beat of your drum – and ensures that the Anarchs will swarm to take you down.",
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
                name: "Skin-Deep",
                description:
                    "No matter your standing, dropping Helena's name in conversation with a Toreador or a vampire who knows of her effectively raises your Status by one dot. You can drop Helena's name once per story for this effect, or more often to make everyone sick of you.",
            },
            {
                dot: 2,
                name: "Real Talent",
                description:
                    "Unlike other vapid Toreador relying on their faces and bodies alone, you were Embraced for your talent. Choose one Skill from Craft, Etiquette, or Performance. Increasing this Skill costs half the experience points (rounded down) that such an increase would typically cost.",
            },
            {
                dot: 3,
                name: "Embrace the Stereotype",
                description:
                    "When the time comes, you can play the role of shallow Toreador, surround yourself with an entourage of sycophants, and throw a party that becomes legend. Once per story, you may host a party to increase your Status and/or Influence by two dots with an invited group; the increase lasts as long as the party does.",
            },
            {
                dot: 4,
                name: "Divine Purity",
                description:
                    "Unlike most within Helena's extended family, your perfection is more angelic than devilish. You can commit any sin, but you will always look innocent. Add two dice to your dice pools when making tests to avoid blame for your actions.",
            },
            {
                dot: 5,
                name: "Succubus Club Franchise",
                description:
                    "Helena succumbed to the Beckoning in recent years, leaving the Succubus Club in Chicago to a manager once again. She bestowed a license upon you to establish a franchised Succubus Club in your domain. This rare honor guarantees the city's Kindred respond to your call, as every vampire Embraced in the last 200 years has heard of the Succubus Club. As long as the club remains open, the Chasse rating of your coterie's Domain increases by two dots. You also have four dots to select among Resources, Fame, and Status among all Kindred.",
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
                name: "Survivor",
                description:
                    "Your domain, or the domain of a vampire close to you, was scourged during the sect war. You can recount how the Sabbat and Camarilla strategized, how they warred in the city without alerting mortals, and the names of the fallen vampires caught in the middle. Once per story, you can ask the Storyteller for a piece of information relating to the sect war in your domain.",
            },
            {
                dot: 2,
                name: "Active Participant",
                description:
                    "No matter the sect, the war pulled in many vampires. Even independents served as mercenaries or suppliers for one or both sides. You have the scars to show for your participation. Your own sect may regard you as a war hero; the other as a war criminal. Take three dots of Status or Mawla to reflect your position or that of one of your comrades.",
            },
            {
                dot: 3,
                name: "Trophy Kill",
                description:
                    "Many notable vampires fell in the sect war, and to the Archons and Templars participating in the war, taking down a \"name\" on either side became a matter of competitive pride. Whether by luck or design, you are responsible for one such vampire's death. You may wear this badge with pride or stifle the rumors, but either way, the vitae coats your hands. Once per story, you can use this legend to bypass a contest where it might assist, just as the Storyteller can always use it to send enemies after your head.",
            },
            {
                dot: 4,
                name: "No Vampire's Land",
                description:
                    "Kindred hit-teams on either side of the sect war ranged from domain to domain and then back across old ground as the defenders rallied. This Great War-style push-and-pull of conflict led to some vampires obsessing over domains and their hidden sanctuaries, armories, tunnel networks, and side streets. You know all the best spots in your domain and two adjacent domains for launching an ambush, hiding from attackers, restocking a militia, or making contact with mercenaries. Add two dots to your Domain's Portillon, and add two dice to relevant Streetwise, Larceny, and Stealth pools in two neighboring domains.",
            },
            {
                dot: 5,
                name: "Sect Agitator",
                description:
                    "Some vampires exist only to cause bloodshed, and you count yourself among that number. Individuals such as Lucinda of the Camarilla and Francisco Domingo de Polonia of the Sabbat spoiled for war and were left hollow when it concluded. You know all the trigger points and the correct fuse to light in order to spark a new sect war. It may be localized to a single domain at first, but once the flames start, you can fan them to extend. Add two dice to all your pools for Social tests to inflame sectarian tension.",
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
                name: "Constantinople",
                description:
                    "Outside the Ashirra, vampire tradition refers to Istanbul as \"Constantinople.\" You are one of the few who know why. Constantinople represented everything possible in a city where vampires shared ideas and discussed philosophy without falling to carnage. Once per story, you can ask the Storyteller a question about Constantinople's past and be given an accurate answer.",
            },
            {
                dot: 2,
                name: "Antonius' Architecture",
                description:
                    "Renowned for his architectural skills, both political and physical, the Ventrue Antonius built the structure that held Constantinople together. To some, he fathered the Primogen ideal. You study Antonius' methods; you can add two dice to any Politics dice pool when making a test involving domain government. Once per story, you can mediate and calm any court debate, quashing violence with action or profundity.",
            },
            {
                dot: 3,
                name: "The Dream",
                description:
                    "For a millennium, the Trinity practiced Michael's Dream: a vision of vampire utopia. Michael encouraged all vampires in Constantinople to learn and seek enlightenment, grow distant from the Beast, and become something beyond mere predators. You are a modern exponent of the dream, recognized as a Speaker of the Dream in your city. You can add one die to any Insight dice pool when testing to gauge another's Beast. You inspire and calm souls; once per story, you can spend a Willpower point to allow another vampire to re-roll up to three dice when resisting frenzy.",
            },
            {
                dot: 4,
                name: "The Dracon",
                description:
                    "Of the Trinity, only the Tzimisce known as the Dracon survived Constantinople's fall. Passionate and wise, the lover of both Antonius and Michael, and spiritual guide for the Trinity, the grieving Dracon fell silent for many centuries following Antonius' murder. Rumors whisper that the Dracon reemerges now, with unclear intent. You count yourself as one of his disciples, and likely know how to find him. He counts as a five-dot Mawla, assisting with spiritual and Discipline matters.",
            },
            {
                dot: 5,
                name: "The New Trinity",
                description:
                    "One night, Michael's Constantinople will be reborn, and you shall assist at the birth. You know this not from fragile ego, but from certain prophecy. You, along with two others who complement your skills without mirroring them, will rebuild Constantinople in a new city – no matter what you must do. If you earned them on the path to bringing about the New Trinity, you can remove up to five Stains per story before making a Remorse test (p. 239).",
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
                name: "Asylum Membership",
                description:
                    "You never need to wait in a queue for entry to the Asylum, you always have one of the best seats in the house, and as long as you don't fuck up, you may hunt there once or twice per session (Difficulty 2) without any ruffled feathers.",
            },
            {
                dot: 2,
                name: "Performing Monkey",
                description:
                    "Jeanette and Therese know you as a reliable asset, and they frequently subject you to missions ranging from serious investigations to flights of insane fancy. Although dangerous, they are generous, and they repay any boons incurred.",
            },
            {
                dot: 3,
                name: "Jeanette's Favorite",
                description:
                    "Jeanette Voerman, the wild child of the Voerman family, adores you, pets you, and flirts with you. Though she arguably is the less stable of the sisters, she's also the more generous one. You may stay in the day chamber of any Asylum club if you require (if Jeanette is there, she insists you do), use the club to host your own parties, and ask for favors small and large from the Anarch Baron. Jeanette counts as a four-dot Mawla, but only for the purposes of Malkavian and Anarch dealings.",
            },
            {
                dot: 4,
                name: "Therese's Favorite",
                description:
                    "Therese Voerman, the upright, strict member of the Voerman family, respects and values you. Her business-oriented mind does not allow her to expend the Asylum's resources on your luxury, but she speaks up for you in any regnum where an Asylum is present, and can school you in business and finance if you require it. She counts as a three-dot Mawla.",
            },
            {
                dot: 5,
                name: "Asylum Operator",
                description:
                    "Jeanette or Therese permit you to franchise an Asylum club in your domain. As long as the club remains open, you have four dots to spend on Haven, Herd, Resources, or the Chasse of your Domain; depending on your club's focus, which may be changed over time. Whether the club is an Elysium is up to you.",
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
                name: "Oral History",
                description:
                    "You have heard and told the tale of the Week of Nightmares countless times, and you know exactly what to embellish and which parts to conceal. Your telling of the tale is popular in Elysia, where you are sometimes invited to speak as historian and entertainer. Important Kindred from all over come to hear your retelling. Add three dice to Performance dice pools to tests to tell the story.",
            },
            {
                dot: 2,
                name: "Ravnos Remains",
                description:
                    "Prior to the Week of Nightmares, the Ravnos were a clan – now, they are little more than a bloodline. You know some Ravnos remnants and perhaps share their grudge against the Gangrel who left them to annihilation. You have three dots of Mawla representing this group of contacts. They carry news and warnings to you, and can perhaps be convinced to cast mighty illusions once per chronicle, but association with them is frowned upon, if discovered.",
            },
            {
                dot: 3,
                name: "I Was There",
                description:
                    "You didn't just hear about it, you were on the front line. Your reputation as a survivor and on-the-spot veteran of the Week of Nightmares grants you Status among Kindred historians, occultists, Ravnos, and Gehenna cultists alike. Once per story, you can use this Status to earn a minor boon from one of those groups or from a prominent courtier in the domain with a sudden interest.",
            },
            {
                dot: 4,
                name: "The Red Star",
                description:
                    "Anthelios (NASA designation 28978 IXION), called Wormwood, harbinger of Gehenna, still glows in the sky – to your eyes, at least. You believe it looks back at you, changing you somehow. Once per story, you can either reduce your Hunger to a rating of two or gain a die to the pools of one Discipline for a night by staring at the star for 10 minutes.",
            },
            {
                dot: 5,
                name: "Blood of Zapathasura",
                description:
                    "The Ravnos Antediluvian met Final Death in July 1999 at the hands of parties unknown, armed with advanced weaponry and the power of the sun. Before he died, he drained vitae from all his clan, driving them to frenzy and cannibalism in his death throes. Thick, sentient ropes of his vitae stained the ground in Bangladesh where he fell. The noonday sun did not destroy it all. You own a small vial containing the Blood of the Ravnos Antediluvian. What you do with this vitae is up to you, and what it does to anyone who imbibes it is up to the Storyteller.",
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
                name: "Newfound Rights",
                description:
                    "Flush with the success of the Gangrel clan's independence from the Camarilla, like Rudi, you find this freedom energizing. Once per story, when striking out against or decrying the establishment, you can re-roll any one Skill test dice pool.",
            },
            {
                dot: 2,
                name: "Them and Theirs",
                description:
                    "When supporting the disenfranchised or persecuted, you are the resolute champion. Perhaps you believe vampires can only persist successfully when supporting each other, or you believe a pack is only as strong as its weakest member, but at great self-sacrifice, you defend others. When a Touchstone of any member of your coterie comes under threat, your ears prick up and your hair stands on end.",
            },
            {
                dot: 3,
                name: "Gangrel Advocate",
                description:
                    "As Rudi does in Northern Europe, many believe that you stand for Gangrel rights in your local domains, for good or ill. Gangrel react well to you; add one die to Social tests involving them. Although this reputation means that you speak for many, it also means that some hold you responsible for the actions of many. You can organize convocations and discreet truce meetings between Gangrel and Camarilla representatives with a successful Charisma + Politics test (Difficulty set by the Storyteller).",
            },
            {
                dot: 4,
                name: "The Bear Pack",
                description:
                    "You are, or were, a member of the Bear Pack: hardcore Rudista Kindred who double as howling orators and fierce combatants. (Consider your fellow Bear Pack a three-dot Mawla group that actually likes getting in fights.) Once per story, these modern revolutionaries, including yourself, gain one automatic success whenever attempting to rouse Anarchs and disenfranchised mortals against the establishment. Members of the Bear Pack are feared throughout Camarilla domains, which might be both bane and boon, depending on who you talk to, and if they recognize you.",
            },
            {
                dot: 5,
                name: "Rudi's Army",
                description:
                    "Rudi's Army comprises outsiders of all clans, all mortal colors, and creeds. You hold sway over an arm of this \"paramilitary\" force. You can call them to act against mortal or immortal governments in many ways, from staging peaceful protests outside a governor's home to organizing rallies against the leaders of oppressive groups. Large, unwieldy, and potentially dangerous, your brigade of the army gives you six dots to split among Allies, Influence, and Contacts, that can be directed – but never controlled.",
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
                name: "Instigator",
                description:
                    "Once per story, whenever you attempt to persuade a mortal crowd into violent action, your hot-blooded nature adds two dice to your dice pool to do so.",
            },
            {
                dot: 2,
                name: "Champion of the Cause",
                description:
                    "When vampires want a leader for a rebellion, large or small scale, they come to you for advice or leadership. They might even listen to your words, and providing your advice is not completely ridiculous, might even defer to your authority. You add two dots to your Status with them during such rebellions, but you might find the numerous contacts gained before a rebellion more valuable and certainly less dangerous.",
            },
            {
                dot: 3,
                name: "Tyler's Mercy",
                description:
                    "You know when to stop. Tyler recognized when the Sabbat went too far with her Anarch ideals, and you likewise recognize the limits of violent revolution. Once per story, when frenzying, you may at any point take a Brujah Compulsion (p. 210) to immediately cease the outburst. You do not suffer any confusion or tiredness after an interrupted frenzy, abruptly snapping back to Humanity.",
            },
            {
                dot: 4,
                name: "The Furores",
                description:
                    "Tyler's philosophies first emerged among a historic vampire group known as the Furores, dedicated to the destruction of all Kindred tyrants. This group still exists in secret, and you claim membership. When the time is right (once per chronicle), the Furores arm you, provide you with sanctuary in a regnum where they have influence, and activate assets in the target domain as surprise Allies (available within one scene). The Allies add up to five dots of Effectiveness; the rest depends on your collaboration with the Storyteller. Furore assets can only be used when attempting to take down a Prince, unfit Baron, or vampire of higher station. Misuse makes you a target of the Furores and their unknown operatives.",
            },
            {
                dot: 5,
                name: "Permanent Revolution",
                description:
                    "You have already taken down one sect figurehead. You now lead an army of revolutionaries to sweep the board in the neighboring regnae. For as long as you keep fighting and are not found to be indulging in the luxuries of station, Anarchs stop to listen to your every word, and Brujah Anarchs do exactly as you say, including embarking on suicide missions. No rolls are required if your speech is strong and argument convincing enough.",
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
                name: "Sanctuary",
                description:
                    "Your haven is a wonder of modern design, possessing security in the form of secret passages, electronic security, and even a self-destruct button, all while looking stylish and comfortable. Split two dots between either or both of the Haven Merits Postern and Security System, but someone, somewhere likely has all the details of the setup.",
            },
            {
                dot: 2,
                name: "Saboteur",
                description:
                    "You instinctively know where a building's weaknesses are, and you don't even require explosives to destroy it. With maul, crowbar, cable, and cold chisel, and as many nights on site as the difficulty the Storyteller sets for the building (i.e. four for a family home, six for a bank, eight for a prison, nine for a skyscraper), you can collapse an edifice like a house of cards.",
            },
            {
                dot: 3,
                name: "On Commission",
                description:
                    "Other vampires know you descend from Zelios and ask for advice on how best to build their own havens. This business ensures you often have a boon or two to collect (roughly one minor boon per story) and that you know where a number of powerful vampires sleep – which, in the end, probably does you more harm than good.",
            },
            {
                dot: 4,
                name: "The Labyrinth",
                description:
                    "You used Zelios' work to construct a labyrinth beneath your domain, made in part with sewers, disused drains, cellars, basements, and maintenance tunnels. You added your own chambers, dead ends, and connections to form a true underground maze. Only those you tell know of your labyrinth. You cannot treat the labyrinth as a Haven, as it terrifies you, but if you reach it when chased, no one can pursue you.",
            },
            {
                dot: 5,
                name: "Sense the Ley Lines",
                description:
                    "You occasionally glimpse throbbing red tendrils snaking through the earth: ley lines. Vampires who make their havens where these vessels converge find their Hunger grows more slowly (when making a Rouse check for awakening, roll two dice and pick the highest) if they sleep there by day. Ley lines have other powerful magical effects – secrets you can research along lines the Storyteller indicates – and your fellow Sewer Rats harshly punish disclosing anything about such secrets.",
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
                name: "Agent of Chaos",
                description:
                    "You thrive while everything around you burns or spins into catastrophe. In turbulent situations, such as an unusually chaotic and unpredictable combat, a car chase through a crowded city, or when fleeing an exploding building, once per session, you may re-roll a single die without spending Willpower.",
            },
            {
                dot: 2,
                name: "Hear My Words",
                description:
                    "You carry your ancestor's skills of persuasion, finding your voice speaks to the Blood of others before it reaches their minds. Once per story, if you attempt to counsel others in a chaotic environment and they actually stop to listen, they may re-roll one dice pool in one future test during the same situation.",
            },
            {
                dot: 3,
                name: "Scent the Bond",
                description:
                    "Vasantasena's loathing of Blood Bonds was part of the reason she targeted the Antediluvians and the ties they maintained with their offspring. Such was her power that she could smell the Bond on individual vampires and recognize the same odor on the vampire Bonded to, or Bonding, them. Once per story, on a successful Resolve + Awareness test (Difficulty 4), you can do the same.",
            },
            {
                dot: 4,
                name: "Destroy the Bond",
                description:
                    "Vasantasena's greatest act is the destruction of the Blood Bond. Some say she performed this act many times in recent years among the Sabbat, in part leading to their rapid degeneration. Once per story, you too can remove the Blood Bond imposed on a victim, if you drink a mouthful of the thrall's vitae and then ride out a frenzy.",
            },
            {
                dot: 5,
                name: "Sabbat Becomes Camarilla",
                description:
                    "Vasantasena achieved the impossible and showed her descendants how it was done. Alien, inhuman philosophies locked most vampires into the Sabbat. Once per story, you can deprogram a vampire from their sect beliefs. To do so, you must completely isolate the subject and make an extended test (p. 293) of either Intelligence or Charisma + Insight in an atmosphere of specialized perfumes. Roll once per three nights of disputation; you win after achieving a number of successes equal to twice the subject's Willpower.",
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
                name: "Peacock",
                description:
                    "You are proud of your clan's status as High, and you carry yourself with all the pomp and circumstance befitting a vampire of noble station. Once per session, you may re-roll a single die when attempting to command deference from one non-titled vampire in your domain.",
            },
            {
                dot: 2,
                name: "Sway the Low",
                description:
                    "The High Clans once sat upon thrones, ordering Low Clan vampires to die for them on battlefields and to subjugate themselves in court. You still possess the ability to persuade vampires of Low Clans more easily than you do the vampires of High Clans. You have bullied the equivalent of three dots of Mawla into a loyal, abused retinue of Low Clan vampires. You gain three extra dice to pools using Intimidation or Leadership against those Kindred; if you ever roll a total failure on such a test or contest, you need to compensate them, or they turn on you.",
            },
            {
                dot: 3,
                name: "Elevate the Low",
                description:
                    "Some quirk of your bloodline or an ancient Princely decree allows you to proclaim the ascendancy of one Low Clan in your city to High Clan status. You can do this once per chronicle, but of course, you can promise to do it \"eventually\" for quite a while first. Until then, add one die to Social tests against Low Clan Kindred when you allude to this possibility.",
            },
            {
                dot: 4,
                name: "Embraced to Rule",
                description:
                    "Vampires of the High Clans often opted to Embrace mortals of noble birth or powerful ancestry. Your ancestors may not be kings and queens, but you were Embraced to rule. Add one die to pools for Leadership tests involving High Clan vampires who know your lineage. Once per story, other vampires of the High Clans defer to voting for you, or they allow you to take high responsibility (and power), unless you have created a personal grievance between you.",
            },
            {
                dot: 5,
                name: "Blessed, not Cursed",
                description:
                    "Like many vampires of the High Clans, you have convinced yourself that you bear no Curse of Caine. Rather, your clan weakness is a blessing that reveals more to you about your nature, your position on God's Earth, and the areas in life you must strengthen. Once per session, you may spend one Willpower to ignore the burdens of your clan bane.",
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
                name: "Thick Hide",
                description:
                    "Often denigrated by those who name themselves \"High,\" your ambition and independence do not falter with belittling words and snubs. You do not respond easily to base provocations. Once per story, you can shrug off verbal barbs for a scene without needing to make a test.",
            },
            {
                dot: 2,
                name: "Cursed with Pride",
                description:
                    "In some cases, the Low Clans take great pride in the severity of their banes. For example, some Nosferatu believe their hideous appearances are a mark of glorious monstrosity, instead of something to be hidden. You have learned to use your clan bane as a weapon, gaining an automatic success on one roll per story when incorporating your bane into an action.",
            },
            {
                dot: 3,
                name: "Uncanny Kinship",
                description:
                    "Due to persistent persecution from the High Clans, vampires of Low Clans feel inclined to stick together. You often mediate between Low Clan disputants, and you see the merit of the underworld's Kindred banding together against the hegemony of the High. You can select three dots from among Mawla or Status from other Low Clans in the domain.",
            },
            {
                dot: 4,
                name: "Trade Among Equals",
                description:
                    "For all their suffering, the Low Clans benefited from their adversity in one key way – they taught each other their powers. This collaboration may not be true in all domains, but this old tale still holds in yours. You may select one Low Clan's Discipline and buy dots of that Discipline, using experience points as if it was in-clan for you.",
            },
            {
                dot: 5,
                name: "Criticality Incident",
                description:
                    "Your influence among Low Clan vampires can let you tip the scales of power in your domain – if you choose. Add one die to all your pools for Projects undermining High Clans in your domain. Once per chronicle, you can sacrifice up to 10 of your own Background dots to bring down the same number of High Clan Kindred in a coup.",
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
                name: "True Believer",
                description:
                    "If Ambrus has taught you anything, it's that the Camarilla is right and the Masquerade is essential. You follow his edicts on security and subterfuge religiously, granting you knowledge of the best shared Kindred hiding places in a city, providing a one-die bonus to tests to find such a place. You may not have access to this bonus if the domain is typically opposed to your political or philosophical view.",
            },
            {
                dot: 2,
                name: "Clandestine Information",
                description:
                    "You can use a digital dead drop to request a hack from Ambrus' fan community. Once per story, you can get one piece of information stored online about most mortals within two to 20 hours.",
            },
            {
                dot: 3,
                name: "Taught by the Best",
                description:
                    "As one of Ambrus' disciples, you are provided with a ready supply of intel on topics from Second Inquisition operations to the fashion in Harajuku tomorrow night. Ambrus can also time-lock information in the Dark Web or set you up with your own Ukrainian hacker at \"friend prices.\" Consider Ambrus a three-dot Mawla (●●●).",
            },
            {
                dot: 4,
                name: "Back Door Panopticon",
                description:
                    "Ambrus hooked you up with a back door into PRISM/NUCLEON surveillance software, tracking and sorting online communications (including cell phone calls) for keywords and names. Or perhaps you stole it from him or found it on a machine in a safe house an Ambrusite abandoned in a hurry. Either way, you can only log in once per story for security's sake, but it gets you two automatic successes on any Investigation test involving anyone's cell activity or online presence.",
            },
            {
                dot: 5,
                name: "On Another Grid Entirely",
                description:
                    "Ambrus went all out with your false identity. You have two two-dot Mask (●●) cover identities and have been Zeroed (p. 192). You get three extra dice to resist attempts to research you online or uncover your activities in the mortal world.",
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
                name: "The Art of Story",
                description:
                    "You and Carmelita share the belief that storytelling is one of the lost art forms. Whenever regaling other vampires with historic lore or tales of myth and legend, Toreador naturally gravitate to hear your words, regardless of your standing toward each other.",
            },
            {
                dot: 2,
                name: "The Art of Will",
                description:
                    "A specific objet d'art or relic, entrusted to your safekeeping by Dr. Neillson, inspires and enthralls you. If you spend an hour meditating on this object (and make a Resolve + Academics test at Difficulty 5) before resting for the day, you awaken with one extra Willpower point. You can meditate in this way once per session.",
            },
            {
                dot: 3,
                name: "Neillson Library",
                description:
                    "Carmelita Neillson's small libraries dot the world in Camarilla domains, serving as hives of information used to prompt and support elder vampires' memories. You are the curator or warden for one of these libraries, which counts as a two-dot Haven (●●) with a two-dot Library (●●). Other vampires and Kindred historians meet there as well, which has both advantages and downsides.",
            },
            {
                dot: 4,
                name: "Interview With the Methuselah",
                description:
                    "You have obtained a recording of Carmelita interviewing an impossibly old vampire who divulges secrets about one of the clans in your domain. Once per story, you can ask the Storyteller to provide you with such a secret. Whether Carmelita knew of this recording and gave it to you or someone made the recording in secret, the information in the interview gives you an advantage over the vampire in the clip and the clan discussed. Interestingly, the voice following Carmelita's at the end of the tape mentions further recordings.",
            },
            {
                dot: 5,
                name: "Ancestor's Tomb",
                description:
                    "Carmelita has entrusted you to guard the supposed resting place of one of your ancestors. As long as you keep it safe, you can call upon her for a major boon once per story. Should you fail to keep it safe, there will likely be… other consequences.",
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
                name: "On Fiorenza's List",
                description:
                    "Fiorenza has taken an interest in you. She assigns a Gifted mortal Retainer (•) to spy on your behalf – or on you; the Storyteller decides which.",
            },
            {
                dot: 2,
                name: "Breakfast with Fiorenza",
                description:
                    "Once per story, Fiorenza makes time to meet with you, share information, and offer limited assistance.",
            },
            {
                dot: 3,
                name: "Friendly Benefits",
                description:
                    "You enjoy a three-dot Mawla (•••) friendship with Fiorenza. She offers information, safe houses, the occasional mortal introduction, and protection of a limited nature.",
            },
            {
                dot: 4,
                name: "The Directorate",
                description:
                    "A shadowy Ventrue sub-group called the Directorate approaches you to suborn Fiorenza's operations. Whether you accept or not, you gain six dots divided among Contacts, Mawla, and Resources.",
            },
            {
                dot: 5,
                name: "Government Motion",
                description:
                    "Once per chronicle, Fiorenza can influence a mortal political leader to take an action. She grants you five dice to distribute as you wish among relevant pools for the action.",
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
                name: "Remember the House",
                description:
                    "Once per story, you can ask the Storyteller for one piece of information regarding the activities of House Tremere or the clan before its grievous injury.",
            },
            {
                dot: 2,
                name: "Hardliner",
                description:
                    "Schrekt's way is the only way forward for your clan. You follow Schrekt's laws fanatically. With the Storyteller's agreement, add two dice to any dice pool when testing to resist attempts to sway you from Schrekt's goals.",
            },
            {
                dot: 3,
                name: "Ritual Preparedness",
                description:
                    "Allegedly, Karl Schreckt prepares all of his rituals in advance and keeps several such pre-prepared rituals about his person at all times. Once per story, you may perform one of your rituals in five minutes, without preparation, having done all the preparations beforehand.",
            },
            {
                dot: 4,
                name: "Archon's Bane",
                description:
                    "You find Schrekt's targeting of supernatural entities deplorable, and you have formed a tight bond with a member of another supernatural background. You have a four-dot Ally: a mage, werewolf, wraith, changeling, or something even stranger. You must keep your friend safe, as they are being hunted. Once per story, they come to your aid within one to ten hours when called.",
            },
            {
                dot: 5,
                name: "Know the World",
                description:
                    "Karl Schrekt believes knowledge is power and that vampires who limit their learning to the study of fellow Kindred are fools. Whether Schrekt's puppet or nemesis, you agree with his assessment and keep archives on werewolves, magi, wraiths, fae, and other weird entities. This collection equates to a three-dot Haven Library (pick three suitable specialties of Occult), although you might not store your reference materials in your haven. Also once per story, you can ask the Storyteller to answer any simple question related to such creatures.",
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
                name: "Martyred Ancestor",
                description:
                    "Other Gangrel treat you with the respect they took too long to afford Xaviar. Despite any personal grievances, you can always find sanctuary with other Gangrel, if any are present in your current domain, at least until you insult them grievously. With them, you have two dots of Status.",
            },
            {
                dot: 2,
                name: "Where the Bodies Are Buried",
                description:
                    "Xaviar's experiences with melding through earth, blood, and vitae left a mark on his lineage. Gangrel of his line can make a Resolve + Awareness test to detect whether a vampire has merged with the earth or lays torpid beneath the soil. Difficulty depends on the area you have to search.",
            },
            {
                dot: 3,
                name: "Loyal Hound",
                description:
                    "You resisted the winds of change, remaining with the Camarilla despite your clan's actions. For your loyalty, the local Camarilla Prince awarded you status, feeding rights, and territory, amounting to four dots you can distribute among Domain, Herd, and Status. Non-Camarilla Gangrel despise you, and even Camarilla vampires of other clans pity your solitude, but you guarantee yourself a voice among the Primogen, should any rebel Gangrel pass through your domain.",
            },
            {
                dot: 4,
                name: "Monstrous Bat",
                description:
                    "Xaviar's preferred bestial form was once that of a bat, but following his encounter with the Antediluvian, he found his form capable of changing into a hybrid between human and bat. Once per story when the moon is just right, you can take the same form. This man-sized bat has an extra dot in all Physical Attributes and can glide in the air from any height. Biting in this form adds +1 Aggravated damage to mortals and vampires alike.",
            },
            {
                dot: 5,
                name: "Experienced the Antediluvian",
                description:
                    "Xaviar was not the only Gangrel to sink into the ground and find himself inside his clan founder's vast, inhuman form. You have done the same, and the experience changed you. You are now a little mad, likely suffering from paranoia or claustrophobia. Whenever you call your encounter to mind, you feel your veins rooted to the ground, connecting to every other Gangrel in the world. Once per story, you can sense any Gangrel's location and drain a thimbleful of vitae from them to reset your Hunger level to 2. You must be touching open ground, not concrete, to use this ability.",
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
                    "Your connection to Fatima or her network of Banu Haqim gives you access to a hidden weapons locker somewhere within your domain, or the domain you are visiting. You know from rumor or reliable sources where one of these lockers should be located. Once per chronicle you can use this knowledge to equip yourself with a hand-held weapon of your choice, subject to the Storyteller's approval.",
            },
            {
                dot: 2,
                name: "Extended Web",
                description:
                    "Fatima once held membership in the cult known as the Web of Knives. Though the Web remains loyal to the demonic Ur-Shulgi and the Alamut branch of the Banu Haqim, some cultists from the Web followed Fatima in making overtures to the Camarilla. You are either a member of the Extended Web, or have a close bond to those who are. You can take three dots allocated to Allies, Contacts, and Mentor and assign them to members of the Extended Web, who may assist you for a price, or school you in the art of killing. Note that unlike regular Backgrounds, use of these dots require payment, often severe.",
            },
            {
                dot: 3,
                name: "Missed Hit",
                description:
                    "You are one of the rare Kindred to survive an assassination attempt by the Hand of Vengeance. Whether or not you were the target or collateral damage, you have a reputation as someone Fatima couldn't bring down. As well as granting two dots in Status, this lore grants one bonus die to Social dice pools when your survival story can be used for good effect.",
            },
            {
                dot: 4,
                name: "Recognized Judge",
                description:
                    "The Banu Haqim are meant to be judges of other Kindred. Either you were taught the ways of judgement by Fatima, or the Web of Knives taught you Ur-Shulgi's dictates. In either case, in any non-Camarilla domain you may formally announce judgement and execute a Kindred without open retaliation from the ruling sect, as few wish to cross Banu Haqim law. Your judgement does not prevent other Kindred from subtly attempting reprisals.",
            },
            {
                dot: 5,
                name: "Open Contract",
                description:
                    "Your relationship with Fatima is such that she has agreed to eliminate any one opponent of your choice. She will not ask questions. Perhaps your relationship is one of trust or care, or perhaps Fatima owes you. Her success is not guaranteed, but is likely.",
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
                    "Your sire is a Ventrue notable for their nobility and adherence to clan values. To an extent, you can lean on your sire's name to curry favor with other Kindred mainly of Clan Ventrue. This lore enables you to gain one die in appropriate Social checks where naming your sire could have impact. If the sire still exists, they may come to resent you using them as a line of credit.",
            },
            {
                dot: 2,
                name: "A Lineage of Title",
                description:
                    "You come from a line of Princes, Primogen, or possibly Barons. If you ever attempt to acquire title in a domain, Ventrue — even those you've never met — will automatically support your claim, unless they have sufficient reason to oppose you.",
            },
            {
                dot: 3,
                name: "Recitation",
                description:
                    "You can name your ancestors all the way to a methuselah of the Fourth Generation, impressing all Kindred within listening distance. Each Kindred of your line has a tale, and you know at least a shortened version of every single one. Reciting the whole thing (something that takes a good 30 minutes or more) gives you a one die bonus to all Social-based tests against other Kindred for the rest of the scene. This can be used once per story.",
            },
            {
                dot: 4,
                name: "Legendary Lineage (choose one)",
                description:
                    "The Line of Alexander: A patron of the arts, passions, and beauty, Alexander of Paris appeared to many as more a Toreador than a Ventrue. Kindred who name their ancestor as Alexander of Paris gain two bonus dice on all Persuasion and Performance rolls made in a crowd of people, as Alexander's line love an audience. If someone interrupts your oration, you must make a fury frenzy check at Difficulty 3.\n\nThe Line of Antonius: Antonius was a strategic thinker, obsessive planner, and master architect of Clan Ventrue until his apparent destruction. If you descend from Antonius, you gain two bonus dice on all Academics and Leadership rolls made when planning the defense or building of a domain. If someone disrupts you while making a long-term plan of this nature, you must make a fury frenzy check at Difficulty 3.\n\nThe Line of Mithras: Mithras exemplifies pride and power. Kindred of his cult claim he was impervious to flame, and somehow this fortitude ripples through to his descendants' willpower. Your Difficulty to resist fear frenzy from exposure to fire is reduced by two. You suffer a two dice penalty when attempting to withstand Dominate attempts by older vampires also of Mithras' line.",
            },
            {
                dot: 5,
                name: "Name the Antediluvian",
                description:
                    "The Ventrue Antediluvian went by many names, and each methuselah of his clan knows the ancient entity by a different epithet. You know one of these names or titles, and once per chronicle can announce yourself as the descendant of this creature to force all Ventrue in the vicinity to stop what they're doing, fall silent, and sometimes drop to their knees. The name vanishes from the minds of all who hear it, but they will stop anything — even combat — to hear you speak.",
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
                    "Your service to Mithras is in its infancy, but you have learned how to manipulate the kine with talk of religion and grandeur. You can effectively lead a small mortal cult, granting you one bonus die to all Social rolls when interacting with your herd or retainers. This lore comes either from adherence to the cult or through study of its practices.",
            },
            {
                dot: 2,
                name: "Nymphus",
                description:
                    "Mithraists award the title of Nymphus to new sires within the cult. This lore grants you knowledge of Ventrue lineage and customs of Embrace, along with the ceremonial status of a revered sire. You gain two bonus dice to all rolls in which Ventrue or Mithraic customs are discussed or studied, and the equivalent of two dots in the Status Background when among Ventrue.",
            },
            {
                dot: 3,
                name: "Leo",
                description:
                    "Among the most honored members of the Mithraic cult, those Kindred with the title of Leo are entrusted to deliver clandestine messages between Mithraists, and sometimes even outside the order. Mithraists will not hesitate to trust you with information and messages, and you gain one dice to all non-Discipline rolls in which you attempt to get other vampires to trust you. Of course, if your allegiances lay outside the cult, this lore grants you access to deeply dangerous intelligence.",
            },
            {
                dot: 4,
                name: "Perses",
                description:
                    "The Cult of Mithras frequently indulges in ritual bloodletting and sacrifice, with the Perses as the master of such ceremonies. A vampire declared Perses of Mithras receives a short sword and authority to murder enemies of the cult, with the guarantee of full protection (alibis, secret havens, access to resources) should their identity as killer become known. This lore gifts you three Background dots to allocate in any domain in which the Cult of Mithras is present.",
            },
            {
                dot: 5,
                name: "Unconquered",
                description:
                    "You carry the spark of Mithras within you. Perhaps you took vitae from his diablerist Monty Coven, or maybe you once drank from Mithras himself as part of a Blood Bond. Now, Mithras lives in you. Occasionally the ancient vampire speaks to you in command or guidance, though he's not powerful enough to compel. When you please Mithras, you gain three additional dice in Dominate, Fortitude, or Presence tests (choose one) for the remainder of the night.",
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
                    "Despite their recent destabilization, most sires of Clan Tremere still readily awards their fledglings the rank of apprentice. You are one such apprentice, or the master of one, awarding you with the equivalent of a one-dot Mawla.",
            },
            {
                dot: 2,
                name: "Savant",
                description:
                    "Despite your new entry into the Pyramid, you have already drawn the attention of members greater than yourself for a successful experiment in which you courted danger, the creation of a new minor ritual, or the discovery of lore once lost to the clan. Once per chronicle, this lore enables you to ask a major boon of a Regent, and providing the boon is not insulting, remain on good terms with that Tremere thereafter.",
            },
            {
                dot: 3,
                name: "Regent",
                description:
                    "Every chantry has a Regent. The Regent is responsible for the tutelage of all other Tremere in the domain. While the Regent may not teach them personally, she must ensure all Tremere are being educated. The Regent's other duties extend to the clan's protection in the domain, and sometimes its representation on the Primogen Council. You are the Regent of a chantry. This gives you a dot in Tremere Status, as well as three dots in Haven, representing the chantry. Be aware that you are expected to oversee the safety of the chantry, as well as provide lodging and resources to other members of the clan.",
            },
            {
                dot: 4,
                name: "Pontifex",
                description:
                    "Each Warlock on the Council of Seven has seven Pontifices reporting to him. These Pontifices will oversee a vast domain, though it is rarely geographically defined. Different Pontifices are appointed as clan representatives in the fields of art, economics, werewolf studies, and other such fields. You are seen as the clan's foremost expert in whichever domain you're made Pontifex, and your resources regarding that field are extensive. You gain a three dice bonus to any information-gathering test relating to your particular field, provided you have access to your library, as well as three dots in Tremere Status.",
            },
            {
                dot: 5,
                name: "The New Council",
                description:
                    "The new Tremere Council of Seven was assembled as an emergency measure following the Second Inquisition's successful attack in Vienna. The explosion was timed to coincide with a meeting between the Council's members, rendering all but a couple into ash, while the remainder entered torpor. You are considered one of the new potential members of the Council of Seven because you have something unique to offer the Tremere clan. What that is and how you wield your power is up to you and the Storyteller. You also have four dots in Tremere Status.",
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
                    "At some point you have danced, kissed, or even slept with Victoria Ash. This does not make you a rarity, but it does make you special. Victoria has a perfect memory for faces and intimate encounters going back centuries (some suspect it's how she clings to her humanity). Difficulties of Social rolls involving Victoria Ash or someone connected to her is reduced by 1.",
            },
            {
                dot: 2,
                name: "Vermilion Invitation",
                description:
                    "Maybe you were a guest at the Vermilion Wedding or you just know one of the attendees well enough to describe what took place. This enables you to recognize those who attended the wedding, their function, and where they stood on the matter of union between the sects. Once per story you can use this information to blackmail, spin tale, or relate to other attendees of this tense meeting in a familiar way, gaining a three dice bonus to a Social test, provided you can come up with a plausible explanation.",
            },
            {
                dot: 3,
                name: "What Makes Them Tick",
                description:
                    "Victoria Ash is an expert at reading people. She knows how to get to your most sensitive secrets and exploit them and has taught you a few tricks. You gain two extra dice to Insight when scrutinizing a target for their vulnerabilities.",
            },
            {
                dot: 4,
                name: "Celebrity Affectations",
                description:
                    "Emulating the stories of Victoria Ash, you too have access to a well-stocked tour bus to allow ease of transit between domains, and a small crew of roadies. Whether you masquerade as a singer, magician, actor, or any other form of entertainer, is up to you. This is equivalent to holding two dots in Haven (Mobile Home) and two dots in Herd or Retainers (Roadies).",
            },
            {
                dot: 5,
                name: "Patron, Lover, Companion",
                description:
                    "You occupy an important place in Victoria's heart. Once per chronicle she will move heaven and earth to protect you, potentially cashing in the good will she carries with the Camarilla to do so if your crimes are egregious. For an entire session she counts as a five-dot Mawla and provides you three dots of Status.",
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
                name: "A Way With Words",
                description:
                    "You've studied the thoughts of not just Salvador Garcia, but all well-known Anarch political ideologues. You're a veteran of the Movement's political debates and can hold your own. For this reason, you get two extra dice in any roll involving a political debate where you invoke Anarch principles.",
            },
            {
                dot: 2,
                name: "Old School",
                description:
                    "You've met Garcia and advocated the ideas of abolishing Princes and establishing domains with decentralized power. This gives you cred among old school Anarchs of the California Free States generation, who kept the Movement going through the lean years before the current explosion of activity. Because of this, you have the equivalent of a three dot Mawla representing older Anarchs who like you, though they will help you only in matters of the Movement.",
            },
            {
                dot: 3,
                name: "Enemy of the State",
                description:
                    "The Camarilla despises you because of your open advocacy of Anarch ideas. They attempt to discredit you by spreading bizarre rumors: You sold out your domain to the Second Inquisition, you didn't really do the heroic acts ascribed to you, you're actually a Sabbat infiltrator, and so on. As an unintended consequence of these rumors, all attempts to find real facts about you are made at a two dice penalty to the relevant roll, and any information gained is tainted by falsehoods unless the roll is a critical win.",
            },
            {
                dot: 4,
                name: "The War of Ideas",
                description:
                    "Garcia teaches many young licks about the ideas of the Anarch Movement. Some of those ideas were formulated by him, but not all. Indeed, you once wrote down a vision of how undead society should be organized and that text has become part of Garcia's standard spiel. Because of this, you're known all across the Anarch territories and can use this fame as the equivalent of three dots of Allies in any Anarch domain.",
            },
            {
                dot: 5,
                name: "Rise Up",
                description:
                    "You know how to talk to your fellow Anarchs, and they know what you stand for. When you call for a revolution, things will happen. Unfortunately, you have no control over what exactly will happen. Once per story you can make a politics roll to rile the local Anarchs into action. Gauge the scale of the effect to the number of successes rolled. (Three can give you a spontaneous raid on the Prince's Haven while six might start a revolt encompassing most of the city's Anarch population.)",
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
                name: "Terrorizing the Powerful",
                description:
                    "Like Agata, you have an uncanny ability to strike terror in the hearts of licks more powerful and influential than you. Once per story, you can reroll an Intimidation test when confronted with a lick of greater means than yourself. This can mean age, resources or Sect status, but the final call on whether your ability applies is up to the Storyteller.",
            },
            {
                dot: 2,
                name: "Apprentice",
                description:
                    "You've met Agata Starek personally, and something in you caught her interest. Sometimes she sends you little tidbits of information about the weaknesses and private vices of the powerful licks in your city, often with the aim of allowing you to taste their sweet, sweet blood. Once per story you gain the equivalent of a four-dot contact for the purpose of deducing a weakness in a stronger enemy. This could be anything from their feeding habit, their Touchstones or the flaw in their haven's security.",
            },
            {
                dot: 3,
                name: "A Favor Owed",
                description:
                    "You've met Agata Starek once or twice, perhaps in a delicate situation involving murder and the spilling of Camarilla blood. Because of your shared history, once per story you can cash in a boon someone in your city owes her. A known appreciator of vitae, the boons owed to Starek always involve gaining access to a particular type of vampiric Blood. You explain what kind of Blood you need, and the Storyteller tells you who owes the boon to acquire it, limited by what's possible in the domain. For example, methuselah Blood is probably not possible, but the Blood of the Prince might be.",
            },
            {
                dot: 4,
                name: "Unlikely Allies",
                description:
                    "Starek is a figure of hope for many who no longer believe that a better world is possible. They are content to yearn for revenge, and like her, you've come to seem like someone who could make things difficult for the powerful. Because of this, once per story an oppressed servant or minion of your undead enemies will help you in a tight spot as long as they can do it without getting caught. The Storyteller can make this happen, or you can appeal to a minion with a Persuasion roll with four additional dice.",
            },
            {
                dot: 5,
                name: "The Joy of Transgression",
                description:
                    "Agata Starek argues that diablerizing powerful Camarilla vampires is not only an Anarch responsibility, it's also one of the chief joys of the revolution. You've taken her words to heart and no longer suffer an automatic loss of a point of Humanity when diablerizing someone with more Sect status than yourself. However, the potential Humanity loss from when you roll the effects of the diablerie still applies.",
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
                name: "One of Hesha's Works",
                description:
                    "You own one of Hesha's treatises on the history of Kindred existence. While the work may be controversial, and oppose the traditional Cainite mythology, it conveys one additional die on Occult-based dice pools, or pools relating to vampire origins. This work may be sold in exchange for one dot of the Resources Background.",
            },
            {
                dot: 2,
                name: "Something Hesha Wants",
                description:
                    "You know what Hesha currently seeks, and can access it, or already own it. This item can be used to bargain with, blackmail, or threaten Hesha, or even present to him as a gift for future favor. This artifact or piece of information conveys an additional three dice to Persuasion or Intimidation dice pools involving Hesha or his cult. It can also be sold, adding three dots to your Resources (up to five) for the duration of the story.",
            },
            {
                dot: 3,
                name: "Museum of the Faithful",
                description:
                    "You possess the rare privilege of membership in one of the Ministry's museums of vampire history. These underground treasure troves are securely guarded but contain a plethora of accessible information about legendary Cainites. You must submit a new treasure to the museum every year for continued membership and will have your access denied if you fail to do so, or ever steal from one of these Setite hoards. You gain three additional dice to all tests involving the research of vampires and vampire history for as long as you keep your membership.",
            },
            {
                dot: 4,
                name: "Blood Cult",
                description:
                    "Ministry characters only. Hesha has taught you the old ways of the Followers of Set, in which mortals and ghouls perform more than a servile role. Your cult encompasses a warrior, a priest, and a scholar, as well as willing vessels from which you feed. Three Background dots can be split between these specialized cultists, who can count as Herd or Retainers. They possess more knowledge and ability of your kind than typical servants and ghouls, giving them an additional die in all interactions with vampires.",
                clanRestriction: ["Ministry"],
            },
            {
                dot: 5,
                name: "Hear the Blood Sing",
                description:
                    "Ministry characters only. Maybe Hesha taught you how to hear the words, or perhaps you accomplished the feat yourself. You hear the voice of Sutekh more loudly than you do your Beast. Through riddles, visions, and musical refrain, the Storyteller will occasionally offer you guidance from the godlike voice issuing from your vitae. Once per session, you are also able to automatically resist Frenzy, treating it as a Ministry Compulsion instead.",
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
                name: "Congregation",
                description:
                    "You have access to a herd of kine, but these mortals are a unified religious flock you can manipulate. This congregation can belong to any mainstream or fringe religion, and whether they see you as their leader, or just another parishioner, you can feed from them easily. This lore is equivalent to a two-dot Herd, though it requires you to show up and uphold the faith regularly.",
            },
            {
                dot: 2,
                name: "Tap the Secret Vein",
                description:
                    "Through the method of a simple interview, you can analyze whether a mortal or Kindred has a secret they're trying to hide. You gain a two-dice bonus to Insight-based tests to find whether someone is keeping a secret.",
            },
            {
                dot: 3,
                name: "Freedom from the Aeons",
                description:
                    "Set despises his fellow clan founders, or so the legend says. The Setites consider the other founders Aeons, and demonstrate a resistance to their power. You gain two additional dice on rolls resisting Dominate and Presence attempts from vampires of other clans.",
            },
            {
                dot: 4,
                name: "Degenerative Process",
                description:
                    "The Church of Set teaches its adherents that a man must be brought to his lowest before he can rise to meet glorious Sutekh. You can push any being, mortal or immortal, to indulge in degenerative corruption only to come out clean on the other side. With a successful Manipulation + Persuasion roll, you can persuade any individual to break a Tenet or Conviction, gaining at least one Stain. When it is done, they feel purified. The targeted character restores up to three Superficial or one Aggravated Willpower damage.",
            },
            {
                dot: 5,
                name: "Body of Set",
                description:
                    "You possess a fragment of Set's skeleton, sarcophagus, or burial robes. Though the implication of Set's Final Death is debatable, the holy (or unholy, depending on your perspective) artifact gives you drive to succeed and impressive influence over other Followers of Set, conveying a four-dot Status among other Ministers. The relic also helps you to touch the mind of Set through meditation, and once per story you are able to reduce Stains gained from breaking a Tenet by one, if following what you and the Storyteller perceive as the will of your god.",
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
                name: "Clan Historian",
                description:
                    "You have studied the path of Clans Brujah, Lasombra, and the Children of Haqim from pre-Carthage nights through to the formation of the Camarilla. You know their rises and their falls, their constant battles with the Ventrue, Malkavians, and Toreador, and can recite names and dates with ease. This lore impresses other Kindred historians and rebels looking for a cause, giving you a bonus die on social tests where you can put this knowledge to use.",
            },
            {
                dot: 2,
                name: "Punic Pride",
                description:
                    "To this night, Brujah still look back on Carthage as the ultimate symbol of rebellion. They believe Carthage was the most successful domain to persistently resist Ventrue-controlled Rome, until its calamitous end. You take great pride in your Carthaginian ancestry, whether through mortal links, or immortal bloodline. When invoking this ancestry, you speak with increased confidence and draw the attentions of fellow rebels. Gain two dice in Leadership-based tests to lead others against perceived oppression.",
            },
            {
                dot: 3,
                name: "Death to Tyrants",
                description:
                    "If Carthage taught the Brujah and Children of Haqim anything, it's that it's always worth fighting until the end. Never since — even when considering the Anarch Revolt — have the pillars of the establishment been so shaken. You harness the strength of the vampires who fell fighting Rome whenever taking the fight to a figure in power. Gain a bonus dice to all contests against someone who can claim authority over you.",
            },
            {
                dot: 4,
                name: "Troile's Wish",
                description:
                    "Many Brujah claim the damning tales of Carthage are simply Ventrue propaganda spread from Rome, and extant to this night. Brujah and Banu Haqim scholars alike claim Troile was a benevolent ruler, treating both Kindred and kine fairly, and ensuring every soul in the empire remained fed, educated, and loved. You believe in this credo, and exude a reassurance that convinces others to trust you, supplicate before you, and help you in whatever schemes you have to mind. You gain two bonus dice to all social tests involving vampiric servants, yours and others, whether they are retainers or just part of a herd.",
            },
            {
                dot: 5,
                name: "Carthage Anew",
                description:
                    "You are an advocate of Carthage anew. Plans have been set in motion and you already have an Anarch city selected where the Masquerade will soon fall without being targeted by mortal agencies. (The deals and pacts you had to make for this to happen are left to you and the Storyteller.) Up until that time, you are able to break the Masquerade and get away with it in that city once per story, no matter the severity of the breach.",
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
                name: "Detection",
                description:
                    "The Blood plague manifests in vampires in a variety of ways, depending on the incarnation of the disease. As the curse afflicting vampires evolves, so must the experts who seek to study and eradicate it. You are one such vampire, who knows all associated symptoms of the Blood plague. You can use this lore to easily determine if someone carries infection, or more malignantly, you can sow rumors in a domain of the plague's existence, by using facts about the disease's course. Add two dice to any Medicine or Occult roll involving the plague.",
            },
            {
                dot: 2,
                name: "The Science of the Blood",
                description:
                    "You believe the Blood plague to be largely medical in genesis, possibly even started among mortals before it infected Kindred. Your thorough study of the Blood plague enables you to simply detect the plague's recent paths and patterns, analyzing where an infected host may have been, who they might have been infected by, and when. Such information can be incredibly useful when attempting to quarantine all infected subjects. Add two dice to all Investigation rolls and other tests to track active victims of the plague.",
            },
            {
                dot: 3,
                name: "Trace the Torpid Victims",
                description:
                    "You see the strains of Blood plague wind through the earth. Your interest in this condition goes further than just quarantine and healing of the infected; you can follow the plague's stench and unholy aura to its torpid victims. You already know where many of the bodies are buried. By making a Resolve + Occult roll (Difficulty 4, modified depending on the vampire population and the history of the Blood plague in the area) you can locate the body of an infected victim still in torpor. Who they are and whether they are still contagious is up to the Storyteller.",
            },
            {
                dot: 4,
                name: "Curative Vitae",
                description:
                    "You believe any disease is curable, with the correct research, and the willingness to sacrifice. Your vitae is clean of the Blood plague, and you show no symptoms despite your proximity to many victims. You believe your Blood may hold the cure, but scientists of other clans require a lot of your vitae to test this idea. By giving enough Blood to force a Rouse Check you can add two dice to any attempt to manufacture a cure, temporary or even permanent (Storyteller's discretion).",
            },
            {
                dot: 5,
                name: "Vector",
                description:
                    "You have a secret. You carry the Blood plague, and can even infect others with it, but you display none of the symptoms. This dangerous lore allows you to spill your vitae in an Elysium or feed a mouthful of it to a popular vessel, and watch the terrible effects as the other Kindred succumb to the Blood plague. If you feel more altruistic, you may volunteer for thorough tests on your vitae, and how it may be applied by your sect as a weapon, or by those looking for a cure. The specific effects of your strain of plague are up to you and the Storyteller.",
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
                name: "Critical Ancestor",
                description:
                    "Vampires largely of Clans Brujah, the Banu Haqim, and Lasombra led the Anarch Revolt across Europe, with power-hungry Tzimisce taking part to eliminate the greatest monsters in their own clan. However, Anarchs rose from all clans, as most elders manipulated their young to disastrous ends. You can name one of your ancestors as critical to the Anarch Revolt, either as an instigator, chronicler, or opponent. Your ties to this ancestor give you credibility in discussions regarding the Revolt, and a passion for its analysis. Gain a point of Anarch status as well as the Suspect (Camarilla) flaw, or vice versa.",
            },
            {
                dot: 2,
                name: "Speak the Words",
                description:
                    "The Anarch Revolt was driven more by words and energy than flashing blades and spilling blood, at least at first. You possess the same ambition as the Anarchs of the past, and can accurately pinpoint where oppression occurs, and where revolt is necessary. When vampires listen to you, they feel more inclined to seize power from their masters. Add two dice to social tests involving the instigation of Anarch activism.",
            },
            {
                dot: 3,
                name: "Enemy of the Establishment",
                description:
                    "You consider yourself an Old Anarch, not necessarily by age, but by ethos. The new Anarch Movement has its strengths, but also many weaknesses. Your views put you in direct opposition to the Camarilla and its Victorian methods of subjugation. The Camarilla has marked you as an enemy, which only draws more listless Anarchs to your banner. You gain the equivalent of a four-dot Mawla, representing your comrades among the Anarchs, as well as a one-dot Adversary, representing someone tasked with keeping tabs on you and, if necessary, bringing you down.",
            },
            {
                dot: 4,
                name: "Icon",
                description:
                    "You have taken the name of one of the Anarch Revolt's original participants, and act as that vampire's successor. This would be disrespectful, if you had not performed many of the same actions as your forebears. Many Anarchs see you as the next great leader of the Revolt, whether or not that is your intent. You may have seized an historic identity for the cult status and easy access to herd, but now the sect puts increasing pressure on you to act in their interest. Gain two dots of Status, two dots in Herd and two dots in Resources for as long as you put the Anarch cause before anything else. Any misstep and they are lost until you redeem yourself.",
            },
            {
                dot: 5,
                name: "Reignite the Revolt",
                description:
                    "The time has come. You know how the Anarch Revolt took place half a millennium ago, and know how it needs to take place tonight. You know the weakness of your city, the greatest threats, and the Camarilla positions direly in need of removal. You can threaten your enemies with the prospect of war for extortion purposes, or to prevent the Camarilla taking more liberties with the Anarchs than they have already. Once per story you can use this leverage to gain four dice in any Social conflict against a member of the Camarilla establishment. If you fail the roll you either need to make good on your threat or lose this Advantage permanently.",
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
                description: "As a skilled diplomat, advisor, or negotiator, the legacy of Tegyrius is reflected in you. When you mediate between two opposing individuals or groups, you receive a two-dice bonus to Intimidation or Persuasion skill tests.",
            },
            {
                dot: 2,
                name: "The Pen is Mightier",
                description: "Following in the footsteps of Tegyrius, you value knowledge and choose to hone your mental abilities just as much as you do your fighting skills. As a protégé of Tegyrius, you have access to a Banu Haqim library transplanted from Alamut during the Schism. The library counts as a two-dot Haven (••) with a two-dot Library (••), but its contents are being sought after by one of the Shepherds of Ur-Shulgi, counting as a two-dot Adversary.",
            },
            {
                dot: 3,
                name: "Hear My Words",
                description: "You are a known ally of Tegyrius, and when you speak, others listen. As a source of wisdom and restraint, you get three additional dice for any social test against another Banu Haqim of the same sect, and two additional dice for any social test against a Banu Haqim of a different sect.",
            },
            {
                dot: 4,
                name: "Perception is Power",
                description: "In the hallowed halls of Alamut, the Council of Scrolls dedicated their unlives to the pursuit of academic knowledge. But when Ur-Shulgi awoke and seized the Black Throne, the Council disbanded. You sat on the Council, and under Tegyrius' guidance, learned that one cannot fight what one cannot see. You have access to the Auspex Discipline and may buy dots using experience points as if it was one of your clan Disciplines.",
            },
            {
                dot: 5,
                name: "A Matter of Honor",
                description: "Not only were you a guest of honor at the Vermillion Wedding, but Tegyrius himself owes you a debt of gratitude. Perhaps you assisted in his negotiations with the Camarilla, or maybe you saved his life several years ago. Once per chronicle, Tegyrius functions as a five-dot Mawla, and uses his lofty position to aid you as best he can (short of violating the alliance between the Camarilla and the Ashirra).",
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
                description: "Not only were you in Los Angeles, you were pivotal to the success of the Revolt and your compatriots know it. You fought in a crucial battle or stopped an important VIP from escaping. Once per story, you may call on former allies to summon an Anarch gang to your aid — five neonates, each with 4 dots in Disciplines (no power higher than level three) and a General Difficulty of 4/3. They only help if the action can be presented as part of the righteous struggle against the Camarilla.",
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
    // ── Let the Streets Run Red Loresheets ───────────────────────────────────
    {
        id: "anubi",
        name: "The Anubi",
        source: "let-the-streets-run-red",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Argent Fury",
                description:
                    "Your connection to the Anubi or a similar organization provides access to hidden caches of silver weapons and those who manufacture them. Once per story, you can equip yourself with a silver hand-held weapon or ammunition of your choice.",
            },
            {
                dot: 2,
                name: "What Big Eyes You Have",
                description:
                    "A Lupine must be located before it can be slain. Your organization has seeded your city with a web of informants, contacts, and surveillance devices to facilitate the hunt. Once per story, you gain two automatic successes on an Investigation roll related to locating Lupines within your domain.",
            },
            {
                dot: 3,
                name: "Brick House",
                description:
                    "The hunter often becomes the hunted when Lupines are involved. You spend substantial resources outfitting your haven for just such occasions. You gain four points to spend on Haven and/or Retainers relating to defense against Lupines.",
            },
            {
                dot: 4,
                name: "In the City, In the Woods",
                description:
                    "Choose one path: War Eternal — your advanced knowledge of Lupine hunting grants two bonus damage from all Firearms and Athletics rolls when fighting Lupines. Strange Bedfellows — your organization seeks peace with Lupines; gain two bonus dice to all Persuasion rolls when dealing with Lupines and a two-dot werewolf Ally reflecting your contact in the local Lupine community. Most Dangerous Game — your nightly hunt grants access to Lupine blood; once per story, you can slake two Hunger via werewolf blood with all attendant benefits and drawbacks.",
            },
            {
                dot: 5,
                name: "Summon the Pack",
                description:
                    "You are a formal member of the Anubi or a similar Lupine-hunting organization and can call on these Kindred for aid at a moment's notice when Lupines are near. Your membership grants you a temporary Mawla (•••) and four dots of Allies (Anubi Bikers) — representing mortal bikers who follow the Anubi — who can be called on once per story when Lupines are involved. Situations not involving Lupines may require favor trading and/or boons.",
            },
        ],
    },
    {
        id: "eletria",
        name: "Eletria",
        source: "let-the-streets-run-red",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Muse",
                description:
                    "Eletria saw great potential in you and fanned the embers of your talent. All Craft (Painting or Sculpture) or Performance (Music) tests have their difficulty reduced by one.",
            },
            {
                dot: 2,
                name: "Portrait of a Woman",
                description:
                    "Eletria entrusted you with a rare and precious piece of art of deep importance to her — a portrait, sculpture, or piece of music created by her hand. Once per session, you can spend an hour meditating on this piece and make a Resolve + Craft (Painting or Sculpture) or Performance (Music) test at Difficulty 4 before resting for the day. If successful, you awaken having recovered all Superficial Willpower damage.",
            },
            {
                dot: 3,
                name: "This is Sparta",
                description:
                    "You served under Eletria in Veracruz during her war against the Sabbat or fought by her side during the War of Chicago. You gain a bonus die to all Investigation, Academics, and Occult rolls related to defending your city against hostile sect incursions.",
            },
            {
                dot: 4,
                name: "Ageless Beauty",
                description:
                    "You shared blood with Eletria and inherited a measure of her ability to see the past. You can see a person as they were at any point in their life (or unlife). Make a Wits + Resolve or Auspex test (difficulty assigned by the Storyteller depending on how far back you attempt to see). Success captures a photographic image of the subject with perfect accuracy and grants two bonus dice to a relevant Craft test to replicate it. This ability can be used once per session.",
            },
            {
                dot: 5,
                name: "Conspicuous Consumption",
                description:
                    "Your search for Eletria leads to Helena. You become part of the circle of vampires used to slake her thirst and keep the Beckoning at bay. Gain five dots to distribute between Mawla, Resources, Allies, Herd, and Contacts. You also have access to Helena once per story, although she has compelled you not to reveal her presence. If lucky, your perilous association may reveal Eletria's fate.",
            },
        ],
    },
    {
        id: "kindred-social-media-influencer",
        name: "Kindred Social Media Influencer",
        source: "let-the-streets-run-red",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Friends Everywhere",
                description:
                    "You have a small following, mostly consisting of friends and close acquaintances. Once per chapter, you can crowdsource a solution to a problem — providing you have enough time to consult your followers — allowing you to roll two dice in a Skill you don't possess or adding two automatic successes in an area you already have familiarity.",
            },
            {
                dot: 2,
                name: "Niche Following",
                description:
                    "Your knowledge in a specific area grants you a degree of online authority. Your threads occasionally go viral, and you've been paid to write articles thanks to your unique voice. Gain two dots of Influence in your field. Once per story, you may temporarily increase your Resources by one dot when you pen an article or do a video hangout for a small audience.",
            },
            {
                dot: 3,
                name: "Internet Famous",
                description:
                    "Your follower count is in the tens of thousands across several platforms. Loyal fans provide ad revenue and buy branded swag, providing you with an additional two dots in Resources. Once per story, you can arrange a small local meetup and feed from one of the attendees, granting you one dot in Herd.",
            },
            {
                dot: 4,
                name: "Collabs and Sponsorships",
                description:
                    "Everyone interested in your subject matter knows your name. Companies offer to work with you to create branded products and woo you with freebies they hope you'll promote. In addition to two dots in Fame, gain Allies (••) from among your fans and declare a two-dot Contact at one of the companies you've promoted.",
            },
            {
                dot: 5,
                name: "Superstar",
                description:
                    "Your social media presence makes you a household name. You set trends and pull in a sizable income from products, promotions, ad revenue, and patron donations. This grants you three dots in both Fame and Resources. However, your notoriety also puts you in a precarious position with Kindred elders — should they or FIRSTLIGHT discover your vampiric identity, punishment will be swift and deadly.",
            },
        ],
    },
    {
        id: "juggler",
        name: "Juggler",
        source: "let-the-streets-run-red",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "For the Cause",
                description:
                    "You've run with the Anarchs in Chicago under Juggler's direction. Gain one reroll per session on Brawl, Melee, and Streetwise rolls when going up against members of the Camarilla.",
            },
            {
                dot: 2,
                name: "Guns to a Knife Fight",
                description:
                    "Juggler learned hard lessons about Princes who blame the Anarchs first. Once per story, you have access to a weapons cache that Juggler has secreted away in Gary and can buy up to Resources (•••) worth of gear.",
            },
            {
                dot: 3,
                name: "Rabble Rouser",
                description:
                    "You have a knack for dirty fighting. Juggler put you in charge of a group of Anarchs who Get Shit Done around Gary. Once per story, you can call upon a small group (3–5 people) to sow chaos in Gary's streets or back you up in a brawl. This counts as a temporary Allies Background at an effectiveness of two dots; they are Kindred carrying Disciplines. They cease following you for the rest of this story.",
            },
            {
                dot: 4,
                name: "Coordination is Key",
                description:
                    "Juggler set you up as a key part of Anarch communications. Other Kindred slip you information about their activities, which you pass along to those who need to know. Gain Status: Anarchs (•••) and Influence: Gary (•••). Once per story, ask your Storyteller for a piece of intel that's recently come across your desk.",
            },
            {
                dot: 5,
                name: "Rust Never Sleeps",
                description:
                    "Juggler trusted you with his plans and valued your input in his strikes against the Camarilla and Modius. He is your four-dot Mawla (in his absence, Evelyn Stephens fills this role). Once per story, work with your Storyteller to name a member of the Movement in another city whose skills or access are useful to you. A friend of Juggler's is a friend of theirs — they act as a three-dot Contact for you until the end of that story.",
            },
        ],
    },
    {
        id: "lost-secrets-milwaukee-chantry",
        name: "Lost Secrets of the Milwaukee Chantry",
        source: "let-the-streets-run-red",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Carna's Primogen Files",
                description:
                    "While nominally apolitical, Carna managed to collect significant information about her fellow Kindred during her tenure as Primogen. You have access to Carna's Primogen Files and gain a bonus die on all Politics rolls involving the Kindred of Milwaukee.",
            },
            {
                dot: 2,
                name: "Abandoned Real Estate",
                description:
                    "Carna and Victor maintained numerous havens throughout the wealthier areas of Milwaukee. Your search uncovers one such haven, providing you with a two-dot Haven in Milwaukee equipped with a two-dot Occult Library (Carna) or two-dot Hidden Armory (Victor), and potential clues to additional havens or Tremere secrets. Tremere agents are certain to follow — take up permanent residence with extreme caution.",
            },
            {
                dot: 3,
                name: "Victor's Grimoire",
                description:
                    "Victor was the deadly enforcer of the Milwaukee Tremere with access to a potent array of unique rituals. You have located Victor's Grimoire and cache of occult rituals. Blood Sorcerers may immediately learn one ritual with a roleplaying justification to learn additional rituals through standard experience expenditure. Non-Tremere are hunted mercilessly for mere possession of this knowledge.",
            },
            {
                dot: 4,
                name: "Objects of Desire",
                description:
                    "You have uncovered the subject of Tremere study in Milwaukee — a strange Null Zone where magic does not function, centered on Marquette University. Tremere records indicate objects of incredible power are located somewhere in the zone, but opposition from Clan Tremere, Lupines, and/or Magi is extremely likely. You gain a precarious Haven Background rated at four dots, though with it comes an Adversary at two dots and an Enemy at two dots.",
            },
            {
                dot: 5,
                name: "Dr. Mortius's Haven",
                description:
                    "You have located Dr. Mortius's haven — a 'haunted' house near Marquette University. It is a three-dot Haven with an awe-inspiring, utterly disorganized occult library that grants a three-dot bonus to all Academics and Occult rolls. At the Storyteller's discretion, the library may contain access to Blood Sorcery, magic items, information about Milwaukee's Null Zone, theories on ancient Kindred in Lake Michigan, and even a copy of The Book of the Grave-War. Mortius's haven may contain a variety of mundane and mystical defenses to penetrate prior to entry.",
            },
        ],
    },
    {
        id: "mark-decker",
        name: "Mark Decker",
        source: "let-the-streets-run-red",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Good Graces",
                description:
                    "Decker has put a small amount of trust in you, assigning you to patrol duty around the city and allowing you to act with his authority in minor breaches of his laws. Still, he requires you to enter a one-step Blood Bond in case that feeling is misplaced.",
            },
            {
                dot: 2,
                name: "Tyrant's Recognition",
                description:
                    "Decker is aware of the body count you've racked up protecting Milwaukee. He grants you feeding rights to a small rack, providing you with a two-dot Herd and a one-dot Haven.",
            },
            {
                dot: 3,
                name: "One Strike",
                description:
                    "Your penchant for not only upholding but enforcing the Prince's laws has caused Decker to loosen his reins on you. Once per story he allows you to plead your case if you're caught for a minor infraction. Rather than the final death, he'll impose sanctions.",
            },
            {
                dot: 4,
                name: "The Prince's Trust",
                description:
                    "You've fought at Decker's side against the Lupines and rooted out Anarch incursions. You've learned how to talk to him without setting him off. Decker listens to your counsel, and his trust gives you a little leeway in the city. Gain Mark Decker as a five-dot Mawla. Additionally, once per story, you may dine with him at the Hyatt or join him in his private suite at Brewers Stadium for an audience.",
            },
            {
                dot: 5,
                name: "Childe of Mark Decker",
                description:
                    "Decker granted you the gift of his Embrace and expects you to treat such an honor accordingly. He's trained you as one of his Anubi and placed you in a position of power in the city. Work with your Storyteller to determine where your authority lies. Decker provides you with a three-dot Haven and two-dot Status, and you gain one free Skill Specialty in Athletics, Brawl, or Melee. Many Kindred despise Decker, and this antipathy extends to his childer — you earn three dots in Adversaries, made into one vampire or split across two or three.",
                clanRestriction: ["Gangrel"],
            },
        ],
    },
    {
        id: "maxwell",
        name: "Maxwell",
        source: "let-the-streets-run-red",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Tactician",
                description:
                    "You've studied Maxwell's strategies as Prince of Chicago and sussed out some of the secrets of his rule. Add two bonus dice to an Academics, Politics, or Subterfuge roll relating to political planning or military maneuvers.",
            },
            {
                dot: 2,
                name: "Travelling Companion",
                description:
                    "While Kindred considered him dead after Devil's Night, Maxwell roamed the world building up allies in other countries. One thing he learned in these hyper-surveilled modern nights is how to evade detection while travelling. You traveled with him during this time, and he's willing to share his contacts. Once per story, you can call on Maxwell's allies for reliable and secure transportation between cities.",
            },
            {
                dot: 3,
                name: "Vanguard",
                description:
                    "You're a member of Gary's Vanguard, trusted by Eric Sharpe and Maxwell alike. Gain Status: Gary (•••). Sharpe has granted you territory in the city, where you have a two-dot Haven and feeding rights.",
            },
            {
                dot: 4,
                name: "The Art of Disappearing",
                description:
                    "If your enemies think you're dead, they stop worrying about how you're plotting against them. Maxwell has taught you tricks for staying hidden and working from the shadows. Once per story, he'll help you create a two-dot Mask under which you can anonymously further a goal — or help you convincingly fake the death of one of your current Masks and transfer its resources to a new identity without leaving a paper trail.",
            },
            {
                dot: 5,
                name: "The Once and Future Prince",
                description:
                    "You're one of the highly placed Kindred Maxwell is counting on in Chicago. He's guided and financed your rise, helped rid you of enemies, and provided information about Prince Jackson's machinations. Gain Resources (•••••); two dots must be spent securing Maxwell's plans, but the remaining three are yours. You have a list of Kindred in Chicago who owe Maxwell boons — once per story, you can call in a minor boon from someone on the list; once per chronicle, you can call in a major boon. Maxwell expects an account of how you've spent his favors. Using them foolishly will earn his ire.",
            },
        ],
    },
    {
        id: "milwaukee-null-zone",
        name: "The Milwaukee Null Zone",
        source: "let-the-streets-run-red",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Legends of Usla",
                description:
                    "You know the legend of the battle between Usla and Chiclena and discern something extremely important to the Lupines is buried inside the Null Zone. You don't know exactly where it's buried, but you are on the hunt. Gain one bonus die to all Investigation and Occult rolls related to the Null Zone.",
            },
            {
                dot: 2,
                name: "Into the Zone",
                description:
                    "You have access to the Milwaukee Null Zone and can linger there for brief periods. Within the zone, all Auspex uses have difficulty reduced by one. Protean does not require Rouse checks, but you must spend one Willpower per scene to prevent transformative powers from activating automatically. All Blood Sorcery rolls require seven successes to succeed and its rituals fail automatically. Failure on any of these delivers levels of Aggravated damage equal to the margin of failure; Total Failure also leaves a mystical mark on your aura as a powerful beacon to all local Lupines.",
            },
            {
                dot: 3,
                name: "St. Joan of Arc Chapel",
                description:
                    "You discover that a powerful mage had the medieval St. Joan of Arc Chapel moved and reconstructed directly over the center of the Null Zone in the 1960s. The chapel is surrounded by extremely powerful wards against Lupines, and the presence of the Joan of Arc Stone makes it almost unbearable to Kindred (equivalent to True Faith 5). A secret staircase beneath the altar leads to underground tunnels used by the mage in his investigation. Any entrance will be opposed by Lupines, magi, or agents of the Society of St. Leopold stationed on the Marquette campus.",
            },
            {
                dot: 4,
                name: "Church of Isis",
                description:
                    "Mount Mary College hosts the Church of Isis, an occult society composed of humans and magick users from the Cult of Isis who are eager to recover Usla's talismans. Formerly affiliated with Dr. Mortius, they seek new Kindred allies. You forge an alliance with the Church of Isis, allowing you to call upon their aid once per chronicle. They count as a five-dot Ally group that can provide both mundane and sorcerous assistance.",
            },
            {
                dot: 5,
                name: "Usla's Talismans",
                description:
                    "Choose one talisman: Eye of the Coyote — with Storyteller's permission you know where to find the Eye; you have the equivalent of five dots of Auspex and the difficulty of a single Blood Sorcery roll made against you is increased by four while the Eye is on your person; usable once per story, but you are hunted day and night by all Lupines until it is recovered. Talon of the Eagle — with Storyteller's permission you know the location of the Talon; all your physical Attributes are doubled (max five) and you have the equivalent of five dots of Protean once per story; you are hunted day and night by all Lupines until it is recovered.",
            },
        ],
    },
    {
        id: "modius",
        name: "Modius",
        source: "let-the-streets-run-red",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Followers",
                description:
                    "You believe in Modius's capability, even if most others don't understand why. You're in contact with a few like-minded Kindred. Once per chapter, you can call on one of them to do a small favor for you in Gary.",
            },
            {
                dot: 2,
                name: "Windy City Ally",
                description:
                    "You were one of the few who backed naming Modius as Prince of Chicago this last go-round. It earned you sneers and enmity within the city, but word of your support got back to the pauper Prince. As thanks, he sent one of his employees to you and permitted you to make them your two-dot Retainer.",
            },
            {
                dot: 3,
                name: "Keys to the Mansion",
                description:
                    "Modius values your strategic mind, especially when it comes to outthinking the Anarchs. He's provided you with keys to the guest quarters at the governor's mansion (Haven •••) and access to his files with intel on Juggler's plans. Once per story, ask your Storyteller for a piece of information on recent Anarch movements in the city.",
            },
            {
                dot: 4,
                name: "Since 1913",
                description:
                    "You were part of Modius's original attempt at seizing praxis and took part in attacks on Lodin's loyalists. He's never forgotten your service and made sure the vampires in Gary heard about your deeds. Gain Status: Gary Camarilla (••••). Modius has also declared that you may feed anywhere in Gary, though the Anarchs are unlikely to abide by that if you wander into their territory.",
            },
            {
                dot: 5,
                name: "Pauper Dynasty",
                description:
                    "Whatever Chicago's Kindred think, Modius is a Prince and has been one for over half a century. He has insight into what it takes to rule and imparts that wisdom to you in the hopes you'll seize praxis in some other domain — provided it's neither Gary nor Chicago. Gain Modius as a five-dot Mawla, and gain Influence (••) in a city of your choosing to reflect the groundwork he's helped you lay there.",
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

    // ── Winter's Teeth Loresheets ─────────────────────────────────────────────
    {
        id: "minneapolis",
        name: "Minneapolis",
        source: "winters-teeth",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "The Nod Lot",
                description: "You have cultivated a small Herd (••) in the unofficial northwest district known as the Nod Lot. The blood resonance of your herd varies from melancholic to completely absent. However, feeding from such victims presents a high risk of transferring blood-borne pathogens. You must take the Flaw Addiction (•) or Dark Secret - Plague Bearer (•).",
            },
            {
                dot: 2,
                name: "The Artist Formerly Known As...",
                description: "You are one of the lucky few who has made a name for themselves within the music industry as a performing artist. Since your Embrace, your renown has become a double-edged sword, especially after the highly publicized reports of your death. You gain Fame (•••), however, you must also take the Flaw Mask (Known Corpse).",
            },
            {
                dot: 3,
                name: "The Revolution",
                description: "Minneapolis has a strong tradition of fighting for equal rights and representation. You were once an active force for change within your community, or have become familiar to those who are. You gain four dots to spend among Allies, Contacts, or Influence, representing affiliation with prominent grassroots movements, local leaders, or institutions. However, this activism has made you a target among your elite Camarilla enemies — you must take the Flaw Status: Shunned - Camarilla (*).",
            },
            {
                dot: 4,
                name: "The River Rats",
                description: "You have managed to ingratiate yourself to the Nosferatu cabal of secret-seekers who infest Minneapolis from the sewers and riverfront to the dark corners of the skywalk and ruins of ancient flour mills. You may distribute three dots between Contacts and Mawla (Nosferatu Mawla only), and once per story you may gain one valuable piece of information (at Storyteller's discretion) relevant to your character's Ambition.",
            },
            {
                dot: 5,
                name: "The Minneapolis Six",
                description: "In 2003, a riot following a University of Minneapolis hockey victory was blamed on the Anarch community. Prince Merrain capitalized on the opportunity and had three of the six perpetrators put to Final Death; the remaining three were forcibly blood bound to the Prince. You are one of the surviving three. Your blood bond has broken, and now you and your kin hunger for retribution. Once per chronicle, you may evoke the memory of the Minneapolis Six to sway the Anarch community to your cause, at the Storyteller's discretion.",
            },
        ],
    },
    {
        id: "the-nictuku",
        name: "The Nictuku",
        source: "winters-teeth",
        requiresStPermission: true,
        clanRestriction: ["Nosferatu"],
        dots: [
            {
                dot: 1,
                name: "Signal-to-Noise",
                description: "Mysterious deaths and disappearances are often attributed by conspiracy-minded Sewer Rats to the dreaded Nictuku. Once per story, by examining the tell-tale signs (or lack thereof), you may definitively know whether such a crime was committed by your ancestral enemy or some other circumstance.",
            },
            {
                dot: 2,
                name: "Morbid Curiosity",
                description: "Whether through legend, gossip, or indirect exposure, you have grown obsessed with the concept of these ancestral nemeses and devoted your unlife to the study of the Nictuku. When making an Occult or Investigation roll regarding the Nictuku, you may add +2 dice to the roll.",
            },
            {
                dot: 3,
                name: "Blindspot",
                description: "The Hidden have had to hone their skills to counter not only the perceptive Tremere regent on whom they are spying, but also the unknown shadows that haunt their every step. Once per session, when contesting against a power such as Sense the Unseen, you may add two dice to your Obfuscate roll.",
            },
            {
                dot: 4,
                name: "Deathmark",
                description: "You have attracted the attention of one of the Nictuku (or something that appears as one), and it is but a matter of time before they catch up with you. You gain Adversary (••••); however, you may spend an equal number of points on haven merits relating to the added security measures taken against your phantom nemesis. Once per story, you may permanently sacrifice up to three dots in Backgrounds to make a clean getaway, at the Storyteller's discretion.",
            },
            {
                dot: 5,
                name: "Hunted-Becomes-Hunter",
                description: "You have developed skills of survival and combat against more than just the Nictuku. You have honed yourself into a defensive weapon against any Kindred who would seek to consume the vitae within you. You gain the specialization Brawl (Kindred) and may add an additional +2 dice to all conflicted rolls against cannibalistic Kindred (diableriests, Blood Leeches, and the like).",
            },
        ],
    },

    {
        id: "wolves-in-sheeps-clothing",
        name: "Wolves in Sheep's Clothing",
        source: "winters-teeth",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "What Big Teeth You Have!",
                description: "As their name suggests, the Wolves in Sheep's Clothing are deadly because, as ghouled mortals, Kindred tend to underestimate them — allowing them to get close enough to strike with lethal precision. You have learned to recognize the tell-tale signs of these abominations as your Beast instinctively finds itself agitated around these callous usurpers.",
            },
            {
                dot: 2,
                name: "Huntsman",
                description: "You have engaged in a deadly game of cat-and-mouse with the Wolves in Sheep's Clothing for years. The lines between predator and prey have become blurred as you seek out these deadly foes while simultaneously ensuring your own safety during daylight hours. You gain an extra die to all Investigation rolls made to track down or investigate the Wolves in Sheep's Clothing, in addition to gaining an extra die to all rolls made to act during the daytime.",
            },
            {
                dot: 3,
                name: "Carrion Preservation",
                description: "You have managed to replicate the way in which the Wolves harvest vampiric body parts without them immediately decaying into dust. While you cannot gain the benefits they do by grafting such parts onto yourself, such a talent can prove useful when preserving evidence or grisly keepsakes. By dousing the organ or extremity in one Rouse Check's worth of vitae and succeeding at a Resolve + Occult roll (diff. 3), you may embalm the object for a year, at which time the preservation needs to be renewed. Final Death of the caster immediately renders this preservation null.",
            },
            {
                dot: 4,
                name: "A Wolf in the Fold",
                description: "You have been victimized by the Wolves in Sheep's Clothing, though you have managed to escape. To this night, some up-jumped ghoul stalks the streets wielding pieces of your body as their own. Once per Chronicle, you may attempt to inhabit the perception of your assailant, as per the Auspex power Share the Senses (using Resolve + Insight). Should you already possess Share the Senses, you instead reduce the difficulty of the roll by two.",
            },
            {
                dot: 5,
                name: "The Shepherd",
                description: "You have made yourself a mysterious benefactor to the Wolves in Sheep's Clothing to such a degree that they have become your loyal, if ignorant, hounds. You gain Allies (••••) representing a cell of these redoubtable ghouls. Once per Chronicle, you may send this cell to dispatch a Kindred enemy. However, should the Wolves discover your true nature, said Allies may very easily become Enemies (••••) instead, not to mention any objections your local Camarilla may take to those who willingly aid and abet anathemas such as these.",
            },
        ],
    },

    // ── Custom Game Loresheets ───────────────────────────────────────────────
    {
        id: "castoff-court",
        name: "The Castoff Court",
        source: "custom",
        requiresStPermission: true,
        dots: [
            {
                dot: 1,
                name: "Recognized Scent",
                description: "The Castoffs no longer treat you as immediate prey. Gain +1 die to Social tests involving scavengers, outcasts, sewer denizens, or frightened people. Lesser chimera, animated objects, and small nightmare-things hesitate before attacking or exposing you unless directly threatened. Not fondness. Recognition. There is a difference.",
            },
            {
                dot: 2,
                name: "Proper Manners",
                description: "You understand the etiquette of dangerous things: gifts, silence, honest fear, and knowing when not to stare. Reduce Difficulty by 1 on Social rolls against Thallain, hostile changelings, scavenger spirits, or supernatural predators — provided you approach without aggression. Once per session, offer a symbolic gift to de-escalate a hostile encounter long enough to speak. It does not guarantee safety afterward.",
            },
            {
                dot: 3,
                name: "Little Stories",
                description: "The underside of the city has started attaching rumors to you. Scavenger gossip, sightings, stray memories — the Castoff ecosystem knows your name, after a fashion. Once per story, declare: \"Something down here remembers me.\" Choose one: a chimera stands down; a hidden watcher leaves information; an abandoned object reveals a clue; a scavenger warns you of approaching danger. Gain +1 die to resist ambush or stalking in abandoned or subterranean locations.",
            },
            {
                dot: 4,
                name: "Mercy's Good Side",
                description: "Crackjaw Mercy has decided you are useful, entertaining, or simply too inconvenient to eat safely. Once per story, request temporary shelter, scavenged intelligence, protection from lesser tunnel predators, or direct intervention. Functions as Allies 3/2 or Contacts 3/2 depending on the situation. Be aware: the Castoffs solve problems the way nightmares do — violently, indirectly, with no regard for collateral damage. Their help tends to create additional problems.",
            },
            {
                dot: 5,
                name: "One of the Things Below",
                description: "You are no longer treated as entirely separate from the hidden ecosystem beneath Nashville. Once per story, without a roll, you may: disappear into the urban underside, break off pursuit underground, shelter among nightmare-things, or pass safely through an actively dangerous subterranean space. Predatory supernatural creatures must succeed on a Resolve + Awareness test (Difficulty 4) before immediately attacking you on first encounter in sewers, flooded tunnels, or urban nightmare spaces. Something about you registers as possibly belonging here. Predators pause. Sometimes that is enough.",
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
                name: "The Land Listens",
                description: "You have been recognized — however faintly — as relevant to the Langford site. Doors no longer slam closed randomly, and the temperature and humidity no longer rebel against your presence. Gain 1 extra die to Lien, Portillon, or similar spirit- or place-mediated actions conducted at or directly tied to the Plantation. Spirits, charms, or chimera associated with the land do not immediately treat you as an Intruder.",
            },
            {
                dot: 2,
                name: "Keeper of the Threshold",
                description: "You have gained knowledge of where the curtains between the land and other spaces are thin, and you know how to step carefully to manipulate or protect these spaces accordingly. Reduce the difficulty by 1 to open, stabilize, or traverse a known threshold connected to the Langford ley line.",
            },
            {
                dot: 3,
                name: "Blood Writes on Stone",
                description: "Your vitae has been accepted as part of the site's ongoing metaphysical structure. When performing a ritual, ceremony, or extended occult action that draws on the land, spirits, or ley flow at Langford, gain +1 die to the primary roll. Spirits or Fae convinced by you to assist may supply teamwork to such castings as determined by a Storyteller.",
            },
            {
                dot: 4,
                name: "Warden's Claim",
                description: "You are no longer merely Acknowledged — you are obeyed, albeit reluctantly. Once per story you may issue a binding directive to a spirit, guardian, or trod function tied to the Langford line. This spirit acts as Allies 4/2 and is controlled by the Storyteller. It may twist your words to suit its needs, and this control may be considered hostile.",
            },
            {
                dot: 5,
                name: "Master of the Broken Chain",
                description: "You hold the leash. The hold is not clean nor safe, but it is currently firm. You may open, close, reroute, or deny passage along the Langford Trod once per story without a roll, unless directly opposed by another entity of similar narrative weight. Opponents attempting to use or destabilize the trod must contend with you first, both narratively and mechanically. This control may bring friction and contact with other entities that rely on the Trod for transport and defense, and may also require occasional effort to defend the Trod as entities from the Deep Dreaming find their way to it and attempt crossing.",
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
                name: "The Sound of Silence",
                description: "You've come to understand the ambient noises under the city — dripping water, pipe expansion, hissing steam — and also the more intentional sounds: an entire language of banging on pipes that can carry for miles through cisterns and culverts. You have learned how to listen and decipher these patterns to learn things about the city above. Gain the Specialty Streetwise (Sewer Echoes) that may be used for rumors and other information gathering.",
            },
            {
                dot: 2,
                name: "No, Really!",
                description: "Nashville's sewers span thousands of miles of tunnels that exit anywhere in the city if you know how to navigate them. You are one such creature, and know how to avoid pitfalls and lairs along the way. You may navigate the sewers freely and safely, using them to appear nearly anywhere in Nashville given enough time to travel on foot. This is also useful for escaping pursuit.",
            },
            {
                dot: 3,
                name: "The Blood Flows",
                description: "Deep within Nashville runs the mother of all sewers — a century-old line big enough to drive a dump truck through. This rarely used space has become a ramshackle marketplace called The Liminals, where most anything can be found for the right price. Gain the Side Hustler merit as well as Contacts 1: The Liminals.",
            },
            {
                dot: 4,
                name: "The Hollow Veins",
                description: "Deep within Nashville's darkest sewer places lies the Hollowed Veins freehold, ruled by a motley of Sluagh called the Whispered Court. Thallain flock to the freehold, held in check by the sly and wicked Unseelie. You've met denizens or prisoners of the freehold and perhaps done work for them. You know an emissary of the dark Unseelie and may call upon them for information or favors — though as with any Fae dealing, the reward is often not what you expect. Gain Mawla (••••) to be used at your own peril.",
            },
            {
                dot: 5,
                name: "Roiling Madness",
                description: "The Whispered Court owes you favors, or you have proven yourself and gained the respect of the assembled Fae. You may call upon a motley of Thallain to do your bidding, boiling up from the sewers like mad howling ants upon sugar. You may or may not keep them in check once they have been pointed at a task, and they may stay and cause trouble after the task is complete if you do not word things perfectly, as Fae are wont to do. Be careful what you wish for. Gain Allies: Thallain Motley (••••).",
            },
        ],
    },
]

export const getLoresheetById = (id: string): Loresheet | undefined =>
    LORESHEETS.find((l) => l.id === id)
