# VIP Chest — Game Items Design Doc

**Status:** Dev portal UI live & inspected (2026-06-25). Webhook handler is next implementation step.
**Owner:** Cosmic Sloths dev team
**Date:** 2026-06-19 · **Last update:** 2026-06-25
**Context:** OmenX is launching **VIP Chests** (Bronze → Elite, 7 tiers) as an OmenX **platform** reward. Chests roll from a pool of categories:

1. Asset Manager Packs
2. Faucet Manager Packs
3. OMENX Tokens
4. VIP Points
5. **Game Items** ← *this doc*

This doc covers ONLY the Game Items slot — what Cosmic Sloth contributes when a chest rolls a game-item reward.

---

## 🆕 2026-06-25 — Dev portal UI is LIVE

Confirmed by inspecting the OmenX dev portal "VIP Chests" page directly (screenshot captured). Several things from the 06-19 spec are now nailed down with concrete UI evidence.

### Confirmed from the dev portal screen

1. **Three-tab structure per game.** Each integrated game has tabs for:
   - **Reward rows** — our weighted loot table per chest tier (this is where the bronze→elite tables go).
   - **Reward webhook** — currently flagged "Setup required" for Cosmic Sloths. This is the blocker.
   - **Revenue** — display-only dashboard of our chest revenue. **Payouts flow OmenX → dev wallet directly, NOT through our app/backend.** Confirmed 2026-06-25. So nothing for us to build here — no accounting entity, no reconciliation function, no payout webhook. The tab is purely informational on the OmenX side.

2. **Game selector dropdown.** Cosmic Sloths is listed as an option — the platform-side game registration is already done.

3. **Webhook contract — exact details from the UI:**
   - Event type: `vip_chest.reward_granted` *(matches 06-19 spec ✓)*
   - Signing header: `X-OmenX-Webhook-Signature: sha256=…` *(confirmed exact format)*
   - Verification: **HMAC SHA-256** over `timestamp header + raw body` *(confirmed)*
   - Signing secret format: `whsec_…` (64 hex chars). One-click "Regenerate secret" available.
   - **Webhook must be saved AND enabled BEFORE we can add reward rows.** This means our backend handler has to ship first — we can't even populate the loot table until the webhook is verified live.

4. **Ordering constraint we missed.** The UI text reads:
   > "You must save a URL and enable the webhook before adding reward rows."
   
   So the dependency order for shipping is:
   1. Build `onVipChestRewardGranted` handler.
   2. Deploy it to production at a stable URL.
   3. Paste the URL, save, enable, copy signing secret into `OMENX_VIP_CHEST_WEBHOOK_SECRET`.
   4. Only then submit the reward rows for all 7 chest tiers.

   This is the opposite of what I'd assumed (I had reward rows as parallel work). It's actually a hard sequence.

### Webhook URL planning

The portal expects an HTTPS endpoint. **We're already on our custom domain**, so the webhook URL should point at the custom domain directly — NOT the `*.base44.app` fallback. That way, if we ever migrate the backend off Base44 entirely down the road, we can repoint the same domain at the new host and the webhook URL stays valid (no need to update OmenX dev portal config, no risk of rotating the signing secret).

Format will be:
```
https://<custom-domain>/functions/onVipChestRewardGranted
```
(Need to grab the exact custom domain from `api/base44Client.js` baseUrl before pasting into the portal.)

### Q&A status (06-25 PM update)

→ **All 12 questions have been answered by Marco.** Full Q&A captured in [`VIP_CHEST_QUESTIONS_FOR_OMENX.md`](./VIP_CHEST_QUESTIONS_FOR_OMENX.md). Build-impact summary:

