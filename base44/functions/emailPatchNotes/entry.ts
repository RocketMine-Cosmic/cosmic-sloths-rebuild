// One-shot admin utility: emails the two S6 patch-note docs in FULL (verbatim)
// to the calling admin's account email. Mobile-friendly read.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PUBLIC_PATCH_NOTES = `# S6 Patch Notes — Discord Post Pack

Condensed to 6 posts. Each under 2,000 chars so it fits a single Discord message.

**Goes live:** Monday, May 18 • 00:00 UTC
**Maintenance window:** Sun May 17, 23:00 UTC (1hr soft warning) → 23:40 UTC (game closes) → ~00:10 UTC Mon (back online)

> Staff: detailed engineering version is in \`S6_STAFF_PATCH_NOTES.md\`. Don't paste that one to public channels.

---

## 📢 POST 1 — Headline & Schedule

\`\`\`
🌌 **SEASON 6 — May 18, 00:00 UTC**

S5 ends Sunday May 17, 23:59 UTC. Final S5 leaderboard rewards + Squad Champions payouts distribute as normal. S6 starts fresh.

🗓️ **Schedule**
S5 ends:    Sunday May 17, 23:59 UTC
S6 begins:  Monday May 18, 00:00 UTC

🛡️ **What resets**
• ALL leaderboards — Weekly, Seasonal AND Endless
• Weekly + seasonal upgrades

🛡️ **What's kept**
• All gold + relic fragments earned in S5
• Unlocked characters, cosmetics, weapons, mastery
• Permanent upgrades, talents, relics
• Squad XP, war record, rosters, treasury
• Daily/weekly bounty progress

Normal seasonal rollover — nothing extra is being wiped. The Endless leaderboard previously persisted across seasons; from S6 it resets alongside the others so everyone starts from zero. The first time you load /hub on May 18 a new in-game tour will walk you through the changes. Read the next 5 posts to get a head start.
\`\`\`

---

## 📢 POST 2 — Score Formula & Gold Caps

\`\`\`
⚖️ **NEW SCORE FORMULA**
Score now scales with sector depth and victory, not run length or gold.

**Sector runs add up like this:**
• Kills × 120
• Level² × 100
• Sector reached × 8,000
• Victory bonus: Sector × 15,000

**Endless runs:**
• Kills × 120
• Level² × 100
• Time bonus: 10,000 per full minute survived

**Gold no longer contributes to score at all.**
Hard score ceiling: 10M (only the very best runs will get close).

**Reference points (approximate):**
• Sector 1 quick clear → ~30k
• Sector 5 victory → ~200k
• Sector 10 victory → ~600k–1M (depends on kills + level)
• Endless 25 minutes → ~550k
• A clean Sector 10 victory now beats a 25-min endless farm run.

**Why:** S5 rewarded raw playtime + gold pickups, so longer/AFK-style runs always beat skilled short runs. The new formula makes sector progression the headline scorer so leaderboard rank reflects skill, not session length.

🪙 **GOLD CAPS REMOVED**
• 10,000 gold endless ceiling — gone
• 30-fragment per-run cap — gone
• "GOLD CAPPED" HUD warning — gone

**Added:** endless gold tapers past 10 minutes so AFK-style runs can't mint unlimited gold. Sector runs unaffected.

**Why:** Hard caps were a blunt tool. Tapering replaces them so sector runs finally pay full value end-to-end, without surprise mid-run warnings.
\`\`\`

---

## 📢 POST 3 — Balance & Weapon System

\`\`\`
🔧 **BALANCE CHANGES**
• Talent stack factor reduced (0.66×) — only triple-max stacks affected
• NFT perks now apply additively with talents
• Cosmic difficulty gold/XP: 3× → 2× (enemy stats unchanged)
• Structural multiplier ceilings: damage 6×, gold 8×, area 4×, xp 5×, cooldown ≥ 0.35

⚔️ **WEAPON SYSTEM**
• 6-weapon slot cap — once full, level-up pool only offers upgrades to your existing weapons. Synergies (2→1) free up slots.
• Evolutions now require base weapon at **Level 8**. Watch for the 🌟 EVOLVES badge.
• Rarity actually matters now:
  - Common = +1 level
  - Rare = +2 levels
  - Epic = +3 levels
  - Legendary = +5 levels
• Pool autobalance — soft-corrects toward balanced loadouts when you're heavy on one side. Your manual Pool Bias still wins.
• "Overcharge" fillers replace the late-game +25 HP loop — once you've maxed all passives + weapons, you'll see rotating uncapped stat boosters instead of the same option forever.

**Why these changes:**
• **Talent stack & Cosmic nerf** — top-end multipliers were stacking to ~38× on whale builds. Flattening to ~19× brings the gap between casual and whale builds back to "meaningful but fair," and stops Cosmic from being the only profitable difficulty.
• **Slot cap & Lvl 8 evolutions** — carrying 9+ weapons at once tanks framerate on mobile and dilutes DPS because nothing gets levelled. Level-1 evolutions also felt accidental, not earned. Both match the genre standard (Vampire Survivors, Brotato, Halls of Torment).
• **Rarity scaling** — old Rare picks were rounded to +1 (identical to Common) and Legendary felt barely different from Epic. Now each tier is a real upgrade.
• **Overcharge fillers** — endless past 30 min was begging for new picks but only had a single repeated +25 HP option. Players now keep getting meaningful choices forever.
\`\`\`

---

## 📢 POST 4 — New Sinks: Prestige, Astral Lab, Treasury

\`\`\`
💎 **PRESTIGE RELICS**
Once a relic hits Level 5, you can prestige it.
• 5 tiers (PL1 → PL5)
• Each tier: **1.5M gold + 100 relic fragments**
• +5% relic effect per tier (max +25% at PL5)

🌌 **ASTRAL LAB** *(replaces the Mystery Forge)*
A new endgame gold sink for whales sitting on millions. Each pull grants a **small permanent stat buff** at random:
• Damage / Area / Projectile Speed → +2% per pull (max +20%)
• Cooldown → -1% per pull (max -10%)
• Move Speed → +1% per pull (max +10%)
• HP Regen / Magnet Range / Max HP → flat bonus per pull

Cost: **20,000 gold for the first pull, +40% each subsequent pull** (20k → 28k → 39k → 55k → 77k → 108k…). After ~10 pulls you've capped roughly 1/3 of one stat. Fully maxing every stat costs **30M+ gold**.

Pure RNG which stat lands. Already-capped stats are skipped. Bonuses feed into your existing stat multipliers — so if you're already near a hard cap (e.g. damage 4.0×), additional damage pulls won't push you past it. Designed as a deep prestige curve for the highest-grinding players.

🏛️ **SQUAD TREASURY**
Members donate gold to a shared squad pool. Leaders/officers spend it on weekly buffs:
🥉 Bronze — 25k → +5% squad XP
🥈 Silver — 100k → +10% XP, +5% gold drops
🥇 Gold — 500k → +20% XP, +10% gold, +3% boss damage
💎 Platinum — 2M → +30% XP, +15% gold, +8% boss damage

Donations made in week N apply to week N+1's wars. Buffs reset weekly.

**Why these sinks:** Prestige is a long-term gold + fragment dump for L5-relic owners. Astral Lab targets whales specifically — the cost curve and per-stat caps mean only deep-endgame players engage with it, and bonuses don't bypass the existing stat ceilings. Treasury is a recurring sink that scales with squad size. None affect leaderboard balance directly.
\`\`\`

---

## 📢 POST 5 — Squad Meteor *(new persistent boss)*

\`\`\`
☄️ **SQUAD METEOR — A NEW SQUAD BOSS**
A persistent meteor that lives inside your squad. Hit it together, level it up, and the whole squad gets permanent buffs that apply to every run.

**How it works:**
• Every squad has its own meteor (starts at Lv.1)
• Tap **⚔ ATTACK METEOR** on the Squads page to launch a dedicated DPS run
• Damage you deal accumulates toward the next level
• When the squad collectively breaks through, the meteor levels up — and a fresh, beefier one spawns
• **Levels never reset** — keep climbing forever

**Attack limits:**
• Each member gets a small daily attack quota (resets 00:00 UTC)
• Encourages consistent squad participation over single-player grinds

**Persistent squad buffs (apply to ALL arena runs, not just meteor runs):**
• +Gold drops
• +Damage
• +AoE size
• +Cooldown reduction

The buff strength scales with your squad's current meteor level. Buffs are **capped** so a 6-month-old squad isn't infinitely stronger than a new one — but every level matters.

**Leaderboards:**
• 📊 **Today** — your squad's top damage dealers today
• 🏆 **This Week** — weekly squad-wide damage leaderboard

**Why this exists:** Squads needed a true co-op endgame loop. Squad Wars are competitive (vs another squad) and the Global Raid is server-wide. Squad Meteor is *your squad vs the meteor* — a long-running shared goal that rewards everyone who shows up. The buffs intentionally apply to every arena so meteor participation feels valuable even if you don't love the meteor arena itself.

**Where to find it:** Squads page → Meteor tab. Quit a meteor run early? Whatever damage you dealt up to that point is still banked.
\`\`\`

---

## 📢 POST 6 — UX Polish & First-Login Tour

\`\`\`
✨ **QUALITY OF LIFE**

🎓 **In-game S6 tour** — first time you load /hub after launch, an 8-step walkthrough explains the changes (including Squad Meteor). Skip-able anytime.

🎁 **Free Pool Bias respec** — one-time gift on the Loadouts page so you can rebuild around the new weapon-rarity meta without paying.

🏛️ **Squad Treasuries pre-seeded** — every active squad gets +25,000g on launch day so leaders can immediately activate the Bronze buff for week 1.

🔍 **HUD score mirror** — the live score in your run now matches exactly what the leaderboard credits. No more "wait, why did my score change?" moments.

📡 **Pool Bias indicator** — when you have bias allocated, the level-up screen shows a 🎯 POOL BIAS badge with your top 2 boosted targets. Reassures that your respec is actually working mid-run.

⚠️ **No more 'GOLD CAPPED' / 'KILLS CAPPED' warnings** — the underlying caps are gone. What you see is what you get.
\`\`\`

---

Feedback in \`#s6-feedback\` after launch — first 2 weeks we're monitoring closely for hotfixes.
`;

