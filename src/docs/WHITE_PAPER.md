# Cosmic Sloths — Official White Paper

**Version 1.0 · May 2026**
**Developed by SlowBurn Studios**
**Powered by the Omen Foundation ecosystem**

---

## 1. Executive Summary

Cosmic Sloths is a fast-paced, browser-native multiplayer roguelike where players pilot heroic sloths through a neon cosmos, slaying waves of enemies, conquering bosses, and competing on global leaderboards for real-money $OMENX rewards. Built on a Web3 backbone via the Omen Foundation, it bridges casual arcade combat with persistent on-chain identity, NFT-powered perks, and a self-sustaining player-driven economy.

The game's core loop — "fight, loot, upgrade, ascend" — is designed to be approachable in 60 seconds and deep enough to keep dedicated pilots invested for entire seasons. Cosmic Sloths is currently live, fully playable on desktop and mobile, and runs as a Progressive Web App with no install required.

**Key pillars:**

- **Skill-based competition** — Weekly and seasonal leaderboards with payout pools.
- **Squad warfare** — Persistent guilds, weekly head-to-head Squad Wars, shared treasuries, and global raids.
- **Web3-native identity** — Wallet-based authentication via Omen Foundation; no email signups required.
- **Earn-while-you-play** — $OMENX token rewards distributed weekly to top performers and squads.
- **NFT-powered perks** — Verified NFT holders unlock cosmetic and gameplay bonuses from partnered collections.
- **Mobile-first design** — Built for iOS/Android browsers with full touch and gamepad support.

---

## 2. Vision & Philosophy

The Web3 gaming space is saturated with two failed archetypes: shallow "play-to-earn" treadmills that collapse the moment the token incentive dries up, and AAA-budget MMOs that take five years to ship and rarely launch playable. Cosmic Sloths takes a third path:

> **A game that is genuinely fun without the token economy — and made better by it.**

We build the loop first. Combat has to feel good. Builds have to feel meaningful. The leaderboard has to feel earnable. Only then do we layer on the token rewards, NFT perks, and squad systems. If we removed every Web3 element tomorrow, Cosmic Sloths would still be a complete game. That is the bar.

### Design principles

1. **One-tap-to-play.** No wallet popups blocking the front door. New players can hit "Play" and be in a run in under five seconds.
2. **The leaderboard is the meta-game.** Every system feeds into score. Squads, NFTs, mastery, relics — they all matter because they help you climb.
3. **No pay-to-win.** $OMENX purchases buy convenience (cosmetics, XP boosts, gold sinks). They never sell raw power that gold or skill cannot match.
4. **Server-authoritative.** Score, currency, and progression are validated server-side. The client is treated as untrusted.
5. **Operator-first tooling.** Admin dashboards, kill switches, refund flows, leaderboard takeover alerts — built early, used daily.

---

## 3. Gameplay Overview

### 3.1 Core loop

A run is 5–25 minutes of top-down twin-stick arena combat. The player selects a **character** (each with unique mechanics, stats, and signature abilities), an **arena** (sector progression with escalating difficulty), and dives in.

During a run, the player:

- **Moves and auto-fires** weapons at the swarming enemy waves.
- **Vacuums up XP gems and gold** dropped by slain enemies.
- **Levels up**, choosing from rotating upgrade picks (weapons, passives, evolutions).
- **Fights mid-arena elites and an end-of-sector boss.**
- **Survives** environmental hazards, environmental modifiers, and dynamic difficulty.

When the run ends — by death, victory, or timer expiry — the player's score, kills, and accumulated gold are submitted to the server. Gold is added to a persistent meta-currency stash; score is published to the weekly leaderboard. Then they spend gold in the **Hub** on permanent stat upgrades, weapon mastery, talents, relics, cosmetics, and forge augments, and head back out for another run.

### 3.2 The "fight, loot, upgrade, ascend" cycle

| Phase | Player activity | Time horizon |
|---|---|---|
| **Fight** | A single run. Combat, leveling, build choices. | 5–25 min |
| **Loot** | Gold, fragments, mastery progress credited at run end. | 10 sec |
| **Upgrade** | Spend gold in the Hub: stats, talents, relics, mastery. | 1–5 min |
| **Ascend** | Climb weekly/seasonal leaderboards, unlock new characters, prestige relics, win Squad Wars. | Daily/weekly |