- **Webhook handler must never return 5xx.** OmenX does not retry — we own retries internally. New architecture: handler verifies signature → persists raw event to a new `VipChestWebhookEvent` entity (idempotent on `tx_id`) → returns 200 immediately. A scheduled automation drains the queue and applies grants with our own retry/backoff.
- **Payload is an ARRAY of granted items**, not a single reward. One Elite chest can grant currency + NFT + cosmetic together — handler must iterate.
- **Test tool not yet available.** Marco is building a "send test event" button in the dev portal. We can scaffold the handler against assumed field names and finalise parsing once it ships. ⏳ **Only real blocker** for going live with reward rows.
- **No platform throttling** on concurrent webhooks. The persist-then-process pattern above handles this for free.
- **Cosmetic/title moderation is our problem.** Sunset cosmetic seasons + in-game admin custom-title queue, confirmed.
- **Blacklist policy:** OmenX credits the item regardless. We persist the grant but the drain step at login enforces the block (grant stays in queue / gets moved to audit table).

### 🆕 Edge case — wallet has never played Cosmic Sloths

**The scenario:** an OmenX user buys/opens a chest, the roll lands on our Game Items slot, and the wallet has never logged into Cosmic Sloths. There's no PlayerSave row for them. What does the webhook handler do?

This isn't hypothetical — Cosmic Sloths is one of multiple games on the platform. Plenty of chest buyers will be users from other titles who never tried ours. Every chest tier that includes our slot will hit this case eventually.

**Three sub-cases to handle:**

1. **Wallet has never touched Cosmic Sloths (no PlayerSave row).**
   - Option A — *Reject the grant.* Returns a non-200 to OmenX, which presumably re-rolls or refunds. Cleanest but wastes the player's chest slot through no fault of theirs.
   - Option B — *Create an empty PlayerSave with the grant baked in.* Player logs in for the first time and finds 10k gold / fragments / cosmetic already on the account. Strong onboarding hook — chest doubles as a "come try the game" funnel.
   - Option C — *Pending-grant queue.* Webhook logs the grant in a `PendingChestGrant` entity keyed by wallet, returns 200. First time the wallet logs in (or links a wallet), we drain the queue into their PlayerSave. Safer than B because no half-baked PlayerSave rows pile up if the player never visits.

   **Recommendation: Option C.** Reasons:
   - Idempotent + survives schema changes (the grant is data, not a partial save).
   - No risk of polluting PlayerSave queries (active player counts, leaderboard reads) with ghost rows.
   - Drain happens in a place we already control (the `linkWalletToUser` / first-load flow).
   - Marketing angle: we can show a "🎁 You have N unclaimed chest rewards waiting" badge on first login, which is a fantastic first-run experience.

2. **Wallet exists but the player hasn't logged in for weeks.**
   - Grant just lands on the existing PlayerSave. They see it next time they open the app — same flow as any other server-side update (existing `loadSave` already returns the latest state). Nothing special to build.

