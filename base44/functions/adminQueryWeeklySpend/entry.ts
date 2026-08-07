import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Admin-only ad-hoc aggregator. Returns total OMENX spent per player_name
// for a given week_id, broken down by sku_id. Used to investigate score
// anomalies (e.g. who was spending heavily on rerolls/banishes/revives).
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const { week_id, player_names } = await req.json();
        if (!week_id || !Array.isArray(player_names) || player_names.length === 0) {
            return Response.json({ error: 'week_id and player_names[] required' }, { status: 400 });
        }

        const results = {};
        for (const name of player_names) {
            // Page through logs (entity list cap is typically 500/page).
            const all = [];
            let skip = 0;
            const pageSize = 500;
            while (true) {
                const page = await base44.asServiceRole.entities.TokenSpendLog.filter(
                    { week_id, player_name: name },
                    '-created_date',
                    pageSize,
                    skip
                );
                all.push(...page);
                if (page.length < pageSize) break;
                skip += pageSize;
                if (skip > 20000) break; // safety
            }

            const total = all.reduce((s, r) => s + Number(r.amount || 0), 0);
            const bySku = {};
            for (const r of all) {
                const sku = r.sku_id || 'unknown';
                if (!bySku[sku]) bySku[sku] = { count: 0, total: 0 };
                bySku[sku].count += 1;
                bySku[sku].total += Number(r.amount || 0);
            }
            results[name] = {
                total_omenx_spent: total,
                transaction_count: all.length,
                by_sku: bySku,
            };
        }

        return Response.json({ week_id, results });
    } catch (error) {
        console.error('[adminQueryWeeklySpend]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});