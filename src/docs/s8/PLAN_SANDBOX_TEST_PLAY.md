# Sandbox / Test Play Mode — Design Doc

**Status:** Under active consideration for **S8 launch** (~1 week out).
**Source:** Player suggestion from Jasper70 in Discord, 2026-06-26 —
originally framed as OMEN-public-launch polish; **repositioned 2026-07-01**
as a returning-player retention hook for S8.
**Priority:** Elevated — pairs with the S8 revive+fragments monetisation
sinks (see `PLAN_REVIVE_AND_FRAGMENTS.md` §"S8 launch coordination") to
address the audit's -51% active-player collapse. Serves double duty:
**retention lever for lapsed players now**, **onboarding lever for OMEN
public launch later** — same build, two audiences.

---

## The ask (verbatim summary)

Jasper70 proposed a **Sandbox / Test Play mode** so new players joining via the OMEN Foundation can experiment with builds and mob types without affecting their leaderboard standings.

Key points from the original message:

1. As OMEN onboards more players, there'll be an influx of users unfamiliar with how the game's builds and items interact.
2. A sandbox would give them a low-stakes space to mess with setups before committing to a "real" run.
3. Suggested features: **spawn arbitrary mobs on demand**, **apply arbitrary builds / item types**.
4. **Explicitly excluded from OMENX reward pools** — no points, no LB entries, no gold, no weekly kill credit.
5. Net effect: better-prepared players push the LB higher, which raises the ceiling for the competitive scene.
6. Framed as quality-of-life for the OMEN public launch — "more professional game setup, doubles down on the quality of the program."

---

## Why this is a good fit for us

- **Onboarding gap is real.** Right now a new player learns build interactions by losing real runs. That's fine for hardcore audiences but punishing for the broader OMEN crowd Jasper is anticipating.
- **No economy risk.** Because sandbox runs are server-rejected for scoring/rewards, there's zero leaderboard manipulation or token-pool exposure.
- **Reuses existing systems.** Game engine, weapon system, enemy spawner, upgrade system — all already exist. Sandbox is mostly a *gating layer* + a small dev-tools UI, not a new game.
- **Marketing surface.** "Sandbox mode" is a tangible bullet point for the OMEN launch announcement.

---

## Scope (what sandbox mode actually is)

A run launched from a dedicated Sandbox entry point, with these properties:

### Player-facing capabilities

1. **Pick any character** — including locked ones (sandbox bypasses unlock requirements).
2. **Pick any arena** — including locked sectors / endless / Leviathan Trials modifiers.
3. **Pick any difficulty** — easy through cosmic.
4. **Starting kit** — start at level 1 OR pick a starting level (e.g. "drop me at level 30 with these picks").
5. **In-run dev panel** (toggleable HUD button, sandbox only):
   - **Spawn enemy:** dropdown of every enemy type → spawn N at cursor.
   - **Grant weapon:** dropdown of every weapon → add to inventory at any level.
   - **Grant passive item:** dropdown of every passive → add to inventory at any level.
   - **Force level-up:** instant level + offer choices.
   - **Toggle invincibility.**
   - **Toggle infinite ability cooldowns.**
   - **Set XP/Gold multiplier.**
   - **Clear all enemies on screen.**
   - **Fast-forward time** (1× / 2× / 4×).
6. **Free exit** — pause menu → "End Sandbox" returns to menu instantly, no death screen.

### Server / reward isolation (the critical guardrails)

This is the part that protects the economy:

1. **Run flagged `is_sandbox = true` at engine init.**
2. **`saveScore` checks the flag and returns `{ ok: false, reason: 'sandbox' }` immediately** — no RunScore row, no PlayerSave mutation, no weekly_sector_kills increment, no DailyActivityLog write, no SquadWarMemberKill write, no RunHistoryLog write, no GlobalBoss damage, no SquadMeteor damage.
3. **`checkpointRun` mid-run** — also no-op for sandbox runs.
4. **No gold earned** persists. No XP toward NFT perks. No achievement unlocks. No daily/weekly bounty progress.
5. **Cosmetics still render** (player wants to see how their drip looks) but no cosmetic state mutates.
6. **NFT perks and forge upgrades still APPLY** in-engine — sandbox should reflect the player's real character power so testing is realistic. Just nothing writes back.

---

## UX / entry point

**Where it lives:** new "Sandbox" tile on the Hub page (slide 1 of the carousel), or a dedicated carousel slide between Hub and Daily's. Sits visually separate from Play / Endless / Sectors so it's never confused for a real run.

**Pre-run setup screen:**

```
┌─ Sandbox Setup ─────────────────────────────┐
│  [Character] [Arena] [Difficulty] [Lv start]│
│  [Starting kit: empty / random / custom]    │
│                                              │
│  ⚠ Sandbox runs award no rewards, no LB,    │
│    no kill credit. For practice only.       │
│                                              │
│  [Launch Sandbox]                            │
└──────────────────────────────────────────────┘
```

**In-run banner:** persistent thin yellow strip at the top — `SANDBOX MODE — No rewards · No leaderboard`. Non-dismissible. Makes screenshots / streams self-explanatory and stops anyone claiming they "didn't realise".