3. **Wallet is blacklisted (`BlacklistedWallet` entity).**
   - Webhook handler checks blacklist before granting. Logs the rejected grant to `VipChestGrantLog` with a `rejected_reason: 'blacklisted'` field for audit, returns 200 (we don't want OmenX to retry).
   - Policy question on this is tracked in the Open Questions master list below (Q14).

**New entity needed: `PendingChestGrant`**

```
{
  wallet_address: string (lowercase),  // not unique — multiple grants can stack
  reward_key: string,                   // e.g. 'gold_10k', 'cosmetic_animated_orbiting_moon'
  chest_key: string,                    // e.g. 'bronze', 'platinum'
  tx_id: string (unique),               // OmenX transaction id — idempotency key
  granted_at: ISO datetime,
  applied: boolean (default false),     // flipped true when drained into PlayerSave
  applied_at: ISO datetime,             // when drain happened
}
```

**Drain trigger points (in order of preference):**
1. **`linkWalletToUser`** — fires when an OmenX-authenticated user first lands in our app. Natural spot to check `PendingChestGrant.filter({ wallet_address, applied: false })` and apply.
2. **`loadSave`** — defensive backstop. Cheap query (indexed wallet lookup), happens on every save load.
3. **Admin tool** — one-button "drain pending chest grants for wallet X" for support cases.

**Idempotency rule:** the same `tx_id` must not grant twice, even if the webhook fires multiple times AND the wallet is drained mid-retry. Strict unique-index on `tx_id`, drain only applies rows where `applied=false`, flip-and-grant in a single update.

**Estimated extra dev:** 0.5 day on top of the base webhook handler. One entity, ~30 lines in the webhook handler, ~10 lines on the drain path in `linkWalletToUser`/`loadSave`.

---

### Implementation status

- [x] Spec'd reward rows per tier (weighted format) — see below
- [x] Identified webhook contract (HMAC SHA-256, header format, event type)
- [x] Confirmed dev portal flow + ordering constraint
- [x] Marco answered all 12 open questions (2026-06-25)
- [ ] **NEXT:** Build `onVipChestRewardGranted` backend function
  - Signature: HMAC SHA-256 verification → 401 on failure
  - Iterate items array, persist each to `VipChestWebhookEvent` (idempotent on per-item tx_id), return 200 immediately
  - **Must never return 5xx** — OmenX doesn't retry, we own retries
- [ ] Create `VipChestWebhookEvent` entity (raw event store, per-item tx_id unique)
- [ ] Create `PendingChestGrant` entity (player-facing grant queue, drained on login)
- [ ] Create scheduled automation: drain `VipChestWebhookEvent` → apply grant → write to `PendingChestGrant` if wallet not yet linked, else apply directly to PlayerSave
- [ ] Add `OMENX_VIP_CHEST_WEBHOOK_SECRET` to secrets (only when ready to paste URL into portal)
- [ ] Wire drain step into `linkWalletToUser` + defensive backstop in `loadSave`
- [ ] Register reward SKUs in dev portal (mostly non-purchasable / non-tradable)
- [ ] Wait for Marco's test-webhook tool → finalise payload field names
- [ ] Submit reward rows once webhook is verified live

---

## 🆕 2026-06-19 PM — Update from Marco (Discord)

Marco shared concrete details on the OmenX-side architecture. **This changes how we ship.**

### Key facts confirmed

1. **Battle Pass is on the roadmap, but NOT shipping alongside chests.** Confirmed internally 2026-06-25 — BP is "a way off yet," won't be needed at the same time as chests. Chest launch can proceed standalone; BP integration is a separate workstream later.
   - VIP Chest purchases (OMENX + GMT) ← **launch scope**
   - Battle Pass progression rewards ← **deferred, separate doc when it gets closer**

2. **Developer portal is the source of truth.** OmenX added two new pages to the dev portal:
   - **VIP Chests** — manage our game-item reward rows per chest tier
   - **Battle Pass** — manage rewards on each BP tier
   Marco's screenshot shows the bronze chest already has 7 platform reward rows (weight sum 100) and an empty `Your game rewards (weight sum: 0)` row — that's our slot to fill.

3. **Weighted loot table model.** Each game item I add is a row with a **weight**. Higher weight = more frequent roll. Bronze chest example weights:
   ```
   Common Pack + 500 OMENX     weight 1   (rarest)
   Common Pack + 1000 VIP Pts  weight 4
   Common Pack                 weight 5
   500 OMENX                   weight 10
   2000 VIP Points             weight 20
   300 OMENX                   weight 25
   200 OMENX                   weight 35  (most common)
   ```
   Our 12-item shortlist needs to be expressed as weighted rows per chest tier. The framework is already designed for this — no custom drop logic needed on our side.

4. **Webhook-driven grants.** When a chest rolls one of our game items:
   - OmenX backend calls a webhook on OUR backend
   - Signed with **HMAC SHA-256** (header: `X-OmenX-Webhook-Signature: sha256=…`, timestamp header + raw body)
   - Signing secret provided in dev portal (one-click regenerate)
   - We verify the signature, grant the item to the player's PlayerSave, return 200
   - Event type: `vip_chest.reward_granted`
   - We pick the webhook URL (e.g. `https://cosmic-sloth-app.base44.app/functions/onVipChestRewardGranted`)

5. **Confirmed chest pricing** (Bronze → Elite):

   | Chest | GMT | OMENX |
   |---|---|---|
   | Bronze | 15 | 0 |
   | Silver | 30 | 100 |
   | Gold | 70 | 200 |
   | Platinum | 150 | 300 |
   | Diamond | 300 | 500 |
   | Legend | 500 | 1000 |
   | Elite | 750 | 1500 |

   This gives us hard data on EV — a Bronze chest at 15 GMT (~$0.50?) and an Elite chest at 750 GMT + 1500 OMENX is a real money sink. Our game-item rewards must scale to feel proportional.

### What this means for the doc

- **My "Per-Chest-Tier Game-Item Pools" table needs to be reformatted as weight rows** so it's drop-in compatible with the dev portal.
- **No need to build a chest-rolling backend on our side** — OmenX handles the RNG.
- **We do need to build a webhook handler.** New Base44 function: `onVipChestRewardGranted`.
- ~~**Battle Pass requires the same webhook.**~~ Deferred — BP isn't part of chest launch.
- **Cosmetics overhaul scope is unchanged** — still the biggest delta.

### Updated implementation surface

#### Backend (new)
- **`onVipChestRewardGranted`** — public webhook function
  - Verifies HMAC SHA-256 using the OmenX signing secret (stored as `OMENX_VIP_CHEST_WEBHOOK_SECRET`)
  - Parses payload: `{ wallet, reward_key, chest_key, tx_id }`
  - Looks up reward grant by `reward_key` → applies to PlayerSave
  - Logs to a new `VipChestGrantLog` entity for audit + dedup (idempotent by `tx_id`)
  - Returns 200 even on duplicate, 4xx only on signature failure / unknown reward_key
- New secret: `OMENX_VIP_CHEST_WEBHOOK_SECRET`
- New entity: `VipChestGrantLog` (wallet, reward_key, chest_key, tx_id unique, amount/metadata, granted_at)

#### Backend (already covered)
- `spendGold` plumbing handles grants — no change needed
- Cosmetic ownership fields on PlayerSave — same as before

#### Frontend
- **No new pages needed for chest opening** — chest opening happens on OmenX, not in our app
- Profile page wardrobe (for equipping cosmetics) — still needed
- VIP Chest reward history page (optional) — show what you've been granted from OmenX

### Reward weights — bronze tier example (our slot)

To match the OmenX format, our weight rows for Bronze chest's Game Items slot:

| Label | Key | Weight |
|---|---|---|
| 10,000 Gold | `gold_10k` | 35 |
| 25,000 Gold | `gold_25k` | 25 |
| 10 Relic Fragments | `relic_10` | 20 |
| Talent Respec Token | `respec_talent` | 15 |
| 1 Star Fragment | `star_1` | 5 |

Weight sum 100. Mirrors the OmenX platform reward distribution shape.

(Per-tier weight tables for all 7 tiers are below in the original shortlist section — needs to be converted to this row format before submitting to Marco.)

### Updated open questions

→ Consolidated into the **[📋 Open Questions — Master List](#-open-questions--master-list)** section below.

### Action items

- [ ] Reply to Marco confirming we're ready to integrate (open questions consolidated in master list below)
- [ ] Build `onVipChestRewardGranted` webhook function + signature verification
- [ ] Create `VipChestGrantLog` entity for audit / idempotency
- [ ] Convert the per-tier game-item shortlist below into weighted rows per chest tier
- [ ] Submit reward rows for all 7 chest tiers in the OmenX dev portal
- ~~Battle Pass scoping~~ — deferred until BP launch gets closer (06-25)

---

---

## Design Principles

1. **Game items are the "fun bonus" tier.** Real value lives in the on-chain rolls (Asset/Faucet/OMENX). Game items must feel exciting on the open, not be a primary driver of chest EV.
2. **No item bypasses the leaderboard.** All stat-affecting items are capped. No silent score multipliers, no per-run damage buffs that show on the LB. (We killed silent buffs at S6 for a reason.)
3. **Cosmetics must be spectacular.** The cosmetics we ship today (basic emoji icons, plain titles, jukebox tracks) are forgettable. Chest cosmetics must be **animated, exclusive, and visibly different** — something a player would screenshot.
4. **Reuse existing systems.** Every item below already plugs into Forge / Meteor / Squads / Loadouts / Cosmetics. No new game subsystems required.
5. **Inventory model.** Game items grant directly to PlayerSave (gold, fragments, tokens, cosmetic unlocks) — no NFT-bound game items at this stage. The chest itself is the NFT.

---

## The Shortlist — 12 Items

Tight, shippable, and covers every chest tier.

### 💰 Currency Drops (4 items — Common → Rare)

| # | Item | Rarity | Effect |
|---|---|---|---|
| 1 | **Gold Cache** | Common | 10k / 25k / 50k / 100k gold (tier-scaled) |
| 2 | **Relic Fragment Cache** | Common | 10 / 25 / 50 / 100 fragments (tier-scaled) |
| 3 | **Star Fragment Cache** | Uncommon | 1 / 3 / 5 / 10 star fragments (tier-scaled) |
| 4 | **Squad Treasury Voucher** | Uncommon | Auto-donates 50k gold to the player's squad treasury (player still gets the donation credit) |

These are the safe baseline. Every chest tier has a chance at one of these — guarantees a non-empty game-item roll.

### 🎯 Convenience Tokens (3 items — Uncommon → Rare)

| # | Item | Rarity | Effect |
|---|---|---|---|
| 5 | **Talent Respec Token** | Uncommon | One free full talent respec |
| 6 | **Pool Bias Respec Token** | Uncommon | One free Pool Bias respec (skips the escalating gold cost) |
| 7 | **Mystery Forge Reroll** | Rare | Reroll one Mystery Forge augment for free |

Already-existing actions, just gifted. Zero new code beyond inventory grants.

### ⚡ Power Tokens (3 items — Rare → Legendary, all capped)

| # | Item | Rarity | Effect | Cap |
|---|---|---|---|---|
| 8 | **Bonus Meteor Attack** | Rare | +1 Squad Meteor attack on top of the daily 3 | Max 2 banked at a time |
| 9 | **Loadout Slot Unlock** | Epic | Permanent +1 saved loadout slot | Hard cap at 10 total slots |
| 10 | **Permanent Stat Pip** | Legendary | +1% to one stat (player picks: Gold / Damage / AoE / CDR / XP) | **Hard cap 10 pips total across all stats**, lifetime |

Item #10 is the only "permanent power" item. Capped tightly at 10 pips (max +10% to any single stat, max +10% spread across stats) so chest stacking can't break balance. Leaderboards stay fair because the cap is identical for every player who buys chests.

### 💎 Cosmetics (2 items — Epic → Mythic)

| # | Item | Rarity | Effect |
|---|---|---|---|
| 11 | **VIP Cosmetic Drop** | Epic | One chest-exclusive cosmetic (rotating pool — see **Cosmetics Overhaul** below) |
| 12 | **VIP Mythic Cosmetic Drop** | Mythic | One Mythic-tier cosmetic — only available in Legend / Elite chests |

---

## Per-Chest-Tier Game-Item Pools

When a chest rolls "Game Items," the chest tier dictates the pool. Higher tiers can roll lower-tier items, but with smaller weight.

| Chest | Pool | Weight on Cosmetic Roll |
|---|---|---|
| 🥉 **Bronze** | Items 1, 2, 5 | 0% Mythic, 0% Epic cosmetic |
| 🥈 **Silver** | + 3, 4, 6 | 0% Mythic, 5% Epic cosmetic |
| 🥇 **Gold** | + 7, 8 | 0% Mythic, 15% Epic cosmetic |
| 💎 **Platinum** | + 9 | 0% Mythic, 30% Epic cosmetic |
| 💠 **Diamond** | + 11 (Epic cosmetic) | 5% Mythic, 45% Epic cosmetic |
| 🟣 **Legend** | + 10 (Stat Pip) | 15% Mythic, 60% Epic cosmetic |
| 👑 **Elite** | + 12 (Mythic cosmetic) | 35% Mythic, 65% Epic cosmetic |

---

## 🌟 Cosmetics Overhaul — REQUIRED

> **The current cosmetics are meh.** Plain emoji icons, static titles, jukebox tracks. None of it screenshots well. None of it makes another player go "wait, where did you get THAT."
>
> Chest cosmetics need to fix this — or chests will feel like a flop on the cosmetic roll.

### What "Spectacular" means

Every chest cosmetic must hit at least one of:

- **Animated** (not a static emoji)
- **Visible in-game during a run** (not just on the menu)
- **Visibly chest-exclusive** (other players can tell at a glance)
- **One-of-a-kind per season** (Mythic tier only)

### New Cosmetic Categories to Build

#### 1. Animated Pilot Icons ⭐ (Epic)
- Looping animated sprites (8–16 frame loops) instead of static emoji
- Examples: a slowly rotating black hole, a flickering hologram skull, a pulsing star, a blinking robot eye
- Shown next to player name on **leaderboard, squad chat, squad page, in-run HUD, end-of-run modal**
- **Implementation:** add `pilot_icon_animated_url` field on PlayerSave.profile — render as `<img>` when present, fall back to emoji

#### 2. Leaderboard Banner Frames ⭐⭐ (Epic / Mythic)
- An animated frame that wraps the player's row on the weekly leaderboard
- Examples: golden flame border, electric arc border, swirling nebula border, glitch border
- **Visible on the leaderboard to everyone** — pure flex
- **Implementation:** add `lb_frame_id` field on PlayerSave.profile; LeaderboardPage maps id → CSS class

#### 3. Title Flair / Title Gradients ⭐ (Epic)
- Player titles get **animated gradient text**, **glow effects**, or **particle trails** on hover
- Today's titles are flat white text. Chest titles are alive.
- Examples: rainbow shimmer, blue-flame outline, gold leaf, glitched RGB split
- **Implementation:** add `title_style_id` field; map to a CSS class in title rendering

#### 4. Weapon Trails / Projectile Skins ⭐⭐ (Mythic)
- Cosmetic-only visual upgrade to the player's projectiles in-game
- Examples: gold projectile trails, neon-pink lasers, void-purple blasts, fire trails
- **Visible during gameplay** — every other player who watches a Discord clip sees it
- **Implementation:** add `weapon_trail_id` on PlayerSave; ProjectileRenderer picks color/particle based on id
- **No damage impact** — purely visual

#### 5. Death FX / Kill Effect Skins ⭐⭐ (Mythic)
- When you kill an enemy, the death effect changes
- Examples: gold coin burst, neon shatter, void implosion, fireworks
- **Visible in-game on every kill** — high screenshot value
- **Implementation:** add `kill_fx_id` on PlayerSave; ParticleManager branches on id

#### 6. Squad Meteor Strike FX ⭐⭐ (Mythic)
- Your meteor attacks render with a custom strike effect for the whole squad to see in the activity feed
- Examples: gold lightning, void rift, supernova flash
- **Implementation:** stored on SquadMeteorAttack record; rendered on the activity feed line

#### 7. Custom Title ⭐⭐⭐ (Mythic, Elite-only)
- Player types their own title, mod-approved (anti-slur filter + manual review)
- Already-existing moderation pipeline (we have admin tools for chat moderation)
- **Implementation:** new `custom_title_pending` field + admin approval UI

---

## Cosmetic Inventory Plan

Every Epic / Mythic cosmetic drop pulls from a **per-season pool**. New cosmetics ship each season — old chest cosmetics become "vintage" and unobtainable, increasing the value of older chest contents.

**Rough Season-1-of-chests pool (20 cosmetics):**

| Cosmetic | Category | Tier | Notes |
|---|---|---|---|
| Animated icon: Orbiting Moon | Pilot Icon | Epic | |
| Animated icon: Glitch Skull | Pilot Icon | Epic | |
| Animated icon: Pulsing Heart | Pilot Icon | Epic | |
| Animated icon: Rotating Blackhole | Pilot Icon | Epic | |
| Animated icon: Cosmic Egg | Pilot Icon | Epic | |
| LB Frame: Gold Flame | Banner Frame | Epic | |
| LB Frame: Electric Arc | Banner Frame | Epic | |
| LB Frame: Nebula Swirl | Banner Frame | Epic | |
| Title Flair: Rainbow Shimmer | Title Style | Epic | |
| Title Flair: Blue Flame | Title Style | Epic | |
| Title Flair: Gold Leaf | Title Style | Epic | |
| Weapon Trail: Gold | Projectile FX | Mythic | |
| Weapon Trail: Void | Projectile FX | Mythic | |
| Weapon Trail: Neon Pink | Projectile FX | Mythic | |
| Kill FX: Coin Burst | Death FX | Mythic | |
| Kill FX: Neon Shatter | Death FX | Mythic | |
| Kill FX: Fireworks | Death FX | Mythic | |
| Meteor Strike: Gold Lightning | Meteor FX | Mythic | |
| Meteor Strike: Supernova | Meteor FX | Mythic | |
| LB Frame: Glitch RGB | Banner Frame | Mythic | Elite-only |

20 cosmetics is enough for launch. Players opening 5–10 chests will collect 2–3 cosmetics, leaving plenty of chase items.

---

## Anti-Duplicate Logic

When a chest rolls a cosmetic the player already owns:

- **Silver / Gold / Platinum chests:** convert to a Star Fragment cache (3-5 fragments) so the slot isn't wasted
- **Diamond / Legend / Elite chests:** force-roll an unowned cosmetic from the player's chest tier pool. If the player owns ALL cosmetics from their tier's pool, fall back to Star Fragment cache (15 fragments) + a small consolation gold drop (100k)

This prevents whales from feeling robbed after their 5th duplicate.

---

## Implementation Surface (rough scope)

### Backend
- 1× new function: `claimVipChest({ chestId })` — verifies NFT ownership, rolls reward pool, grants game items
- 1× automation listener: maintains `vip_chest_cosmetics_owned` field on PlayerSave
- Reuses: `spendGold` plumbing for grants, existing cosmetic plumbing

### Save Schema additions on PlayerSave.save_data
```js
{
  // existing fields...
  vipChestStatPips: {
    gold: 0,      // max 10 total across all keys
    damage: 0,
    aoe: 0,
    cdr: 0,
    xp: 0,
  },
  loadoutSlotBonus: 0,        // additional slots above the default
  bonusMeteorAttacks: 0,      // banked, max 2
  ownedAnimatedIcons: [],     // ids
  ownedLBFrames: [],          // ids
  ownedTitleStyles: [],       // ids
  ownedWeaponTrails: [],      // ids
  ownedKillFX: [],            // ids
  ownedMeteorFX: [],          // ids
  equippedCosmetics: {
    pilotIconAnimated: null,
    lbFrame: null,
    titleStyle: null,
    weaponTrail: null,
    killFX: null,
    meteorFX: null,
  },
}
```

### Frontend
- 1× new page: **VIP Chest Inventory** (`/vip-chests`) — list owned-but-unopened chests, open animation, reveal modal
- 1× **Cosmetic Wardrobe** section on Profile page — equip/preview the owned animated icons, frames, trails, FX
- Render updates in: LeaderboardPage (frame), ProjectileRenderer (trail), ParticleManager (kill FX), squad meteor activity feed (meteor FX)

### Where stat pips plug in
- Game engine reads `save.vipChestStatPips.gold` → adds to gold multiplier
- `save.vipChestStatPips.damage` → small flat damage bonus on the multiplier stack
- `save.vipChestStatPips.cdr` → small flat CDR bonus
- All applied at the same layer as relic / NFT perks, capped before sector caps trigger

---

## 📋 Open Questions — RESOLVED

All 12 questions answered by Marco on 2026-06-25. Full Q&A archived in [`VIP_CHEST_QUESTIONS_FOR_OMENX.md`](./VIP_CHEST_QUESTIONS_FOR_OMENX.md).

**Remaining blocker:** waiting on Marco's "send test event" tool in the dev portal so we can lock in the exact payload field names. We can scaffold against assumed names in the meantime.

---

## Summary

**12 game items, 5 cosmetic categories, 1 cap (stat pips × 10).** Reuses existing systems. Cosmetics overhaul is the biggest delta — we'd be building animated icons, leaderboard frames, title flair, weapon trails, death FX, and meteor strike FX as net-new visual systems. **Without the cosmetic overhaul, the chest game-item slot will feel flat. With it, chests become a flex piece.**

Estimated dev time:
- Game item plumbing + inventory: **3–5 days**
- Cosmetics overhaul (5 new categories, 20 launch cosmetics): **2–3 weeks**
- VIP Chest Inventory page + reveal animation: **3–5 days**

Total: **~4 weeks** for a polished launch.