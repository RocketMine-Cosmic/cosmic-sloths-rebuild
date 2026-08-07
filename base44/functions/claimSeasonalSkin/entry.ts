import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Server-authoritative seasonal-skin claim.
// Players earn seasonalPoints from Daily Missions; at 100 pts they can spend
// them here to unlock ONE seasonal-reward skin (chosen from a fixed allowlist
// that mirrors SKIN_COSMETICS entries flagged isSeasonalReward in game/Constants.js).
// Each claim costs SEASONAL_POINTS_PER_SKIN points and grants the skin id into
// save.unlockedSkins. Players can claim multiple times (one skin per 100 pts).

const SEASONAL_POINTS_PER_SKIN = 100;

// Hard-coded allowlist — mirrors the isSeasonalReward entries in game/Constants.js.
// Server-side guard so a tampered client can't grant non-seasonal (paid) skins via this endpoint.
const SEASONAL_SKIN_ALLOWLIST = new Set([
    'neobyte_neon_vanguard',
    'pandypaws_golden_sov',
    'novabyte_galactic_enforcer',
    'glitch_toxic_phantom',
    'holodrift_quantum_drifter',
    'codebreaker_cyber_ninja',
    'dataphantom_abyssal_wraith',
    'neonvortex_supernova_elite',
    'synthbeats_astro_dj',
    'skybyte_nebula_ace',
]);

async function with429Retry(fn, label = 'op') {
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
        try { return await fn(); }
        catch (err) {
            lastErr = err;
            const status = err?.status || err?.response?.status;
            const msg = String(err?.message || '').toLowerCase();
            const is429 = status === 429 || msg.includes('rate limit') || msg.includes('429');
            if (!is429 || attempt === 3) throw err;
            const backoff = 300 * Math.pow(2, attempt) + Math.random() * 200;
            console.warn(`[claimSeasonalSkin] ${label} 429 — retry ${attempt + 1}/3 after ${Math.round(backoff)}ms`);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw lastErr;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Please sign in to claim your skin.' }, { status: 401 });

        const wallet = me.wallet_address;
        if (!wallet) return Response.json({ error: 'Your wallet isn\'t linked yet. Sign in with OmenX to continue.' }, { status: 400 });

        const { skinId } = await req.json();
        if (!skinId || typeof skinId !== 'string') {
            return Response.json({ error: 'Missing skin info — please refresh and try again.' }, { status: 400 });
        }
        if (!SEASONAL_SKIN_ALLOWLIST.has(skinId)) {
            return Response.json({ error: 'That skin isn\'t claimable here.' }, { status: 400 });
        }

        const walletLower = wallet.toLowerCase();
        const records = await with429Retry(
            () => base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletLower }),
            'PlayerSave.filter'
        );
        if (records.length === 0) return Response.json({ error: 'We couldn\'t find your save. Please play a run first to create one.' }, { status: 404 });

        const record = records[0];
        const saveData = typeof record.save_data === 'string' ? JSON.parse(record.save_data) : record.save_data;

        const currentPoints = saveData.seasonalPoints || 0;
        if (currentPoints < SEASONAL_POINTS_PER_SKIN) {
            return Response.json({
                error: `You need ${SEASONAL_POINTS_PER_SKIN} Seasonal Points to claim this skin. You have ${currentPoints}.`,
            }, { status: 400 });
        }

        const unlockedSkins = Array.isArray(saveData.unlockedSkins) ? [...saveData.unlockedSkins] : [];
        if (unlockedSkins.includes(skinId)) {
            return Response.json({ error: 'You\'ve already unlocked this skin.', alreadyOwned: true }, { status: 409 });
        }

        // Deduct points and grant skin atomically
        saveData.seasonalPoints = currentPoints - SEASONAL_POINTS_PER_SKIN;
        unlockedSkins.push(skinId);
        saveData.unlockedSkins = unlockedSkins;
        saveData.updated_at = Date.now();

        await with429Retry(
            () => base44.asServiceRole.entities.PlayerSave.update(record.id, {
                save_data: saveData,
                updated_at: Date.now()
            }),
            'PlayerSave.update'
        );

        return Response.json({
            success: true,
            skinId,
            saveData: {
                seasonalPoints: saveData.seasonalPoints,
                unlockedSkins: saveData.unlockedSkins,
            }
        });
    } catch (error) {
        console.error('[claimSeasonalSkin]', error.message);
        return Response.json({ error: 'Couldn\'t claim your skin right now. Please try again.' }, { status: 500 });
    }
});