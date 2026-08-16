# Manual Test Plan — Character Creation

End-to-end passes to run by hand on `https://dev.mcbn.jkomg.us`. Automated
coverage handles the wizard's internal logic and the server's XP maths; these
sets cover what it cannot: the Discord round trip, staff review, the roster
handoff, and how the whole thing feels to a player.

Setup, sign-in, and troubleshooting: [TESTING_CHARACTER_CREATION.md](TESTING_CHARACTER_CREATION.md).

**Before you start**, confirm what is deployed:

```bash
gh run list --workflow=deploy-web-dev.yml --limit 3
curl -s -o /dev/null -w '%{http_code}\n' https://dev.mcbn.jkomg.us/api/health
```

Dev redeploys on every CI-passing push on any branch. If behaviour changes
mid-session, someone pushed.

Each set is independent. Sets 1–3 are the core paths; 4–7 are where the recent
bugs lived and where new ones are most likely.

---

## Set 1 — New player onboarding

The path a genuinely new player takes. Use **View As** from the staff dashboard
to see it as a player would; staff see extra UI that hides these branches.

| # | Step | Expected |
|---|------|----------|
| 1.1 | Sign in as a player with **no** characters and no drafts | Lands on My Characters, not redirected to the link page |
| 1.2 | Look at the dashboard | Both **Create a Character** and **Link an Existing Character** are offered, with a line explaining which is which |
| 1.3 | Click **Create a Character** | Wizard opens at the **age category** step |
| 1.4 | Go back to My Characters, click **Create a new character** again | Starts a **fresh** wizard — not the draft you just began |
| 1.5 | As a player whose only characters are **retired** | Create/Link actions still visible, alongside "Show N retired/deceased" |
| 1.6 | Visit `/player/link` directly | Offers "create a new character instead" |

> 1.4 is the one to be pedantic about. The link carries `?new=1`; without it the
> creator resumes the last draft from localStorage and autosaves over it —
> including a draft already submitted for review.

---

## Set 2 — Neonate, full pass

The most common path. Budget is **15 XP**.

| # | Step | Expected |
|---|------|----------|
| 2.1 | Age category → **Neonate** | Ancilla is disabled unless you have a roster character 60+ days old |
| 2.2 | Clan → **Toreador** | Advances to attributes |
| 2.3 | Attributes, skills, predator type, basics | Each advances; nothing lets you continue under-allocated |
| 2.4 | Disciplines: 2 dots in one clan discipline, 1 in another | Level 2 powers unlock only after a level 1 in the *same* discipline |
| 2.5 | Look at the **Predator Type** section | Only levels you can actually take are shown. No greyed-out TAKE buttons for levels above your dots |
| 2.6 | Put your 2 clan dots into the **same** discipline your predator type grants | Level 3 opens up in the PT section |
| 2.7 | Touchstones | Advances |
| 2.8 | **Freebies** — try Continue with no flaws | **Blocked.** Message says you must take 2 flaw dots |
| 2.9 | Take 1 flaw dot | Still blocked |
| 2.10 | Take the 2nd dot | Continue enabled |
| 2.11 | **Starting XP** — spend 12 of 15 on loresheets | Sidebar and step both show **3 remaining** |
| 2.12 | Raise an attribute | Both figures drop by the same amount, and agree |
| 2.13 | **Hard-reload the page** | Spent still counts the raise. Budget does **not** reset |
| 2.14 | Continue | Advances to Review & Submit — the button does something |
| 2.15 | Submit for Review | Draft becomes `submitted`; appears under Pending Drafts |

> 2.13 is the budget-reset exploit. Before the fix, reloading let you spend the
> whole budget a second time.

---

## Set 3 — Staff review and approval

| # | Step | Expected |
|---|------|----------|
| 3.1 | As staff: **CC Admin → Drafts** | The submitted draft is listed |
| 3.2 | Open it | Shows **Creation XP budget / Spent / Banks into play** |
| 3.3 | Check the banked figure | Equals unspent budget, capped at **5** |
| 3.4 | If unspent exceeds 5 | A warning says the excess is forfeit |
| 3.5 | **Approve** | Roster character created |
| 3.6 | Open the roster character | Clan, age category, and sect are correct |
| 3.7 | Check its XP | `creation_xp` equals the banked figure from 3.3 |
| 3.8 | Approve a draft whose name matches an existing roster character | Links to it — no duplicate row, existing XP untouched |

---

## Set 4 — Revision cycle

| # | Step | Expected |
|---|------|----------|
| 4.1 | Staff: **Request revision** with a note | Draft becomes `revision_requested` |
| 4.2 | As the player, open My Characters | Draft shows "Revision Requested" with the staff note |
| 4.3 | Edit and resubmit | Back to `submitted` |
| 4.4 | Staff view | The original note is still visible (deliberate — it keeps ST context) |
| 4.5 | Approve | Roster character created as normal |

