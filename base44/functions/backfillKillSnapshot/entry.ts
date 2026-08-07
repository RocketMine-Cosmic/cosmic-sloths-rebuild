import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Admin-only one-shot recovery for the W25 kill-snapshot bug
// (Hugo bug 2026-06-22 — week_id rollover overwrote the live counter on
// PlayerSave.weekly_sector_kills the moment a player's first run of the new
// week saved, silently dropping any unsnapshotted player from the closing-week
// kill payout). Going forward, saveScore writes WeeklyKillSnapshot on rollover.
// This function recovers the lost data for week_ids that closed BEFORE that fix.
//
// For each player, the canonical value comes from (in priority order):
//   1. Existing WeeklyKillSnapshot row for (week_id, wallet) — already frozen, keep it.
//   2. Sum of SquadWarMemberKill.kills across all wars in week_id — these are
//      incremented in-place by saveScore (alongside the live counter) and survive
//      RunScore cleanup. Authoritative for any player who was in a war that week.
//      A wallet can have multiple rows (one per war they participated in); we sum
//      them so a player who switched squads mid-week still gets full credit.
//   3. PlayerSave.weekly_sector_kills if weekly_sector_kills_week === target week_id
//      (player hasn't played in the new week yet — live counter is authoritative).
//   4. Sum of RunScore.kills for sector-run rows in week_id (last-resort recovery
//      for players not in a war who already rolled over; will undercount if
//      cleanupKeepTopScoresPerPlayer already pruned).
//
// Idempotent: re-running for the same week is safe — existing snapshots are
// preserved unless dry_run=false AND force=true, in which case live/RunScore
// values override.
//
// Payload: { week_id: "2026-W25", dry_run: true|false, force?: boolean }

