// Endless-run safety net (server-side).
//
// During long endless / world-boss runs, the client periodically calls this to
// persist the current run stats into PlayerSave.save_data.pendingRunSnapshot.
// If the player's tab dies / device wipes / browser crashes before the run ends,
// the next launch's flushPendingScores will pick the snapshot up and submit it
// through the normal saveScore path — no progress lost.
//
// This function does NOT credit anything to the player. It only stores stats
// for later promotion. saveScore is the sole writer for run aggregates.
//
// Validation mirrors saveScore's loose sanity caps so a tampered checkpoint
// can't poison a future recovery — anything wildly out of range is rejected.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MAX_KILLS_PER_SEC = 200;
const MAX_LEVEL = 500;
const MAX_TIME_SEC = 60 * 60;
const MIN_TIME_SEC = 1;
const ENDLESS_GOLD_HARD_CEILING = 18000;
const MAX_GOLD_PER_KILL = 500;

function validateStats(s) {
    const time = Number(s.time_survived) || 0;
    const kills = Number(s.kills) || 0;
    const level = Number(s.level) || 1;
    const gold = Number(s.gold) || 0;
    const fragments = Math.max(0, Math.floor(Number(s.fragments) || 0));
    if (time < MIN_TIME_SEC || time > MAX_TIME_SEC) return { ok: false, reason: `time ${time}` };
    if (kills < 0 || kills > Math.ceil(time * MAX_KILLS_PER_SEC)) return { ok: false, reason: `kills ${kills}/${time}s` };
    if (level < 1 || level > MAX_LEVEL) return { ok: false, reason: `level ${level}` };
    if (gold < 0) return { ok: false, reason: `gold negative` };
    const isEndless = s.arena_id === 'endless';
    if (isEndless && gold > ENDLESS_GOLD_HARD_CEILING * 2) return { ok: false, reason: `gold ${gold}` };
    if (!isEndless && gold > Math.max(100, kills * MAX_GOLD_PER_KILL)) return { ok: false, reason: `gold/kills` };
    return { ok: true, time, kills, level, gold, fragments };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS when there's no auth context — catch it for a clean 401.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const walletAddress = me.wallet_address;
        if (!walletAddress) return Response.json({ error: 'Wallet not linked' }, { status: 400 });

        const body = await req.json();
        const stats = body?.stats;
        if (!stats) return Response.json({ error: 'Missing stats' }, { status: 400 });

        // S8 Sandbox — never persist a snapshot for practice runs, so nothing
        // can be replayed as a "recovered" run via flushPendingScores next launch.
        if (stats.is_sandbox === true) {
            return Response.json({ success: false, sandbox: true });
        }

        // Only checkpoint endless / world-boss runs — these are the long ones.
        if (stats.arenaId !== 'endless' && stats.arenaId !== 'world_boss_arena') {
            return Response.json({ skipped: true });
        }

        // Translate engine stats shape → saveScore-style shape for validation.
        const v = validateStats({
            time_survived: stats.time,
            kills: stats.kills,
            level: stats.level,
            gold: stats.gold,
            fragments: stats.fragments,
            arena_id: stats.arenaId,
        });
        if (!v.ok) {
            console.warn(`[checkpointRun] rejected ${walletAddress}: ${v.reason}`);
            return Response.json({ error: 'Invalid stats' }, { status: 400 });
        }

        const walletLower = walletAddress.toLowerCase();
        const records = await base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletLower });
        if (records.length === 0) return Response.json({ error: 'No save' }, { status: 400 });
        const saveRecord = records[0];
        const saveData = typeof saveRecord.save_data === 'string'
            ? JSON.parse(saveRecord.save_data)
            : saveRecord.save_data;

        // Store the snapshot — small payload, ~1KB.
        const updated = {
            ...saveData,
            pendingRunSnapshot: {
                stats,
                takenAt: Date.now(),
            },
        };
        await base44.asServiceRole.entities.PlayerSave.update(saveRecord.id, {
            save_data: updated,
            updated_at: Date.now(),
        });

        return Response.json({ success: true });
    } catch (error) {
        console.error('[checkpointRun]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});