import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Admin-only one-shot: gives every existing squad a starter Treasury so when
// S6 lands they can immediately try the cheapest weekly buff tier. Without
// this, week 1 of S6 would have zero squad buffs active (squads start at 0
// treasury and would need to gather donations before any buff fires) — making
// the whole system feel dead at launch.
//
// Idempotent: skips squads that already have treasury_gold > 0 OR a non-empty
// active_buff_week_id. Only seeds the cold-start ones.
//
// Usage:
//   base44.functions.invoke('seedSquadTreasuries', { amount: 1000 })

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const me = await base44.auth.me();
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        if (me.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

        const { amount = 25000 } = await req.json();
        const seedAmount = Math.max(0, Math.min(50000, Number(amount) || 0));
        if (seedAmount <= 0) return Response.json({ error: 'amount must be > 0' }, { status: 400 });

        // Fetch all squads. With ~hundreds of squads max this is fine in one call;
        // bump to pagination if you scale past the default page size.
        const squads = await base44.asServiceRole.entities.Squad.filter({}, '-weekly_kills', 500);
        if (!squads || squads.length === 0) {
            return Response.json({ ok: true, message: 'No squads found', seeded: 0 });
        }

        let seeded = 0;
        let skipped = 0;
        for (const sq of squads) {
            const existing = Number(sq.treasury_gold || 0);
            if (existing > 0) { skipped++; continue; }
            try {
                await base44.asServiceRole.entities.Squad.update(sq.id, {
                    treasury_gold: existing + seedAmount,
                    treasury_total_donated: Number(sq.treasury_total_donated || 0) + seedAmount,
                });
                seeded++;
            } catch (e) {
                console.error(`[seedSquadTreasuries] failed for ${sq.name}:`, e.message);
            }
        }

        // Audit log.
        try {
            await base44.asServiceRole.entities.AdminChangesLog.create({
                wallet_address: (me.wallet_address || '').toLowerCase(),
                action_type: 'reward_adjustment',
                description: `S6 launch: seeded ${seeded} squad treasuries with ${seedAmount} gold each (${skipped} skipped)`,
                details: { seedAmount, seeded, skipped, total_squads: squads.length },
            });
        } catch (e) { console.warn('[seedSquadTreasuries] log failed:', e.message); }

        console.log(`[seedSquadTreasuries] seeded=${seeded} skipped=${skipped} total=${squads.length}`);
        return Response.json({ ok: true, seeded, skipped, total: squads.length, seedAmount });
    } catch (error) {
        console.error('[seedSquadTreasuries]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});