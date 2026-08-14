# Testing Character Creation on Dev

How to exercise the character-creation pipeline end to end on
`https://dev.mcbn.jkomg.us`, and what to look at when something is wrong.

Dev runs the same code as prod against a **separate Turso database** and
separate Discord OAuth app. Nothing you do here touches production data.

> **Dev is shared.** Every CI-passing push on *any* branch redeploys it. If you
> are mid-test and the page changes under you, someone pushed. Check
> `gh run list --workflow=deploy-web-dev.yml --limit 3`.

## Getting in

1. Go to `https://dev.mcbn.jkomg.us` and sign in with Discord. Dev uses its own
   OAuth app (`mcbn-dev-discord-client-id`), so you will be asked to authorize
   separately from prod.
2. Staff access is controlled by `ALLOWED_DISCORD_IDS` / `SETTINGS_ADMIN_DISCORD_IDS`
   in Secret Manager — the same values as prod, so if you are staff in prod you
   are staff in dev.
3. To test as a *player* without a second Discord account, use **View As** from
   the staff dashboard. Staff see extra UI on the player pages otherwise (the
   full character search), which hides the empty-state paths new players hit.

## The happy path

Entry point: **My Characters → Create a new character** (`/player/new`). If you
have no characters and no drafts, the landing page shows *Create a Character* /
*Link an Existing Character* side by side.

1. **Age category** — the first step. Budgets come from
   `packages/rules/cc_xp.json`: Ghoul/Mortal/Fledgling 0, Neonate 15, Ancilla 35.
   Ancilla is gated on having a roster character at least 60 days old
   (`/api/cc/eligibility`), so a fresh test account can only pick the others.
2. Work through clan → attributes → skills → predator type → basics →
   disciplines → touchstones → merits.
3. **Starting XP step** (neonate/ancilla only) — spend on attributes, skills,
   and loresheets. Watch the sidebar and the step agree on Remaining.
4. **Review & Submit** — the finish line is *Submit for Review*, not a PDF
   download. The draft goes to `submitted`.
5. As staff: **CC Admin → Drafts** (`/cc-admin/drafts`), open the draft, check
   the **Budget / Spent / Banks into play** row, then **Approve**.
6. Confirm the roster character exists with the right clan, age category, sect,
   and `creation_xp` equal to the banked figure.

## What to try to break

These are the behaviors most recently changed. Each has an expected result.

| Test | Expected |
|---|---|
| Neonate spends 10 of 15, submit, approve | roster `creation_xp` = 5 |
| Neonate spends nothing, submit, approve | `creation_xp` = 5 (capped, not 15) |
| Neonate spends all 15 | `creation_xp` = 0 |
| Ghoul / Mortal / Fledgling, any path | `creation_xp` = 0 |
| In-Memoriam ancilla who spends all era XP | `creation_xp` = 0, not 5 |
| **Raise an attribute on the XP step, then hard-reload** | Spent still counts it. Previously reset to 0 and the budget could be spent twice. |
| Raise an attribute, compare sidebar vs step "Remaining" | Same number in both places |
| Create a Ministry character | roster clan reads **The Ministry**, appears in clan filters |
| Create a Thin-blood character | roster clan reads **Thin-Blood** |
| Create a ghoul | roster age category stays **Ghoul**, not Ancilla |
| Request revision, then resubmit | status returns to `submitted`, staff notes still visible |
| Approve a draft whose name matches an existing roster character | links to it, no duplicate row, existing XP untouched |

### Tampering checks

The server no longer trusts the draft's own budget. To confirm, edit
`character_data` directly (staff sheet editor at `/roster/<name>/sheet`, or the
API) and approve:

- Set `cc_xp_budget: 500` on a neonate → still banks at most 5.
- Set `cc_xp_budget: 50` on a ghoul → banks 0.
- Set `inherited_xp: 20` → ignored entirely.

### Robustness

- Save a draft with deliberately corrupt `character_data` → `/cc-admin/drafts`
  should still list every other draft, and `/api/cc/characters` should return
  that draft with `character_data: null` rather than 500.
- Open a draft written before the current schema → the review screen shows an
  "older character-creator format" warning listing what it missed.

## When something looks wrong

- **Container won't start after a deploy** — usually a migration, not the app.
  `entrypoint.sh` runs `flask db upgrade` under `set -e` before gunicorn, so a
  branch missing a migration the dev DB is already stamped at cannot boot. Fix
  is `git fetch && git rebase origin/main && git push --force-with-lease`, not a
  retry. See CONTRIBUTING.md.
- **Cloud Run logs**: filter the `mcbn-xp-tracker-dev` service in the GCP
  console, or `gcloud run services logs read mcbn-xp-tracker-dev --region us-central1`.
- **Health check**: `curl -s -o /dev/null -w '%{http_code}' https://dev.mcbn.jkomg.us/api/health`
- **Which commit is live**: the dev deploy workflow tags the image with the
  commit SHA; `gh run list --workflow=deploy-web-dev.yml --limit 3` shows what
  last shipped.
- **Secret changes don't apply until redeploy** — Cloud Run pins `secret:latest`
  at deploy time. Run `apps/web/deploy.sh dev` to trigger one.

## Running the same checks locally

Faster than waiting on a deploy, and the same code:

```bash
./scripts/bootstrap-local.sh web-only     # http://127.0.0.1:5001
cd apps/web && ./venv/bin/pytest -q       # 500+ tests
cd apps/character-app && npm run test:run # creator unit tests
```

The creator's dev server proxies `/api` to Flask on 5001, so
`cd apps/character-app && npm run dev` gives you hot reload against a local web
app — much faster than a dev deploy for wizard UI work.
