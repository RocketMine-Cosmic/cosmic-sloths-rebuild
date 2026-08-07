import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Distributes the Squad Wars Champions Pool (5% of seasonal OMENX) to top 3 squads
// of a season. Idempotent — safe to call repeatedly. Real-money path; every payout
// is logged to SquadChampionsPayoutLog.
//
// Auth:
//   - emergency adminKey (env: AdminDash) — used by automation/cron
//   - OR Base44 admin user with 'distribute_rewards' permission
//
// Body params:
//   { period_id?: string, mode?: 'preview' | 'execute', adminKey?: string }
//   - period_id defaults to the previous completed season
//   - mode defaults to 'preview' (read-only, computes ranking + payout list)

// Service-role db client — set inside the request handler from
// createClientFromRequest(req).asServiceRole. Module-level `let` so the helper
// functions further down can use it without threading through every call.
// CRITICAL: previously used `createClient({ appId })` which is unauthenticated
// and CANNOT read AdminWallet (admin-only RLS) → every admin caller got
// "Forbidden — not an admin" (Texxy/Hugo bug 2026-05-04, mirrors the
// distributeRewards fix).
let db = null;

const GAME_ID = 'cosmic-sloths';
const GAME_NAME = 'Cosmic Sloths';
const CHAMPIONS_POOL_PCT = 0.10; // 10% of seasonal pool
const TOP_3_SHARES = [0.5, 0.3, 0.2]; // 1st, 2nd, 3rd
const MIN_WARS_FOUGHT = 2;
const MIN_SQUAD_MEMBERS = 2;

// Get current and previous season ids based on UTC week.
// Proper ISO 8601 (Mon-start, Sun 23:59 UTC end). Old formula rolled over a day early on Sundays.
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
    return { week_id, season_id, isoWeek, year: isoYear };
}

// Returns the previous season id given the current one (rolls year if needed).
function getPreviousSeasonId() {
    const { season_id, year } = getCurrentPeriodIds();
    const m = /^(\d{4})-S(\d+)$/.exec(season_id);
    if (!m) return null;
    const sNum = parseInt(m[2], 10);
    if (sNum > 1) return `${m[1]}-S${sNum - 1}`;
    // Roll back to last season of previous year (year had 52 weeks → 13 seasons of 4 weeks)
    return `${year - 1}-S13`;
}

// Returns the list of week_ids that belong to a given season_id (4 consecutive ISO weeks).
function getWeekIdsForSeason(seasonId) {
    const m = /^(\d{4})-S(\d+)$/.exec(seasonId);
    if (!m) return [];
    const year = parseInt(m[1], 10);
    const sNum = parseInt(m[2], 10);
    const startWeek = (sNum - 1) * 4 + 1;
    const weeks = [];
    for (let i = 0; i < 4; i++) {
        const wk = startWeek + i;
        if (wk > 53) break; // safety
        weeks.push(`${year}-W${String(wk).padStart(2, '0')}`);
    }
    return weeks;
}

