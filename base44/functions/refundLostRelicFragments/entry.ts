import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// One-time refund tool for players who lost relic fragments to the syncSave
// anti-cheat block before the server-authoritative fragment crediting fix.
//
// Source of truth: SyncBlockLog rows where field='relicFragments'. Each row
// captured the client's claimed running total vs the cloud's total at the moment
// of block. The net loss per wallet = max(client_value) - max(cloud_value) across
// all blocks for that wallet. That's the high-water mark of what they had picked
// up but the cloud refused to accept.
//
// Modes:
//   - dryRun=true (default): returns the computed refund per wallet, no writes
//   - dryRun=false: credits PlayerSave.relicFragments and writes an AdminChangesLog entry
//
// Idempotency: stores a marker on the PlayerSave (save_data._fragmentRefundApplied=true)
// so re-runs don't double-credit.
//
// Auth: admin only.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const me = await base44.auth.me();
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        const callerWallet = me.wallet_address?.toLowerCase();
        if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
        const adminWallets = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
        if (adminWallets.length === 0) return Response.json({ error: 'Forbidden' }, { status: 403 });

        const { dryRun = true } = await req.json().catch(() => ({}));

        // Page through all SyncBlockLog entries for relicFragments.
        const allBlocks = [];
        let page = 1;
        const PAGE = 500;
        while (true) {
            const batch = await base44.asServiceRole.entities.SyncBlockLog.filter(
                { field: 'relicFragments' }, '-created_date', PAGE, page
            );
            if (!batch || batch.length === 0) break;
            allBlocks.push(...batch);
            if (batch.length < PAGE) break;
            page++;
            if (page > 50) break;
        }

        // Per-wallet aggregation: max(client_value) - max(cloud_value).
        const perWallet = new Map();
        for (const b of allBlocks) {
            const w = b.wallet_address?.toLowerCase();
            if (!w) continue;
            const cur = perWallet.get(w) || { maxClient: 0, maxCloud: 0, blocks: 0 };
            cur.maxClient = Math.max(cur.maxClient, Number(b.client_value || 0));
            cur.maxCloud = Math.max(cur.maxCloud, Number(b.cloud_value || 0));
            cur.blocks += 1;
            perWallet.set(w, cur);
        }

        const refundPlan = [];
        for (const [wallet, agg] of perWallet) {
            const refund = Math.max(0, agg.maxClient - agg.maxCloud);
            if (refund > 0) {
                refundPlan.push({
                    wallet,
                    refund,
                    blocks: agg.blocks,
                    maxClient: agg.maxClient,
                    maxCloud: agg.maxCloud,
                });
            }
        }
        refundPlan.sort((a, b) => b.refund - a.refund);

        const totalWallets = refundPlan.length;
        const totalFragments = refundPlan.reduce((s, r) => s + r.refund, 0);

        if (dryRun) {
            return Response.json({
                dryRun: true,
                totalWallets,
                totalFragments,
                blocksScanned: allBlocks.length,
                preview: refundPlan.slice(0, 50),
            });
        }

        // Live mode — credit each wallet, skip if marker already set.
        const results = { credited: 0, skipped: 0, failed: 0, fragmentsAdded: 0, errors: [] };
        for (const row of refundPlan) {
            try {
                const saves = await base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: row.wallet });
                if (saves.length === 0) { results.skipped++; continue; }
                const save = saves[0];
                const sd = typeof save.save_data === 'string' ? JSON.parse(save.save_data) : save.save_data;
                if (sd._fragmentRefundApplied) { results.skipped++; continue; }

                const newTotal = Number(sd.relicFragments || 0) + row.refund;
                sd.relicFragments = newTotal;
                sd._fragmentRefundApplied = true;
                sd._fragmentRefundAmount = row.refund;
                sd._fragmentRefundDate = Date.now();
                sd.updated_at = Date.now();

                await base44.asServiceRole.entities.PlayerSave.update(save.id, {
                    save_data: sd,
                    updated_at: Date.now(),
                });
                results.credited++;
                results.fragmentsAdded += row.refund;
            } catch (e) {
                results.failed++;
                results.errors.push({ wallet: row.wallet, error: e.message });
            }
        }

        // Audit log for the operation.
        try {
            await base44.asServiceRole.entities.AdminChangesLog.create({
                wallet_address: callerWallet,
                action_type: 'reward_adjustment',
                description: `Refunded ${results.fragmentsAdded} relic fragments to ${results.credited} players (anti-cheat false positive recovery)`,
                details: {
                    totalWallets,
                    totalFragments,
                    credited: results.credited,
                    skipped: results.skipped,
                    failed: results.failed,
                    blocksScanned: allBlocks.length,
                },
            });
        } catch (e) {
            console.warn('[refundLostRelicFragments] audit log failed:', e.message);
        }

        return Response.json({
            dryRun: false,
            totalWallets,
            totalFragments,
            blocksScanned: allBlocks.length,
            results,
        });
    } catch (error) {
        console.error('[refundLostRelicFragments]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});