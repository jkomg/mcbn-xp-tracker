# Hunt Consequence Monitor

The Hunt Consequence Monitor automatically detects Messy Critical and Bestial Failure results in roll channels and prompts players to resolve the consequence before play continues. Staff receive a structured summary in #st-coordination-1 for every resolved consequence.

---

## Monitored Channels

The bot watches the following Rolls of Darkness channels for messages from **The Eldest** bot:

- `#standard-rolls`
- `#combat-rolls`
- `#project-rolls`

> **Test mode is currently active.** All activity is routed through `#bot-testing` instead of the live roll channels. This will be disabled once testing is complete.

---

## Player Guide

### When the prompt appears

If The Eldest posts a roll result containing a **Messy Critical** or **Bestial Failure**, the bot will immediately reply to that roll with a prompt and action buttons. You do not need to do anything to trigger this — it happens automatically.

### Before you click anything

You may spend Willpower to reroll dice before resolving a consequence. The bot watches for edits to The Eldest's roll message and will update its prompt accordingly:

- If the consequence type changes (e.g. Messy Critical becomes Bestial Failure), the prompt and buttons update automatically.
- If your rerolls clear the consequence entirely, **ignore the buttons** — no action is needed.

Only click a button when you are done with all rerolls and the consequence still applies.

### Messy Critical buttons

| Button | What it does |
|---|---|
| **Roll d10 Consequence** | Rolls a d10 and looks up the result on the Messy Critical chart |
| **Choose to Fail (negate)** | You opt to fail the hunt instead; the consequence does not apply and your character does not feed |

### Bestial Failure buttons

| Button | What it does |
|---|---|
| **Roll d10 Consequence** | Rolls a d10 and looks up the result on the Bestial Failure chart |

Negate is not available for Bestial Failures.

### After you click

You will receive an **ephemeral (private) reply** showing your d10 result and the resulting consequence, or confirming the negate. The prompt buttons in the channel become inactive — the entry is consumed and cannot be used again.

---

## Consequence Charts

### Messy Critical (d10)

| Roll | Consequence |
|---|---|
| 1–2 | One of the character's flaws are triggered |
| 3–4 | The character breaches the masquerade and has to deal with a witness |
| 5–6 | The character loses one dot from an appropriate advantage |
| 7–8 | The character gains a random compulsion |
| 9–10 | The character kills their victim with no witnesses |

### Bestial Failure (d10)

| Roll | Consequence |
|---|---|
| 1–2 | The character breaches the masquerade and has to deal with a witness |
| 3–4 | One of the character's flaws are triggered |
| 5–6 | The character loses one dot from an appropriate advantage |
| 7–8 | The character suffers one or more points of Aggravated Health damage |
| 9–10 | The character's hunger increases by one |

**Note:** On a Bestial Failure, the character always gains an appropriate compulsion and always fails the hunt, regardless of the d10 result.

---

## Staff Guide

### What posts to #st-coordination-1

Every time a player resolves a consequence (by clicking a button), the bot posts a summary pinging `@system helper`:

```
@system helper — Hunt consequence needed

Character: [name]
Roll Type: Messy Critical / Bestial Failure
d10 Result: [number]
Consequence: [text]
Also: [bestial failure note, if applicable]
Resolved by: @[user]

Original Roll: [discord message link]
```

The link in the summary goes directly to the original roll message in the roll channel.

### What staff need to do

Review the consequence and apply it in-scene as appropriate. The bot handles detection and logging; adjudication of the consequence is up to staff.

---

## Edge Cases

**Bot restart — state lost**
The bot holds active prompts in memory. If the bot restarts after a prompt is posted but before a player clicks a button, that entry is gone. If a player clicks a button after a restart, they will receive a message telling them to ping staff directly to resolve the consequence manually.

**Consequence type flips via WP reroll**
If a Willpower reroll changes the consequence type (e.g. Messy Critical to Bestial Failure), the bot edits its existing prompt in the channel to show the correct wording and buttons. Players do not need to do anything — just wait for the prompt to update before clicking.

**Stale button after type flip**
If the consequence type changed but a player clicks the now-outdated "Choose to Fail" button (which only exists for Messy Criticals), they will receive a clear error message explaining that the consequence type has changed and they should use the updated prompt.
