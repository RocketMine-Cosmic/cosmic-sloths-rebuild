import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Server-authoritative relic crafting & upgrading (Phase 3d).
// Spends relicFragments and grants/upgrades a relic on PlayerSave.
// Client cannot mutate unlockedRelics, relicLevels, or relicFragments via syncSave.

// Mirrors RELICS in game/Constants.js — only id + fragmentCost are needed here.
const RELIC_COSTS = {
    relic_lucky_dice:  2,
    relic_gold_magnet: 3,
    relic_xp_drive:    3,
    relic_blood_chalice: 4,
    relic_damage_core: 5,
};
const MAX_LEVEL = 5;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS when there's no auth context — catch it for a clean 401.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const wallet = me.wallet_address;
        if (!wallet) return Response.json({ error: 'No wallet linked to user' }, { status: 400 });

        const { relicId } = await req.json();
        if (!relicId || !RELIC_COSTS[relicId]) {
            return Response.json({ error: 'Invalid relicId' }, { status: 400 });
        }

        const walletLower = wallet.toLowerCase();
        const records = await base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletLower });
        if (records.length === 0) {
            return Response.json({ error: 'PlayerSave not found — sync your save first' }, { status: 400 });
        }
        const saveRecord = records[0];
        const save = typeof saveRecord.save_data === 'string'
            ? JSON.parse(saveRecord.save_data)
            : saveRecord.save_data;

        const unlocked = Array.isArray(save.unlockedRelics) ? [...save.unlockedRelics] : [];
        const levels = { ...(save.relicLevels || {}) };
        const isOwned = unlocked.includes(relicId);
        const currentLevel = isOwned ? Number(levels[relicId] || 1) : 0;

        if (currentLevel >= MAX_LEVEL) {
            return Response.json({ error: 'Relic already at max level' }, { status: 400 });
        }

        const baseCost = RELIC_COSTS[relicId];
        const multiplier = currentLevel === 0 ? 1 : Math.pow(2, currentLevel);
        const cost = baseCost * multiplier;

        const fragments = Number(save.relicFragments || 0);
        if (fragments < cost) {
            return Response.json({ error: `Not enough Relic Fragments (need ${cost}, have ${fragments})` }, { status: 400 });
        }

        // Apply
        const updated = { ...save };
        updated.relicFragments = fragments - cost;
        if (!isOwned) {
            unlocked.push(relicId);
            levels[relicId] = 1;
        } else {
            levels[relicId] = currentLevel + 1;
        }
        updated.unlockedRelics = unlocked;
        updated.relicLevels = levels;
        updated.updated_at = Date.now();

        await base44.asServiceRole.entities.PlayerSave.update(saveRecord.id, {
            save_data: updated,
            updated_at: Date.now()
        });

        console.log(`[craftRelic] ${walletLower} ${isOwned ? 'upgraded' : 'crafted'} ${relicId} → lvl ${levels[relicId]} (-${cost} fragments)`);
        return Response.json({ success: true, saveData: updated, cost, newLevel: levels[relicId] });
    } catch (error) {
        console.error('[craftRelic]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});