import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { OmenXServerSDK } from 'npm:@omen.foundation/game-sdk@1.0.33';

// Service-role db client — set inside the request handler from
// createClientFromRequest(req).asServiceRole. Module-level let so the helper
// functions further down can use it without threading through every call.
// CRITICAL: previously used `createClient({ appId })` which is unauthenticated
// and CANNOT read AdminWallet (admin-only RLS). That silently returned [] →
// staff payouts never fired. Now uses asServiceRole which bypasses RLS.
let db = null;

// S7 pool re-split gate (2026-06-04). Periods >= S7 use AppConfig-driven pool
// %s (15% weekly + 20% seasonal + new 5% weekly kill pool); earlier periods
// keep the legacy 20/30 / no kill pool split untouched. See docs/OMENX_POOL_RESPLIT_PLAN.md.
const NEW_POOL_SEASON = '2026-S7';
function getPeriodSeason(period_id, period_type) {
    if (period_type === 'seasonal') return period_id;
    const m = String(period_id || '').match(/^(\d{4})-W(\d{1,2})$/);
    if (!m) return null;
    const seasonNum = Math.floor((Number(m[2]) - 1) / 4) + 1;
    return m[1] + '-S' + seasonNum;
}
function isNewPoolPeriod(period_id, period_type) {
    const s = getPeriodSeason(period_id, period_type);
    if (!s) return false;
    // Numeric compare — string compare breaks at 2026-S10 vs 2026-S7 ('1' < '7').
    const m = s.match(/^(\d{4})-S(\d{1,2})$/);
    if (!m) return false;
    const year = Number(m[1]);
    const seas = Number(m[2]);
    if (year > 2026) return true;
    if (year < 2026) return false;
    return seas >= 7;
}

const GAME_ID = 'cosmic-sloths';
const GAME_NAME = 'Cosmic Sloths';
const MAX_PAYOUT_PER_PLAYER_CAP = 10000;

