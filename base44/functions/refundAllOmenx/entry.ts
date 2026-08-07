import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const GAME_ID = 'cosmic-sloths';
const GAME_NAME = 'Cosmic Sloths';

async function postDiscord(envName, color, payload) {
    const url = Deno.env.get(envName);
    if (!url) return;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [{ ...payload, color, timestamp: new Date().toISOString() }] }),
        });
    } catch {}
}

// Auth: Base44 session + 'refund_omenx' permission, OR emergency master key.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { adminKey, confirm_refund } = body;

        let callerWallet = 'EMERGENCY_KEY';
        if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
            const me = await base44.auth.me();
            if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            callerWallet = me.wallet_address?.toLowerCase();
            if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
            const records = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
            if (records.length === 0) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });
            const perms = records[0].permissions || [];
            if (!perms.includes('refund_omenx') && !perms.includes('owner')) {
                return Response.json({ error: "Forbidden — 'refund_omenx' permission required" }, { status: 403 });
            }
        }

        if (!confirm_refund) {
            return Response.json({ error: 'Refund must be confirmed with confirm_refund: true' }, { status: 400 });
        }

        try {
            await base44.asServiceRole.entities.AdminChangesLog.create({
                wallet_address: callerWallet,
                action_type: 'other',
                description: 'Triggered full OMENX refund',
                details: {}
            });
        } catch {}

        console.log('[refundAllOmenx] Fetching all token spend logs...');
        const spendLogs = await base44.asServiceRole.entities.TokenSpendLog.list('', 10000);

        if (!spendLogs || spendLogs.length === 0) {
            return Response.json({ success: true, refunded: 0, totalAmount: 0, message: 'No spend logs found' });
        }

        const refundMap = {};
        spendLogs.forEach(log => {
            if (log.wallet_address) {
                refundMap[log.wallet_address] = {
                    amount: (refundMap[log.wallet_address]?.amount || 0) + (log.amount || 0),
                    player_name: log.player_name
                };
            }
        });

        const payments = Object.entries(refundMap).map(([walletAddress, data]) => ({
            walletAddress,
            // 2026-08-03 — was .toString(). Omen changed the Game Rewards API:
            // amounts are token units as NUMBERS and grant-batch rejects a string
            // with VALIDATION_ERROR. Math.floor is kept as-is — the API allows
            // decimals now, but rounding down is this function's existing
            // behaviour and changing it would change what players are refunded.
            amount: Math.floor(data.amount),
            player_name: data.player_name
        }));

        const apiKey = Deno.env.get('OMENX_REWARDS_API_KEY');
        let apiBaseUrl = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        if (!apiBaseUrl.startsWith('http')) apiBaseUrl = `https://${apiBaseUrl}`;

        const response = await fetch(`${apiBaseUrl}/v1/game-rewards/grant-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                payments,
                gameId: GAME_ID,
                gameName: GAME_NAME,
                note: 'full system refund'
            }),
        });

        const batchResult = await response.json();
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${JSON.stringify(batchResult)}`);
        }

        const totalRefunded = Object.values(refundMap).reduce((sum, data) => sum + data.amount, 0);
        console.log(`[refundAllOmenx] Refund complete: ${payments.length} wallets, ${totalRefunded} OMENX total`);

        postDiscord('DISCORD_ECONOMY_WEBHOOK', 0xf59e0b, {
            title: '🚨 FULL OMENX REFUND issued',
            fields: [
                { name: 'Triggered by', value: callerWallet === 'EMERGENCY_KEY' ? '🔑 Emergency master key' : `Admin \`${callerWallet.slice(0, 6)}…${callerWallet.slice(-4)}\``, inline: false },
                { name: 'Wallets refunded', value: String(payments.length), inline: true },
                { name: 'Total OMENX', value: totalRefunded.toLocaleString(), inline: true },
                { name: 'Tx', value: batchResult?.transactionId || batchResult?.txHash || '(none)', inline: false },
            ],
        });

        return Response.json({
            success: true,
            refunded: payments.length,
            totalAmount: totalRefunded,
            txId: batchResult?.transactionId || batchResult?.txHash || '',
            failedWallets: [],
        });
    } catch (error) {
        console.error('[refundAllOmenx] Error:', error.message);
        postDiscord('DISCORD_ERROR_WEBHOOK', 0xef4444, {
            title: '❌ refundAllOmenx failed',
            description: `\`\`\`${(error.message || String(error)).slice(0, 1500)}\`\`\``,
        });
        return Response.json({ error: error.message }, { status: 500 });
    }
});