### 3.3 Characters

The roster is built around archetypes that play and feel different — not just stat reskins. Examples:

- **NeoByte** — Banner-based commander. Plants a buff banner that boosts squad damage and cooldown speed in a radius.
- **Glitch** — Phase-shift dodger. Periodically becomes invulnerable mid-hit, with a corruption augment that hacks enemies.
- **NeonVortex** — Execute specialist. Vaporises low-HP enemies and emits splash projectiles from kills.
- **SynthBeats** — Gold-fueled trickster. Spends gold to dodge incoming damage; rewards aggressive looters.
- **Holodrift** — Mobility ace. Built-in speed bonus, emergency revive augment.
- **DataPhantom** — Stealth burst. Brief phase-boosted speed windows on damage.
- **Codebreaker** — XP-focused. Higher gem yields scale faster builds.
- **Skybyte** — Sonic specialist. Charges a shockwave that releases a screen-cleansing boom (or, at tier-7 mastery, a "HYPER BOOM" double-damage variant).

Characters are unlocked through play — by hitting kill milestones server-side, then permanently saved to the player's roster.

### 3.4 Weapons, synergies, and evolutions

Weapons auto-fire on individual cooldowns. Picks from level-ups grow them in level (more damage, more projectiles, larger AoE) and unlock **synergies** when paired with specific passives. A fully-mastered synergy plus its evolution prerequisite gives access to **evolved weapons** — usually 2–4× more powerful than their base form and visually distinct.

The **Synergy Codex** in the hub lists every known recipe so players can plan builds before a run.

### 3.5 Arenas, sectors, and modes

- **Sectors** — Linear, story-progression arenas. Each clears unlocks the next, with rising enemy density and stronger bosses.
- **Endless** — No timer, no win condition. Time-based gold accrual; difficulty ramps continuously. The ultimate score-chase mode.
- **Leviathan Trials** — Modifier-stacked challenge runs. Each modifier amps risk and reward.
- **Global Raid** — Server-wide cooperative boss. Every player chips at a shared HP pool; rewards scale with damage contribution and milestone tiers.
- **Squad Meteor** — A 1.5-minute DPS-check arena unlocked through squad play. Squad members vote on a shared meteor target; their cumulative damage funds squad-wide weekly buffs.
- **World Boss Arena** — Special raid encounter with weekly resets.

### 3.6 Dynamic difficulty

The engine watches every run in real time. A "DD controller" measures kills-per-window and damage-taken-per-window, then nudges spawn rate and enemy speed up or down. Strong players see fuller fields and faster enemies; struggling players see breathing room.

Tuning notes (Season 6):
- DD evaluates every 5s in the opening minute, every 15s after — strong openers ramp into difficulty quickly.
- The floor is 0.85× (struggling players still see a populated field).
- The ceiling is 3.5× spawn rate and 2.5× enemy speed (top players have headroom).
- Mid-tier ramp-up assist: while DD is still below 1.0×, the kill thresholds to climb are halved, so improving players escape the basement faster.

---

## 4. Progression Systems

### 4.1 Currencies

| Currency | Source | Spend |
|---|---|---|
| **Gold** | Run rewards, time trickle in endless | Hub upgrades, talent trees, prestige, mystery forge, mastery, ability respec |
| **Star Fragments** | Forged from gold (capped daily) | Weapon augments, character passives |
| **Relic Fragments** | Boss drops, milestone rewards, raid contribution | Crafting and prestiging relics |
| **$OMENX** | Real on-chain token, earned via weekly/seasonal payouts | Premium cosmetics, convenience SKUs (revives, XP boosters), gifting |

### 4.2 Permanent stat tree

A flat stat-bonus tree (health, speed, damage, magnet, regen, cooldown, luck). Three tiers exist in parallel: permanent (lifetime), weekly (resets every Monday UTC), seasonal (resets every 4 weeks). Whales with all three maxed do see stacking — but Season 6 introduces a 0.66× scaling factor on stacked weekly+seasonal contributions to keep the top-end gap from widening uncontrollably.

