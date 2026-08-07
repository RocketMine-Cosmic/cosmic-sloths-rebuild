import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Auth: Base44 session. Wallet: from linked User.wallet_address.
// Server-authoritative: validates run stats with sanity caps, recomputes score,
// AND is the sole writer for run-aggregate fields on PlayerSave (Phase 3c).

// Proper ISO 8601 (Mon-start, Sun 23:59 UTC end) — must mirror lib/periodIds.js.
// Old `getUTCDay() + 1` formula treated Sunday as the start of a new week,
// rolling week_id over a day early (Hugo bug 2026-05-03).
function getCurrentPeriodIds() {
    const now = new Date();
    const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const isoYear = tmp.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    const week_id = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
    const seasonNum = Math.floor((isoWeek - 1) / 4) + 1;
    const season_id = `${isoYear}-S${seasonNum}`;
    return { week_id, season_id };
}

// Silent per-wallet score multiplier — admin balance lever for top spenders.
// Applied as the very last step on `score` (after arena mult + hard ceiling).
// Fully invisible: no client surface, no log line beyond a quiet console note.
// Lowercase wallet keys. Set to 1.0 (or remove) to disable.
//
// IMPORTANT: These ONLY apply in S5. All silent buffs are auto-disabled at S6
// rollover (2026-05-18) — S6 is a clean-slate, no-bias season. See line 519.
const SILENT_SCORE_MULTIPLIERS = {
    // AnubisDominus🐺 — closing the gap with Texxy through end of S5.
    // Knocked from 1.20× → 1.10× on 2026-05-14 for final week of S5. Auto-disables at S6.
    '0x085b826b4cc262df1b39f063cc9161cac314eff3': 1.10,
};

// Sanity caps (loose) — runs exceeding these are rejected as tampered
const MAX_KILLS_PER_SEC = 200;
// Non-endless gold sanity: baseline 50k + 2000g/kill. Old check (500g/kill) was
// rejecting legitimate stacked-multiplier runs (Synthbeats + VIP10 + relic gold +
// augments + boss auto-credit pools), e.g. a sector with 2 boss kills auto-credits
// 1000g × ~5× multiplier × 2 = 10k from 2 kills alone. New formula leaves comfortable
// headroom for whales while still catching obvious tampering (1.4M gold in 7min etc).
const MAX_GOLD_BASELINE = 50000;
const MAX_GOLD_PER_KILL = 2000;
const MAX_LEVEL = 500;
const MAX_TIME_SEC = 60 * 60; // 60 minutes
const MIN_TIME_SEC = 1;       // No instant runs

// Relic fragment caps. Drop rates in PickupSystem produce ~1 fragment per 30-60s
// of normal play, NFT bonus may add up to +1 per drop. 1 fragment per 5 seconds
// is a generous upper bound that catches obvious tampering without rejecting
// long fragment-heavy runs. Endless runs get a smaller per-run cap.
const MAX_FRAGMENTS_PER_SEC = 0.2; // = 1 frag / 5s
const ENDLESS_FRAGMENTS_CAP_PER_RUN = 30;

// Endless mode anti-exploit caps. Long endless runs were granting up to 800k gold,
// breaking the upgrade economy. Caps now scale with playtime so a 30-min legit
// run isn't truncated like a 60s tampered one. Per-second budget × time + a small
// floor for very short runs. Hard ceiling prevents infinite-AFK exploits.
// Time-based endless gold (rebalanced 2026-05-03): client accrues 10 gold/sec × goldMult.
// Server cap = 12/sec — endless was over-rewarding compared to sectors (a 17-min endless
// AFK run earned 25k while a victorious 7-min sector earned ~3-5k). Now scaled down
// so endless feels like a chill grind, not a primary gold farm.
// Hard ceiling 10k = ~14 min × ~720 g/min ceiling.
const ENDLESS_GOLD_PER_SEC = 12;
// Endless kills cap raised 2026-05-08 — old 6k ceiling capped peak score around
// ~5M, making the 10M leaderboard target unreachable in endless. New 12k ceiling
// + 5/sec rate puts realistic peak at ~8.5M, leaving 10M as a legendary chase
// target. Gold cap is intentionally untouched (wallets unaffected).
const ENDLESS_KILLS_PER_SEC = 5;        // ~300/min sustained
const ENDLESS_GOLD_FLOOR = 1000;        // minimum cap for very short runs
const ENDLESS_KILLS_FLOOR = 600;
const ENDLESS_GOLD_HARD_CEILING = 10000;
const ENDLESS_KILLS_HARD_CEILING = 12000;

// Hard score ceiling — last-line backstop. Long S5 endless runs (Tijckers 33min,
// Waeoo 19min) were both clipping the previous 2.5M ceiling, so we raised it to
// 10M to leave the leaderboard chase open for the final 10 days of S5. S6's new
// formula caps endless naturally at ~10k/min and peaks ~1M overall, so 10M
// remains a meaningful tampering backstop without constraining legit play.
// Bumped 10M → 25M for Outer Galaxy (2026-06-04). Endless top runs were already
// clipping the old 10M ceiling, and Outer Galaxy bonus mult at S20 (3.5× on
// sector+victory) can push legit S20 Cosmic runs into ~2.2M; long endless tails
// can reach ~7-10M. 25M gives comfortable headroom without losing the tampering
// backstop. See SECTORS_11_20_PLAN.md.
const SCORE_HARD_CEILING = 25_000_000;

// Arena progression — must mirror game/Constants.js ARENAS order EXACTLY.
// Bug 2026-05-01 (Crybel): old order had stale ids ('voidring', 'singularity')
// and was missing 5 arenas, so beating Ethereal Nebula / Crimson Void didn't unlock the next sector.
// Extended 2026-06-04: 10 → 20 entries for Outer Galaxy (S11-S20). New arena ids
// MUST match the new ARENAS entries appended in game/Constants.js. See SECTORS_11_20_PLAN.md.
const ARENA_ORDER = [
    // Inner Galaxy (S1-S10)
    'station', 'asteroid', 'nebula', 'void', 'plasma', 'crystal', 'moon', 'blackhole', 'mothership', 'dimension',
    // Outer Galaxy (S11-S20)
    'galactic_core', 'pillars', 'saturnian', 'andromeda', 'painters_spiral',
    'harmony', 'chromatic', 'stormfront', 'supernova', 'devourer',
];

// Arena durations (seconds) — must mirror game/Constants.js ARENAS.duration EXACTLY.
// Used to clamp time_survived on sector runs: the engine's `this.time` keeps ticking
// past the arena duration while the final boss is still alive (victory only fires when
// the boss dies). That post-duration tail was inflating time, gold accrual, and score.
// Endless (Infinity) and raid (world_boss_arena) are not clamped — they have no duration.
const ARENA_DURATIONS = {
    // Inner Galaxy
    station: 180, asteroid: 210, nebula: 240, void: 270, plasma: 300,
    crystal: 330, moon: 360, blackhole: 390, mothership: 420, dimension: 450,
    // Outer Galaxy (S11-S20) — +30s per sector, 8:00 → 12:30
    galactic_core: 480, pillars: 510, saturnian: 540, andromeda: 570, painters_spiral: 600,
    harmony: 630, chromatic: 660, stormfront: 690, supernova: 720, devourer: 750,
};

