import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Server-authoritative daily login claim. Uses cloud PlayerSave as source of truth
// so users can't claim multiple times by tampering with localStorage or switching devices.

// 429-aware retry wrapper — reduces visible failures during peak. Safe because
// the claim is a single atomic write (mark + grant in one update).
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
            console.warn(`[claimDailyLogin] ${label} 429 — retry ${attempt + 1}/3 after ${Math.round(backoff)}ms`);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw lastErr;
}

const DAILY_REWARDS = [
    { day: 1, reward: 400,  currency: 'gold' },
    { day: 2, reward: 800,  currency: 'gold' },
    { day: 3, reward: 1000, currency: 'gold' },
    { day: 4, reward: 1,    currency: 'fragment' },
    { day: 5, reward: 2000, currency: 'gold' },
    { day: 6, reward: 2,    currency: 'fragment' },
    { day: 7, reward: 4000, currency: 'gold' },
];

// UTC date in YYYY-MM-DD form. Server-side date is the source of truth so users
// can't change their device clock to claim again.
function todayUTC() {
    return new Date().toISOString().split('T')[0];
}

function yesterdayUTC() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().split('T')[0];
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS when there's no auth context — catch it for a clean 401.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Please sign in to claim your daily reward.' }, { status: 401 });

        const wallet = me.wallet_address;
        if (!wallet) return Response.json({ error: 'Your wallet isn\'t linked yet. Sign in with OmenX to continue.' }, { status: 400 });

        const walletLower = wallet.toLowerCase();
        const today = todayUTC();
        const yesterday = yesterdayUTC();

        const records = await with429Retry(
            () => base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletLower }),
            'PlayerSave.filter'
        );
        if (records.length === 0) return Response.json({ error: 'We couldn\'t find your save. Please play a run first to create one.' }, { status: 404 });

        const record = records[0];
        const saveData = typeof record.save_data === 'string' ? JSON.parse(record.save_data) : record.save_data;

        const login = saveData.dailyLogin || { lastDate: '', streak: 0, claimed: false };

        // Already claimed today? Reject.
        if (login.lastDate === today && login.claimed) {
            return Response.json({ error: 'You\'ve already claimed today\'s reward — come back tomorrow!', alreadyClaimed: true }, { status: 409 });
        }

        // Compute new streak: continues if yesterday, resets otherwise.
        const newStreak = (login.lastDate === yesterday ? login.streak : 0) + 1;
        const rewardDay = DAILY_REWARDS[(newStreak - 1) % 7];

        // Apply reward to save_data
        if (rewardDay.currency === 'gold') {
            saveData.gold = (saveData.gold || 0) + rewardDay.reward;
        } else if (rewardDay.currency === 'token') {
            saveData.cosmicTokens = (saveData.cosmicTokens || 0) + rewardDay.reward;
        } else if (rewardDay.currency === 'fragment') {
            saveData.relicFragments = (saveData.relicFragments || 0) + rewardDay.reward;
        }

        saveData.dailyLogin = { lastDate: today, streak: newStreak, claimed: true };
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
            reward: rewardDay,
            streak: newStreak,
            saveData: {
                gold: saveData.gold,
                cosmicTokens: saveData.cosmicTokens,
                relicFragments: saveData.relicFragments,
                dailyLogin: saveData.dailyLogin
            }
        });
    } catch (error) {
        console.error('[claimDailyLogin]', error.message);
        return Response.json({ error: 'Couldn\'t claim your daily reward right now. Please try again.' }, { status: 500 });
    }
});