Based on the audit data, here's a prioritized cleanup list organized by impact. Do the automated fix first since it's the safe foundation everything else builds on.                         
                                                                                                                                                                                               
  ---                                                                                                                                                                                          
  Step 1 — Run the automated fix (222 overwrites, zero risk)                                                                                                                                   
  python3 scripts/fix-discord-overwrites.py --apply                                                                                                                                            
  Gets you from 1698 → ~1476. Snapshot saves automatically.                                                                                                                                    
                                                                  
  ---                                                                                                                                                                                          
  Step 2 — Identify the two high-count members (frees ~252 overwrites)

  Run the audit script and look up the top two member IDs in Discord:
  - 557628352828014614 — 164 channels
  - 1472726596124278835 — 88 channels

  In Discord: Server Settings → Members → search by ID, or just paste the ID into any channel as <@557628352828014614> to resolve the name.

  These are almost certainly staff members or bots that got manually added to private channels one by one. If they already have a role (Storyteller, Moderator, System Helper) that grants
  access via the category, their individual member overwrites are completely redundant. Once confirmed:

  python3 scripts/fix-discord-overwrites.py --members --dry-run
  # review output, then:
  python3 scripts/fix-discord-overwrites.py --members --apply

  ---
  Step 3 — Fix the cubby categories (~400–500 overwrites saved)

  This is the biggest structural change. Each cubby channel has Storyteller, Moderator, System Helper, Administrator added individually because those roles aren't set at the category level.
  The fix:

  In Discord UI, for each of these four categories:
  - Neonate Character Cubbies
  - Ancilla Character Cubbies
  - Fledgeling Character Cubbies
  - Mortal Character Cubbies

  Edit the category permissions and explicitly allow these roles:
  - Storyteller
  - Moderator
  - System Helper
  - Administrator

  Once those are set at the category level, re-run the automated fix — it will now detect all the matching per-channel copies as redundant and remove them. This is why Step 1 + Step 3 work
  together.

  ---
  Step 4 — Retired characters (~280 overwrites)

  345 overwrites sitting in channels no one actively uses. Three options:

  - Delete dead channels — any retired character whose player is gone or who explicitly doesn't want the history preserved. Each deletion removes 5–9 overwrites instantly.
  - Archive to read-only — set the retired characters category to @everyone deny + Storyteller/Moderator allow, remove all individual channel overrides. Players lose write access but history
  is preserved.
  - Leave it — if the channels genuinely need per-player access for historical reference, the overhead is acceptable.

  ---
  Step 5 — Close old ticket channels (~71 overwrites)

  Character Tickets (44) + Character Tickets Two (27) = 71 overwrites in what are probably resolved or stale tickets. For each closed ticket channel: delete it, or move it to an archive
  category with simple permissions and run the automated fix again.

  ---
  After all steps, re-audit to confirm:
  python3 scripts/audit-discord-overwrites.py

  If Steps 1–4 all go well you should land well under 1000 and be able to use server templates again.
