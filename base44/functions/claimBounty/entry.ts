import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Server-authoritative bounty/daily-mission claim.
// Reads cloud PlayerSave to verify progress >= target and not yet claimed,
// then atomically marks claimed and grants the reward.

// 429-aware retry wrapper — reduces visible failures during peak load.
// Safe because the claim is a single atomic write: if it 429s after retries
// the player retries — nothing was marked claimed AND nothing was credited.
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
            console.warn(`[claimBounty] ${label} 429 — retry ${attempt + 1}/3 after ${Math.round(backoff)}ms`);
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
        if (!me) return Response.json({ error: 'Please sign in to claim your bounty.' }, { status: 401 });

        const wallet = me.wallet_address;
        if (!wallet) return Response.json({ error: 'Your wallet isn\'t linked yet. Sign in with OmenX to continue.' }, { status: 400 });

        const { type, bountyIndex, is_sandbox } = await req.json();
        if (!type || (type !== 'bounty' && type !== 'dailyMission')) {
            return Response.json({ error: 'Couldn\'t process this claim — please refresh and try again.' }, { status: 400 });
        }
        // S8 Sandbox — practice runs can't reach here (we early-return in saveScore
        // so no bounty progress is written), but guard defensively so a tampered
        // client can't manually POST here after a sandbox run.
        if (is_sandbox === true) {
            return Response.json({ success: false, sandbox: true });
        }
        if (type === 'bounty' && (bountyIndex === undefined || bountyIndex < 0 || bountyIndex > 2)) {
            return Response.json({ error: 'Couldn\'t process this claim — please refresh and try again.' }, { status: 400 });
        }

        const walletLower = wallet.toLowerCase();
        const records = await with429Retry(
            () => base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletLower }),
            'PlayerSave.filter'
        );
        if (records.length === 0) return Response.json({ error: 'We couldn\'t find your save. Please play a run first to create one.' }, { status: 404 });

        const record = records[0];
        const saveData = typeof record.save_data === 'string' ? JSON.parse(record.save_data) : record.save_data;

        if (!saveData.bounties) return Response.json({ error: 'No bounties available yet — play a run to refresh.' }, { status: 400 });

        let bounty;
        if (type === 'bounty') {
            const list = saveData.bounties.active;
            if (!Array.isArray(list) || !list[bountyIndex]) return Response.json({ error: 'This bounty is no longer available.' }, { status: 404 });
            bounty = list[bountyIndex];
        } else {
            bounty = saveData.bounties.dailyMission;
            if (!bounty) return Response.json({ error: 'No daily mission available right now.' }, { status: 404 });
        }

        // Validate
        if (bounty.claimed) return Response.json({ error: 'You\'ve already claimed this bounty.', alreadyClaimed: true }, { status: 409 });
        if ((bounty.progress || 0) < (bounty.target || 0)) return Response.json({ error: 'You haven\'t finished this bounty yet.' }, { status: 400 });

        // Mark claimed and grant reward atomically in saveData
        bounty.claimed = true;

        if (type === 'dailyMission') {
            // Daily mission rewards seasonal points
            saveData.seasonalPoints = (saveData.seasonalPoints || 0) + (bounty.reward || 0);
        } else {
            // Daily bounties reward gold/fragments/tokens
            const amount = bounty.reward || 0;
            if (bounty.currency === 'gold') {
                saveData.gold = (saveData.gold || 0) + amount;
            } else if (bounty.currency === 'fragment') {
                saveData.relicFragments = (saveData.relicFragments || 0) + amount;
            } else if (bounty.currency === 'token') {
                saveData.cosmicTokens = (saveData.cosmicTokens || 0) + amount;
            }
        }

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
            reward: { amount: bounty.reward, currency: bounty.currency || 'seasonalPoints' },
            saveData: {
                gold: saveData.gold,
                relicFragments: saveData.relicFragments,
                cosmicTokens: saveData.cosmicTokens,
                seasonalPoints: saveData.seasonalPoints,
                bounties: saveData.bounties
            }
        });
    } catch (error) {
        console.error('[claimBounty]', error.message);
        return Response.json({ error: 'Couldn\'t claim your bounty right now. Please try again.' }, { status: 500 });
    }
});