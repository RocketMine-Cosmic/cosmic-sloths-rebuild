import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Admin-only: scans every PlayerSave and rolls stale weekly/seasonal upgrade
// containers forward to the current period. Zeroes values, archives prior
// containers into weeklyUpgradeHistory / seasonalUpgradeHistory.
//
// One-shot fix for the Texxy bug 2026-05-04 — players who hadn't purchased
// anything in the new period kept last period's upgrades active because the
// rollover was previously only triggered by purchaseSku/spendGold. After the
// loadSave + syncSave fixes ship, this sweep cleans up everyone who still
// has stale containers from before the fix landed.

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

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        if (user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const dryRun = body.dryRun === true;

        const { week_id: currentWeek, season_id: currentSeason } = getCurrentPeriodIds();

        // Page through every PlayerSave. Base44 default page size is 50; we explicitly
        // request 1000 per page to keep this O(few requests) for ~1k players.
        const all = [];
        const pageSize = 1000;
        let skip = 0;
        while (true) {
            const batch = await base44.asServiceRole.entities.PlayerSave.list('-updated_at', pageSize, skip);
            if (!batch || batch.length === 0) break;
            all.push(...batch);
            if (batch.length < pageSize) break;
            skip += pageSize;
        }

        let scanned = 0;
        let weeklyRolled = 0;
        let seasonalRolled = 0;
        let playersFixed = 0;
        const samples = [];

        for (const row of all) {
            scanned++;
            let saveData = row.save_data;
            if (typeof saveData === 'string') {
                try { saveData = JSON.parse(saveData); } catch { continue; }
            }
            if (!saveData || typeof saveData !== 'object') continue;

            let didRollWeekly = false;
            let didRollSeasonal = false;
            const weeklyArchive = { ...(saveData.weeklyUpgradeHistory || {}) };
            const seasonalArchive = { ...(saveData.seasonalUpgradeHistory || {}) };

            for (const key of WEEKLY_KEYS) {
                const c = saveData[key];
                if (c && c.weekId && c.weekId !== currentWeek) {
                    weeklyArchive[c.weekId] = c;
                    saveData[key] = { weekId: currentWeek };
                    didRollWeekly = true;
                }
            }
            for (const key of SEASONAL_KEYS) {
                const c = saveData[key];
                if (c && c.seasonId && c.seasonId !== currentSeason) {
                    seasonalArchive[c.seasonId] = c;
                    saveData[key] = { seasonId: currentSeason };
                    didRollSeasonal = true;
                }
            }

            if (!didRollWeekly && !didRollSeasonal) continue;

            playersFixed++;
            if (didRollWeekly) weeklyRolled++;
            if (didRollSeasonal) seasonalRolled++;
            if (samples.length < 20) {
                samples.push({
                    wallet: row.wallet_address,
                    name: row.player_name,
                    weekly: didRollWeekly,
                    seasonal: didRollSeasonal,
                });
            }

            if (dryRun) continue;

            saveData.weeklyUpgradeHistory = weeklyArchive;
            saveData.seasonalUpgradeHistory = seasonalArchive;
            saveData.updated_at = Date.now();

            try {
                await base44.asServiceRole.entities.PlayerSave.update(row.id, {
                    save_data: saveData,
                    updated_at: saveData.updated_at,
                });
            } catch (e) {
                console.error(`[rolloverStalePeriods] update failed for ${row.wallet_address}:`, e.message);
            }
        }

        const summary = {
            success: true,
            dryRun,
            currentWeek,
            currentSeason,
            scanned,
            playersFixed,
            weeklyRolled,
            seasonalRolled,
            samples,
        };
        console.log('[rolloverStalePeriods]', JSON.stringify(summary));
        return Response.json(summary);
    } catch (error) {
        console.error('[rolloverStalePeriods]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});