// Character unlock kill milestones — must mirror game/CharacterUnlocks.js.
// 10 milestones to cover all 10 characters (1 starter at 0 + 9 unlockable).
// Spacing keeps the early-game cadence (first unlock at 2k stays accessible to
// new players) and stretches the later ones so the full roster is a long-term
// goal rather than something a heavy player completes in a weekend.
// (Old list capped at 20k kills, which only unlocked 5 of the 10 characters
//  via milestones — leaving the other 5 strandable behind admin grants only.)
const KILL_MILESTONES = [0, 2000, 5000, 10000, 20000, 35000, 55000, 80000, 115000, 160000];
// Full character roster — must mirror game/Constants.js CHARACTERS ids.
const ALL_CHARACTER_IDS = [
    'neobyte', 'pandypaws', 'novabyte', 'glitch', 'holodrift',
    'codebreaker', 'dataphantom', 'neonvortex', 'synthbeats', 'skybyte'
];

// Numeric season compare — string compare breaks at 2026-S10 vs 2026-S7 ('1' < '7').
function seasonAtLeast(seasonId, year, seas) {
    const m = String(seasonId || '').match(/^(\d{4})-S(\d{1,2})$/);
    if (!m) return false;
    const y = Number(m[1]);
    const s = Number(m[2]);
    if (y > year) return true;
    if (y < year) return false;
    return s >= seas;
}

function getArenaMultiplier(arenaId) {
    if (arenaId === 'endless') return 2.0;
    const idx = ARENA_ORDER.indexOf(arenaId);
    return 1.0 + (Math.max(0, idx) * 0.2);
}

