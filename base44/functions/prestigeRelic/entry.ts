import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// S6 Phase 3a — Prestige Relics gold sink (per docs/S6_MASTER_PLAN.md §5a).
//
// Once a relic hits L5, you can prestige it up to PL5. Each prestige tier costs
// a flat 1.5M gold per the locked design decision (no tiered pricing — fairness
// for all players over whale-friendly economics). Each tier adds +5% to the
// relic's stat value when applied at runtime.
//
// Storage on PlayerSave:
//   relicPrestige: { [relicId]: 0..5 }   // 0 = not yet prestiged, 5 = max
//
// Hard-gated to S6+ via the same season check as the rest of the rebalance.
// Pre-rollover the function returns 403 so even an admin/script can't prestige
// during S5. (S5 leaderboard remains immutable history.)

// Proper ISO 8601 (Mon-start, Sun 23:59 UTC end). Mirrors lib/periodIds.js.
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

const VALID_RELIC_IDS = new Set([
    'relic_lucky_dice',
    'relic_gold_magnet',
    'relic_xp_drive',
    'relic_blood_chalice',
    'relic_damage_core',
]);

// 2026-05-20 — tiered prestige costs (500K → 2.5M) so early tiers feel achievable
// while late tiers reward grind. Same total as flat 1.5M model (7.5M per relic).
const PRESTIGE_GOLD_COSTS = [500_000, 1_000_000, 1_500_000, 2_000_000, 2_500_000];
const PRESTIGE_FRAGMENT_COST = 100;
const PRESTIGE_MAX = 5;

function getPrestigeCost(tier) {
    return PRESTIGE_GOLD_COSTS[Math.min(tier, PRESTIGE_MAX - 1)] || PRESTIGE_GOLD_COSTS[PRESTIGE_MAX - 1];
}

async function with429Retry(fn, label = 'op') {
    let lastErr;
    for (let attempt = 0; attempt < 6; attempt++) {
        try { return await fn(); }
        catch (err) {
            lastErr = err;
            const status = err?.status || err?.response?.status;
            const msg = String(err?.message || '').toLowerCase();
            const is429 = status === 429 || msg.includes('rate limit') || msg.includes('429');
            if (!is429 || attempt === 5) throw err;
            const backoff = 300 * Math.pow(2, attempt) + Math.random() * 200;
            console.warn(`[prestigeRelic] ${label} 429 — retry ${attempt + 1}/5 after ${Math.round(backoff)}ms`);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw lastErr;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS when there's no auth context — catch it for a clean 401.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Please sign in to continue.' }, { status: 401 });

        const wallet = me.wallet_address;
        if (!wallet) return Response.json({ error: 'Your wallet isn\'t linked yet.' }, { status: 400 });

        // S6+ gate — pre-rollover (≤ 2026-S5) this feature is unavailable.
        const { season_id, week_id } = getCurrentPeriodIds();
        if (season_id === '2026-S5') {
            return Response.json({ error: 'Relic prestige unlocks in Season 6.' }, { status: 403 });
        }

        const { relicId } = await req.json();
        if (!relicId || !VALID_RELIC_IDS.has(relicId)) {
            return Response.json({ error: 'Invalid relicId' }, { status: 400 });
        }

        const walletLower = wallet.toLowerCase();
        const records = await with429Retry(
            () => base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletLower }),
            'PlayerSave.filter'
        );
        if (records.length === 0) {
            return Response.json({ error: 'PlayerSave not found.' }, { status: 400 });
        }
        const saveRecord = records[0];
        const save = typeof saveRecord.save_data === 'string'
            ? JSON.parse(saveRecord.save_data)
            : saveRecord.save_data;

        // Must own the relic at L5 to prestige it.
        const unlocked = Array.isArray(save.unlockedRelics) ? save.unlockedRelics : [];
        const level = Number((save.relicLevels || {})[relicId] || 0);
        if (!unlocked.includes(relicId) || level < 5) {
            return Response.json({ error: 'Relic must be at level 5 to prestige.' }, { status: 400 });
        }

        const prestige = { ...(save.relicPrestige || {}) };
        const currentPrestige = Number(prestige[relicId] || 0);
        if (currentPrestige >= PRESTIGE_MAX) {
            return Response.json({ error: 'Relic is already at max prestige (PL5).' }, { status: 400 });
        }

        const gold = Number(save.gold || 0);
        const prestigeCost = getPrestigeCost(currentPrestige);
        if (gold < prestigeCost) {
            return Response.json({
                error: `Not enough gold — you need ${prestigeCost.toLocaleString()} but have ${gold.toLocaleString()}.`
            }, { status: 400 });
        }
        const fragments = Number(save.relicFragments || 0);
        if (fragments < PRESTIGE_FRAGMENT_COST) {
            return Response.json({
                error: `Not enough relic fragments — you need ${PRESTIGE_FRAGMENT_COST} but have ${fragments}.`
            }, { status: 400 });
        }

        // Apply
        const updated = { ...save };
        updated.gold = gold - prestigeCost;
        updated.relicFragments = fragments - PRESTIGE_FRAGMENT_COST;
        prestige[relicId] = currentPrestige + 1;
        updated.relicPrestige = prestige;
        updated.updated_at = Date.now();

        await with429Retry(
            () => base44.asServiceRole.entities.PlayerSave.update(saveRecord.id, {
                save_data: updated,
                updated_at: Date.now()
            }),
            'PlayerSave.update'
        );

        // Audit trail — re-uses existing GoldSpendLog so admin Gold Audit picks up
        // prestige spend automatically.
        try {
            await base44.asServiceRole.entities.GoldSpendLog.create({
                wallet_address: walletLower,
                player_name: saveRecord.player_name || updated.player_name || '',
                amount: prestigeCost,
                balance_before: gold,
                balance_after: updated.gold,
                grant_info: { type: 'relic_prestige', relicId, newPrestige: prestige[relicId], fragmentCost: PRESTIGE_FRAGMENT_COST },
                week_id,
                season_id,
            });
        } catch {}

        console.log(`[prestigeRelic] ${walletLower} prestiged ${relicId} → PL${prestige[relicId]} (-${prestigeCost} gold, -${PRESTIGE_FRAGMENT_COST} frags)`);
        return Response.json({
            success: true,
            saveData: updated,
            cost: prestigeCost,
            fragmentCost: PRESTIGE_FRAGMENT_COST,
            newPrestige: prestige[relicId],
        });
    } catch (error) {
        console.error('[prestigeRelic]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});