**Dev panel UI:** collapsible sidebar (mobile: bottom sheet) with the controls listed above. Hidden by default behind a small wrench icon so the playfield stays clean.

---

## Technical sketch (not for build — reference only)

### Data model

No new entity needed. Sandbox state is purely in-engine — never persisted.

Game engine init reads a `mode` param:
- `mode: 'normal'` (default — existing behaviour)
- `mode: 'sandbox'` (new)

### Server guards

Single source of truth — every server-side run-mutating function checks the flag and early-returns:

```js
// saveScore.js (sketch — not actual code)
if (payload.is_sandbox === true) {
  return { ok: false, reason: 'sandbox', sandbox: true };
}
```

Same one-liner in: `saveScore`, `checkpointRun`, `submitBossDamage`, `submitSquadMeteorDamage`, `claimBounty` (bounty progress).

**Defensive position:** `is_sandbox` is set by the client, but the server treats it as a *one-way reject* — a client can lie and *not* set it to spawn a real run, but they can't lie and set it to *cheat rewards*. So the worst-case attack is just "a player plays a normal run" → no exploit.

### Game engine touchpoints

- `EnemySpawner` gains a `manualSpawn(typeId, x, y, count)` API used only by the dev panel.
- `WeaponSystem.grantWeapon(weaponId, level)` — already exists internally for level-ups, expose to the dev panel.
- `UpgradeSystem.grantPassive(passiveId, level)` — same.
- `LevelUpModal.forceTrigger()` — new entry path that doesn't require XP threshold.
- Player invincibility / cooldown flags — toggle bits on the player state object.

All of these are dev-panel-only and gated by an `if (engine.mode === 'sandbox')` check.

### UI surface

- New page `pages/Sandbox.jsx` — setup screen.
- New component `components/game/SandboxDevPanel.jsx` — in-run sidebar.
- Hub or carousel entry point.
- Banner: extend `UIOverlay` with a sandbox stripe.

---

## What's explicitly OUT of scope

To stop this growing into a months-long feature:

- ❌ **No multiplayer sandbox.** Solo only — co-op sandbox is a separate, much larger project.
- ❌ **No saving sandbox setups as templates.** v1 is "configure → launch → quit". If players love it, template saving is a v2.
- ❌ **No replay recording.** Out of scope.
- ❌ **No sharing sandbox runs.** Out of scope.
- ❌ **No sandbox-only achievements.** The whole point is "no progression."
- ❌ **No sandbox tutorial mode.** Sandbox is for *experimentation*, not for guided onboarding. (A guided tutorial is a separate idea — possibly worth doing alongside, but tracked separately.)

---

## Risks / open questions

1. **NFT perk exposure for non-holders.** If sandbox lets anyone test any character including locked/NFT-gated ones, do we let them feel NFT-only perks? **Lean yes** — it's a *test drive* that may convert players to buying the NFT. But flag for product call before build.
2. **Custom title / cosmetic preview.** Sandbox is also a great preview-your-drip mode. Decide whether to let players equip cosmetics they don't own for sandbox runs only. **Lean yes** — same conversion logic. Locks back to owned-only when they exit.
3. **Server load.** Sandbox runs do hit the engine but write nothing to the DB, so cost is purely client-side compute. No backend scaling concern.
4. **Streamer abuse vector.** Sandbox runs could be screenshotted and passed off as real scores. Mitigation: the persistent yellow banner is rendered into every frame of the canvas, so any screenshot/recording of a sandbox run shows it.
5. **Player confusion: "why didn't my sandbox score appear on the LB?"** Mitigation: banner + setup-screen warning + end-of-sandbox toast ("Sandbox ended — no rewards saved, as expected."). Three touchpoints should be enough.

---

## Suggested phasing (when it's prioritised)

| Phase | Scope | Effort estimate |
|---|---|---|
| 1 | Server guards on all run-mutating functions + `is_sandbox` flag plumbing | 0.5 day |
| 2 | Sandbox setup page + Hub entry tile | 1 day |
| 3 | In-run yellow banner + free-exit button | 0.5 day |
| 4 | Dev panel core (spawn enemy, grant weapon, grant passive, force level-up) | 2 days |
| 5 | Dev panel extras (invincibility, cooldowns, multipliers, fast-forward, clear screen) | 1 day |
| 6 | Polish / mobile dev-panel layout / QA | 1 day |

**Rough total: ~1 week of focused dev work.** Could ship as a single update aligned with the OMEN public launch, not a multi-stage rollout.

---

## Decision

**Repositioned for S8 launch consideration (2026-07-01).** Original
"park until OMEN public launch" call is superseded by the S8 retention
need — active players fell 63 → 31 over the last 5 weeks and the S8
patch as currently drafted is monetisation-heavy (revive escalation +
fragment express lane) with no *give* to lapsed players. Sandbox flips
the launch narrative from "we're charging more" to "try anything, then
chase the leaderboard."

**Open question for product:** ~5 days of dev during S8 crunch is real
budget. If sandbox slots in alongside revive+fragments for the S8
launch patch, something else on the S8 roadmap gives up its slot.
Product to confirm the trade before build kicks off.

**If it doesn't make S8:** original OMEN-public-launch window still
applies. The doc stands as-is either way.