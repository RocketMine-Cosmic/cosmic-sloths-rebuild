import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Loads the player save for the currently-authenticated Base44 user,
// using the wallet_address linked on their User record.
//
// Also opportunistically rolls stale weekly/seasonal upgrade containers
// forward to the current period (zeroing values, archiving prior period).
// This is the same logic as syncSave's resolvePeriodicUpgradeContainer —
// we run it here too so players self-heal on page load instead of needing
// to wait for a sync round-trip (Texxy bug 2026-05-04 — players who hadn't
// purchased anything in the new week kept last week's upgrades active).

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

const WEEKLY_KEYS = ['weeklyUpgrades', 'weeklyWeaponUpgrades', 'weeklyTalents'];
const SEASONAL_KEYS = ['seasonalUpgrades', 'seasonalWeaponUpgrades', 'seasonalTalents'];

// Outer Galaxy expansion backfill (2026-06-04). Players who had already cleared
// S10 (`dimension`) BEFORE the Outer Galaxy patch landed have it in their unlock
// list but no `galactic_core` — because the saveScore unlock chain only fires on
// a NEW victory. Without this backfill they'd need to grind S10 again to access
// S11, which Anubis + others reported as a bug 2026-06-04.
//
// Idempotent: only mutates when a character has `dimension` but lacks
// `galactic_core`. Runs on every load until applied. After the first unlock the
// normal saveScore self-heal takes over for S11 → S20 progression.
function backfillOuterGalaxyUnlock(saveData) {
    if (!saveData || typeof saveData !== 'object') return false;
    const map = saveData.unlockedArenasByCharacter;
    if (!map || typeof map !== 'object') return false;
    let changed = false;
    for (const charId of Object.keys(map)) {
        const arenas = Array.isArray(map[charId]) ? map[charId] : null;
        if (!arenas) continue;
        if (arenas.includes('dimension') && !arenas.includes('galactic_core')) {
            map[charId] = [...arenas, 'galactic_core'];
            changed = true;
        }
    }
    return changed;
}

function rollStalePeriods(saveData) {
    if (!saveData || typeof saveData !== 'object') return { saveData, rolled: false };
    const { week_id: currentWeek, season_id: currentSeason } = getCurrentPeriodIds();
    let rolled = false;
    const weeklyArchive = { ...(saveData.weeklyUpgradeHistory || {}) };
    const seasonalArchive = { ...(saveData.seasonalUpgradeHistory || {}) };

    for (const key of WEEKLY_KEYS) {
        const c = saveData[key];
        if (c && c.weekId && c.weekId !== currentWeek) {
            weeklyArchive[c.weekId] = c;
            saveData[key] = { weekId: currentWeek };
            rolled = true;
        }
    }
    for (const key of SEASONAL_KEYS) {
        const c = saveData[key];
        if (c && c.seasonId && c.seasonId !== currentSeason) {
            seasonalArchive[c.seasonId] = c;
            saveData[key] = { seasonId: currentSeason };
            rolled = true;
        }
    }

    if (rolled) {
        saveData.weeklyUpgradeHistory = weeklyArchive;
        saveData.seasonalUpgradeHistory = seasonalArchive;
        saveData.updated_at = Date.now();
    }
    return { saveData, rolled };
}

// Read the global wipe epoch (set by resetAllPlayerData / fullWipeIncludingUsers).
// Clients pass this back on next launch to detect "cloud was reset" and clear
// stale local caches. Cached for the duration of one request.
async function readWipeEpoch(base44) {
    try {
        const rows = await base44.asServiceRole.entities.AppConfig.filter({ key: 'wipe_epoch' });
        return Number(rows?.[0]?.value?.epoch || 0);
    } catch {
        return 0;
    }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS (doesn't return null) when there's no auth context —
        // common during page-load races. Catch it cleanly instead of logging a scary
        // "Authentication required to view users" error in the runtime logs.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ saveData: null, wipeEpoch: 0 });

        const wallet = me.wallet_address;
        if (!wallet) {
            console.log('[loadSave] User has no linked wallet yet');
            return Response.json({ saveData: null, wipeEpoch: await readWipeEpoch(base44) });
        }

        const records = await base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: wallet.toLowerCase() });
        let saveData = records.length > 0 ? records[0].save_data : null;

        // Belt-and-braces: ensure profile fields (player_name) are present in save_data
        // so cross-device cloud restore works even for legacy saves where the name lives
        // only on the top-level PlayerSave column. SaveManager reads from save_data only.
        if (saveData && records.length > 0) {
            const row = records[0];
            if (typeof saveData === 'string') {
                try { saveData = JSON.parse(saveData); } catch {}
            }
            if (saveData && typeof saveData === 'object') {
                if (!saveData.player_name && row.player_name) {
                    saveData = { ...saveData, player_name: row.player_name };
                }

                // Server-side profile migration (Option A, 2026-05-08):
                // Lift legacy top-level player_name / player_title / pilot_icon
                // into save_data.profile so the new client reads from a single
                // canonical location. Idempotent — only sets fields that aren't
                // already present in save_data.profile.
                if (!saveData.profile || typeof saveData.profile !== 'object') {
                    saveData.profile = {};
                }
                if (!saveData.profile.player_name) {
                    saveData.profile.player_name = saveData.player_name || row.player_name || '';
                }
                if (!saveData.profile.player_title) {
                    saveData.profile.player_title = saveData.player_title || '';
                }
                if (!saveData.profile.pilot_icon) {
                    saveData.profile.pilot_icon = saveData.pilot_icon || '';
                }

                // Roll stale weekly/seasonal containers forward and persist if changed.
                const { saveData: rolledData, rolled } = rollStalePeriods(saveData);
                saveData = rolledData;
                // Outer Galaxy unlock backfill (2026-06-04) — see helper above.
                const outerBackfilled = backfillOuterGalaxyUnlock(saveData);
                if (outerBackfilled) {
                    saveData.updated_at = Date.now();
                }
                if (rolled || outerBackfilled) {
                    try {
                        await base44.asServiceRole.entities.PlayerSave.update(row.id, {
                            save_data: saveData,
                            updated_at: saveData.updated_at,
                        });
                        if (rolled) console.log(`[loadSave] Rolled stale period(s) for ${wallet}`);
                        if (outerBackfilled) console.log(`[loadSave] Backfilled Outer Galaxy (galactic_core) for ${wallet}`);
                    } catch (e) {
                        console.error('[loadSave] Persist load-time fixes failed (non-fatal):', e.message);
                    }
                }
            }
        }

        const wipeEpoch = await readWipeEpoch(base44);
        console.log('[loadSave] Loaded for wallet:', wallet, '- found:', !!saveData, 'wipeEpoch:', wipeEpoch);
        return Response.json({ saveData, wipeEpoch });
    } catch (error) {
        console.error('[loadSave]', error.message);
        return Response.json({ saveData: null, wipeEpoch: 0 });
    }
});