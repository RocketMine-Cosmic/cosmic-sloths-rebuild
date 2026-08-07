// Background retry for runs that couldn't be saved at game-over time
// (e.g. server hiccup, lost connection, expired session during a long endless run,
// or — critically on Android — a tab kill while the run was still active).
// Called on app launch, when a new game starts, and whenever the wallet link is
// (re)established — drains the queue without blocking UI.
import { base44 } from '@/api/base44Client';
import { readRunSnapshot, clearRunSnapshot } from '@/lib/runSnapshot';
import { getOmenXUserSync } from '@/lib/omenxUser';
import { toast } from '@/components/ui/use-toast';

// Friendly arena names so the toast reads "Rainbow Rift" instead of "dimension".
const ARENA_LABELS = {
    station: 'Station', asteroid: 'Asteroid Field', nebula: 'Nebula', void: 'Void',
    plasma: 'Plasma Storm', crystal: 'Crystal Caverns', moon: 'Moon Base',
    blackhole: 'Black Hole', mothership: 'Mothership', dimension: 'Rainbow Rift',
    endless: 'Endless', world_boss_arena: 'Global Raid', quantum_meteor: 'Squad Meteor',
};
function formatTime(seconds) {
    const s = Math.floor(seconds || 0);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

let flushing = false;
let listenersBound = false;

// Build a saveScore-ready payload from a raw run-stats snapshot.
function statsToPayload(stats, user) {
    const scoreData = {
        player_name: user.player_name || user.full_name || '',
        player_title: user.data?.player_title || '',
        pilot_icon: user.pilot_icon || user.data?.pilot_icon || '🦥',
        time_survived: stats.time,
        level: stats.level,
        kills: stats.kills,
        character_id: stats.characterId,
        arena_id: stats.arenaId,
        gold: stats.gold,
        fragments: stats.fragments || 0,
        is_victory: false, // recovered runs are always abandoned
        encountered: stats.encountered || [],
        enemyKills: stats.enemyKills || {},
        // Forward the run-start season stamp (if the snapshot has one) so a run
        // that crashed pre-rollover and recovers post-rollover still banks into
        // the correct season's leaderboard. Missing on old snapshots — server
        // will fall through to its current-season default in that case.
        runSeasonId: stats.runSeasonId || null,
    };
    return { scoreData, squadStats: null };
}

// If a tab kill left an orphan run snapshot in localStorage, promote it into the
// saveScore queue. Only runs once per launch — if the promotion succeeds, the
// snapshot is cleared.
function promoteOrphanSnapshot() {
    try {
        const snap = readRunSnapshot();
        if (!snap?.stats) return;
        const user = getOmenXUserSync();
        if (!user) return; // wait until auth is available
        const queue = JSON.parse(localStorage.getItem('pending_score_saves') || '[]');
        queue.push({ payload: statsToPayload(snap.stats, user), queuedAt: snap.takenAt || Date.now(), reason: 'tab_killed' });
        while (queue.length > 20) queue.shift();
        localStorage.setItem('pending_score_saves', JSON.stringify(queue));
        clearRunSnapshot();
        console.log('[flushPendingScores] Promoted local orphan snapshot (tab kill recovery).');
    } catch (e) {
        console.warn('[flushPendingScores] Local snapshot promotion failed:', e?.message);
    }
}

// Cloud safety net: cross-device / device-wipe recovery. Each endless boss kill
// + every 5 min of run time, the engine writes the current stats to
// PlayerSave.pendingRunSnapshot. On next launch, fetch that and queue it.
// saveScore clears the cloud snapshot when it processes the recovered run, so
// this is idempotent — failed recoveries stay queued in cloud for next launch.
async function promoteCloudSnapshot() {
    try {
        const user = getOmenXUserSync();
        if (!user?.walletAddress) return;
        const res = await base44.functions.invoke('loadSave', {});
        const saveData = res?.data?.saveData;
        const snap = saveData?.pendingRunSnapshot;
        if (!snap?.stats) return;
        const queue = JSON.parse(localStorage.getItem('pending_score_saves') || '[]');
        // De-dupe — if we already queued this snapshot from localStorage, skip.
        const dup = queue.some(e => e.payload?.scoreData?.time_survived === snap.stats.time && e.payload?.scoreData?.kills === snap.stats.kills && e.payload?.scoreData?.arena_id === snap.stats.arenaId);
        if (dup) return;
        queue.push({ payload: statsToPayload(snap.stats, user), queuedAt: snap.takenAt || Date.now(), reason: 'cloud_checkpoint' });
        while (queue.length > 20) queue.shift();
        localStorage.setItem('pending_score_saves', JSON.stringify(queue));
        console.log('[flushPendingScores] Promoted cloud checkpoint (cross-device recovery).');
    } catch (e) {
        console.warn('[flushPendingScores] Cloud snapshot promotion failed:', e?.message);
    }
}

export async function flushPendingScores() {
    if (flushing) return;
    flushing = true;
    try {
        // First pass: pull any orphan snapshot from localStorage into the queue.
        promoteOrphanSnapshot();
        // Second pass: pull cloud-side checkpoint snapshot (cross-device / device-wipe
        // recovery — covers the case where Texxy's 25min endless run lost its session
        // mid-flight and his localStorage queue was cleared before relaunch). Safe to
        // re-enable: syncSave now treats pendingRunSnapshot as server-owned, and
        // saveScore clears the field as soon as it credits the recovered run.
        await promoteCloudSnapshot();

        const raw = localStorage.getItem('pending_score_saves');
        if (!raw) return;
        let queue;
        try { queue = JSON.parse(raw); } catch { queue = []; }
        if (!Array.isArray(queue) || queue.length === 0) {
            localStorage.removeItem('pending_score_saves');
            return;
        }

        const remaining = [];
        for (let i = 0; i < queue.length; i++) {
            const entry = queue[i];
            // Pace queued saves — firing N back-to-back saveScore calls
            // (each of which makes ~5 Base44 SDK calls internally) was a
            // reliable way to trigger 429s. 800ms between entries is plenty.
            if (i > 0) await new Promise(r => setTimeout(r, 800));
            try {
                const res = await base44.functions.invoke('saveScore', entry.payload);
                console.log('[flushPendingScores] Recovered queued run from', new Date(entry.queuedAt).toISOString(), entry.reason ? `(${entry.reason})` : '');
                // Notify the player so they know the run finally landed. Without this
                // toast, queued-for-retry runs (long endless / tab-killed Android runs)
                // recover silently and players have no idea their score was credited.
                try {
                    const sd = entry.payload?.scoreData || {};
                    const arenaLabel = ARENA_LABELS[sd.arena_id] || sd.arena_id || 'Arena';
                    const score = res?.data?.score;
                    const gold = res?.data?.goldCredited;
                    const frags = res?.data?.fragmentsCredited;
                    const lines = [
                        `${arenaLabel} • ${formatTime(sd.time_survived)} • Lvl ${sd.level} • ${sd.kills} kills`,
                    ];
                    if (typeof score === 'number') lines.push(`Score: ${score.toLocaleString()}`);
                    const extras = [];
                    if (typeof gold === 'number' && gold > 0) extras.push(`+${gold.toLocaleString()} gold`);
                    if (typeof frags === 'number' && frags > 0) extras.push(`+${frags} fragment${frags === 1 ? '' : 's'}`);
                    if (extras.length) lines.push(extras.join(' • '));
                    toast({
                        title: '🎯 Run recovered & submitted',
                        description: lines.join(' · '),
                        duration: 10000,
                    });
                } catch {}
            } catch (e) {
                // Only re-queue for TRANSIENT failures (429, 5xx, network).
                // Permanent 4xx errors (validation failed, duplicate run, banned
                // wallet, etc.) would otherwise stay in the queue forever, retried
                // on every launch and tab-focus — eventually growing past the 20-
                // entry cap and getting silently shifted out. Drop them now so
                // legitimate future runs aren't crowded out.
                const status = e?.status || e?.response?.status || 0;
                const msg = String(e?.message || '').toLowerCase();
                const isTransient = status === 0 || status === 429 || status >= 500
                    || msg.includes('rate limit') || msg.includes('network')
                    || msg.includes('failed to fetch') || msg.includes('timeout');
                if (isTransient) {
                    remaining.push(entry);
                } else {
                    console.warn(`[flushPendingScores] Dropping permanently-failed entry (status=${status}): ${msg}`);
                }
            }
        }

        if (remaining.length === 0) {
            localStorage.removeItem('pending_score_saves');
        } else {
            localStorage.setItem('pending_score_saves', JSON.stringify(remaining));
        }
    } finally {
        flushing = false;
    }
}

// Auto-flush when auth (re)establishes — covers the case where a long endless
// run lost its session, queued, and the player re-signs in. Idempotent: won't
// double-bind even if called from multiple modules.
export function bindFlushListeners() {
    if (listenersBound) return;
    listenersBound = true;
    if (typeof window === 'undefined') return;
    const handler = () => { flushPendingScores().catch(() => {}); };
    window.addEventListener('walletLinked', handler);
    // Also retry whenever the tab regains focus — a queued run from a closed-tab
    // crash gets a chance to flush as soon as the user returns.
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) handler();
    });
}