function validateAndRecompute(scoreData) {
    const { week_id: _runWeek, season_id: serverSeasonId } = getCurrentPeriodIds();

    // Season stamp: always use the server's current season. The straddle-run
    // back-date logic (honoring an older client-declared run-start season) was
    // removed 2026-07-13 W29 — long browser sessions with stale caches were
    // shunting fresh runs onto closed leaderboards. Runs now land on whatever
    // week/season the server is on when the score is saved. Simple, predictable.
    const runSeasonId = serverSeasonId;

    const isS6OrLater = runSeasonId !== '2026-S5';
    // S7 §4f: HEAT score bonus — up to +1.0× score based on DD peak vs the
    // difficulty's own DD cap. Server-side mirror of lib/seasonGate.isS7OrLater.
    const isS7OrLater = seasonAtLeast(runSeasonId, 2026, 7);

    // S6 Phase 1: time max raised from 60 → 120 min, eliminates the false-reject
    // on legit 60+ min endless runs. S5 keeps the original 60 min cap.
    const timeMax = isS6OrLater ? 2 * 60 * 60 : MAX_TIME_SEC;

    let time = Number(scoreData.time_survived) || 0;
    let kills = Number(scoreData.kills) || 0;
    const level = Number(scoreData.level) || 1;
    let gold = Number(scoreData.gold) || 0;
    let fragments = Math.max(0, Math.floor(Number(scoreData.fragments) || 0));

    if (time < MIN_TIME_SEC || time > timeMax) {
        return { ok: false, reason: `time out of range: ${time}` };
    }

    // Arena-duration clamp — S5 only. S6 removes it entirely (per S6_CAP_REMOVAL):
    // the score formula no longer rewards `time * 5`, so a few seconds of post-boss
    // tail can't inflate score, and the cap was confusing players whose recorded
    // time didn't match what they saw on the run timer.
    if (!isS6OrLater) {
        const arenaDuration = ARENA_DURATIONS[scoreData.arena_id];
        if (arenaDuration && time > arenaDuration) {
            time = arenaDuration;
        }
    }
    if (kills < 0 || kills > Math.ceil(time * MAX_KILLS_PER_SEC)) {
        return { ok: false, reason: `kills out of range: ${kills} for ${time}s` };
    }
    if (level < 1 || level > MAX_LEVEL) {
        return { ok: false, reason: `level out of range: ${level}` };
    }
    const isEndlessRun = scoreData.arena_id === 'endless';
    const isRaidRun = scoreData.arena_id === 'world_boss_arena';
    const isMeteorRun = scoreData.arena_id === 'quantum_meteor';
    if (gold < 0) {
        return { ok: false, reason: `gold negative: ${gold}` };
    }
    // Non-endless gold sanity rejection — S5 only. Skip for raid AND meteor:
    // both are damage-only arenas with zero gold/kill credit anyway.
    if (!isS6OrLater && !isEndlessRun && !isRaidRun && !isMeteorRun && gold > MAX_GOLD_BASELINE + (kills * MAX_GOLD_PER_KILL)) {
        return { ok: false, reason: `gold out of range: ${gold} for ${kills} kills (cap=${MAX_GOLD_BASELINE + kills * MAX_GOLD_PER_KILL})` };
    }

    // Raid AND Meteor runs are damage-contribution only — no gold or kill credit
    // to PlayerSave. Rewards come from boss claims / squad meteor buffs, not run gold.
    if (isRaidRun || isMeteorRun) {
        gold = 0;
        kills = 0;
    }

    // Endless ledger caps — S5 only. S6 removes them entirely (per S6_CAP_REMOVAL):
    // the multiplier rebalance (L1/L2/L3) + new gold sinks (prestige relics, forge
    // lottery, squad treasury) absorb the extra gold flow. HUD ↔ server now match
    // exactly, so the "GOLD CAPPED" warnings disappear too.
    const isEndless = scoreData.arena_id === 'endless';
    let goldForLedger = gold;
    let killsForLedger = kills;
    let endlessGoldCapped = false;
    let endlessKillsCapped = false;
    if (!isS6OrLater && isEndless) {
        const goldCap = Math.min(ENDLESS_GOLD_HARD_CEILING, Math.max(ENDLESS_GOLD_FLOOR, Math.floor(time * ENDLESS_GOLD_PER_SEC)));
        const killsCap = Math.min(ENDLESS_KILLS_HARD_CEILING, Math.max(ENDLESS_KILLS_FLOOR, Math.floor(time * ENDLESS_KILLS_PER_SEC)));
        if (gold > goldCap) {
            goldForLedger = goldCap;
            endlessGoldCapped = true;
        }
        if (kills > killsCap) {
            killsForLedger = killsCap;
            endlessKillsCapped = true;
        }
    }

    // Fragment caps — S5 only. S6 removes both the per-second cap and the
    // per-run endless ceiling (legit fragment drop rate is bounded by the
    // PickupSystem's drop chance, which is itself anti-tamper).
    let fragmentsForLedger = fragments;
    let fragmentsCapped = false;
    if (!isS6OrLater) {
        const fragmentsTimeCap = Math.max(5, Math.ceil(time * MAX_FRAGMENTS_PER_SEC) + 2);
        fragmentsForLedger = Math.min(fragments, fragmentsTimeCap);
        fragmentsCapped = fragmentsForLedger < fragments;
        if (isEndless && fragmentsForLedger > ENDLESS_FRAGMENTS_CAP_PER_RUN) {
            fragmentsForLedger = ENDLESS_FRAGMENTS_CAP_PER_RUN;
            fragmentsCapped = true;
        }
    }

    const isVictory = !!scoreData.is_victory;
    const sectorIdxForBonus = isEndless || isRaidRun
        ? 0
        : Math.max(0, ARENA_ORDER.indexOf(scoreData.arena_id));

    let score;
    if (isS6OrLater) {
        // ====================================================================
        // S6 SCORE FORMULA — Option A (player-anchor scaled, ~1M peak)
        // Per docs/S6_SCORE_FORMULA.md §5 (locked 2026-05-07).
        //
        //   killsScore  = kills × 120
        //   levelScore  = level² × 100
        //   sectorScore = sectorIdx × 8000   (sectors only)
        //   victoryBonus = sectorIdx × 15000 (sectors only, on victory)
        //   endlessScore = floor(time / 60) × 10000  (endless only)
        //
        // No gold contribution. No arena multiplier (sector progression is the
        // multiplier, baked into sectorScore + victoryBonus). No difficulty
        // multiplier in Phase 1 — client doesn't ship difficulty yet, plumbing
        // can be added later if needed (Cosmic players still earn more naturally
        // via more kills / higher level from harder enemies).
        //
        // Projected peaks (no difficultyMult): Sector 10 victory ~430k, long
        // endless 25-min ~550k, raw kills/level potential up to ~1M. Comfortably
        // under the 2.5M ceiling.
        // ====================================================================
        const killsScore = kills * 120;
        const levelScore = level * level * 100;
        const sectorScore = (isEndless || isRaidRun) ? 0 : sectorIdxForBonus * 8000;
        const victoryBonus = (isVictory && !isEndless && !isRaidRun) ? sectorIdxForBonus * 15000 : 0;
        // Outer Galaxy climb bonus (2026-06-04). Escalating multiplier on the
        // sector + victory portion ONLY — kill score stays sacred (flat 120/kill).
        // Compensates for kill-rate drop at high sectors so S20 still scores
        // higher than farming S10. sectorIdxForBonus is 0-indexed: S11=10, S15=14, S18=17, S20=19.
        // S11-S14 bumped from 1× → 1.5× on 2026-06-04 — players were struggling to
        // beat their S10 high scores on the early Outer Galaxy sectors because kill
        // rates drop immediately on entry while the bonus didn't kick in until S15.
        // S7 (2026-06-15 W25 rollover): Outer Galaxy HP curve was flattened
        // dramatically (S20 mob HP 698× → 11×). Kill rates now alone reward S20,
        // and HEAT bonus stacks up to ×2.0 on top. The original ladder was
        // double-dipping — halved here so S20 still feels best without runaway scores.
        const bonusMult = isS7OrLater
            ? (sectorIdxForBonus >= 19 ? 2
                : sectorIdxForBonus >= 17 ? 1.75
                : sectorIdxForBonus >= 14 ? 1.5
                : sectorIdxForBonus >= 10 ? 1.25
                : 1)
            : (sectorIdxForBonus >= 19 ? 3.5
                : sectorIdxForBonus >= 17 ? 2.5
                : sectorIdxForBonus >= 14 ? 2
                : sectorIdxForBonus >= 10 ? 1.5
                : 1);
        const scaledSectorBonus = (sectorScore + victoryBonus) * bonusMult;
        const endlessScore = isEndless ? Math.floor(time / 60) * 10000 : 0;
        const baseScore = killsScore + levelScore + scaledSectorBonus + endlessScore;
        score = Math.min(SCORE_HARD_CEILING, Math.floor(baseScore));
    } else {
        // ====================================================================
        // S5 SCORE FORMULA (legacy — frozen until 2026-05-18 W21 rollover)
        // ====================================================================
        const arenaMult = getArenaMultiplier(scoreData.arena_id);
        // S5 gold cap: 200g/kill × 1.5 multiplier.
        const goldScoreCap = kills * 200;
        const goldScoreContribution = Math.min(gold, goldScoreCap) * 1.5;
        const victoryBonus = isVictory ? (15000 + sectorIdxForBonus * 16000) : 0;
        const baseScore = kills * 45 + level * level * 15 + time * 5 + goldScoreContribution + victoryBonus;
        score = Math.min(SCORE_HARD_CEILING, Math.floor(baseScore * arenaMult));
    }

    // S7 §4f: HEAT score bonus. Scales score by up to ×2.0 based on the DD peak
    // reached this run relative to the difficulty's own DD ceiling. Easy never
    // ramps so it stays at ×1.0. Skipped on endless+raid+meteor (no DD there).
    if (isS7OrLater && !isEndlessRun && !isRaidRun && !isMeteorRun) {
        const ddPeak = Number(scoreData.ddPeakSpawnMult) || 1.0;
        const ddCapMap = { normal: 1.75, hard: 2.5, cosmic: 3.5 };
        const difficulty = String(scoreData.difficulty || 'normal').toLowerCase();
        const ddCap = ddCapMap[difficulty] || 1.0;
        if (ddCap > 1.0) {
            const ddProgress = Math.min(1.0, Math.max(0, (ddPeak - 1.0) / (ddCap - 1.0)));
            const heatBonus = 1 + ddProgress; // 1.0 → 2.0
            score = Math.min(SCORE_HARD_CEILING, Math.floor(score * heatBonus));
        }
    }

    return {
        ok: true, score,
        kills, time, level, gold, fragments, // raw values (for score / leaderboard display)
        goldForLedger, killsForLedger, fragmentsForLedger, // ledger values (= raw in S6)
        endlessGoldCapped, endlessKillsCapped, fragmentsCapped, isEndless,
        isRaidRun, isMeteorRun, // damage-only arenas — excluded from RunScore + squad kill credit
        // Honored season (client stamp if strictly older, else server current). RunScore
        // will be stamped with this so a straddle-run lands on the correct leaderboard.
        runSeasonId,
        // Straddle back-date retired — always false. Kept for clarity; downstream code
        // checks this and falls through to server current period.
        seasonBackDated: false,
    };
}