### 4.3 Character mastery (kills-per-character)

Each character earns mastery tiers as you kill enemies with them. Tier 1–5 grants single-stat bumps. Tier 6 grants a multi-stat package flavoured around the character's archetype. Tier 7 unlocks an **ability boost** — fundamentally upgrading the character's signature mechanic (e.g. NeoByte's banner buff goes from +30% to +45%, Skybyte's Sonic Boom can supercharge into HYPER BOOM).

### 4.4 Talents

Character-specific talent trees with three timeframes (permanent, weekly, seasonal). Players spend gold to slot talents — pure stat sticks, but combined with mastery and relics they define a character's build identity.

### 4.5 Relics

Equippable artifacts (max 3 slots) that grant passive bonuses — gold magnetism, XP drives, blood chalices (lifesteal), damage cores, lucky dice. Crafted with **relic fragments**, leveled 1→5 with gold and additional fragments.

**Prestige Relics (Season 6+):** Once a relic hits L5, it can be **prestiged** up to PL5. Each tier costs scaling gold (500K → 2.5M) plus 100 fragments and adds +5% to the relic's effect, applied multiplicatively. This is the late-game gold sink that gives whales something to chase without breaking the mid-game economy.

### 4.6 Mystery Forge (Astral Lab) — Season 6+

A gold-only RNG pull system that grants permanent stat buffs. Folds directly into the player's stat multipliers but respects all existing caps — so whales hitting damage/cooldown ceilings naturally see diminishing returns.

### 4.7 Cosmetic systems

- **Skins** — Per-character recolors. Some unlock via achievements, some via seasonal events, some purchased with $OMENX.
- **Pilot icons** — Emoji-based avatar that appears next to your name on leaderboards.
- **Titles** — Flair shown after your pilot name. Some titles grant tiny stat buffs (e.g. +1% HP, +1% damage), creating a "title meta" for min-maxers.
- **Trails** — Visual particle trails that follow your character.
- **Kill effects** — Custom death VFX on enemies you kill.
- **Music tracks** — Unlocked jukebox playlist that overrides the default BGM.

---

## 5. Squads & Social Systems

A solo run is fun. A coordinated squad run is the heart of the game's long-term retention.

### 5.1 Squads

Player-created guilds (8–50 members depending on level). Each has a name, tag, emoji icon, privacy setting (open, request-to-join, closed), level, XP, member-shared treasury, weekly kill counter, daily goals, war record, and roster with leader/officer/member roles.

### 5.2 Daily and weekly squad goals

Squad leaders can set custom daily goals ("hit 1500 kills today", "everyone clear sector 4"). Members see them on the global goal banner. Hitting goals awards XP bonuses to the whole squad.

### 5.3 Squad Wars

Every Monday, squads are paired head-to-head for a week-long Squad War. The squad with more kills at the end of the week wins, earning lifetime War record stats, war streak, and an OMENX bonus for participating members. A per-member kill breakdown shows who carried.

### 5.4 Squad Treasury (Season 6+)

Members donate gold into a shared squad treasury. The squad can spend the treasury to activate weekly buff tiers (bronze/silver/gold/platinum) that boost every member's runs across every arena — damage, AoE, gold, CDR. Donations are tracked lifetime for "biggest contributor" flair.

### 5.5 Squad Meteor

A 3-minute DPS-check arena unique to squad play. Squad members pick a meteor target, hammer it together (cumulative damage tracked server-side), and unlock squad-wide gameplay buffs that apply to *every* squad member's runs across *every* arena. It is intentionally a sink for coordinated play, not an individual challenge.

### 5.6 Squad Champions (seasonal)

The top 3 squads by lifetime War wins each season earn the largest squad payouts. Lifetime stats are public for bragging rights.

### 5.7 Cross-pilot communication

Squad chat is built-in with moderator tools (mute, message delete, admin overrides). Optional Discord webhook integrations notify squads of payouts and War results.

---

## 6. Competitive Loop

### 6.1 Leaderboards

