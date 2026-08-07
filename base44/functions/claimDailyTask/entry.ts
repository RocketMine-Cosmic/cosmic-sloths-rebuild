import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Server-authoritative Daily Task claim. Mirrors claimBounty's pattern.
// Tasks live on PlayerSave.dailyTasks = { date: 'YYYY-MM-DD', tasks: [{id, progress, claimed}, ...] }
// Progress is updated in saveScore.js. This endpoint validates completion + claim and grants reward.

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
            console.warn(`[claimDailyTask] ${label} 429 — retry ${attempt + 1}/3 after ${Math.round(backoff)}ms`);
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
        if (!me) return Response.json({ error: 'Please sign in to claim your task.' }, { status: 401 });

        const wallet = me.wallet_address;
        if (!wallet) return Response.json({ error: 'Your wallet isn\'t linked yet. Sign in with OmenX to continue.' }, { status: 400 });

        const { taskId } = await req.json();
        if (!taskId) return Response.json({ error: 'Couldn\'t process this claim — please refresh and try again.' }, { status: 400 });

        const walletLower = wallet.toLowerCase();
        const records = await with429Retry(
            () => base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletLower }),
            'PlayerSave.filter'
        );
        if (records.length === 0) return Response.json({ error: 'We couldn\'t find your save. Please play a run first.' }, { status: 404 });

        const record = records[0];
        const saveData = typeof record.save_data === 'string' ? JSON.parse(record.save_data) : record.save_data;

        if (!saveData.dailyTasks || !Array.isArray(saveData.dailyTasks.tasks)) {
            return Response.json({ error: 'No daily tasks available — play a run to refresh.' }, { status: 400 });
        }

        // Block claims against stale (yesterday's) tasks. The reset happens
        // server-side on next run completion in saveScore.ensureDailyTasks().
        const todayUTC = new Date().toISOString().split('T')[0];
        if (saveData.dailyTasks.date && saveData.dailyTasks.date !== todayUTC) {
            return Response.json({ error: 'These tasks are from yesterday — play a run to refresh today\'s tasks.' }, { status: 400 });
        }

        const task = saveData.dailyTasks.tasks.find(t => t.id === taskId);
        if (!task) return Response.json({ error: 'This task is no longer available.' }, { status: 404 });

        if (task.claimed) return Response.json({ error: 'You\'ve already claimed this task.', alreadyClaimed: true }, { status: 409 });
        if ((task.progress || 0) < (task.target || 0)) return Response.json({ error: 'You haven\'t finished this task yet.' }, { status: 400 });

        // Mark claimed and grant reward atomically
        task.claimed = true;
        const goldReward = Number(task.rewardGold || 0);
        const fragReward = Number(task.rewardFragments || 0);
        if (goldReward > 0) saveData.gold = (saveData.gold || 0) + goldReward;
        if (fragReward > 0) saveData.relicFragments = (saveData.relicFragments || 0) + fragReward;

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
            reward: { gold: goldReward, fragments: fragReward },
            saveData: {
                gold: saveData.gold,
                relicFragments: saveData.relicFragments,
                dailyTasks: saveData.dailyTasks
            }
        });
    } catch (error) {
        console.error('[claimDailyTask]', error.message);
        return Response.json({ error: 'Couldn\'t claim your task right now. Please try again.' }, { status: 500 });
    }
});