const STAFF_PATCH_NOTES = `# Season 6 — Staff Brief

**For:** Discord moderators & in-game staff with AdminDashboard access
**Launch:** Mon May 18 2026 • 00:00 UTC
**Last updated:** 2026-05-13

> Use this to answer player questions and run the launch-day tools. Public-facing patch notes are in \`S6_PATCH_NOTES.md\`.

---

## 1. What's actually changing (player-visible)

### 🏆 New score formula
- Gold no longer counts toward score
- Sector progression is now the headline scorer (Sector 10 victory peaks around ~1M with strong kills/level)
- Endless score scales at ~10k per full minute survived (+ kills/level) so long runs can't dominate
- A **Sector 10 victory now beats a 25-min farm run** — skill > grind
- Hard score ceiling: **10M** (anti-tamper backstop, not a realistic target)

### 🪙 Gold caps gone
- The 10k endless gold ceiling, 30-fragment per-run cap, and "GOLD CAPPED" warnings are all removed
- Replaced with a soft taper: endless gold drops decay 1.0× → 0.25× past 10 minutes
- Sector runs unaffected — they always pay full value

### ⚔️ Weapon system
- **6-weapon slot cap** — once full, only level-ups for owned weapons appear. Synergies free up slots.
- **Evolutions need Lvl 8** — base weapon must reach level 8 before evolving. The 🌟 EVOLVES badge appears when ready.
- **Rarity actually matters** — Common +1 / Rare +2 / Epic +3 / **Legendary +5** levels per pick
- **Overcharge fillers** — once you've maxed everything, the pool offers rotating uncapped stat boosters instead of repeating +25 HP forever

### ⚖️ Balance pass
- Talent stack factor reduced 1.0× → 0.66× on weekly/seasonal (permanent unchanged)
- Cosmic difficulty: 3× gold/XP → 2× (enemy stats unchanged — still hardest mode)
- NFT gold perks now stack additively instead of multiplicatively

### 💎 New gold sinks
- **Astral Lab** — RNG gold pulls for permanent stat buffs (capped per stat)
- **Prestige Relics** — once a relic hits L5, prestige PL1→PL5 for +5% per tier (max +25%). Costs 1.5M gold + 100 fragments per tier.
- **Squad Treasury** — donate gold to your squad pool, leaders activate weekly buffs (Bronze 25k → Platinum 2M)

### ☄️ Squad Meteor *(new persistent squad boss)*
- Every squad has its own meteor. Members attack it via a dedicated DPS run on the Squads page.
- Damage accumulates toward the next level. When destroyed, level increments, a fresh beefier meteor spawns. **Levels never reset.**
- Each member gets a small **daily attack quota** (resets 00:00 UTC).
- Squad meteor level grants **persistent buffs that apply to EVERY arena run** (not just meteor): +gold drops, +damage, +AoE, +cooldown reduction. Strength scales with meteor level, capped to prevent old squads being infinitely stronger.
- Two leaderboards on the Meteor tab: **Today** and **This Week** (per-member damage).
- Quitting a meteor run mid-fight still banks the damage dealt up to that point — players see a "Damage submitted" toast.

### ✨ Quality of life
- 7-step in-game tour on first /hub load after launch
- Free Pool Bias respec on the Loadouts page (one-time)
- Pool Bias badge in level-up screen (shows your top 2 boosted targets)
- HUD live score now matches what gets credited at run end
- **Endless leaderboard now resets each season** alongside Weekly/Seasonal (was previously persistent — fixed for S6)

---

## 2. What stays / what resets

| Stays ✅ | Resets ❌ |
|---|---|
| All gold + relic fragments earned in S5 | All leaderboards (Weekly, Seasonal, **Endless**) |
| Unlocked characters, cosmetics, mastery | Weekly upgrades + talents |
| Permanent upgrades + talents + relics | Seasonal upgrades + talents |
| Squad XP, war record, rosters, treasury | Squad Champions standings |
| Daily/weekly bounty progress | |

> ⚠️ The **Endless leaderboard** previously persisted across seasons (filter was arena-only). For S6 it's now scoped by \`season_id\` like every other board, so it resets cleanly at the rollover. Any S5 endless runs are still queryable in the database by admins via \`season_id = 2026-S5\` if needed.

**Nothing extra is being wiped.** This is a normal seasonal rollover.

---

## 3. Launch-day playbook

**Almost everything is automated.** Only two things need a human:
1. Run the squad treasury seed tool (any time before launch — recommended ~Sun May 17 evening)
2. Flip Maintenance OFF after verifying the rollover went well (~00:10 UTC Mon May 18)

### What runs automatically

| When (UTC) | What happens | Who triggers it |
|---|---|---|
| Sun May 17, **23:00** | Maintenance flips to **SOFT** (yellow warning banner) | Scheduled automation |
| Sun May 17, **23:40** | Maintenance flips to **HARD** (blocks \`/game\`) | Scheduled automation |
| Mon May 18, **00:00** | Period rolls W20→W21, all S6 logic activates | Server-side (season-gated by \`isS6OrLater()\`) |

The scheduler can only flip the gate **on** — it never flips it off, by design (if rollover breaks, we want it to stay locked until a human clears it).

### What you do

#### Any time before launch (recommended Sun May 17 evening) — Seed squad treasuries (one-shot)
**Admin Dashboard → Live Ops → 🔧 Maintenance → S6 Launch Tools**

1. **🪙 Seed Squad Treasuries**
   - Confirm amount is \`25000\` (= one Bronze buff activation)
   - Tap "Run" twice to confirm
   - Shows "Seeded N squads (M skipped, already had treasury)"
   - **Idempotent** — squads with existing treasury are skipped automatically

> All leaderboards (weekly / seasonal / endless) reset automatically when the season flips. No archive action needed.

#### Mon May 18, ~00:10 UTC — Verify, then flip OFF
- ⚡ **Admins bypass the HARD gate automatically.** You'll see a small "ADMIN BYPASS · Gate is HARD" pill in the bottom-right corner instead of the full block overlay. \`/game\` stays playable for you so you can smoke-test the rollover.
- Try a quick Sector 1 run on a test wallet — score should match new formula
- Try entering an endless run — should see no "GOLD CAPPED" warnings
- Check the Endless leaderboard tab — should be empty (S5 endless runs are now scoped to S5)
- **Admin Dashboard → Live Ops → 🔧 Maintenance** → Tap **✓ OFF** twice to re-open the game for everyone

### If something looks wrong

- **You don't need to wait for 00:10** to flip OFF if the gate is breaking and rollover hasn't happened yet — manual override always wins.
- **You can manually flip the gate any time** — Maintenance panel works whether the schedule fired or not.
- **If the SOFT/HARD schedule misfires** (didn't fire, fired wrong time, etc), just flip manually in the Maintenance panel — same result.

---

## 4. Support scripts (copy-paste)

### "My score is way lower than S5"
> Season 6 reset the leaderboard with a new scoring system that rewards reaching deeper sectors and beating bosses, instead of just running long. Your gameplay didn't change — the formula did. A clean Sector 10 victory now scores around 600k–1M depending on your kills and level. Your S5 high score is preserved in the database for the record.

### "Why won't my weapon evolve?"
> Season 6 added an evolution requirement: the base weapon needs to reach **level 8** before the evolution can trigger. Look for the orange 🌟 EVOLVES badge on the level-up screen — that means picking it now will trigger the evolution.

### "I keep getting offered passives, no new weapons"
> If you're carrying 6 weapons, the level-up pool only offers upgrades to weapons you already have. That's the new slot cap. To free up a slot: combine two weapons into a **synergy** (which counts as one weapon).

### "Where did my gold go?" / "Endless gold seems lower"
> Gold isn't lost — nothing is wiped. Endless gold now decays gradually past 10 minutes instead of stopping at the old 10,000 cap. Short endless runs feel about the same; long runs accumulate slower than before. The HUD now shows exactly what gets credited at the end.

### "My talents feel weaker"
> Weekly and seasonal talents now scale at 0.66× when stacking on top of permanent talents. Permanent talents are unchanged. This was a balance pass to flatten extreme triple-stacking — solo or paired tier upgrades feel the same, only the triple-max stack is curbed.

### "What about my S5 leaderboard rank?"
> All leaderboards (Weekly, Seasonal, and Endless) reset at the start of every new season — that's how seasonal play works. Your S5 final rank determined your S5 reward payout, which has already been distributed. The S6 leaderboards start fresh for everyone.

### "Why did my Endless leaderboard rank disappear?"
> Endless used to persist across seasons but as of S6 it resets alongside the Weekly and Seasonal boards. This makes Endless a fair seasonal competition like the others instead of being permanently dominated by old runs. Your S5 endless score is still recorded — it just doesn't count for the S6 leaderboard.

### "What's the Astral Lab?"
> A new gold-only RNG sink for endgame players. Each pull costs gold (starts at 20k, increases each pull) and grants a small permanent stat buff at random. Each stat caps eventually so it can't infinitely scale. It's designed as a deep prestige curve — completing it costs 30M+ gold.

### "How does the Squad Treasury work?"
> Members donate gold to a shared squad pool. Leaders/officers spend it to activate weekly buffs (Bronze 25k → Platinum 2M). Donations made this week apply to next week's wars. Buffs reset weekly. We pre-seeded every squad with 25,000g at launch so leaders can immediately activate the Bronze buff for week 1.

### "Where's the free respec?"
> One-time gift on the Loadouts page — a green "Use Free Respec" button appears below your Pool Bias allocation. It refunds all your spent points at no cost so you can rebuild around the new weapon-rarity meta.

### "What's the Squad Meteor?"
> A new persistent boss your whole squad fights together. Open the Squads page → Meteor tab and tap ATTACK METEOR to launch a damage run. Damage banks toward levelling the meteor; once destroyed, a new (tougher) one spawns. Higher meteor level = stronger squad-wide buffs that apply to every arena run. Each member has a small daily attack quota (resets 00:00 UTC).

### "I only got partial damage credit on the meteor"
> If you quit a meteor run mid-fight, only the damage you'd dealt up to that point is banked. That's intentional — keeps things fair. Finish the run for full credit. The "Damage submitted: X" toast at the end shows exactly what was banked.

---

## 5. What to escalate to engineering

Ping engineering (#base44-internal) if you see:

- 🚨 **Score formula posting > 5M** for a single run — far beyond intended peaks (~1M Sector 10 victory). Possible tampering or formula bug.
- 🚨 **Squad Meteor stuck** — meteor HP hits 0 but level doesn't increment, or attacks aren't banking damage
- 🚨 **One character/build dominating top 10** for 3+ days running (e.g. 7+ NeonVortex runs out of 10)
- 🚨 **Player reports gold disappeared** (not "lower" — actually missing). Use Admin → 🪙 Gold Audit to verify before escalating.
- 🚨 **Astral Lab returning impossible buffs** (e.g. damage past +20% cap)
- 🚨 **Treasury donations not crediting** to the squad pool
- 🚨 **In-game S6 tour not appearing** for fresh players after launch
- 🚨 **AdminDashboard launch tools error out** — copy the error message verbatim

Don't escalate:
- ✅ Score "lower than S5" complaints (use script above)
- ✅ Weapon won't evolve at Lvl 1 (it's the new gate)
- ✅ Endless gold lower past 15 min (it's the new decay)
- ✅ Confused about new sinks (use scripts above)

---

## 6. Common AdminDashboard tools you'll need

| Question | Where to look |
|---|---|
| "Did this player actually lose gold?" | 🪙 Gold Audit (Player Operations) |
| "What did this player buy?" | 📋 Audit Log → filter by wallet |
| "Is this run legit?" | 🔍 Suspicious Runs (Moderation) |
| "Player wants a refund" | 💸 Refund Player (Finance) |
| "Their NFT perks aren't applying" | ✨ NFT Refresh (Player Operations) |
| "Mute / unmute player chat" | 💬 Squad Chat (Moderation) |
| "Where's their S5 high score?" | RunScore data still exists with \`season_id = 2026-S5\` — engineering can query if needed |

---

## 7. Quick FAQ

**Q: Do I need to do anything at midnight UTC?**
A: No. Period rollover is automatic. Just verify after with a test run and flip Maintenance OFF.

**Q: Can I re-run the Treasury seed tool if I make a mistake?**
A: Yes — it's idempotent. Squads that already have a treasury balance are skipped automatically, so re-running just tops up any that were missed.

**Q: What if a player asks about prestige relics during the SOFT maintenance window?**
A: Prestige is live at S6 launch (Mon May 18, 00:00 UTC). Tell them it'll be available right after the rollover.

**Q: A player insists their S5 score should still be on the board.**
A: Leaderboards are seasonal — they always reset at season rollover. Their S5 reward (if they were top 45) was already paid out at the end of S5. The data still exists in the database for engineering to look up if there's a payout dispute.

**Q: I see a "GOLD CAPPED" message in a player's screenshot.**
A: They're on an old browser cache. Tell them to hard-refresh (Ctrl+Shift+R / Cmd+Shift+R). The warning code is gone in S6.

---

*Questions about anything in this doc? Ask in #base44-internal before launch — not at 23:55 UTC.*
`;

function escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildEmail(title, body) {
    return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:760px;margin:0 auto;padding:16px;color:#1a1a1a;">
<h1 style="color:#D946EF;">${escapeHtml(title)}</h1>
<pre style="white-space:pre-wrap;font-family:'SF Mono',Menlo,monospace;font-size:13px;line-height:1.55;background:#f7f8fa;padding:14px;border-radius:6px;border:1px solid #e1e5eb;">${escapeHtml(body)}</pre>
<p style="font-size:12px;color:#888;margin-top:24px;">Sent ${new Date().toISOString()}</p>
</div>`;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Sign in required.' }, { status: 401 });
        if (me.role !== 'admin') return Response.json({ error: 'Admin only.' }, { status: 403 });

        const { to } = await req.json().catch(() => ({}));
        const targetEmail = (to && typeof to === 'string') ? to : me.email;
        if (!targetEmail) return Response.json({ error: 'No email on file.' }, { status: 400 });

        // Send the two docs as separate emails so each lands intact (and is easy
        // to find in the inbox by subject).
        await base44.integrations.Core.SendEmail({
            from_name: 'Cosmic Sloths Docs',
            to: targetEmail,
            subject: '🌌 S6 Patch Notes — PUBLIC (Discord post pack)',
            body: buildEmail('S6 Patch Notes — Public', PUBLIC_PATCH_NOTES),
        });

        await base44.integrations.Core.SendEmail({
            from_name: 'Cosmic Sloths Docs',
            to: targetEmail,
            subject: '🛠️ S6 Patch Notes — STAFF brief',
            body: buildEmail('S6 Patch Notes — Staff Brief', STAFF_PATCH_NOTES),
        });

        return Response.json({ success: true, sent_to: targetEmail, emails: 2 });
    } catch (error) {
        console.error('[emailPatchNotes]', error.message);
        return Response.json({ error: error.message || 'Failed to send.' }, { status: 500 });
    }
});