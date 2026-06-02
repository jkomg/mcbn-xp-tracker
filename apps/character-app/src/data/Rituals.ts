import { Ritual } from "./Disciplines"

export const Rituals: Ritual[] = [
    // Level 1
    {
        name: "Astromancy",
        summary: "Learn information such as Skills, Desires, and Convictions about a target person. Knowing their correct birth or Embrace date adds 1 die to the Ritual pool.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 1
    },
    {
        name: "Beelzebeatit",
        summary: "Make a small area repellent to animals, vermin, plants, and other lesser living creatures. Directed or controlled creatures are not prevented from entering.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Vinegar or alcohol",
        level: 1
    },
    {
        name: "Bind the Accusing Tongue",
        summary: "Prevent the target from communicating anything negative about the caster. The victim can break free by rolling Composure + Resolve.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 1
    },
    {
        name: "Blood Apocrypha",
        summary: "Embed messages into blood or vessels. The first person receives the message if they are the intended recipient or if they possess A Taste for Blood.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 1
    },
    {
        name: "Blood Missive",
        summary: "Send messages through blood. The first person to taste the blood receives the message as if it were intended for them, or if they possess A Taste for Blood.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "The caster's blood",
        level: 1
    },
    {
        name: "Blood to Water",
        summary: "Turn blood into water, removing all traces of blood.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 1
    },
    {
        name: "Blood Walk",
        summary: "Use blood to learn about a subject's generation, name, sire, and — on a crit — any active Blood Bonds. Requires one Rouse Check from the subject.",
        rouseChecks: 1,
        requiredTime: "1 hour",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Blood of the subject",
        level: 1
    },
    {
        name: "Bloody Message",
        summary: "Write a blood message onto a remembered reflective surface for a chosen type of viewer. Make the Ritual Roll when enchanting the surface.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "A mirror, human blood, and UV light",
        level: 1
    },
    {
        name: "Clinging of the Insect",
        summary: "Drink blood mixed with a freshly crushed spider to cling to walls like an insect. The user must cling with both hands and feet.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Living spider, your own blood",
        level: 1
    },
    {
        name: "Coax the Garden",
        summary: "Animate nearby plant life to hinder and harm anyone in the ritual area except the caster.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Human blood and poppy seeds",
        level: 1
    },
    {
        name: "Craft Bloodstone",
        summary: "Slowly soak blood into a small magnet. Once done, sense the direction and rough distance of the stone for a week. A caster may have up to as many stones as their Resolve.",
        rouseChecks: 1,
        requiredTime: "3 nights",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Small magnet, your blood",
        level: 1
    },
    {
        name: "Douse the Fear",
        summary: "Briefly steady yourself against fire, gaining a bonus to resist terror frenzy from flames. The power wears off once the scene ends.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "A holy object exposed to flame",
        level: 1
    },
    {
        name: "Enrich the Blood",
        summary: "Make a human vessel's blood richer so a smaller drink slakes more Hunger for a short time. Does not work on Kindred vitae.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "A vial of the target's blood and fresh human blood",
        level: 1
    },
    {
        name: "Herd Ward (Minor)",
        summary: "Ward a single member of a herd to prevent unauthorized feeding. Make the Ritual Roll when someone else tries to feed from them.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 1
    },
    {
        name: "Letter Ward",
        summary: "Seal a letter so anyone except the intended recipient is burned and the message is destroyed. Make the Ritual Roll if anyone other than the recipient opens it.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Pigeon blood, wax, and dog blood",
        level: 1
    },
    {
        name: "Revealing the Crimson Trail",
        summary: "Reveal traces of spilled blood at the caster's current location. Very old traces require a Resolve + Awareness test.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 1
    },
    {
        name: "Sanguine Tidings",
        summary: "Make a message appear on a mirror when a specific type of person comes nearby. The message disappears once read.",
        rouseChecks: 0,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 1
    },
    {
        name: "Seal the Brand",
        summary: "Make a tattoo, scar, brand, or similar body modification permanent on vampiric flesh. The process inflicts 1 Superficial damage.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Molten silver poured over the body modification",
        level: 1
    },
    {
        name: "Shared Memory",
        summary: "Observe another's In Memoriam. Participants can observe events and offer advice but cannot directly influence them.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 1
    },
    {
        name: "Wake with Evening's Freshness",
        summary: "When threatened during the day after performing this ritual, awaken and ignore daytime penalties for a scene. Do not make the Ritual Roll until true danger appears.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Burnt bones of a rooster",
        level: 1
    },
    {
        name: "Ward Against Ghouls",
        summary: "Place a ward on a small object. When a ghoul tries to touch it, make the Ritual Roll — on a success, the ghoul cannot touch it and is damaged. Uses standard rules for Wards.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 1
    },
    // Level 2
    {
        name: "As Fog on Water",
        summary: "Walk silently across the surface of a body of water for the rest of the night. Can be ended early.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "A piece of wood from a ship and water",
        level: 2
    },
    {
        name: "Calling the Aura's Remnants",
        summary: "Speak with the residual aura of someone who has died. The aura retains memories only up to the time of death.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 2
    },
    {
        name: "Calix Secretus",
        summary: "Store your vitae inside a small object and release it later with a command word. Two Rouse Checks stored will slake one Hunger.",
        rouseChecks: 1,
        requiredTime: "1 hour",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "A hand-sized object and the caster's blood",
        level: 2
    },
    {
        name: "Communicate with Kindred Sire",
        summary: "Create a long-distance telepathic link between Sire and Childe. A major disturbance on either side breaks the connection.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 2
    },
    {
        name: "Craftmaster",
        summary: "Temporarily gain dots and a specialty in Academics, Craft, Performance, or Science. Dots replace existing dots in that skill, but grant an extra die if the caster already has the specialty. On a total failure, the caster takes Aggravated Damage.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 2
    },
    {
        name: "Depths of Nightmare",
        summary: "Curse someone with nightmares that cause Willpower damage which cannot be healed during the Ritual's duration. On a total failure, the victim has pleasant dreams and is pointed toward the caster.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 2
    },
    {
        name: "Elemental Grasp",
        summary: "Command your chosen element to interfere with a target. The target takes Superficial Health damage and must roll to continue. Gain +1 die to the Ritual pool if the element is already naturally active.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 2
    },
    {
        name: "Enhance Dyscrasia",
        summary: "Amplify a vessel's Dyscrasia so several Kindred can benefit from it over three nights.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "A resonant personal object belonging to the target",
        level: 2
    },
    {
        name: "Eyes of Babel",
        summary: "Consume the eyes and tongue of a victim to gain the ability to read and speak any language known by them. This Ritual may incur Stains.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "The victim's eyes and tongue",
        level: 2
    },
    {
        name: "Illuminate Trail of Prey",
        summary: "Follow the trail of a specific person. The victim's face must be known to the caster.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 2
    },
    {
        name: "Le Sang de l'Amour",
        summary: "Create a mystical connection between two people who desire each other at the time of casting. Both can use Resolve + Awareness to estimate where the other is. On a total failure of the Ritual, the roll disorients them and temporarily reduces Composure by one.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 2
    },
    {
        name: "Silentia Mortis",
        summary: "Replicate Silence of Death (Obfuscate ●), creating a radius of silence. If cast on someone other than the caster, they must also make a Rouse Check.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 2
    },
    {
        name: "Soporific Touch",
        summary: "Turn your vitae into a touch-activated narcotic that weakens the victim's resistance to mundane manipulation or mind-altering Disciplines. The Ritual Roll is contested against the victim's Stamina + Resolve.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Hashish or another narcotic substance",
        level: 2
    },
    {
        name: "Shroud of Silence",
        summary: "Seal a room so no sound can escape until the focus is removed or the scene ends. Requires vitae from a Kindred who possesses Obfuscate.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Woven cloth, a golden ring, and vitae from an Obfuscate user",
        level: 2
    },
    {
        name: "Stolen Memory",
        summary: "Access your sire's memories. Can reach grandsire or beyond with a Difficulty increase of 2 per generation past the sire.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 2
    },
    {
        name: "Tiamat Glistens",
        summary: "Attune yourself to a place of power (Furcus), gaining bonuses to Rituals cast there. Only one caster can be attuned at a time; if another performs the Ritual, the original caster immediately loses their bonus.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 2
    },
    {
        name: "Truth of Blood",
        summary: "Discern truth from lies in a target's speech. The target resists with Composure + Occult. Cannot get past memory-wiping Disciplines.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Resolve + Blood Sorcery",
        ingredients: "",
        level: 2
    },
    {
        name: "Unseen Underground",
        summary: "Become invisible while underground. Immediately ends if the caster goes above ground or takes hostile actions; otherwise lasts one hour.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 2
    },
    {
        name: "Viscera Garden",
        summary: "Grow Blood-addicted plants that can consume corpses. Kindred can eat them without slaking Hunger but they stay down. Mortals who ingest a plant become more susceptible to Disciplines.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 2
    },
    {
        name: "Ward against Spirits",
        summary: "Protect a small object against spirits. Uses standard rules for Wards.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 2
    },
    {
        name: "Warding Circle against Ghouls",
        summary: "Protect an area against Ghouls. Uses standard rules for Wards.",
        rouseChecks: 3,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 2
    },
    {
        name: "Web of Hunger",
        summary: "Avoid the pull of the Beckoning. Normally a 4th level Ritual, but reduced to 2nd level when used with the required dagger.",
        rouseChecks: 1,
        requiredTime: "10 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "A special dagger",
        level: 2
    },
    // Level 3
    {
        name: "Bladed Hands",
        summary: "Sharpen the caster's hands into weapons. Treated as a light piercing Brawl weapon with a +2 modifier.",
        rouseChecks: 2,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Blood Sigil",
        summary: "Create a tattoo on a Kindred that also contains a hidden message. Read it with a Resolve + Occult roll or Sense the Unseen (Auspex ●). The caster can remove it by spending Willpower and touching the tattoo.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Bloodless Feast",
        summary: "Transmute an unconscious human's life into clear vitae that can sate Hunger. Those who consume enough of it become weaker to diablerie. May incur Stains.",
        rouseChecks: 1,
        requiredTime: "3 hours",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "An unconscious human and a flawless crystal chalice",
        level: 3
    },
    {
        name: "Communal Vigor",
        summary: "Strengthen a pack's Vaulderie so members share the priest's Blood Potency for the night. The Priest gains +3 bonus dice on Dominate and Presence tests against packmates.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "A fingernail from the pack priest",
        level: 3
    },
    {
        name: "Dagon's Call",
        summary: "Rupture the blood vessels of a victim from afar. Can be used up to two additional times the same night, each costing another Rouse Check. Opposed by Stamina + Resolve.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Resolve + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Deflection of Wooden Doom",
        summary: "Protect yourself from being staked. Do not make the Ritual Roll until actually staked.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Elemental Shelter",
        summary: "Meld with your chosen element, similar to Earth Meld (Protean ●●●). Fire Kolduns must resist terror frenzy before casting. The caster's form can be detected with Wits + Awareness or Sense the Unseen. If the bonded element is removed, the Koldun enters torpor.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Essence of Air",
        summary: "Allows for flight. The Camarilla frowns upon this Ritual due to its Masquerade dangers.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Eyes of the Past",
        summary: "See what happened at the caster's current location in the past. Only holds events within the last five years.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Fire in the Blood",
        summary: "Burn a target's blood from afar, causing painful Superficial damage and physical penalties. A victim can only be affected by this Ritual once per night.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Target's blood, their image, and a red candle or iron lighter",
        level: 3
    },
    {
        name: "Firewalker",
        summary: "Allow yourself and your comrades to become resistant to fire. The required fingertip removal must all come from the caster, even when cast on others.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "The caster's fingertips",
        level: 3
    },
    {
        name: "Galvanic Ruination",
        summary: "Destroy nearby electrical systems, knocking out lights, alarms, cars, and cameras in a warehouse or three-story building. Extend to additional buildings by increasing Difficulty by 1 per building.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "A copper coin smeared with the caster's blood",
        level: 3
    },
    {
        name: "Gentle Mind",
        summary: "Protect the mind of a target against Frenzy. The caster must share blood with the target and cannot cast this on themselves.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Grim Chrysalis",
        summary: "Spit out a protective cocoon that shields from sunlight and accelerates healing or reshaping. The cocoon is hard and provides some protection from outside damage.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Human hair and a moth or butterfly",
        level: 3
    },
    {
        name: "Haunted House",
        summary: "Make a haven appear as if it's haunted. The effects last for 10 years.",
        rouseChecks: 3,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Herd Ward (Major)",
        summary: "Ward a door to protect multiple herd members within against unauthorized feeding. Make the Ritual Roll when someone else tries to feed from the herd.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Scorpion poison and the caster's vitae",
        level: 3
    },
    {
        name: "Illusion of Peaceful Death",
        summary: "Make a corpse appear as if it died a natural death. The body must have at least half of its blood remaining to succeed.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Illusion of Perfection",
        summary: "Become a nondescript, unremarkable person to blend into crowds, similar to Mask of a Thousand Faces (Obfuscate).",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Nepenthe",
        summary: "Create a draught that removes Stains, but prolonged use makes those Stains permanent. Using Nepenthe two sessions in a row causes one Stain to become permanent (cumulative).",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "One with the Blade",
        summary: "Dedicate a melee weapon to yourself so it resists decay and can be anointed for combat. Only one weapon can hold this ritual at a time.",
        rouseChecks: 1,
        requiredTime: "1 night",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "A melee weapon immersed in the caster's vitae",
        level: 3
    },
    {
        name: "Sanguine Watcher",
        summary: "Create a small rat from vitae that can observe or steal on the caster's behalf. Instructions must be very explicit.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Seeing with the Sky's Eyes",
        summary: "Observe a target from above. Ask one question about their location and surroundings per success. Critical Wins grant 3 extra questions and can reveal Ambitions, Desires, Convictions, and Humanity.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Seeking Tiamat",
        summary: "Find veins of the Earth (Furcae). Costs one Rouse Check and Aggravated Health damage. Critical Wins discover the closest vein and point toward 2 Furcae on that vein.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Sleep of Judas",
        summary: "Prepare a supernatural narcotic that can incapacitate vampires and kill mortals or ghouls. Make the Ritual Roll when the target is drugged.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Blood from a mystical landmark and opium",
        level: 3
    },
    {
        name: "Soul of the Hemonculus",
        summary: "Create a Hemonculus — a shrivelled, smaller, weaker version of the caster who must obey every command. Immune to sunlight but cannot be Embraced, made into a ghoul, or Blood Bonded. Kindred slake no Hunger from drinking its blood.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Stone of the True Form",
        summary: "Dispel illusions and Discipline-altered creatures. Must throw the stone with Dexterity + Athletics. On a win: illusions dispelled, shapeshifters painfully returned to original form, Discipline-made beings separated into components. Target resists with Resolve + Occult.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "The Unseen Change",
        summary: "Force Lupines entering the area into Wolf Form. They resist with a contested Willpower roll; on failure they enter Lupus Form instead.",
        rouseChecks: 3,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Trespass",
        summary: "Flow through any crevice that blood can fit through to move through a building undetected. Unlike Incorporeal Passage, the caster can be attacked if noticed.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Viral Haruspex",
        summary: "Gather information from everyone in an area suffering from a certain disease. The caster must drink from someone infected with that disease within 24 hours before casting.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Blood of someone infected with the target disease",
        level: 3
    },
    {
        name: "Ward against Lupines",
        summary: "Protect a small object against Werewolves. Uses standard rules for Wards.",
        rouseChecks: 1,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    {
        name: "Warding Circle against Spirits",
        summary: "Protect an area against spirits. Uses standard rules for Wards.",
        rouseChecks: 3,
        requiredTime: "15 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 3
    },
    // Level 4
    {
        name: "Balm of Bathory",
        summary: "Brew a blood balm from young mortal blood that temporarily grants the Stunning (••••) Merit. Each subsequent use requires double the mortal blood of the last batch.",
        rouseChecks: 1,
        requiredTime: "1 hour",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Caster vitae, youthful mortal blood, chamomile, and fat or butter",
        level: 4
    },
    {
        name: "Compel the Inanimate",
        summary: "Give a simple command to an inanimate object that it follows a few minutes later. The caster must remain in the same general area. Detectable with Sense the Unseen (Auspex ●) via a contested roll.",
        rouseChecks: 1,
        requiredTime: "20 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 4
    },
    {
        name: "Defense of the Sacred Haven",
        summary: "Protect a haven with mystical darkness from sunlight. The Ritual Roll is made once the sun rises.",
        rouseChecks: 1,
        requiredTime: "20 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 4
    },
    {
        name: "Egregore Consultation",
        summary: "By hosting an illness, access the collective experiences of everyone in the area with that illness to enhance Skills. Skills very common locally can grant up to +2 extra dice.",
        rouseChecks: 1,
        requiredTime: "20 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 4
    },
    {
        name: "Eyes of the Nighthawk",
        summary: "Take control of a carnivorous bird and act through them. The caster can use most non-physical Disciplines through the bird.",
        rouseChecks: 1,
        requiredTime: "20 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 4
    },
    {
        name: "Feast of Ashes",
        summary: "Curse a vampire so they vomit blood for a night and can only sate Hunger with ashes (minimum Hunger 3). Contested against the victim's Resolve + Willpower.",
        rouseChecks: 1,
        requiredTime: "20 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "A parchment bearing the target's name, burned to ash",
        level: 4
    },
    {
        name: "Guided Memory",
        summary: "Drink a willing Kindred's prepared vitae to relive their memories guided by them. Can be used to unlock Discipline powers, Merits, and other gifts.",
        rouseChecks: 1,
        requiredTime: "20 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Another vampire's vitae, dried rosemary, and poppies or forget-me-nots",
        level: 4
    },
    {
        name: "Incorporeal Passage",
        summary: "The caster's form becomes ghost-like, allowing them to pass through solid matter. They may only interact with the world through speech and sight.",
        rouseChecks: 1,
        requiredTime: "20 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 4
    },
    {
        name: "Innocence of the Child's Heart",
        summary: "Block Scry the Soul (Auspex) to hide evidence of diablerie and other vampiric traits. Extremely rare — only learned by obtaining Nicolai's notes or by Storyteller discretion.",
        rouseChecks: 1,
        requiredTime: "20 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 4
    },
    {
        name: "Innocence's Veil",
        summary: "Temporarily make traces of Diablerie undetectable. Cannot be detected by A Taste for Blood or Scry the Soul.",
        rouseChecks: 0,
        requiredTime: "20 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 4
    },
    {
        name: "Invisible Chains of Binding",
        summary: "Prepare a chain link that can pin a target in place for one hour per success in the margin and hinder their physical defenses. Ends if the chain is destroyed or removed.",
        rouseChecks: 1,
        requiredTime: "1 hour",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "A chain link inscribed with the caster's blood",
        level: 4
    },
    {
        name: "Land's Sustenance",
        summary: "Feed from a place of power, turning it into a place of suffering where injuries are more severe. Lasts until end of the Story. Once per session, automatically pass Rouse Checks equal to the Ritual margin.",
        rouseChecks: 1,
        requiredTime: "20 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 4
    },
    {
        name: "Protean Curse",
        summary: "Transform a target into a bat, similar to Metamorphosis (Protean). Cannot be used on the caster.",
        rouseChecks: 2,
        requiredTime: "20 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 4
    },
    {
        name: "Rending the Sweet Earth",
        summary: "Pull a vampire from the earth who is using Earth Meld (Protean). Automatically awakens the target unless they are in torpor or the Ritual Roll is a Critical Win.",
        rouseChecks: 1,
        requiredTime: "20 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 4
    },
    {
        name: "Riding the Earth's Vein",
        summary: "Travel from one Furcus to a random other. The caster has no control over the destination. One-way; only activates where first cast.",
        rouseChecks: 1,
        requiredTime: "20 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 4
    },
    {
        name: "Seek the Gathered Vitae",
        summary: "Sense a concentration of Kindred vitae with a collective Blood Potency of 13 or higher and track its direction for an hour. Ghouls count as 1/4 and Duskborn as 1/2.",
        rouseChecks: 1,
        requiredTime: "5 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Red ink, pomegranate juice, white paper or cloth, and a large top",
        level: 4
    },
    {
        name: "Ward against Cainites",
        summary: "Protect a small object against Kindred. Uses standard rules for Wards. A vampire examining the ward may read the caster's name with an Intelligence + Auspex vs. Intelligence + Blood Sorcery roll.",
        rouseChecks: 1,
        requiredTime: "20 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 4
    },
    {
        name: "Warding Circle against Lupines",
        summary: "Protect an area against Werewolves. Uses standard rules for Wards.",
        rouseChecks: 3,
        requiredTime: "20 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 4
    },
    // Level 5
    {
        name: "Antebrachia Ignium",
        summary: "Coat your arms in vitae that catches fire, letting you wield flame by touch for a scene. The caster is only resistant to fire on their arms.",
        rouseChecks: 1,
        requiredTime: "25 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Enough vitae to coat both arms and a source of flame",
        level: 5
    },
    {
        name: "Atrocity's Release",
        summary: "Reverse the effects of Diablerie. Can be resisted with a Resolve + Blood Sorcery test.",
        rouseChecks: 1,
        requiredTime: "25 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 5
    },
    {
        name: "Dominion",
        summary: "Claim a building as your domain, blocking others from using Animalism, Auspex, Dominate, or Presence there. The area of effect is determined by the number of Rouse Checks spent.",
        rouseChecks: 1,
        requiredTime: "3 hours",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Iron seals embedded over every doorway",
        level: 5
    },
    {
        name: "Eden's Bounty",
        summary: "Draw blood from nearby mortals through a tree to reduce the caster's Hunger. Mortals suffer −1 die to Physical rolls and 1 Aggravated health damage for the remainder of the chapter. May incur Stains.",
        rouseChecks: 1,
        requiredTime: "25 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "A corpse, a living tree, a fresh apple, and a rotten apple",
        level: 5
    },
    {
        name: "Elemental Attack",
        summary: "Command your chosen element to attack a foe. Can be a Chain Ritual. Gain +1 die if the element is naturally active. Chained with Elemental Grasp and Tiamat Glistens, becomes a natural disaster (tornado, magma flow, tsunami, etc.).",
        rouseChecks: 1,
        requiredTime: "25 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 5
    },
    {
        name: "Escape to True Sanctuary",
        summary: "Create a one-way portal between two ritual circles. Requires 12 Rouse Checks total. A caster may only have one set of circles active at a time.",
        rouseChecks: 12,
        requiredTime: "25 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 5
    },
    {
        name: "Fisher King",
        summary: "Become one with your land, gaining access to its secrets. Can be a Chain Ritual. Use Wits + Streetwise or Survival to ask questions about the land; gain one extra question per session. Lasts until end of the story. Chained with Land's Sustenance and Compel the Inanimate, casters gain complete control and can heal 5 Aggravated damage total each night.",
        rouseChecks: 1,
        requiredTime: "25 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 5
    },
    {
        name: "Heart of Stone",
        summary: "Turn your heart to stone, preventing staking. Causes emotional detachment, penalizing Remorse rolls and active Social-related rolls. Cannot use Presence during the Ritual's duration, but gain a bonus when resisting its use on you.",
        rouseChecks: 1,
        requiredTime: "25 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 5
    },
    {
        name: "Reawakened Vigor",
        summary: "Regain Blood Potency faster after extended torpor. Inflicts Aggravated damage on anyone other than the caster.",
        rouseChecks: 1,
        requiredTime: "25 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 5
    },
    {
        name: "Shaft of Belated Dissolution",
        summary: "Create a stake that seeks out a vampire's heart. Even if the initial attack misses the heart, a splinter breaks off and moves toward it — if it finds the heart, the target faces Final Death.",
        rouseChecks: 2,
        requiredTime: "25 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "A wooden stake",
        level: 5
    },
    {
        name: "Simulacrum Gate",
        summary: "Build a sacrificial replica doorway that allows multiple vampires to cross vast distances. May incur Stains.",
        rouseChecks: 1,
        requiredTime: "weeks",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "Replica materials, mortal sacrifices, and a vampire sacrifice",
        level: 5
    },
    {
        name: "Transferring the Soul",
        summary: "Take over a new body through the act of diablerie. Requires another Kindred with Oblivion ●●●●●, or a single Kindred possessing both Blood Sorcery ●●●●● and Oblivion ●●●●●.",
        rouseChecks: 1,
        requiredTime: "25 min",
        dicePool: "Intelligence + Blood Sorcery and Intelligence + Oblivion",
        ingredients: "",
        level: 5
    },
    {
        name: "Warding Circle against Cainites",
        summary: "Protect an area against Kindred. Uses standard rules for Wards.",
        rouseChecks: 3,
        requiredTime: "25 min",
        dicePool: "Intelligence + Blood Sorcery",
        ingredients: "",
        level: 5
    }
]