// Aggregates squad performance across all wars in the season, returning a sorted ranking.
async function buildSeasonRanking(periodId) {
    const weekIds = getWeekIdsForSeason(periodId);
    if (weekIds.length === 0) return [];

    // Pull all resolved wars for these 4 weeks in ONE batched query (was 4 sequential calls).
    const warsAllWeeks = await db.entities.SquadWar.filter({ week_id: { $in: weekIds } }, '-created_date', 500);
    const allWars = warsAllWeeks.filter(w => w.is_resolved);

    // Aggregate per squad
    const bySquad = new Map();
    const ensure = (squadId, name, tag, icon) => {
        if (!squadId) return null;
        if (!bySquad.has(squadId)) {
            bySquad.set(squadId, {
                squad_id: squadId,
                squad_name: name || '',
                squad_tag: tag || '',
                squad_icon: icon || '🛡️',
                wins: 0, losses: 0, ties: 0, byes: 0,
                total_kills: 0,
                wars_fought: 0,
            });
        }
        return bySquad.get(squadId);
    };

    for (const war of allWars) {
        const a = ensure(war.squad_a_id, war.squad_a_name, war.squad_a_tag, war.squad_a_icon);
        const b = war.squad_b_id ? ensure(war.squad_b_id, war.squad_b_name, war.squad_b_tag, war.squad_b_icon) : null;

        if (a) {
            a.wars_fought++;
            a.total_kills += Number(war.kills_a || 0);
        }
        if (b) {
            b.wars_fought++;
            b.total_kills += Number(war.kills_b || 0);
        }

        if (war.result_kind === 'bye') {
            if (a) a.byes++;
        } else if (war.result_kind === 'tie') {
            if (a) a.ties++;
            if (b) b.ties++;
        } else if (war.result_kind === 'win_a') {
            if (a) a.wins++;
            if (b) b.losses++;
        } else if (war.result_kind === 'win_b') {
            if (b) b.wins++;
            if (a) a.losses++;
        }
    }

    // Refresh display fields + member counts in ONE batched call (was N sequential Squad.get
    // calls → easily 10+ API hits which combined with the rest of the preview was tripping
    // Base44's rate limit).
    const squadIds = [...bySquad.keys()];
    const freshById = new Map();
    if (squadIds.length > 0) {
        try {
            const freshSquads = await db.entities.Squad.filter({ id: { $in: squadIds } }, '-created_date', squadIds.length);
            for (const f of freshSquads) freshById.set(f.id, f);
        } catch (e) {
            console.warn('[distributeSquadChampions] batched Squad lookup failed:', e?.message);
        }
    }

    const rows = [];
    for (const sq of bySquad.values()) {
        const points = sq.wins * 3 + sq.ties * 1 + sq.byes * 1;
        const fresh = freshById.get(sq.squad_id);
        let memberCount = 0;
        if (fresh) {
            sq.squad_name = fresh.name || sq.squad_name;
            sq.squad_tag = fresh.tag || sq.squad_tag;
            sq.squad_icon = fresh.icon || sq.squad_icon;
            memberCount = fresh.member_count || 0;
        }
        rows.push({
            ...sq,
            ranking_points: points,
            member_count: memberCount,
            eligible: sq.wars_fought >= MIN_WARS_FOUGHT && memberCount >= MIN_SQUAD_MEMBERS,
        });
    }

    // Sort: points desc, kills desc, wars_fought desc
    rows.sort((a, b) =>
        b.ranking_points - a.ranking_points ||
        b.total_kills - a.total_kills ||
        b.wars_fought - a.wars_fought
    );

    return rows;
}

async function fetchSquadMemberWallets(squadId) {
    const PAGE = 100;
    const wallets = [];
    let skip = 0;
    for (let i = 0; i < 5; i++) {
        const members = await db.entities.SquadMember.filter({ squad_id: squadId }, '-created_date', PAGE, skip);
        for (const m of members) {
            if (m.wallet_address) wallets.push(m.wallet_address.toLowerCase());
        }
        if (members.length < PAGE) break;
        skip += PAGE;
    }
    return [...new Set(wallets)];
}

