import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const GAME_DESCRIPTION = `# 🦥 COSMIC SLOTHS

> *The laziest roguelike with the realest payouts. Squad up. Slay. Stack OMENX.*

---

## 🎮 DROP IN, SURVIVE, EARN

Blast through **10 hand-crafted sectors** filled with cosmic chaos. Move with WASD or your joystick. Your weapons? They auto-fire at whatever's closest. Survive the timer. Climb the leaderboards. **Earn real Web3 currency** based on your performance.

### ⚡ The Core Loop
1. **Move & Fight** — WASD/Arrows or Virtual Joystick. Auto-firing weapons handle the rest.
2. **Level Up** — Defeat enemies for XP. Pick 1 of 3 random upgrades (Common → Legendary).
3. **Unlock Sectors** — Beat runs to unlock new arenas with unique enemies and environments.
4. **Face Bosses** — Epic encounters drop Relic Fragments and massive gold bonuses.
5. **Earn Real Rewards** — Top leaderboard performers get OMENX sent to their wallet every week.

---

## 🛠️ FORGE YOUR POWER IN THE SLOTH LOUNGE

Between runs, visit your cosmic base and spend **Gold** and **OMENX** to get stronger:

| Feature | What You Get |
|---------|-------------|
| **👤 Characters** | Unlock sloths via **kill milestones OR NFT ownership**. Own an NFT? Instant unlock + per-run bonuses (+5-15% Gold & Fragments based on rarity). |
| **⬆️ Stat Upgrades** | 3 tiers: Permanent / Weekly / Seasonal—stronger each cycle |
| **🔫 Armory** | Master weapons across 3 thematic upgrades tailored per-weapon (e.g. Shield Bubble's *Barrier Strength / Bubble Size / Recharge Rate*) to unlock ultimate forms |
| **💎 Ancient Relics** | Equip for global buffs. Upgrade with Relic Fragments. |
| **✨ Cosmetics** | Trails, kill effects, character skins—flex your style |
| **🔨 The Forge** | Convert Gold → Star Fragments to permanently enhance weapons |

### 🔥 Advanced Synergies
Discover **Weapon Synergies**: combine two specific weapons mid-run to unlock game-changing power combos. Track them all in your **Synergy Codex**.

---

## 🏆 COMPETE FOR OMENX

Three leaderboards. Real crypto rewards.

### 📅 **Weekly Leaderboard**
- Resets every Monday 00:00 UTC
- **20% of the weekly OMENX spend pool** is paid out to the **top 45 players** — higher rank = bigger share
- #1 = 10% · #2 = 8% · #3 = 6% · #4–10 = 4% each · #11–20 = 3% each · #21–30 = 1.8% each · #31–45 = 1.2% each
- Max **10,000 OMENX** per player per period
- Weekly stat upgrades also reset

### 🗓️ **Seasonal Leaderboard**
- 4-week cycles
- **30% of the seasonal OMENX spend pool** is paid out to the **top 45 players** — higher rank = bigger share
- An additional **10%** is reserved for the Squad Wars Champions pool
- #1 = 10% · #2 = 7.5% · #3 = 6% · #4–10 = 3.2% each · #11–20 = 2.2% each · #21–30 = 1.5% each · #31–40 = 0.9% each · #41–45 = 0.7% each
- Max **10,000 OMENX** per player per period
- Seasonal stat upgrades reset at season end

### ♾️ **Endless Void**
- Infinitely scaling difficulty with boss fights every 3 minutes
- Season-scoped leaderboard (resets each season alongside Weekly/Seasonal)
- **Excluded from OMENX payouts** — but earns its own per-minute score bonus, so long endless runs stay competitive with sector victories at the very top
- **S6: all caps removed** — every Gold and kill is credited in full, no per-run ceiling

### 📊 **How Scores Work (Season 6)**
S6 rebuilt the formula from scratch — **skill beats grind**. Gold and raw playtime no longer pad your score; sector progression and boss-killing are the headline:

> **Score = (Kills × 120) + (Level² × 100) + (SectorIndex × 8,000) + Victory Bonus + Endless Bonus**

- **⚔️ Kills × 120** — every enemy defeated
- **📈 Level² × 100** — quadratic, so late levels matter massively more
- **🌌 SectorIndex × 8,000** — flat bonus per sector reached (Sector 1 = 0, Sector 2 = 8k, ... Sector 10 = 72k)
- **🏆 Victory Bonus = SectorIndex × 15,000** — clearing Sector 10 = +135k bonus
- **♾️ Endless Bonus = Minutes × 10,000** — endless runs get per-minute scaling so they stay competitive with sector victories

**Gold no longer affects score** — stacking gold multipliers helps you survive, not pad your leaderboard. **Difficulty no longer multiplies score directly** either; harder difficulties just grant more XP & Gold (Hard +100%, Cosmic +200%), feeding kills/level naturally. Only your **highest score per period** counts. A clean Sector 10 victory lands ~430k. Long, skilled endless (25+ min with high kills/level) can reach 600k–1M. Top-of-board target: **~900k–1M**.

---

## 👥 SLOTH SQUADS — RAID TOGETHER

Create or join a crew of up to **5 players**. Every kill you make—in any run—counts toward your squad's weekly total.

### 📈 **Squad Levels** (7 tiers)
🦥 **Recruits** → ⭐ **Drifters** → 🔥 **Hunters** → ⚡ **Vanguards** → 💀 **Reapers** → 👑 **Legends** → 🌌 **Cosmic Elite**

**Level up?** Unlock harder bounties with bigger rewards.

### 🛡️ **Daily & Weekly Bounties**
Both reset on schedule. Hit the kill targets and **every member** individually claims:
- ☀️ **Daily** — 150 → 4,000 Gold + up to 3 Fragments (scales by squad level)
- 📅 **Weekly** — 500 → 15,000 Gold + up to 10 Fragments (scales by squad level)

### ⚔️ **Squad Wars** (head-to-head every week)
Every Monday, your squad is auto-paired against a similar-level rival. Whoever scores more kills by Sunday 23:59 UTC wins. No opponent? Bye week (auto-win). Per-member rewards: **Win** 2,500 Gold + 3 Fragments | **Tie** 1,000 Gold + 1 Fragment | **Loss** 500 Gold (consolation).

### 👑 **Squad Champions Pool**
A dedicated **OMENX prize pool** is reserved for the top 3 squads of each season. Split 50% / 30% / 20% between 1st / 2nd / 3rd, then divided equally among all squad members. Eligibility: ≥2 wars fought + ≥2 active members.

### 💬 **Squad Chat**
Real-time messaging to coordinate with your team.

---

## 🌍 DIFFICULTY & MODIFIERS

### 🎯 **Dynamic Difficulty**
Replay any unlocked sector freely — enemy spawns and speed adapt to your performance. Crushing it? Spawns ramp up. Struggling? The game eases off. **No gold penalties** for playing earlier sectors.

### 🌟 **Difficulty Modes**
Difficulty changes enemy strength + how much XP and Gold you earn per run (which feeds the score formula).
- **Easy** — −50% XP & Gold
- **Normal** — Baseline
- **Hard** — +100% XP & Gold
- **Cosmic** — +200% XP & Gold

### ⚔️ **Leviathan Trials / Cosmic Mutations**
Stack any of 6 boss modifiers before a run — each makes the fight harder *and* boosts the rewards:
- 🔴 **Leviathan's Fury** — bosses +50% damage → +500 boss Gold
- 🛡️ **Thick Hide** — bosses +100% HP → +50% boss XP
- 💨 **Frenzy** — bosses +50% speed → +1 Relic Fragment per boss kill
- ⚡ **Bullet Hell** — bosses fire 2× projectiles → +30% total score
- 💚 **Cellular Regeneration** — boss heals 1% HP/sec → +800 boss Gold
- ⚓ **Unstoppable Force** — boss ignores slow & pushback → +1,000 boss Gold

---

## 🎁 DAILY GRIND & MISSION REWARDS

### 📅 **Daily Login Streak**
7-day escalating rewards. Miss a day? Streak resets to Day 1.

### 🎯 **Daily Bounties**
3 random challenges every day → **Gold** or **Relic Fragments**

### ⚔️ **Daily Mission**
One harder challenge → **Seasonal Points** (collect 100 for exclusive seasonal skins)

### 👥 **Squad Daily & Weekly Bounties**
Hit your squad's shared daily and weekly kill targets → every member individually claims **Gold + Relic Fragments** (scales with squad level, up to 15,000 Gold + 10 Fragments at Lv.7).

---

## 💀 GLOBAL RAID BOSS

**Community-wide cooperative event.** A massive World Boss with **shared HP across all players**. Deal damage in up to **5 Raid Runs per day** (or buy +5 more for 10 OMENX) — your damage is permanent.

### 🔥 **Infinite Scaling**
- Boss reaches 0 HP? → Respawns at **next level**
- Each level? → Boss gains **+50% max HP**
- Your rewards? → **Scale with boss level** (250 Gold × Level claimable per milestone)

### 📡 **Live Activity Feed**
A rotating banner at the top of the Raid page surfaces real-time damage milestones and boss kills from players around the world. The **Top Contributors** tab ranks the highest-damage pilots this week.

---

## ✨ IN-RUN PICKUPS

| Icon | Item | Effect |
|------|------|--------|
| 💎 | **XP Gems** | Dropped by every enemy. Level up to pick upgrades. |
| 🪙 | **Gold Coins** | Random drops. Spend in the Lounge. |
| 🧩 | **Relic Fragments** | Boss drops. Craft & upgrade Relics. |
| ☢️ | **Nuke** | Destroys all non-boss enemies instantly. |
| 🧲 | **Magnet Surge** | Pulls all nearby XP & Gold to you. |
| 🛡️ | **Shield Overcharge** | 10 seconds of full invincibility. |

---

## 👑 VIP STATUS

Purchase **VIP Tiers** with real money. Your subscription pays you back in OMENX each week.

### ⚡ **VIP Bonuses**
Each tier = **+1% Damage** & **+1% Max HP** per run. Bonuses **stack** with all your upgrades.

**14 Tiers Available:** Bronze 1–2 → Silver 1–3 → Gold 1–2 → Platinum 1–3 → Diamond 1–4

*(VIP is automatically detected from your OmenX wallet — no setup required.)*

---

## 💎 NFT INTEGRATION

### 🔓 **Character Unlocks**
- **Own the NFT?** → Instantly unlock the character + earn rarity-based per-run bonuses
- **No NFT?** → Reach cumulative kill milestones (2k, 5k, 10k, 20k kills) for permanent unlocks
- **Sell your NFT?** → Character is removed from roster, but mastery is preserved for re-acquisition

### 🎁 **Rarity-Based Per-Run Bonuses**
- ⬜ **Common** — +5% Gold, +5% Relic Fragments
- 🟢 **Uncommon** — +7% Gold, +8% Relic Fragments
- 🔵 **Rare** — +10% Gold, +10% Relic Fragments
- 🟣 **Epic** — +12% Gold, +13% Relic Fragments
- 🟡 **Legendary** — +15% Gold, +15% Relic Fragments

**Important:** Bonuses apply only to the character you're actively playing in that run. Owning multiple NFTs doesn't stack bonuses—each run uses the bonus from whichever character you selected. Mastery is shared across unlock paths.

---

## 🌟 MASTERY SYSTEMS

### 👾 **Enemy Mastery**
Defeat enough of one enemy type? Unlock permanent **+2% to +10% damage** against that enemy forever.

### 🎮 **Character Mastery**
Play a character repeatedly → Rank up through **7 tiers** (Cadet → Star Runner → Void Reaper → Nebula Warden → Cosmic Overlord → Tier 6 → Tier 7) for unique badges & permanent stat bonuses. **Tier 6 & 7 are unique per pilot** — they boost that character's signature ability (e.g. Pandypaws gets +50 HP & +3 Armor at T6, Glitch's phase-shift goes 15%→25% at T7, SkyByte unlocks HYPER BOOM).

---

## 💰 OMENX — THE PREMIUM CURRENCY

Earn via **leaderboard rankings**. Spend in-game to:
- 🔄 Reroll upgrade picks (2 OMENX, once per level-up)
- 🚫 Banish unwanted upgrades — tiered: **2 OMENX** for the first 3 banishes, **4 OMENX** for the next 3, then **6 OMENX** per banish
- ⚡ Activate Squad Ultimates — **Lite (5 OMENX)** capped clone power, or **Full (10 OMENX)** scales with your full upgrades
- 💀 Emergency Revive on death (4 OMENX — 50% HP + 3s invincibility)
- ➕ Buy 5 extra Galactic Raid runs (10 OMENX)
- ✨ Buy cosmetics, stat upgrades & a +50% XP session buff (10 OMENX / 60 min)

**Live balance always shown in the top bar of your screen.**

---

## 🎯 THE HOOK

✅ **Free-to-play** — Pure skill determines earnings
✅ **Skill-first** — Leaderboard earnings are purely based on performance
✅ **Real rewards** — OMENX tokens to your wallet
✅ **Squad multiplier** — Farm together, earn together
✅ **Infinite scaling** — Boss raids never stop

---

**Ready to slay cosmic enemies and stack real crypto?**

**🦥 Create your squad. Raid the Global Boss. Earn OMENX. Repeat.**`;

export default function AdminContent() {
    const { toast } = useToast();
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(GAME_DESCRIPTION);
            setCopied(true);
            toast({ title: "Copied!", description: "Game description copied to clipboard." });
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            toast({ title: "Error", description: "Failed to copy to clipboard." });
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Game Description</h2>
                <button
                    onClick={handleCopy}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                        copied
                            ? 'bg-emerald-600 text-white'
                            : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                    }`}
                >
                    {copied ? (
                        <>
                            <Check className="w-4 h-4" /> Copied!
                        </>
                    ) : (
                        <>
                            <Copy className="w-4 h-4" /> Copy Markdown
                        </>
                    )}
                </button>
            </div>

            <div className="bg-slate-900/50 rounded-xl border border-slate-700 p-4 md:p-6 max-h-[70vh] overflow-y-auto">
                <pre className="text-xs md:text-sm text-slate-300 whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {GAME_DESCRIPTION}
                </pre>
            </div>
        </div>
    );
}