const EXCLUDED_ARENAS = new Set(['endless', 'world_boss_arena', 'quantum_meteor']);
const PAGE_SIZE = 1000;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const me = await base44.auth.me();
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const callerWallet = me.wallet_address?.toLowerCase();
        if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
        const admins = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
        if (admins.length === 0) return Response.json({ error: 'Forbidden' }, { status: 403 });

        const { week_id, dry_run = true, force = false } = await req.json();
        if (!week_id || !/^\d{4}-W\d{1,2}$/.test(week_id)) {
            return Response.json({ error: 'week_id required (e.g. "2026-W25")' }, { status: 400 });
        }

        // Step 1 — collect existing snapshots so we don't clobber them.
        const existingSnapshots = await base44.asServiceRole.entities.WeeklyKillSnapshot.filter(
            { week_id },
            '-kills',
            1000
        );
        const snapshotByWallet = new Map();
        for (const s of existingSnapshots) {
            const w = (s.wallet_address || '').toLowerCase();
            if (w) snapshotByWallet.set(w, s);
        }

        // Step 2 — SquadWarMemberKill sums (authoritative, survives RunScore cleanup).
        // A wallet may have multiple rows if they swapped squads mid-week; sum across all wars.
        const warMemberRows = await base44.asServiceRole.entities.SquadWarMemberKill.filter(
            { week_id },
            '-kills',
            1000
        );
        const warKillsByWallet = new Map(); // wallet -> { kills, player_name }
        for (const r of warMemberRows) {
            const w = (r.wallet_address || '').toLowerCase();
            if (!w) continue;
            const prev = warKillsByWallet.get(w) || { kills: 0, player_name: r.player_name || '' };
            prev.kills += Number(r.kills) || 0;
            if (!prev.player_name && r.player_name) prev.player_name = r.player_name;
            warKillsByWallet.set(w, prev);
        }

        // Step 3 — live counter from PlayerSave (anyone still on this week).
        const livePlayers = await base44.asServiceRole.entities.PlayerSave.filter(
            { weekly_sector_kills_week: week_id },
            '-weekly_sector_kills',
            1000
        );
        const liveByWallet = new Map();
        for (const p of livePlayers) {
            const w = (p.wallet_address || '').toLowerCase();
            if (!w || !(p.weekly_sector_kills > 0)) continue;
            liveByWallet.set(w, {
                kills: Number(p.weekly_sector_kills) || 0,
                player_name: p.player_name || `Pilot_${w.slice(-8).toUpperCase()}`,
            });
        }

        // Step 4 — RunScore sum (last-resort; undercounts after cleanup cron).
        // Page by created_date so we cover all rows even if a week had thousands of runs.
        const runScoreByWallet = new Map(); // wallet -> { kills, player_name }
        let lastDate = null;
        let pages = 0;
        let rowsScanned = 0;
        while (pages < 200) {
            const query = { week_id };
            if (lastDate) query.created_date = { $lt: lastDate };
            const batch = await base44.asServiceRole.entities.RunScore.filter(
                query,
                '-created_date',
                PAGE_SIZE
            );
            if (!batch || batch.length === 0) break;
            rowsScanned += batch.length;
            for (const r of batch) {
                const wallet = (r.wallet_address || '').toLowerCase();
                if (!wallet) continue;
                if (r.run_type) {
                    if (r.run_type !== 'sector') continue;
                } else if (EXCLUDED_ARENAS.has(r.arena_id)) {
                    continue;
                }
                const prev = runScoreByWallet.get(wallet) || { kills: 0, player_name: r.player_name || '' };
                prev.kills += Number(r.kills) || 0;
                if (!prev.player_name && r.player_name) prev.player_name = r.player_name;
                runScoreByWallet.set(wallet, prev);
            }
            if (batch.length < PAGE_SIZE) break;
            lastDate = batch[batch.length - 1].created_date;
            pages++;
        }

        // Step 5 — merge into a single per-wallet view + decide what to write.
        const allWallets = new Set([
            ...snapshotByWallet.keys(),
            ...warKillsByWallet.keys(),
            ...liveByWallet.keys(),
            ...runScoreByWallet.keys(),
        ]);

        const actions = []; // { wallet, action: 'keep'|'create'|'update'|'skip_zero', source, kills, prev_kills?, player_name }
        for (const wallet of allWallets) {
            const existing = snapshotByWallet.get(wallet);
            const war = warKillsByWallet.get(wallet);
            const live = liveByWallet.get(wallet);
            const runScore = runScoreByWallet.get(wallet);

            // Priority: SquadWarMemberKill sum (highest — survives RunScore cleanup
            // AND week rollover) > live counter (authoritative for non-war players
            // who haven't rolled over) > RunScore sum (last-resort recovery, may
            // undercount). Pick the MAX of war + live when both exist, in case a
            // player accrued kills outside the war window that weren't credited
            // to a war row (legacy edge case).
            let candidate = null;
            let source = null;
            if (war && war.kills > 0) {
                if (live && live.kills > war.kills) {
                    candidate = { kills: live.kills, player_name: live.player_name || war.player_name };
                    source = 'live_counter_over_war';
                } else {
                    candidate = { kills: war.kills, player_name: war.player_name || (live?.player_name) };
                    source = 'war_member_kill_sum';
                }
            } else if (live) {
                candidate = { kills: live.kills, player_name: live.player_name };
                source = 'live_counter';
            } else if (runScore && runScore.kills > 0) {
                candidate = { kills: runScore.kills, player_name: runScore.player_name || `Pilot_${wallet.slice(-8).toUpperCase()}` };
                source = 'run_score_sum';
            }

            if (existing) {
                if (!candidate) {
                    actions.push({ wallet, action: 'keep', source: 'existing_only', kills: existing.kills, player_name: existing.player_name });
                    continue;
                }
                // Existing snapshot: by default keep it (idempotent). Only overwrite
                // if force=true AND candidate is higher than existing.
                if (force && candidate.kills > (existing.kills || 0)) {
                    actions.push({
                        wallet, action: 'update', source, kills: candidate.kills,
                        prev_kills: existing.kills, player_name: candidate.player_name,
                        snapshot_id: existing.id,
                    });
                } else {
                    actions.push({ wallet, action: 'keep', source: 'existing', kills: existing.kills, player_name: existing.player_name });
                }
            } else {
                if (!candidate || candidate.kills <= 0) {
                    actions.push({ wallet, action: 'skip_zero', source: source || 'none', kills: 0 });
                    continue;
                }
                actions.push({ wallet, action: 'create', source, kills: candidate.kills, player_name: candidate.player_name });
            }
        }

        // Summary
        const summary = {
            week_id,
            dry_run,
            force,
            existing_snapshots: snapshotByWallet.size,
            war_member_rows: warMemberRows.length,
            war_unique_players: warKillsByWallet.size,
            live_players: liveByWallet.size,
            run_score_rows_scanned: rowsScanned,
            run_score_unique_players: runScoreByWallet.size,
            total_wallets_considered: allWallets.size,
            actions_planned: {
                create: actions.filter(a => a.action === 'create').length,
                update: actions.filter(a => a.action === 'update').length,
                keep: actions.filter(a => a.action === 'keep').length,
                skip_zero: actions.filter(a => a.action === 'skip_zero').length,
            },
        };

        if (dry_run) {
            // Return a preview sorted by kills (top 30) so admin can sanity-check.
            const topPreview = actions
                .filter(a => a.action !== 'skip_zero')
                .sort((a, b) => (b.kills || 0) - (a.kills || 0))
                .slice(0, 30)
                .map(a => ({
                    rank: 0, // filled in below
                    wallet: a.wallet,
                    player_name: a.player_name,
                    kills: a.kills,
                    action: a.action,
                    source: a.source,
                    prev_kills: a.prev_kills,
                }));
            topPreview.forEach((p, i) => { p.rank = i + 1; });
            return Response.json({ ...summary, preview: topPreview });
        }

        // Live mode — write snapshots.
        let created = 0, updated = 0, failed = 0;
        for (const a of actions) {
            try {
                if (a.action === 'create') {
                    await base44.asServiceRole.entities.WeeklyKillSnapshot.create({
                        week_id,
                        wallet_address: a.wallet,
                        player_name: a.player_name,
                        kills: a.kills,
                        source: 'admin_backfill',
                    });
                    created++;
                } else if (a.action === 'update') {
                    await base44.asServiceRole.entities.WeeklyKillSnapshot.update(a.snapshot_id, {
                        kills: a.kills,
                        player_name: a.player_name,
                        source: 'admin_backfill',
                    });
                    updated++;
                }
            } catch (err) {
                failed++;
                console.error(`[backfillKillSnapshot] ${a.wallet} ${a.action} failed:`, err.message);
            }
        }

        // Audit log
        try {
            await base44.asServiceRole.entities.AdminChangesLog.create({
                wallet_address: callerWallet,
                action_type: 'other',
                description: `WeeklyKillSnapshot backfill for ${week_id}`,
                details: { ...summary, created, updated, failed },
            });
        } catch {}

        return Response.json({ ...summary, created, updated, failed });
    } catch (error) {
        console.error('[backfillKillSnapshot]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});