// Compute the last ISO week id of a given season id (e.g. '2026-S7' → '2026-W28').
// Used to back-stamp week_id when honoring a client run-start season that's older
// than the server's current season. Seasons = 4 weeks each (see periodIds.js:
// seasonNum = floor((week - 1) / 4) + 1), so season N covers weeks (N-1)*4+1 .. N*4.
function lastWeekOfSeason(seasonId) {
    const m = /^(\d{4})-S(\d+)$/.exec(seasonId || '');
    if (!m) return null;
    const year = m[1];
    const seasonNum = Number(m[2]);
    const lastWeek = seasonNum * 4;
    return `${year}-W${String(lastWeek).padStart(2, '0')}`;
}

// 429-aware retry helper for Base44 entity calls. Base44 rate-limits aggressively
// during peak (saveScore + spendGold + getSquadProfile + getAdminData all share
// the same bucket). Without this, an endless run that 429s on PlayerSave.update
// or RunScore.create returns 500 → flushPendingScores re-queues it → loop.
// Retries 3× with exponential backoff (300ms → 700ms → 1500ms + jitter).
async function with429Retry(fn, label = 'op') {
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            const status = err?.status || err?.response?.status;
            const msg = String(err?.message || '').toLowerCase();
            const is429 = status === 429 || msg.includes('rate limit') || msg.includes('429');
            if (!is429 || attempt === 3) throw err;
            const backoff = 300 * Math.pow(2, attempt) + Math.random() * 200;
            console.warn(`[saveScore] ${label} 429 — retry ${attempt + 1}/3 after ${Math.round(backoff)}ms`);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw lastErr;
}

// Sanitise per-enemy kill counts: cap to validated total kills.
function sanitiseEnemyKills(rawEnemyKills, capTotal) {
    if (!rawEnemyKills || typeof rawEnemyKills !== 'object') return {};
    const out = {};
    let runningSum = 0;
    for (const [id, count] of Object.entries(rawEnemyKills)) {
        const n = Math.max(0, Math.floor(Number(count) || 0));
        if (n === 0) continue;
        const allowed = Math.max(0, capTotal - runningSum);
        const capped = Math.min(n, allowed);
        if (capped > 0) {
            out[id] = capped;
            runningSum += capped;
        }
    }
    return out;
}

// Daily Tasks — server-side definitions. Must mirror the labels in DailyTasksPanel.
// All targets are tuned to be completable in 5–15 minutes of normal play.
const DAILY_TASKS_DEFINITIONS = [
    { id: 'dt_first_run',     desc: 'Complete 1 run',                target: 1,   rewardGold: 200, rewardFragments: 0, type: 'play' },
    { id: 'dt_sector_sweep',  desc: 'Survive 60s in a single run',   target: 60,  rewardGold: 300, rewardFragments: 0, type: 'survive' },
    { id: 'dt_kill_streak',   desc: 'Get 100 kills in one run',      target: 100, rewardGold: 250, rewardFragments: 1, type: 'killsRun' },
    { id: 'dt_level_up',      desc: 'Reach level 10 in one run',     target: 10,  rewardGold: 400, rewardFragments: 0, type: 'level' },
    { id: 'dt_diversity',     desc: 'Play 2 different characters',   target: 2,   rewardGold: 500, rewardFragments: 1, type: 'characters' },
];

// Ensure the dailyTasks container exists and is fresh for today (UTC).
// If it's a new day, reset all tasks. Endless runs DO NOT reset/spawn tasks.
function ensureDailyTasks(s) {
    const today = new Date().toISOString().split('T')[0];
    if (!s.dailyTasks || s.dailyTasks.date !== today) {
        s.dailyTasks = {
            date: today,
            tasks: DAILY_TASKS_DEFINITIONS.map(d => ({ ...d, progress: 0, claimed: false })),
            charactersPlayed: []
        };
    } else {
        // Backfill any newly-added task definitions if a player's container is from an earlier today.
        const existingIds = new Set((s.dailyTasks.tasks || []).map(t => t.id));
        for (const def of DAILY_TASKS_DEFINITIONS) {
            if (!existingIds.has(def.id)) {
                s.dailyTasks.tasks.push({ ...def, progress: 0, claimed: false });
            }
        }
        if (!Array.isArray(s.dailyTasks.charactersPlayed)) s.dailyTasks.charactersPlayed = [];
    }
}

// Update daily task progress. Endless runs ARE counted (these are tiny/easy goals,
// not currency-sensitive bounties — anti-farm matters less here and excluding them
// would frustrate endless-only players).
function updateDailyTaskProgress(s, run, charId) {
    ensureDailyTasks(s);
    // Track unique characters played today
    if (charId && !s.dailyTasks.charactersPlayed.includes(charId)) {
        s.dailyTasks.charactersPlayed.push(charId);
    }
    const charsCount = s.dailyTasks.charactersPlayed.length;

    s.dailyTasks.tasks = s.dailyTasks.tasks.map(t => {
        if (t.claimed) return t;
        const updated = { ...t };
        if (t.type === 'play') {
            updated.progress = Math.min(t.target, Number(t.progress || 0) + 1);
        } else if (t.type === 'survive') {
            if (run.time > Number(t.progress || 0)) updated.progress = Math.min(t.target, Math.floor(run.time));
        } else if (t.type === 'killsRun') {
            if (run.kills > Number(t.progress || 0)) updated.progress = Math.min(t.target, run.kills);
        } else if (t.type === 'level') {
            if (run.level > Number(t.progress || 0)) updated.progress = Math.min(t.target, run.level);
        } else if (t.type === 'characters') {
            updated.progress = Math.min(t.target, charsCount);
        }
        return updated;
    });
}

// Update bounty + daily mission progress in-place. Server is source of truth (Phase 3f).
// Endless runs are EXCLUDED from gold + play bounty progress (anti-farm).
function updateBountyProgress(s, run, isEndless) {
    const stats = {
        kills: run.kills,
        time: run.time,
        level: run.level,
        gold: run.gold,
    };

    const apply = (b) => {
        if (!b || b.claimed) return;
        if (b.type === 'kills') {
            b.progress = Number(b.progress || 0) + stats.kills;
        } else if (b.type === 'survive') {
            if (stats.time > Number(b.progress || 0)) b.progress = stats.time;
        } else if (b.type === 'gold') {
            // Endless runs cannot progress "earn X gold (single run)" bounties — was being farmed
            if (isEndless) return;
            if (stats.gold > Number(b.progress || 0)) b.progress = stats.gold;
        } else if (b.type === 'level') {
            if (stats.level > Number(b.progress || 0)) b.progress = stats.level;
        } else if (b.type === 'play') {
            // Endless runs no longer count toward "Play X runs" bounty (was being cycled)
            if (isEndless) return;
            b.progress = Number(b.progress || 0) + 1;
        }
    };

    if (s.bounties) {
        if (Array.isArray(s.bounties.active)) {
            s.bounties.active = s.bounties.active.map(b => { const c = { ...b }; apply(c); return c; });
        }
        if (s.bounties.dailyMission) {
            const c = { ...s.bounties.dailyMission };
            apply(c);
            s.bounties.dailyMission = c;
        }
    }
}