// Sends ONE chunk to OMENX (with per-key fallback on 429/5xx). Returns the txId on success.
// Throws on failure so the caller can stop and preserve any logs already written for prior chunks.
async function callOmenxOneChunk(chunk, apiBaseUrl, rewardsKeys, note, ci, totalChunks) {
    const startIdx = ci % rewardsKeys.length;
    let lastErr = null;
    for (let attempt = 0; attempt < rewardsKeys.length; attempt++) {
        const key = rewardsKeys[(startIdx + attempt) % rewardsKeys.length];
        const response = await fetch(`${apiBaseUrl}/v1/game-rewards/grant-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                payments: chunk.map(p => ({ walletAddress: p.walletAddress, amount: p.amount })),
                gameId: GAME_ID, gameName: GAME_NAME,
                note: `${note} chunk ${ci + 1}/${totalChunks}`,
            }),
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok) {
            return result?.transactionId || result?.txHash || '';
        }
        lastErr = `HTTP ${response.status}: ${JSON.stringify(result)}`;
        console.warn(`[distributeSquadChampions] chunk ${ci + 1} key ${attempt + 1} failed:`, lastErr);
        if (response.status !== 429 && response.status < 500) break;
    }
    throw new Error(`Chunk ${ci + 1}/${totalChunks} failed: ${lastErr}`);
}

Deno.serve(async (req) => {
    try {
        const body = await req.json().catch(() => ({}));
        const { adminKey, mode = 'preview' } = body;
        let { period_id } = body;

        // Auth check — always use service-role for entity reads/writes inside this fn
        // (we read AdminWallet which has admin-only RLS, and write PayoutLog/Roster).
        const base44 = createClientFromRequest(req);
        db = base44.asServiceRole;

        let callerWallet = 'EMERGENCY_KEY';
        if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
            const me = await base44.auth.me();
            if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            callerWallet = me.wallet_address?.toLowerCase();
            if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
            const records = await db.entities.AdminWallet.filter({ wallet_address: callerWallet });
            if (records.length === 0) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });
            const perms = records[0].permissions || [];
            if (!perms.includes('distribute_rewards') && !perms.includes('owner')) {
                return Response.json({ error: "Forbidden — 'distribute_rewards' permission required" }, { status: 403 });
            }
        }

        // Default to previous completed season
        // Track whether the caller specified period_id (manual run) vs auto-defaulted (cron run).
        // The 4-week cron isn't anchored to season boundaries, so we MUST guard against it
        // firing mid-season — otherwise it'd target a long-ago season that's already paid
        // and just no-op every time, which is harmless but noisy. The proper guard:
        // only run on automation if the current ISO week is the FIRST week of a new season
        // (i.e. previous season just ended at last Sun 23:59 UTC).
        const explicitPeriod = !!period_id;
        if (!period_id) period_id = getPreviousSeasonId();
        if (!period_id) return Response.json({ error: 'Could not determine season id' }, { status: 400 });

        // Season-end anchor guard (only enforced for automated runs without explicit period_id).
        // Seasons are 4 ISO weeks. Season N covers weeks [(N-1)*4 + 1 .. N*4]. After Sun 23:59 UTC
        // of week N*4, the new season starts. So this fn should ONLY pay out when the current
        // ISO week is the FIRST week of a new season — i.e. (currentIsoWeek - 1) % 4 === 0.
        if (!explicitPeriod) {
            const { isoWeek } = getCurrentPeriodIds();
            const isFirstWeekOfSeason = ((isoWeek - 1) % 4) === 0;
            if (!isFirstWeekOfSeason) {
                return Response.json({
                    success: true,
                    mode,
                    skipped: 'not season-end',
                    reason: `Current ISO week ${isoWeek} is not the first week of a season (must satisfy (week-1) % 4 === 0). Champions payout only fires when the previous season has just closed.`,
                    period_id,
                });
            }
        }

        // Look up the seasonal pool
        const pools = await db.entities.TokenPool.filter({ period_id, period_type: 'seasonal' });
        if (pools.length === 0) {
            return Response.json({ error: `No seasonal pool found for ${period_id}` }, { status: 404 });
        }
        const pool = pools[0];
        const championsPool = Math.floor((pool.total_spent || 0) * CHAMPIONS_POOL_PCT);

        // Existing payouts (used both for preview metadata and resume-aware execute).
        // CHANGED 2026-05-18: previously hard-blocked execute mode if ANY rows existed,
        // which made partial-payout recovery impossible. Now we always allow retry and
        // skip wallets that already have a log row (matches manuallyDistributeRewards).
        const existingPayouts = await db.entities.SquadChampionsPayoutLog.filter({ period_id }, '-created_date', 1000);
        const alreadyPaidWallets = new Set(existingPayouts.map(l => (l.wallet_address || '').toLowerCase()));

        // Build season ranking
        const ranking = await buildSeasonRanking(period_id);
        const eligible = ranking.filter(r => r.eligible);
        const top3 = eligible.slice(0, 3);

        // Compute per-squad share
        const numWinners = top3.length;
        let shares;
        if (numWinners === 0) {
            shares = [];
        } else if (numWinners === 1) {
            shares = [1.0];
        } else if (numWinners === 2) {
            shares = [0.65, 0.35];
        } else {
            shares = TOP_3_SHARES;
        }

        // Load blacklist ONCE up-front (was being re-fetched per squad → 3× wasted API calls
        // that helped push the preview over Base44's rate limit).
        const blacklisted = await db.entities.BlacklistedWallet.list();
        const blacklistSet = new Set(blacklisted.map(b => (b.wallet_address || '').toLowerCase()));

        // Fetch members for all top-3 squads in ONE batched query (was 3 sequential paged
        // calls → up to 9+ API hits). Top squads have ≤ ~30 members so 500 is plenty.
        const top3Ids = top3.map(s => s.squad_id);
        const walletsBySquad = new Map(top3Ids.map(id => [id, []]));
        if (top3Ids.length > 0) {
            const allMembers = await db.entities.SquadMember.filter({ squad_id: { $in: top3Ids } }, '-created_date', 500);
            for (const m of allMembers) {
                const w = (m.wallet_address || '').toLowerCase();
                if (!w) continue;
                const list = walletsBySquad.get(m.squad_id);
                if (list && !list.includes(w)) list.push(w);
            }
        }

        // Compute per-squad and per-member payouts
        const squadResults = [];
        const allMemberPayments = []; // for OMENX batch call

        for (let i = 0; i < top3.length; i++) {
            const squad = top3[i];
            const squadShare = Math.floor(championsPool * shares[i]);
            const wallets = walletsBySquad.get(squad.squad_id) || [];

            const eligibleWallets = wallets.filter(w => !blacklistSet.has(w));

            const memberCount = eligibleWallets.length;
            const perMember = memberCount > 0
                ? Math.floor(squadShare / memberCount)
                : 0;

            const memberPayouts = eligibleWallets.map(w => ({
                walletAddress: w,
                amount: perMember,
                squad_id: squad.squad_id,
                squad_name: squad.squad_name,
                squad_tag: squad.squad_tag,
                squad_rank: i + 1,
            }));

            squadResults.push({
                rank: i + 1,
                squad_id: squad.squad_id,
                squad_name: squad.squad_name,
                squad_tag: squad.squad_tag,
                squad_icon: squad.squad_icon,
                ranking_points: squad.ranking_points,
                wins: squad.wins, losses: squad.losses, ties: squad.ties, byes: squad.byes,
                total_kills: squad.total_kills,
                wars_fought: squad.wars_fought,
                member_count: memberCount,
                squad_share_omenx: squadShare,
                per_member_omenx: perMember,
                member_wallets: eligibleWallets,
            });

            if (perMember >= 1) {
                allMemberPayments.push(...memberPayouts);
            }
        }

        const totalPayout = allMemberPayments.reduce((s, p) => s + p.amount, 0);

        // Resume-aware: split planned payments into "already paid" and "pending"
        // so both preview and execute can show/process them correctly.
        const annotatedPayments = allMemberPayments.map(p => ({
            ...p,
            already_paid: alreadyPaidWallets.has((p.walletAddress || '').toLowerCase()),
        }));
        const pendingPayments = annotatedPayments.filter(p => !p.already_paid);
        const paidCount = annotatedPayments.length - pendingPayments.length;
        const pendingPayoutTotal = pendingPayments.reduce((s, p) => s + p.amount, 0);

        // ---- PREVIEW MODE: don't pay, just return what would happen ----
        if (mode !== 'execute') {
            // Enrich each planned payment with the player's current name.
            // SINGLE batched lookup (was N sequential filter() calls → 429 rate limit).
            const walletsToLookup = [...new Set(annotatedPayments.map(p => p.walletAddress))];
            const nameByWallet = {};
            if (walletsToLookup.length > 0) {
                try {
                    const rows = await db.entities.PlayerSave.filter(
                        { wallet_address: { $in: walletsToLookup } },
                        '-updated_at',
                        walletsToLookup.length
                    );
                    for (const r of rows) {
                        const w = (r.wallet_address || '').toLowerCase();
                        if (w && !nameByWallet[w]) nameByWallet[w] = r.player_name || '';
                    }
                } catch (e) {
                    console.warn('[distributeSquadChampions] batched name lookup failed:', e?.message);
                }
            }
            const memberPayments = annotatedPayments.map(p => ({
                wallet_address: p.walletAddress,
                player_name: nameByWallet[p.walletAddress] || '(unknown)',
                amount: p.amount,
                squad_name: p.squad_name,
                squad_tag: p.squad_tag,
                squad_rank: p.squad_rank,
                already_paid: p.already_paid,
            }));

            return Response.json({
                success: true,
                mode: 'preview',
                period_id,
                pool_total_spent: pool.total_spent,
                champions_pool_omenx: championsPool,
                already_distributed: existingPayouts.length > 0,
                paid_member_count: paidCount,
                pending_member_count: pendingPayments.length,
                pending_payout_omenx: pendingPayoutTotal,
                eligible_squads: eligible.length,
                top_squads: squadResults,
                member_payments: memberPayments,
                total_member_payouts: allMemberPayments.length,
                total_payout_omenx: totalPayout,
                full_ranking: ranking.slice(0, 20), // top 20 for visibility
            });
        }

        // ---- EXECUTE MODE ----
        if (championsPool <= 0) {
            return Response.json({
                success: true,
                mode: 'execute',
                period_id,
                skipped: 'zero champions pool',
            });
        }
        // Snapshot rosters ONCE up front (idempotent — skip if already exists for this period).
        // Used to live after the OMENX call which meant a 502 mid-payout left zero rosters
        // even though some members had been paid. Doing this first makes recovery clean.
        try {
            const existingRosters = await db.entities.SquadSeasonRoster.filter({ period_id });
            const haveSquadIds = new Set(existingRosters.map(r => r.squad_id));
            for (const sq of squadResults) {
                if (haveSquadIds.has(sq.squad_id)) continue;
                await db.entities.SquadSeasonRoster.create({
                    period_id,
                    squad_id: sq.squad_id,
                    squad_name: sq.squad_name,
                    squad_tag: sq.squad_tag,
                    squad_icon: sq.squad_icon,
                    wallet_addresses: sq.member_wallets,
                    ranking_points: sq.ranking_points,
                    total_kills: sq.total_kills,
                    wars_fought: sq.wars_fought,
                    wins: sq.wins, losses: sq.losses, ties: sq.ties, byes: sq.byes,
                    final_rank: sq.rank,
                    champions_pool_share: sq.squad_share_omenx,
                });
            }
        } catch (e) {
            console.warn('[distributeSquadChampions] roster snapshot warn:', e?.message);
        }

        if (allMemberPayments.length === 0) {
            return Response.json({
                success: true,
                mode: 'execute',
                period_id,
                skipped: 'no eligible members',
                champions_pool_omenx: championsPool,
            });
        }

        if (pendingPayments.length === 0) {
            // Everyone already has a log row — nothing to retry.
            return Response.json({
                success: true,
                mode: 'execute',
                period_id,
                skipped: 'all members already paid',
                already_paid_count: paidCount,
                champions_pool_omenx: championsPool,
            });
        }

        // Pay via OMENX — only the pending wallets, chunked, with per-chunk log writes.
        const apiBaseUrl = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        const rewardsKeys = [
            Deno.env.get('OMENX_REWARDS_API_KEY'),
            Deno.env.get('OMENX_REWARDS_API_KEY_2'),
            Deno.env.get('OMENX_REWARDS_API_KEY_3'),
            Deno.env.get('OMENX_REWARDS_API_KEY_4'),
        ].filter(Boolean);
        if (rewardsKeys.length === 0) {
            return Response.json({ error: 'No OMENX rewards API keys configured' }, { status: 500 });
        }

        const CHUNK_SIZE = 20;
        const chunks = [];
        for (let i = 0; i < pendingPayments.length; i += CHUNK_SIZE) {
            chunks.push(pendingPayments.slice(i, i + CHUNK_SIZE));
        }
        const txIds = [];
        let paidThisRun = 0;
        let partialError = null;

        for (let ci = 0; ci < chunks.length; ci++) {
            const chunk = chunks[ci];
            let chunkTxId;
            try {
                chunkTxId = await callOmenxOneChunk(chunk, apiBaseUrl, rewardsKeys, `Squad Champions ${period_id}`, ci, chunks.length);
            } catch (e) {
                // Stop here — partial success preserved by per-chunk log writes already done.
                partialError = e?.message || String(e);
                console.error(`[distributeSquadChampions] STOPPED at chunk ${ci + 1}/${chunks.length}: ${partialError}`);
                break;
            }
            txIds.push(chunkTxId);
            // Write logs IMMEDIATELY for this chunk before sending the next one,
            // so a 502 on chunk N+1 leaves chunk N safely recorded.
            for (const p of chunk) {
                try {
                    await db.entities.SquadChampionsPayoutLog.create({
                        period_id,
                        wallet_address: p.walletAddress,
                        squad_id: p.squad_id,
                        squad_name: p.squad_name,
                        squad_tag: p.squad_tag,
                        squad_rank: p.squad_rank,
                        amount: p.amount,
                        tx_id: chunkTxId,
                        status: 'success',
                    });
                    paidThisRun++;
                } catch (logErr) {
                    // A failed log write would let a retry double-pay this wallet — alert loudly.
                    console.error('[distributeSquadChampions] CRITICAL: paid OMENX but log write failed', {
                        wallet: p.walletAddress, amount: p.amount, tx: chunkTxId, err: logErr?.message
                    });
                }
            }
        }

        const txId = txIds.join(',');
        const paidPayoutThisRun = paidThisRun > 0
            ? pendingPayments.slice(0, paidThisRun).reduce((s, p) => s + p.amount, 0)
            : 0;

        // Audit log (includes partial-failure info if relevant)
        try {
            await db.entities.AdminChangesLog.create({
                wallet_address: callerWallet,
                action_type: 'reward_adjustment',
                description: partialError
                    ? `Squad Wars Champions Pool PARTIAL payout for ${period_id} — ${paidThisRun}/${pendingPayments.length} pending wallets paid`
                    : `Squad Wars Champions Pool distributed for ${period_id}`,
                details: {
                    period_id,
                    champions_pool_omenx: championsPool,
                    paid_this_run: paidThisRun,
                    paid_omenx_this_run: paidPayoutThisRun,
                    already_paid_before_run: paidCount,
                    total_pending_at_start: pendingPayments.length,
                    partial_error: partialError || undefined,
                    top_squads: squadResults.map(s => ({ rank: s.rank, name: s.squad_name, tag: s.squad_tag, share: s.squad_share_omenx })),
                },
            });
        } catch {}

        if (partialError) {
            return Response.json({
                success: false,
                partial: true,
                mode: 'execute',
                period_id,
                champions_pool_omenx: championsPool,
                paid_this_run: paidThisRun,
                paid_omenx_this_run: paidPayoutThisRun,
                remaining_pending: pendingPayments.length - paidThisRun,
                error: partialError,
                tx_id: txId,
            }, { status: 207 }); // 207 Multi-Status — partial success
        }

        return Response.json({
            success: true,
            mode: 'execute',
            period_id,
            champions_pool_omenx: championsPool,
            paid_this_run: paidThisRun,
            paid_omenx_this_run: paidPayoutThisRun,
            already_paid_before_run: paidCount,
            member_count: allMemberPayments.length,
            top_squads: squadResults.map(s => ({
                rank: s.rank,
                squad_name: s.squad_name,
                squad_tag: s.squad_tag,
                squad_share_omenx: s.squad_share_omenx,
                per_member_omenx: s.per_member_omenx,
                member_count: s.member_count,
            })),
            tx_id: txId,
        });
    } catch (error) {
        console.error('[distributeSquadChampions]', error.message, error.stack);
        return Response.json({ error: error.message }, { status: 500 });
    }
});