Deno.serve(async (req) => {
    try {
        const body = await req.json();
        const { adminKey } = body;

        const base44 = createClientFromRequest(req);
        // Always use service-role for entity reads/writes inside this function —
        // we read AdminWallet (admin-only RLS) and write PayoutLog (admin-only).
        db = base44.asServiceRole;

        // Auth: emergency admin key (used by automation/cron), OR Base44 session + 'distribute_rewards' permission.
        if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
            const me = await base44.auth.me();
            if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            const callerWallet = me.wallet_address?.toLowerCase();
            if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
            const records = await db.entities.AdminWallet.filter({ wallet_address: callerWallet });
            if (records.length === 0) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });
            const perms = records[0].permissions || [];
            if (!perms.includes('distribute_rewards') && !perms.includes('owner')) {
                return Response.json({ error: "Forbidden — 'distribute_rewards' permission required" }, { status: 403 });
            }
        }

        const apiKey = Deno.env.get('OMENX_REWARDS_API_KEY');
        const apiBaseUrl = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        const sdk = new OmenXServerSDK({ apiKey, apiBaseUrl });

        const rewardsKeys = [
            Deno.env.get('OMENX_REWARDS_API_KEY'),
            Deno.env.get('OMENX_REWARDS_API_KEY_2'),
            Deno.env.get('OMENX_REWARDS_API_KEY_3'),
            Deno.env.get('OMENX_REWARDS_API_KEY_4'),
        ].filter(Boolean);

        // Proper ISO 8601 (Mon-start, Sun 23:59 UTC end). Old formula rolled over a day early on Sundays.
        const getCurrentPeriodIds = () => {
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
        };
        const { week_id: currentWeekId, season_id: currentSeasonId } = getCurrentPeriodIds();

        const reconcilePoolBeforeDistribution = async (pool) => {
            const filterKey = pool.period_type === 'weekly' ? { week_id: pool.period_id } : { season_id: pool.period_id };
            const logs = await db.entities.TokenSpendLog.filter(filterKey);
            // Exclude admin self-purchases from the reconciled total — they were
            // intentionally not added to the TokenPool in purchaseSku, so summing
            // them here would re-introduce them and undo the exclusion.
            const logTotal = logs
                .filter(log => !log.excluded_from_pool)
                .reduce((sum, log) => sum + (log.amount || 0), 0);
            if (Math.abs(logTotal - pool.total_spent) > 0.01) {
                console.warn(`[distributeRewards] MISMATCH: ${pool.period_id} pool=${pool.total_spent}, logs=${logTotal}. Auto-correcting...`);
                await db.entities.TokenPool.update(pool.id, { total_spent: logTotal });
                pool.total_spent = logTotal;
            }
        };

        const undistributedPools = await db.entities.TokenPool.filter({ distributed: false });
        const results = [];

        for (const pool of undistributedPools) {
            const isClosedWeekly = pool.period_type === 'weekly' && pool.period_id !== currentWeekId;
            const isClosedSeasonal = pool.period_type === 'seasonal' && pool.period_id !== currentSeasonId;

            if (!isClosedWeekly && !isClosedSeasonal) {
                results.push({ pool: pool.period_id, type: pool.period_type, skipped: 'current period not yet closed' });
                continue;
            }

            const freshPool = await db.entities.TokenPool.get(pool.id);
            if (freshPool.distributed) {
                results.push({ pool: pool.period_id, type: pool.period_type, skipped: 'already distributed' });
                continue;
            }

            if (isClosedWeekly) {
                try {
                    await reconcilePoolBeforeDistribution(pool);
                    const result = await distributeWeekly(sdk, pool, apiBaseUrl, rewardsKeys);
                    results.push({ pool: pool.period_id, type: 'weekly', ...result });
                } catch (err) {
                    console.error('[distributeRewards] WEEKLY FAILED:', err.message);
                    results.push({ pool: pool.period_id, type: 'weekly', error: err.message });
                }
            } else if (isClosedSeasonal) {
                try {
                    await reconcilePoolBeforeDistribution(pool);
                    const result = await distributeSeasonal(sdk, pool, apiBaseUrl, rewardsKeys);
                    results.push({ pool: pool.period_id, type: 'seasonal', ...result });
                } catch (err) {
                    console.error('[distributeRewards] SEASONAL FAILED:', err.message);
                    results.push({ pool: pool.period_id, type: 'seasonal', error: err.message });
                }
            }
        }

        return Response.json({ success: true, results });
    } catch (error) {
        console.error('[distributeRewards]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

// Payouts are configurable via AppConfig key 'leaderboard_payout_config'.
// Falls back to these defaults if no config exists. Owner edits via
// functions/leaderboardPayoutConfig (admin panel: AdminLeaderboardPayoutConfig).
const DEFAULT_PAYOUT_CONFIG = {
    top_n: 20,
    weekly_pool_pct: 0.15,
    seasonal_pool_pct: 0.20,
    kill_pool_pct: 0.05,
    weekly_tiers: [
        { min: 1,  max: 1,  pct: 0.10 },
        { min: 2,  max: 2,  pct: 0.08 },
        { min: 3,  max: 3,  pct: 0.06 },
        { min: 4,  max: 10, pct: 0.04 },
        { min: 11, max: 20, pct: 0.03 },
    ],
    seasonal_tiers: [
        { min: 1,  max: 1,  pct: 0.10 },
        { min: 2,  max: 2,  pct: 0.075 },
        { min: 3,  max: 3,  pct: 0.06 },
        { min: 4,  max: 10, pct: 0.032 },
        { min: 11, max: 20, pct: 0.022 },
    ],
    weekly_kill_tiers: [
        { min: 1,  max: 1,  pct: 0.15 },
        { min: 2,  max: 2,  pct: 0.10 },
        { min: 3,  max: 3,  pct: 0.08 },
        { min: 4,  max: 10, pct: 0.05 },
        { min: 11, max: 20, pct: 0.025 },
    ],
};

async function loadPayoutConfig() {
    try {
        const rows = await db.entities.AppConfig.filter({ key: 'leaderboard_payout_config' });
        return rows[0]?.value || DEFAULT_PAYOUT_CONFIG;
    } catch {
        return DEFAULT_PAYOUT_CONFIG;
    }
}

function makeTierLookup(tiers) {
    return (rank) => {
        const t = tiers.find(t => rank >= t.min && rank <= t.max);
        return t ? t.pct : 0;
    };
 }

 function getSeasonalRewardPercentage(rank) {
     if (rank === 1) return 0.10;
     if (rank === 2) return 0.075;
     if (rank === 3) return 0.06;
     if (rank >= 4 && rank <= 10) return 0.032;
     if (rank >= 11 && rank <= 20) return 0.022;
     return 0;
 }

const CHUNK_SIZE = 20;

// Rank-tier buckets — each tier becomes its own batch (and own OmenX TX),
// so the batch-level `note` describes the exact rank or rank band being paid.
// Top 3 get individual labels ("Rank #1", "Rank #2", "Rank #3"); the rest get
// band labels ("Ranks #4–10", etc). Out-of-band payments fall through to a
// generic "Other" tier (shouldn't happen — top 20 is capped — but safe fallback).
function rankTierLabel(rank) {
    if (rank === 1) return { key: 'r1',   label: 'Rank #1' };
    if (rank === 2) return { key: 'r2',   label: 'Rank #2' };
    if (rank === 3) return { key: 'r3',   label: 'Rank #3' };
    if (rank >= 4  && rank <= 10) return { key: 'r4-10',  label: 'Ranks #4–10' };
    if (rank >= 11 && rank <= 20) return { key: 'r11-20', label: 'Ranks #11–20' };
    return { key: 'other', label: `Rank #${rank}` };
}

// Group ranked payments into tier buckets and send each tier as its own batch
// so the OmenX-side transaction note reflects the recipient's rank/band.
// Preserves ordering within tiers (rank ascending). Returns combined tx ids + chunk count.
async function grantTieredBatches(payments, apiBaseUrl, rewardsKeys, gameId, gameName, baseNote) {
    if (payments.length === 0) return { txId: '', chunks: 0 };
    const tiers = new Map(); // key -> { label, payments[] }
    for (const p of payments) {
        const { key, label } = rankTierLabel(p.rank);
        if (!tiers.has(key)) tiers.set(key, { label, payments: [] });
        tiers.get(key).payments.push(p);
    }
    // Preserve tier order: r1, r2, r3, r4-10, r11-20, other
    const order = ['r1', 'r2', 'r3', 'r4-10', 'r11-20', 'other'];
    const allTxIds = [];
    let totalChunks = 0;
    for (const key of order) {
        const tier = tiers.get(key);
        if (!tier) continue;
        const tierNote = `${baseNote} — ${tier.label}`;
        const { txId, chunks } = await grantBatchChunked(tier.payments, apiBaseUrl, rewardsKeys, gameId, gameName, tierNote);
        if (txId) allTxIds.push(txId);
        totalChunks += chunks;
    }
    return { txId: allTxIds.join(','), chunks: totalChunks };
}

async function grantBatchChunked(allPayments, apiBaseUrl, rewardsKeys, gameId, gameName, note) {
    if (allPayments.length === 0) return { txId: '', chunks: 0 };
    const chunks = [];
    for (let i = 0; i < allPayments.length; i += CHUNK_SIZE) {
        chunks.push(allPayments.slice(i, i + CHUNK_SIZE));
    }
    const txIds = [];
    for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        // Rotate keys per chunk + retry on 429/5xx across the pool
        const startIdx = ci % rewardsKeys.length;
        let lastErr = null;
        let ok = false;
        for (let attempt = 0; attempt < rewardsKeys.length; attempt++) {
            const key = rewardsKeys[(startIdx + attempt) % rewardsKeys.length];
            const response = await fetch(`${apiBaseUrl}/v1/game-rewards/grant-batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify({
                    payments: chunk.map(p => ({ walletAddress: p.walletAddress, amount: p.amount })),
                    gameId, gameName, note: `${note} chunk ${ci + 1}/${chunks.length}`,
                }),
            });
            const batchResult = await response.json().catch(() => ({}));
            if (response.ok) {
                txIds.push(batchResult?.transactionId || batchResult?.txHash || '');
                ok = true;
                break;
            }
            lastErr = `HTTP ${response.status}: ${JSON.stringify(batchResult)}`;
            console.warn(`[distributeRewards] chunk ${ci + 1} key ${attempt + 1} failed:`, lastErr);
            if (response.status !== 429 && response.status < 500) break; // don't retry on 4xx (other than 429)
        }
        if (!ok) throw new Error(`Chunk ${ci + 1}/${chunks.length} failed: ${lastErr}`);
    }
    return { txId: txIds.join(','), chunks: chunks.length };
}

function buildRankedPayments(scores, rewardPool, getPercentageFn, maxRank) {
    const uniqueScores = [];
    const seenWallets = new Set();
    const seenUserIds = new Set();
    for (const score of scores) {
        if (uniqueScores.length >= maxRank) break;
        const wallet = score.wallet_address;
        const userId = score.user_id;
        if (!wallet) continue;
        if (seenWallets.has(wallet)) continue;
        if (userId && seenUserIds.has(userId)) continue;
        seenWallets.add(wallet);
        if (userId) seenUserIds.add(userId);
        uniqueScores.push(score);
    }
    let totalPct = 0;
    for (let i = 0; i < uniqueScores.length; i++) totalPct += getPercentageFn(i + 1);
    if (totalPct === 0 || uniqueScores.length === 0) return [];
    const multiplier = 1 / totalPct;
    const payments = [];
    for (let i = 0; i < uniqueScores.length; i++) {
        let amount = Math.floor(rewardPool * getPercentageFn(i + 1) * multiplier);
        amount = Math.min(amount, MAX_PAYOUT_PER_PLAYER_CAP);
        if (amount >= 1) {
            payments.push({ walletAddress: uniqueScores[i].wallet_address, amount, rank: i + 1, player_name: uniqueScores[i].player_name });
        }
    }
    return payments;
}

async function distributeWeekly(sdk, pool, apiBaseUrl, rewardsKeys) {
     if (!pool.total_spent || pool.total_spent <= 0) {
         await db.entities.TokenPool.update(pool.id, { distributed: true });
         return { paid: 0, skipped: 'zero spend' };
     }
     const adminWallets = await db.entities.AdminWallet.list();
     // Staff % is configurable by owners via setStaffPayoutPct. Falls back to 2%.
     let STAFF_PCT_PER_WALLET = 0.02;
     try {
         const cfg = await db.entities.AppConfig.filter({ key: 'staff_pct_per_wallet' });
         const v = Number(cfg[0]?.value?.pct);
         if (isFinite(v) && v >= 0 && v <= 0.10) STAFF_PCT_PER_WALLET = v;
     } catch {}
     // S7 gate — periods >= S7 use config-driven pool %; earlier use legacy 20%.
     const useNewPools = isNewPoolPeriod(pool.period_id, 'weekly');
     const cfg = await loadPayoutConfig();
     const weeklyPoolPct = useNewPools
         ? (Number.isFinite(Number(cfg.weekly_pool_pct)) ? Number(cfg.weekly_pool_pct) : 0.15)
         : 0.20;
     const rewardPool = Math.floor(pool.total_spent * weeklyPoolPct);
     const allScores = await db.entities.RunScore.filter({ week_id: pool.period_id }, '-score', 10000);
     // Endless mode runs are NOT eligible for OMENX payouts (display-only leaderboard)
     const scores = allScores.filter(s => s.arena_id !== 'endless');
     const payments = buildRankedPayments(scores, rewardPool, makeTierLookup(cfg.weekly_tiers), cfg.top_n);
    // Per-wallet override on AdminWallet.payout_pct_override (number, 0–0.10)
    // takes priority over the global STAFF_PCT_PER_WALLET — lets owners set
    // different cuts per staff member (e.g. lead mods get more than chat mods).
    const resolveStaffPct = (a) => {
        const o = a.payout_pct_override;
        if (o !== null && o !== undefined && isFinite(Number(o)) && Number(o) >= 0 && Number(o) <= 0.10) {
            return Number(o);
        }
        return STAFF_PCT_PER_WALLET;
    };
    const staffPayments = adminWallets
        .filter(a => a.wallet_address)
        .map(a => ({ walletAddress: a.wallet_address, amount: Math.floor(pool.total_spent * resolveStaffPct(a)), player_name: a.admin_name || a.wallet_address, isStaff: true }))
        .filter(p => p.amount >= 1);

    // S7+ weekly kill leaderboard pool — paid in addition to score + staff.
    // Reads from WeeklyKillSnapshot (frozen at week rollover) merged with the
    // live PlayerSave counter for anyone who hasn't rolled over yet. Snapshot is
    // authoritative — the live counter resets on the first run of a new week,
    // so by the time payouts run, anyone who already played in the new week
    // would be silently dropped without the snapshot fallback.
    let killPayments = [];
    if (useNewPools) {
        const killPoolPct = Number.isFinite(Number(cfg.kill_pool_pct)) ? Number(cfg.kill_pool_pct) : 0.05;
        const killRewardPool = Math.floor(pool.total_spent * killPoolPct);
        if (killRewardPool > 0) {
            const [snapshotRows, liveRows] = await Promise.all([
                db.entities.WeeklyKillSnapshot.filter(
                    { week_id: pool.period_id },
                    '-kills',
                    500
                ),
                db.entities.PlayerSave.filter(
                    { weekly_sector_kills_week: pool.period_id },
                    '-weekly_sector_kills',
                    500
                ),
            ]);
            const merged = new Map();
            for (const s of snapshotRows) {
                const w = (s.wallet_address || '').toLowerCase();
                if (!w || (s.kills || 0) <= 0) continue;
                merged.set(w, {
                    wallet_address: w,
                    player_name: s.player_name || w,
                    score: Number(s.kills) || 0,
                    user_id: null,
                });
            }
            for (const p of liveRows) {
                const w = (p.wallet_address || '').toLowerCase();
                if (!w || (p.weekly_sector_kills || 0) <= 0) continue;
                if (merged.has(w)) continue; // snapshot wins
                merged.set(w, {
                    wallet_address: w,
                    player_name: p.player_name || w,
                    score: Number(p.weekly_sector_kills) || 0,
                    user_id: null,
                });
            }
            const killCandidates = [...merged.values()].sort((a, b) => b.score - a.score);
            killPayments = buildRankedPayments(
                killCandidates,
                killRewardPool,
                makeTierLookup(cfg.weekly_kill_tiers || []),
                cfg.top_n
            );
        }
    }

    if (payments.length === 0 && staffPayments.length === 0 && killPayments.length === 0) {
        await db.entities.TokenPool.update(pool.id, { distributed: true });
        return { paid: 0, skipped: 'no eligible wallets' };
    }
    // Players: one batch per rank tier so OmenX TX history shows the exact rank/band.
    // Staff: separate single batch (rank doesn't apply — they're not on the leaderboard).
    // Kill leaderboard (S7+): separate tiered batch so its TX history is independent.
    const playerBase = `Cosmic Sloths weekly payout ${pool.period_id}`;
    const { txId: playerTxId, chunks: playerChunks } = await grantTieredBatches(payments, apiBaseUrl, rewardsKeys, GAME_ID, GAME_NAME, playerBase);
    const { txId: staffTxId, chunks: staffChunks } = await grantBatchChunked(staffPayments, apiBaseUrl, rewardsKeys, GAME_ID, GAME_NAME, `Cosmic Sloths weekly payout ${pool.period_id} — Staff share`);
    let killTxId = '';
    let killChunks = 0;
    if (killPayments.length > 0) {
        const r = await grantTieredBatches(killPayments, apiBaseUrl, rewardsKeys, GAME_ID, GAME_NAME, `Cosmic Sloths weekly KILL payout ${pool.period_id}`);
        killTxId = r.txId;
        killChunks = r.chunks;
    }
    const txId = [playerTxId, staffTxId, killTxId].filter(Boolean).join(',');
    const chunks = playerChunks + staffChunks + killChunks;
    await Promise.all([
        db.entities.TokenPool.update(pool.id, { distributed: true }),
        ...payments.map(p => db.entities.PayoutLog.create({ period_id: pool.period_id, period_type: 'weekly', wallet_address: p.walletAddress, player_name: p.player_name || p.walletAddress, amount: p.amount, rank: p.rank, tx_id: txId })),
        ...staffPayments.map(p => db.entities.PayoutLog.create({ period_id: pool.period_id, period_type: 'staff_weekly', wallet_address: p.walletAddress, player_name: p.player_name, amount: p.amount, rank: 0, tx_id: txId })),
        ...killPayments.map(p => db.entities.PayoutLog.create({ period_id: pool.period_id, period_type: 'weekly_kills', wallet_address: p.walletAddress, player_name: p.player_name || p.walletAddress, amount: p.amount, rank: p.rank, tx_id: killTxId || txId })),
    ]);
    return {
        paid: payments.length,
        staff_paid: staffPayments.length,
        kill_paid: killPayments.length,
        chunks,
        totalOmenx: payments.reduce((s, p) => s + p.amount, 0),
        staffOmenx: staffPayments.reduce((s, p) => s + p.amount, 0),
        killOmenx: killPayments.reduce((s, p) => s + p.amount, 0),
        payments,
        staffPayments,
        killPayments,
    };
}

async function distributeSeasonal(sdk, pool, apiBaseUrl, rewardsKeys) {
     if (!pool.total_spent || pool.total_spent <= 0) {
         await db.entities.TokenPool.update(pool.id, { distributed: true });
         return { paid: 0, skipped: 'zero spend' };
     }
     // Seasonal pool split: pre-S7 = 30% top players, S7+ = 20% (config-driven).
     // 10% Squad Wars Champions (`distributeSquadChampions`) unchanged regardless.
     const useNewPools = isNewPoolPeriod(pool.period_id, 'seasonal');
     const cfg = await loadPayoutConfig();
     const seasonalPoolPct = useNewPools
         ? (Number.isFinite(Number(cfg.seasonal_pool_pct)) ? Number(cfg.seasonal_pool_pct) : 0.20)
         : 0.30;
     const rewardPool = Math.floor(pool.total_spent * seasonalPoolPct);
     const allScores = await db.entities.RunScore.filter({ season_id: pool.period_id }, '-score', 10000);
     // Endless mode runs are NOT eligible for OMENX payouts (display-only leaderboard)
     const scores = allScores.filter(s => s.arena_id !== 'endless');
     const payments = buildRankedPayments(scores, rewardPool, makeTierLookup(cfg.seasonal_tiers), cfg.top_n);
    if (payments.length === 0) {
        await db.entities.TokenPool.update(pool.id, { distributed: true });
        return { paid: 0, skipped: 'no eligible wallets' };
    }
    // One batch per rank tier so OmenX TX history shows the exact rank/band.
    const { txId, chunks } = await grantTieredBatches(payments, apiBaseUrl, rewardsKeys, GAME_ID, GAME_NAME, `Cosmic Sloths seasonal payout ${pool.period_id}`);
    await Promise.all([
        db.entities.TokenPool.update(pool.id, { distributed: true }),
        ...payments.map(p => db.entities.PayoutLog.create({ period_id: pool.period_id, period_type: 'seasonal', wallet_address: p.walletAddress, player_name: p.player_name || p.walletAddress, amount: p.amount, rank: p.rank, tx_id: txId })),
    ]);
    return { paid: payments.length, chunks, totalOmenx: payments.reduce((s, p) => s + p.amount, 0), payments };
}