// Apply run results to PlayerSave server-side. Returns updated save_data.
function applyRunToSave(save, run, isVictory, charId, isEndless) {
    const s = { ...save };

    // Currencies — use capped values from validation (endless caps applied here)
    s.gold = Number(s.gold || 0) + run.gold;
    s.totalGoldEarned = Number(s.totalGoldEarned || 0) + run.gold;

    // Relic fragments — picked up in-run, server is the SOLE writer to PlayerSave.relicFragments.
    // (Client cannot bump this via syncSave; previous architecture lost legitimate pickups.)
    if (run.fragments > 0) {
        s.relicFragments = Number(s.relicFragments || 0) + run.fragments;
    }

    // Kills
    const prevTotalKills = Number(s.totalKills || 0);
    const newTotalKills = prevTotalKills + run.kills;
    s.totalKills = newTotalKills;

    // Per-player daily kills — authoritative server-side counter so the squad
    // profile can display reliable per-member "today" totals without scanning
    // RunScore (which gets soft-deleted by the keep-top-scores cleanup cron,
    // causing the squad page to drop legit daily kills — Texxy 2026-05-16).
    // Resets at UTC midnight, mirroring squad.daily_kills.
    const todayUtc = new Date().toISOString().split('T')[0];
    const prevDailyDate = s.dailyKillsDate || '';
    if (prevDailyDate !== todayUtc) {
        s.dailyKills = 0;
        s.dailyKillsDate = todayUtc;
    }
    s.dailyKills = Number(s.dailyKills || 0) + run.kills;

    s.characterKills = { ...(s.characterKills || {}) };
    s.characterKills[charId] = Number(s.characterKills[charId] || 0) + run.kills;

    if (run.enemyKills) {
        s.enemyKills = { ...(s.enemyKills || {}) };
        for (const [id, n] of Object.entries(run.enemyKills)) {
            s.enemyKills[id] = Number(s.enemyKills[id] || 0) + n;
        }
    }

    // High-water marks
    s.maxTimeSurvived = Math.max(Number(s.maxTimeSurvived || 0), run.time);
    s.maxLevelReached = Math.max(Number(s.maxLevelReached || 0), run.level);

    // Discovery
    if (Array.isArray(run.encountered) && run.encountered.length > 0) {
        s.encounteredEnemies = [...new Set([...(s.encounteredEnemies || []), ...run.encountered])];
    }

    // Arena progression on victory (skip endless / world boss runs)
    let unlockedArena = null;
    if (isVictory && run.arena_id && run.arena_id !== 'endless') {
        const idx = ARENA_ORDER.indexOf(run.arena_id);
        if (idx >= 0 && idx < ARENA_ORDER.length - 1) {
            const nextArena = ARENA_ORDER[idx + 1];
            const map = { ...(s.unlockedArenasByCharacter || {}) };
            const charArenas = Array.isArray(map[charId]) ? [...map[charId]] : ['station'];
            if (!charArenas.includes(nextArena)) {
                // Backfill: ensure all prior arenas in ARENA_ORDER are present (self-heal any gaps from legacy bugs).
                for (let i = 0; i <= idx + 1; i++) {
                    const arena = ARENA_ORDER[i];
                    if (!charArenas.includes(arena)) {
                        charArenas.push(arena);
                    }
                }
                charArenas.sort((a, b) => ARENA_ORDER.indexOf(a) - ARENA_ORDER.indexOf(b));
                unlockedArena = nextArena;
            }
            map[charId] = charArenas;
            s.unlockedArenasByCharacter = map;
        }
        // NG+ branch removed 2026-06-04 — NG+ was retired and `newGamePlusUnlocked`
        // is no longer read anywhere. Outer Galaxy extends the natural unlock chain
        // through S20 instead of triggering a separate prestige flag.
    }

    // Character milestone unlocks (random)
    let grantedCharacter = null;
    const prevCrossed = KILL_MILESTONES.filter(m => prevTotalKills >= m);
    const newCrossed = KILL_MILESTONES.filter(m => newTotalKills >= m);
    const newlyCrossed = newCrossed.filter(m => !prevCrossed.includes(m));
    if (newlyCrossed.length > 0) {
        const unlocked = Array.isArray(s.unlockedCharacters) ? [...s.unlockedCharacters] : ['neobyte'];
        for (const _milestone of newlyCrossed) {
            const available = ALL_CHARACTER_IDS.filter(id => !unlocked.includes(id));
            if (available.length === 0) break;
            const pick = available[Math.floor(Math.random() * available.length)];
            unlocked.push(pick);
            grantedCharacter = pick;
        }
        s.unlockedCharacters = unlocked;
    }

    // Bounty / daily mission progress (Phase 3f). Endless excluded from gold/play bounties.
    updateBountyProgress(s, run, isEndless);

    // Daily Tasks progress — easy 5–15 min goals shown on Star Ops page.
    updateDailyTaskProgress(s, run, charId);

    s.updated_at = Date.now();
    return { saveData: s, unlockedArena, grantedCharacter };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS (doesn't return null) when there's no auth context —
        // catch it and surface a clean 401 instead of a 500 that flushPendingScores
        // would then re-queue forever.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Please sign in to save your score.' }, { status: 401 });

        const walletAddress = me.wallet_address;
        if (!walletAddress) return Response.json({ error: 'Your wallet isn\'t linked yet. Sign in with OmenX to continue.' }, { status: 400 });

        const { scoreData, squadStats } = await req.json();
        if (!scoreData) return Response.json({ error: 'Couldn\'t save your run — missing data. Please try again.' }, { status: 400 });

        // S8 Sandbox mode — client-flagged practice runs get one-way rejected here
        // before ANY score/kill/gold/fragment mutation. Defensive design: a client
        // that omits the flag just gets a normal run (no exploit), but a client
        // that SETS it can never leak rewards through. See PLAN_SANDBOX_TEST_PLAY.md.
        if (scoreData.is_sandbox === true) {
            console.log(`[saveScore] Sandbox run from ${walletAddress} — no rewards recorded`);
            return Response.json({ success: false, sandbox: true, reason: 'sandbox' });
        }

        // Validate stats and recompute score server-side
        const validation = validateAndRecompute(scoreData);
        if (!validation.ok) {
            console.warn(`[saveScore] REJECTED tampered run from ${walletAddress}: ${validation.reason}`);
            return Response.json({ error: 'Your run couldn\'t be validated and wasn\'t saved.' }, { status: 400 });
        }

        // Silent per-wallet score multiplier (admin balance lever). Applied AFTER
        // all validation/caps so the leaderboard score reflects the buff but the
        // ledger (gold/kills/fragments) is untouched. Fully invisible to the client.
        // S5 ONLY — S6 is a clean-slate, no-bias season. All silent + staff buffs
        // auto-disable at S6 rollover (2026-05-18). Locked by request 2026-05-14.
        const { season_id: currentSeasonId } = getCurrentPeriodIds();
        const silentBuffsEnabled = currentSeasonId === '2026-S5';
        const silentMult = silentBuffsEnabled
            ? SILENT_SCORE_MULTIPLIERS[walletAddress.toLowerCase()]
            : undefined;
        if (silentMult && silentMult !== 1) {
            validation.score = Math.floor(validation.score * silentMult);
        }

        const isVictory = !!scoreData.is_victory;
        const charId = scoreData.character_id || 'neobyte';

        // Idempotency guard — protect against duplicate submissions caused by:
        //  • client refreshing mid-save (browser/proxy retries the in-flight POST),
        //  • flushPendingScores re-queuing a run whose first save actually succeeded,
        //  • double-tap on a "Try Again" button before the first save returned.
        // If an identical run (same wallet + time + kills + level + character) was
        // recorded in the last 2 minutes, treat THIS call as a no-op and return the
        // existing score data. PlayerSave is NOT credited again.
        let duplicateBlocked = false;
        let duplicateScore = 0;
        try {
            const recentRuns = await with429Retry(
                () => base44.asServiceRole.entities.RunScore.filter(
                    { wallet_address: walletAddress },
                    '-created_date',
                    10
                ),
                'dup-check'
            );
            const cutoff = Date.now() - 2 * 60 * 1000;
            const dup = recentRuns.find(r => {
                const createdMs = new Date(r.created_date).getTime();
                return createdMs >= cutoff
                    && Number(r.time_survived) === Number(validation.time)
                    && Number(r.kills) === Number(validation.kills)
                    && Number(r.level) === Number(validation.level)
                    && r.character_id === charId
                    && r.arena_id === scoreData.arena_id;
            });
            if (dup) {
                console.warn(`[saveScore] DUPLICATE blocked for ${walletAddress}: matches RunScore ${dup.id} created ${dup.created_date}. No re-credit.`);
                // Defer the response until AFTER we load the player's current save
                // (line 441 below). Previous code referenced `saveData` here, before
                // it was declared, causing a ReferenceError → 500 → flushPendingScores
                // re-queued the run forever (Texxy/Hugo bug 2026-05-04).
                duplicateBlocked = true;
                duplicateScore = dup.score;
            }
        } catch (dupErr) {
            console.error('[saveScore] dup-check failed (proceeding):', dupErr.message);
        }
        // Cap enemyKills total to the (possibly capped) ledger kills to keep aggregates consistent.
        const sanitisedEnemyKills = sanitiseEnemyKills(scoreData.enemyKills, validation.killsForLedger);

        // Apply run to PlayerSave (server-authoritative aggregation)
        const walletLower = walletAddress.toLowerCase();
        const records = await with429Retry(
            () => base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletLower }),
            'PlayerSave.filter'
        );
        if (records.length === 0) {
            return Response.json({ error: 'We couldn\'t find your save. Please refresh and try again.' }, { status: 400 });
        }
        const saveRecord = records[0];
        const saveData = typeof saveRecord.save_data === 'string'
            ? JSON.parse(saveRecord.save_data)
            : saveRecord.save_data;

        // Now that saveData is loaded, we can safely return the duplicate-blocked
        // response (was the source of the ReferenceError → infinite re-queue loop).
        if (duplicateBlocked) {
            return Response.json({
                success: true,
                score: duplicateScore,
                saveData,
                grantedCharacter: null,
                unlockedArena: null,
                goldCredited: 0,
                killsCredited: 0,
                fragmentsCredited: 0,
                duplicateBlocked: true,
            });
        }

        const { saveData: updatedSave, unlockedArena, grantedCharacter } = applyRunToSave(saveData, {
            kills: validation.killsForLedger,
            time: validation.time,
            level: validation.level,
            gold: validation.goldForLedger,
            fragments: validation.fragmentsForLedger,
            arena_id: scoreData.arena_id,
            encountered: Array.isArray(scoreData.encountered) ? scoreData.encountered : [],
            enemyKills: sanitisedEnemyKills,
        }, isVictory, charId, validation.isEndless);

        // Run finished cleanly — clear any cloud checkpoint snapshot so we don't
        // double-credit it on next launch via flushPendingScores.
        if (updatedSave.pendingRunSnapshot) {
            delete updatedSave.pendingRunSnapshot;
        }

        // Resolve current week/season ONCE, up-front — used by the weekly-kills
        // block (immediately below), the RunScore stamp, and the SquadWar filter.
        // Straddle back-date was removed 2026-07-13: runs always land on the
        // server's current period at the time the score is saved.
        const { week_id, season_id } = getCurrentPeriodIds();

        // Weekly sector kill counter — top-level field on PlayerSave so the
        // weekly-kills leaderboard can sort server-side without scanning save_data.
        // Only sector runs count (excludes endless / raid / meteor). Resets when
        // the stored week id no longer matches the current ISO week. RunScore is
        // unreliable here because it gets soft-deleted by the keep-top-scores cron.
        const _currentWeekId = week_id;
        const isSectorRun = !validation.isEndless && !validation.isRaidRun && !validation.isMeteorRun;
        const storedKillsWeek = saveRecord.weekly_sector_kills_week || '';
        const previousKills = Number(saveRecord.weekly_sector_kills) || 0;
        const isWeekRollover = storedKillsWeek && storedKillsWeek !== _currentWeekId && previousKills > 0;
        let weeklySectorKills = storedKillsWeek === _currentWeekId
            ? previousKills
            : 0;
        // Hold W21 at 0 until rollover; resume counting on W22+
        if (isSectorRun && _currentWeekId !== '2026-W21') weeklySectorKills += validation.killsForLedger;

        // Freeze the OLD week's kill total before we overwrite it. Without this,
        // the kill-leaderboard payout for the just-ended week silently drops any
        // player who plays a sector run in the new week before payouts run
        // (Hugo bug 2026-06-22 — Zebrina309 was #1-ish in W25, started a W26
        // run a few minutes after rollover, and disappeared from the W25 preview).
        // Idempotent: snapshot is keyed on (week_id, wallet_address); we update
        // in place if one already exists for this wallet+week.
        if (isWeekRollover) {
            try {
                const existing = await with429Retry(
                    () => base44.asServiceRole.entities.WeeklyKillSnapshot.filter({
                        week_id: storedKillsWeek,
                        wallet_address: walletLower,
                    }, '-created_date', 1),
                    'WeeklyKillSnapshot.filter'
                );
                const snapshotName = (saveData.player_name || saveRecord.player_name || `Pilot_${walletAddress.slice(-8).toUpperCase()}`).trim();
                if (existing && existing.length > 0) {
                    // Take the higher of the two (defends against stale rows from a
                    // partial earlier write). previousKills is the latest authoritative value.
                    const keep = Math.max(Number(existing[0].kills) || 0, previousKills);
                    if (keep > (Number(existing[0].kills) || 0)) {
                        await with429Retry(
                            () => base44.asServiceRole.entities.WeeklyKillSnapshot.update(existing[0].id, {
                                kills: keep,
                                player_name: snapshotName,
                            }),
                            'WeeklyKillSnapshot.update'
                        );
                    }
                } else {
                    await with429Retry(
                        () => base44.asServiceRole.entities.WeeklyKillSnapshot.create({
                            week_id: storedKillsWeek,
                            wallet_address: walletLower,
                            player_name: snapshotName,
                            kills: previousKills,
                            source: 'saveScore_rollover',
                        }),
                        'WeeklyKillSnapshot.create'
                    );
                }
                console.log(`[saveScore] Snapshotted ${storedKillsWeek} kills=${previousKills} for ${walletLower} (rollover to ${_currentWeekId})`);
            } catch (snapErr) {
                console.error('[saveScore] WeeklyKillSnapshot write failed (non-fatal):', snapErr.message);
            }
        }

        await with429Retry(
            () => base44.asServiceRole.entities.PlayerSave.update(saveRecord.id, {
                save_data: updatedSave,
                updated_at: Date.now(),
                weekly_sector_kills: weeklySectorKills,
                weekly_sector_kills_week: _currentWeekId,
            }),
            'PlayerSave.update'
        );

        // DailyActivityLog upsert — immutable per-day activity record so the
        // admin retention chart's historical bars don't shrink as players
        // come back on later days. PlayerSave.updated_at is a single
        // overwriting timestamp per player (no good for historical charts),
        // and RunScore gets soft-deleted by the keep-top-scores cron — so
        // this dedicated entity is the only stable source. Idempotent:
        // first save of the day creates a row, every subsequent save same
        // day is a no-op. Wrapped in try/catch — telemetry only, must not
        // affect score save.
        try {
            const dateKey = new Date().toISOString().split('T')[0];
            const existingDay = await base44.asServiceRole.entities.DailyActivityLog.filter({
                wallet_address: walletLower,
                date_key: dateKey,
            }, '-created_date', 1);
            if (!existingDay || existingDay.length === 0) {
                await base44.asServiceRole.entities.DailyActivityLog.create({
                    wallet_address: walletLower,
                    date_key: dateKey,
                    first_seen_ms: Date.now(),
                });
            }
        } catch (logErr) {
            console.warn('[saveScore] DailyActivityLog upsert failed (non-fatal):', logErr.message);
        }

        // week_id / season_id already resolved above (before weekly-kills block).

        // Authoritative player_name comes from PlayerSave (set via Profile page).
        // Ignore the client-submitted name entirely — it can contain the OAuth
        // full_name as a fallback. Fall back to Pilot_XXXXXXXX (8 chars) to avoid
        // collisions when different wallets share the same last 6 digits.
        const anonName = `Pilot_${walletAddress.slice(-8).toUpperCase()}`;
        const savedName = (saveData.player_name || saveRecord.player_name || '').trim();
        const safeName = savedName || anonName;

        // Chest cosmetic mirror — pulled from the freshly-saved profile so
        // other players see the player's equipped animated icon / LB frame /
        // title flair on the leaderboard. Server-side mirror (vs. trusting the
        // client) means a tampered client can't equip a cosmetic they don't own.
        const equippedProfile = updatedSave.profile || {};
        const ownedChest = updatedSave.owned_chest_cosmetics || [];
        const verifyOwned = (id) => (id && ownedChest.includes(id)) ? id : '';

        const runScore = {
            user_id: me.id,
            wallet_address: walletAddress,
            player_name: safeName,
            player_title: scoreData.player_title || '',
            pilot_icon: scoreData.pilot_icon || '',
            equipped_animated_icon: verifyOwned(equippedProfile.equipped_animated_icon),
            equipped_lb_frame:      verifyOwned(equippedProfile.equipped_lb_frame),
            equipped_title_style:   verifyOwned(equippedProfile.equipped_title_style),
            score: validation.score,
            time_survived: validation.time,
            level: validation.level,
            kills: validation.kills,
            // Gold tracking — `earned` is the raw client-reported value, `credited`
            // is what we actually applied to PlayerSave (may be lower for endless caps).
            // Lets the Gold Audit admin tool show per-run gold history.
            gold_earned: validation.gold,
            gold_credited: validation.goldForLedger,
            character_id: charId,
            arena_id: scoreData.arena_id,
            // run_type — written so future reads can filter by category without
            // scanning arena_id. Raid/meteor never reach here (skipped above), so
            // every row created from this point is either 'sector' or 'endless'.
            // Older RunScore rows lack this field until a backfill runs.
            run_type: validation.isEndless ? 'endless' : 'sector',
            // Sanitise client-supplied difficulty against the known enum so
            // the entity write never fails on a malformed value.
            difficulty: ['easy', 'normal', 'hard', 'cosmic'].includes(String(scoreData.difficulty || '').toLowerCase())
                ? String(scoreData.difficulty).toLowerCase()
                : 'normal',
            week_id,
            season_id,
        };

        // Raid + Meteor runs are damage-contribution only — DO NOT create a RunScore
        // entry. RunScore is what powers weekly/seasonal/endless/squad leaderboards,
        // so writing one for raid/meteor would leak their score into those boards
        // (which players noticed and flagged 2026-05-13). Raid is tracked via
        // GlobalBossContribution, meteor via SquadMeteorAttack — both separate.
        if (!validation.isRaidRun && !validation.isMeteorRun) {
            try {
                await with429Retry(
                    () => base44.asServiceRole.entities.RunScore.create(runScore),
                    'RunScore.create'
                );
            } catch (err) {
                console.error('[saveScore] RunScore save failed:', err.message);
                // Save was already applied; return success with warning
            }
            // Immutable run history log — tiny mirror of (wallet, character,
            // arena, date_key) that survives the keep-top-scores cleanup cron.
            // Admin metrics "top characters / top arenas" reads from this so
            // the totals don't shrink when RunScore rows get pruned.
            // Telemetry only — failure must not block save.
            try {
                await base44.asServiceRole.entities.RunHistoryLog.create({
                    wallet_address: walletLower,
                    character_id: charId,
                    arena_id: scoreData.arena_id,
                    date_key: new Date().toISOString().split('T')[0],
                });
            } catch (logErr) {
                console.warn('[saveScore] RunHistoryLog create failed (non-fatal):', logErr.message);
            }
        }

        // Update squad kills if applicable — use ledger-capped kills (endless capped, others raw)
        let squadIdToUpdate = squadStats?.squadId || null;
        if (!squadIdToUpdate) {
            try {
                const memberRecords = await base44.asServiceRole.entities.SquadMember.filter({ wallet_address: walletAddress });
                if (memberRecords && memberRecords.length > 0) {
                    squadIdToUpdate = memberRecords[0].squad_id;
                }
            } catch (err) {
                console.log('[saveScore] Could not fetch squad membership:', err.message);
            }
        }

        // Raid + Meteor: kills are already zeroed (validation), but also skip the
        // squad write entirely so neither arena ever bumps squad weekly_kills or
        // daily_kills (squad leaderboard hygiene + skips a pointless DB read/write).
        if (squadIdToUpdate && !validation.isRaidRun && !validation.isMeteorRun) {
            const today = new Date().toISOString().split('T')[0];
            const killsToAdd = validation.killsForLedger;
            try {
                // Parallelize the two reads (Squad.get + SquadWar.filter) — they're
                // independent and previously ran sequentially, doubling the latency
                // window during which other requests pile up against the rate limit.
                // Endless runs skip the war read entirely (anti-farm — wars aren't
                // credited from endless mode anyway).
                const skipWar = validation.isEndless;
                const [squad, activeWars] = await Promise.all([
                    base44.asServiceRole.entities.Squad.get(squadIdToUpdate),
                    skipWar
                        ? Promise.resolve([])
                        : base44.asServiceRole.entities.SquadWar.filter({ week_id, is_resolved: false }).catch(err => {
                            console.error('[saveScore] SquadWar fetch failed:', err.message);
                            return [];
                        }),
                ]);

                // Daily-kills reset logic — MUST match squadActions resetPeriods (line 719).
                // Only wipe if the stored day is STRICTLY BEHIND today. Previous code
                // used `!==`, which also wiped when current_day was '', null, or a
                // future-stamped corrupt value from an older buggy client — causing
                // daily_kills to appear to "reset a double time" because two members'
                // concurrent saves could each see a stale pre-reset squad row and
                // each wipe to 0 + their own kills, losing the other member's
                // contribution (Texxy bug 2026-05-15).
                const storedDay = squad.current_day || '';
                const dayBehindToday = storedDay && storedDay < today;
                const dailyKillsReset = dayBehindToday ? 0 : (squad.daily_kills || 0);
                const myWar = skipWar ? null : activeWars.find(w => w.squad_a_id === squadIdToUpdate || w.squad_b_id === squadIdToUpdate);

                // Parallelize the two writes too — Squad.update and SquadWar.update
                // touch different rows and don't depend on each other.
                const writes = [
                    base44.asServiceRole.entities.Squad.update(squadIdToUpdate, {
                        weekly_kills: (squad.weekly_kills || 0) + killsToAdd,
                        daily_kills: dailyKillsReset + killsToAdd,
                        current_day: today,
                    }),
                ];
                if (myWar) {
                    const isSideA = myWar.squad_a_id === squadIdToUpdate;
                    const patch = isSideA
                        ? { kills_a: (myWar.kills_a || 0) + killsToAdd }
                        : { kills_b: (myWar.kills_b || 0) + killsToAdd };
                    writes.push(
                        with429Retry(
                            () => base44.asServiceRole.entities.SquadWar.update(myWar.id, patch),
                            'SquadWar.update'
                        ).catch(warErr => {
                            console.error('[saveScore] SquadWar update failed after retries:', warErr.message);
                        })
                    );

                    // Per-member war contribution — incremental upsert into
                    // SquadWarMemberKill. Keeps an accurate breakdown that survives
                    // RunScore cleanup. Filter→create-or-update by (war_id, wallet).
                    writes.push((async () => {
                        try {
                            const existing = await with429Retry(
                                () => base44.asServiceRole.entities.SquadWarMemberKill.filter({
                                    war_id: myWar.id,
                                    wallet_address: walletLower,
                                }, '-created_date', 1),
                                'SquadWarMemberKill.filter'
                            );
                            if (existing && existing.length > 0) {
                                const row = existing[0];
                                await with429Retry(
                                    () => base44.asServiceRole.entities.SquadWarMemberKill.update(row.id, {
                                        kills: (Number(row.kills) || 0) + killsToAdd,
                                        player_name: safeName,
                                    }),
                                    'SquadWarMemberKill.update'
                                );
                            } else {
                                await with429Retry(
                                    () => base44.asServiceRole.entities.SquadWarMemberKill.create({
                                        war_id: myWar.id,
                                        squad_id: squadIdToUpdate,
                                        week_id,
                                        wallet_address: walletLower,
                                        player_name: safeName,
                                        kills: killsToAdd,
                                    }),
                                    'SquadWarMemberKill.create'
                                );
                            }
                        } catch (mkErr) {
                            console.error('[saveScore] SquadWarMemberKill upsert failed:', mkErr.message);
                        }
                    })());
                }
                await Promise.all(writes);

                console.log(`[saveScore] Squad ${squadIdToUpdate} +${killsToAdd} kills (weekly=${(squad.weekly_kills || 0) + killsToAdd}, daily=${dailyKillsReset + killsToAdd})${myWar ? ` + War ${myWar.id}` : ''}`);
            } catch (err) {
                console.error('[saveScore] Squad update failed:', err.message);
            }
        }

        if (validation.endlessGoldCapped) console.log(`[saveScore] ${walletAddress} ENDLESS gold capped: raw=${validation.gold} → ledger=${validation.goldForLedger}`);
        if (validation.endlessKillsCapped) console.log(`[saveScore] ${walletAddress} ENDLESS kills capped: raw=${validation.kills} → ledger=${validation.killsForLedger}`);
        if (validation.fragmentsCapped) console.log(`[saveScore] ${walletAddress} fragments capped: raw=${validation.fragments} → ledger=${validation.fragmentsForLedger}`);
        console.log(`[saveScore] ${walletAddress} score=${validation.score} kills=${validation.kills} gold=${validation.goldForLedger} fragments=${validation.fragmentsForLedger} victory=${isVictory} endless=${validation.isEndless}${grantedCharacter ? ` granted=${grantedCharacter}` : ''}${unlockedArena ? ` unlockedArena=${unlockedArena}` : ''}`);
        return Response.json({
            success: true,
            score: validation.score,
            saveData: updatedSave,
            grantedCharacter,
            unlockedArena,
            // Tell client what was actually credited (may be < raw values for endless mode).
            goldCredited: validation.goldForLedger,
            killsCredited: validation.killsForLedger,
            fragmentsCredited: validation.fragmentsForLedger,
            // Server-validated time (may be clamped to arena duration on S5 sectors —
            // engine's this.time keeps ticking past arena duration during the final boss
            // fight). Returning this so the end-of-run modal matches the leaderboard
            // exactly. Without it, the modal showed engine.time (e.g. 7:51) while the
            // RunScore stored the clamped value (7:30), confusing leaderboard #1 players.
            timeSurvived: validation.time,
            endlessGoldCapped: !!validation.endlessGoldCapped,
            endlessKillsCapped: !!validation.endlessKillsCapped,
            fragmentsCapped: !!validation.fragmentsCapped,
        });
    } catch (error) {
        console.error('[saveScore]', error.message);
        return Response.json({ error: 'Something went wrong saving your score. Please try again.' }, { status: 500 });
    }
});