- **Weekly score leaderboard** — Resets every Monday UTC. Submission scoring is server-recomputed from validated run stats, with arena multipliers and difficulty modifiers folded in.
- **Weekly sector-kills leaderboard** — A separate kill-volume ladder.
- **Seasonal leaderboard** — Aggregated across the four-week season.
- **Endless arena** — Its own leaderboard tracked separately so endless grinders don't crowd out sector competition.
- **Global Raid** — Tracks damage contribution per player and per squad.

### 6.2 Score validation

Score is **never** trusted from the client. The server recomputes score from a small set of validated stats (time, kills, level, gold pre-cap, character, arena, difficulty), with sanity caps on every dimension. Suspicious submissions are flagged for admin review. Banned wallets are blacklisted entity-wide.

### 6.3 Payouts

A percentage of the leaderboard payout pool is paid out weekly to the top 30 players. Squad Champions pay out at season end. All payouts go through the Omen Foundation rewards API and are logged immutably in PayoutLog and SquadChampionsPayoutLog entities.

---

## 7. Economy

### 7.1 Sources

- Enemy drops (gold + XP)
- Pickup tiers (bronze/silver/gold pickup variants)
- Run completion bonuses
- Endless arena: time-based gold trickle
- Daily login bonuses
- Daily tasks
- Bounty completions
- Boss reward claims
- Global Raid milestone rewards
- Achievement payouts
- Seasonal skin claims (some are gold-priced)

### 7.2 Sinks

- Permanent stat upgrades (scaling exponentially)
- Weekly stat upgrades (resets weekly)
- Seasonal stat upgrades (resets every 4 weeks)
- Weapon mastery
- Character talents (three timeframes)
- Relic crafting and leveling
- Relic Prestige (S6+) — major late-game gold sink
- Forge augments and character passives
- Ability respec
- Pool bias / loadout customization
- Mystery Forge / Astral Lab pulls (S6+)
- Cosmetics

### 7.3 The diminishing-returns lever

Whales with permanent + weekly + seasonal stat upgrades all maxed could previously stack into runs that produced 1.4M-gold submissions, blowing out the leaderboard. Season 6's economy patches introduce a 0.66× scaling factor on stacked weekly+seasonal contributions, plus hard multiplier caps on the most-stacked stats (damage, area, XP, gold, cooldown floor), bringing the top-end ceiling back into a healthy ratio with mid-tier play without nerfing solo period upgrades.

### 7.4 $OMENX token

$OMENX is the Omen Foundation's native utility token. In Cosmic Sloths it functions as:

- The currency for premium SKU purchases (cosmetics, XP boosters, in-run revives, gifting).
- The medium for leaderboard payouts (paid out via the Omen Foundation rewards API).
- A balance-aware in-game asset (real-time wallet balance displayed in the HUD).

All $OMENX-spending surfaces are guarded by a server-side kill switch — when settlement is down, admins flip it off and the game continues without crediting failed purchases.

---

## 8. Web3 Architecture

### 8.1 Identity

Players authenticate via the **Omen Foundation OAuth flow**. Their connected wallet address is the canonical identity for all rewards, leaderboard placement, and squad membership. No email signups required.

The frontend supports two parallel auth contexts: Base44 for app-account state (analytics, user roles), and Omen for wallet-tied identity and rewards. Both are reconciled by `Base44AuthLinker` on every session.

### 8.2 NFT integration

Cosmic Sloths reads NFT inventory from the Omen API and grants perks based on owned NFTs:

- **Character-matched gold and relic-fragment multipliers** — Owning a character's NFT grants a 5–25% gold multiplier (rarity-tiered).
- **Cross-collection legacy bonuses** — Holders of Omen Foundation core collections get baseline boosts.
- **No stacking** — Multiple NFTs of the same character don't multiply; the highest rarity wins. Prevents whale floor manipulation.

NFT data is fetched server-side via a load-balanced rotation of API keys to handle traffic without hitting Omen rate limits.

### 8.3 Server-authoritative writes

Every reward-relevant write goes through a Base44 backend function that authenticates via the Omen wallet, validates the action, applies sanity caps, and writes via service-role to the relevant entity. Examples:

- `saveScore` — Validates, computes server-side score, writes RunScore + PlayerSave.
- `purchaseSku` — Charges $OMENX via the Omen API, grants the SKU.
- `spendGold` — Validates affordability, deducts gold, logs to GoldSpendLog.
- `prestigeRelic`, `craftRelic`, `forgeAction` — All validated.
- `claimBounty`, `claimDailyTask`, `claimSeasonalSkin` — Idempotent claim flow.
- `distributeRewards`, `distributeSquadChampions`, `topupWeeklyPayout` — Admin-only.

Save merge / cloud sync is handled by a dedicated `syncSave` function that uses a shared secret to prevent client-side tampering of server-owned fields.

### 8.4 Maintenance and version gates

A maintenance kill switch lets admins flip the game into SOFT (warning banner) or HARD (block /game) mode. A separate forced-update gate lets admins set a minimum client version — old clients see a blocking "Update Required" modal until they reload. Both poll every 60s with shared module-level caching to keep Base44 rate limits under control.

---

## 9. Technical Stack

### Frontend
- **React 18** with Vite + Tailwind CSS
- **shadcn/ui** for primitives
- **Framer Motion** for UI animation
- **HTML5 Canvas** for game rendering (no WebGL dependency for combat — keeps mobile compatibility broad)
- **Three.js + Pixi.js** for ambient and effect layers
- **React Query** for cached data fetching and optimistic mutations
- **react-router-dom** for client-side routing
- **@hello-pangea/dnd** for any drag-and-drop UI

### Backend (Base44 platform)
- Deno-deployed serverless functions
- Base44 entity database (JSON-schema-backed)
- Service-role and per-user-role SDKs for fine-grained access control
- Built-in OAuth + role + RLS support
- Scheduled automations (cron) for payouts, war pairing, cleanup
- Connector automations (Google Drive / Sheets / Discord) where useful

### External integrations
- **Omen Foundation API** — auth, balance, NFT inventory, settlement
- **Discord webhooks** — leaderboard posts, alerts, squad war results, economy events
- **Stripe** — wired but not currently used for player-facing flows

### Observability
- Discord error and economy webhooks for real-time incident routing
- Admin health-check function for quick triage
- GoldSpendLog, PayoutLog, AdminChangesLog, DataBackup entities for audit trails
- Daily automated backups via scheduled job

### Mobile compatibility
- Auto-pause on tab backgrounding with debounced verification (no Safari URL-bar flicker false-positives)
- Touch joystick + gamepad input
- Cache-busting reload for forced updates so in-app webviews (Discord, Twitter, Telegram) pick up new builds
- Built for iOS Safari / Chrome Android as primary targets

---

## 10. Roadmap

### Shipped (Season 1–6)

- Full character roster (Ten playable pilots with unique mechanics)
- Sector progression + endless mode + Leviathan Trials + Global Raid
- Squad system with Wars, Treasury, Daily Goals, Meteor, Champions
- Mastery, talents, relics, forge augments, prestige relics
- Mystery Forge / Astral Lab (S6+)
- Weekly + seasonal leaderboards with $OMENX payouts
- NFT-powered perks and gold multipliers
- Cosmetic ecosystem (skins, trails, kill effects, titles, jukebox)
- Mobile-first reload + forced-update gate
- Comprehensive admin tooling (refunds, NFT refresh, gold audits, blacklists, mute, score validation)


## 11. Team

**SlowBurn Studios** — A small, independent studio focused on shipping web-native games that respect player time and reward player skill. We ship constantly, talk to our players daily, and patch within hours when something breaks.

We work in close partnership with the **Omen Foundation**, whose ecosystem provides identity, NFT, and payment rails for Cosmic Sloths and the broader OmenX gaming initiative.

---

## 12. Closing

Cosmic Sloths is built on the conviction that Web3 gaming can be more than a token chase. It can be a place where a casual mobile player and a top-100 leaderboard pilot share the same canvas, where squads form lasting friendships, where a cosmetic skin means something because of the run that earned it, and where the economy rewards skill, persistence, and community equally.

We're just getting started. Strap in, pilot.

---

*This document describes the live state of Cosmic Sloths as of May 2026 (Season 6). Game systems are subject to balance changes and feature additions; patch notes are posted in-game and via Discord.*

*Cosmic Sloths is a product of SlowBurn Studios. $OMENX is a utility token of the Omen Foundation. Not financial advice. NFT and token holdings are subject to market risk.*