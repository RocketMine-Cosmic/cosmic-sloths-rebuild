// Endless-run safety net — Android Chrome kills backgrounded tabs aggressively
// (way more than desktop). If a player's tab gets killed mid-run (phone lock,
// app switch, low memory), `gameOver()` never fires and the entire run is lost.
//
// To prevent this, the game engine periodically snapshots the run's stats to
// localStorage. On next launch, `flushPendingScores` picks up the snapshot and
// queues it as a normal saveScore payload — same recovery path as a queued run.
//
// Snapshot is cleared on a clean game-over / victory / quit so it never
// double-counts a successfully-saved run.

const SNAPSHOT_KEY = 'pending_run_snapshot';

export function writeRunSnapshot(stats) {
    try {
        // Only persist endless / world-boss snapshots — these are the long runs that
        // suffer from tab kills. Short fixed-duration arenas almost always finish
        // before the tab gets killed and we don't want to add localStorage churn.
        const arena = stats?.arenaId;
        if (arena !== 'endless' && arena !== 'world_boss_arena') return;
        // Don't snapshot trivial state (player just spawned, no kills yet).
        if (!stats || (stats.kills || 0) < 5 || (stats.time || 0) < 30) return;
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
            stats,
            takenAt: Date.now(),
        }));
    } catch (e) {
        // localStorage full / private mode — silently ignore, snapshot is best-effort.
    }
}

export function clearRunSnapshot() {
    try { localStorage.removeItem(SNAPSHOT_KEY); } catch {}
}

export function readRunSnapshot() {
    try {
        const raw = localStorage.getItem(SNAPSHOT_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}