---

## Set 5 — In-Memoriam ancilla

The least-covered path. Automation stops at the neonate walk; this is all
manual. Budget is **era-derived**, not the flat 35.

| # | Step | Expected |
|---|------|----------|
| 5.1 | Ancilla → **In Memoriam** (not standard) | Generation and era steps appear |
| 5.2 | Pick eras | Era XP pool matches the sum of era values |
| 5.3 | **Era XP step** — spend part of the pool | Banked and **wasted** shown separately |
| 5.4 | Leave more than 5 unspent | Banked caps at 5; the rest is explicitly wasted |
| 5.5 | Continue to **Starting XP** | Budget equals the **banked** figure (≤5) — *not* the era pool |
| 5.6 | Spend 3 of a banked 5 | 2 remaining |
| 5.7 | Submit and approve | `creation_xp` = 2 |
| 5.8 | Repeat, spending the entire era pool | `creation_xp` = 0 |
| 5.9 | Flaw budget | Generation-derived: 12th gen owes 0, 11–10th owes 3, 9–8th owes 5, plus era bonuses |

> 5.5 is the ordering bug fixed most recently. If Starting XP offers the whole
> era pool (20, 60…) rather than the banked ≤5, the cap is being applied in the
> wrong place.

---

## Set 6 — Name and category normalisation

| # | Step | Expected |
|---|------|----------|
| 6.1 | Create a **Ministry** character, approve | Roster clan reads **The Ministry** |
| 6.2 | Filter the roster by clan | The character appears |
| 6.3 | Create a **Thin-blood**, approve | Roster clan reads **Thin-Blood** |
| 6.4 | Create a **Ghoul**, approve | Age category stays **Ghoul**, not Ancilla |
| 6.5 | Ghoul's XP | `creation_xp` = 0 |

> The creator and roster spelled these differently. Mis-normalised characters
> are invisible to clan filters and rejected by the bot's own roster endpoint.

---

## Set 7 — Robustness and tampering

The server no longer trusts the draft's budget. Edit `character_data` via
`PUT /api/cc/characters/<draft_id>` (see TESTING_CHARACTER_CREATION.md), then
approve.

| # | Tamper | Expected |
|---|--------|----------|
| 7.1 | `cc_xp_budget: 500` on a neonate | Banks at most 5 |
| 7.2 | `cc_xp_budget: 50` on a ghoul | Banks 0 |
| 7.3 | `inherited_xp: 20` | Ignored entirely |
| 7.4 | `clan: "Definitely Not A Clan"` | Roster clan stored blank, not the junk string |
| 7.5 | `age_category: "methuselah"` | Falls back to Neonate |
| 7.6 | Corrupt the JSON entirely | `/cc-admin/drafts` still lists every other draft; the player's own draft list returns that one with `character_data: null` rather than a 500 |
| 7.7 | A draft written before the current schema | Review screen warns "older character-creator format" and lists what it missed |

---

## Set 8 — Volume

Use `scripts/generate-test-data.py` (dev only; refuses to run against prod,
and fails closed on any host it cannot confirm is non-production). Everything
it creates is prefixed `ZZTest_`, and `--cleanup` removes exactly that.

Needs Python 3.10+ — macOS `python3` is 3.9 and fails at import:

```bash
# Dry run first; it makes no network calls and needs no credentials.
./apps/web/venv/bin/python scripts/generate-test-data.py \
  --mode db --characters 50 --claims 100 --spends 100

# Then for real, against dev.
DATABASE_URL=<dev libsql url> TURSO_AUTH_TOKEN=<dev token> \
./apps/web/venv/bin/python scripts/generate-test-data.py \
  --mode db --characters 50 --claims 100 --spends 100 --yes
```

`--mode api` exercises real server-side validation but is paced under the
20/min rate limit, so it is slow for volume; `--mode db` is the fast path.
`--cleanup` requires `--mode db`, because the roster delete endpoint refuses
characters that have claim or spend history.

| # | Step | Expected |
|---|------|----------|
| 8.1 | Generate ~50 characters with claims and spends | Completes without errors |
| 8.2 | Load the staff dashboard and roster | Still responsive; no timeouts |
| 8.3 | Load CC Admin → Drafts with many drafts | Lists without a 500 |
| 8.4 | Approve one generated character | Normal behaviour under load |
| 8.5 | `--cleanup` | Only `ZZTest_` records removed; nothing else touched |

---

## Recording results

Worth noting for anything that fails:

- Which set and step
- What you expected vs. what happened
- The commit deployed (`gh run list --workflow=deploy-web-dev.yml --limit 1`)
- Draft id, and character name if one was created
- Browser console errors — several past bugs were silent in the UI and visible
  only there
