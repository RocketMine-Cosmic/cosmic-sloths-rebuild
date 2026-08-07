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

// Auth: Base44 session + 'refund_single' (or 'refund_omenx' / 'owner') permission,
// OR emergency master key.
//
// Modes:
//  - mode='preview' → returns the player's total OMENX spent so staff can see it
//  - mode='manual'  → refund a specific amount (staff-typed)
//  - mode='auto'    → refund the player's full TokenSpendLog total
//
// A reason string is REQUIRED for audit. Logged to AdminChangesLog and #economy-alerts.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { adminKey, mode, walletAddress, amount, reason } = body;

        // --- Permission check ---
        let callerLabel = '🔑 Emergency master key';
        let callerWallet = 'EMERGENCY_KEY';
        if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
            const me = await base44.auth.me();
            if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            callerWallet = me.wallet_address?.toLowerCase();
            if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
            const records = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
            if (records.length === 0) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });
            const perms = records[0].permissions || [];
            if (!perms.includes('refund_single') && !perms.includes('refund_omenx') && !perms.includes('owner')) {
                return Response.json({ error: "Forbidden — 'refund_single' permission required" }, { status: 403 });
            }
            callerLabel = `Admin \`${callerWallet.slice(0, 6)}…${callerWallet.slice(-4)}\``;
        }

        if (!walletAddress) return Response.json({ error: 'walletAddress required' }, { status: 400 });
        const target = walletAddress.toLowerCase();

        // --- Aggregate the player's spend history ---
        const spendLogs = await base44.asServiceRole.entities.TokenSpendLog.filter({ wallet_address: target }, '-created_date', 5000);
        const totalSpent = spendLogs.reduce((sum, log) => sum + (Number(log.amount) || 0), 0);
        const playerName = spendLogs[0]?.player_name || 'Unknown pilot';

        // --- Preview mode: return totals + recent purchases, no transfer ---
        if (mode === 'preview') {
            const recentPurchases = spendLogs.slice(0, 20).map(log => ({
                sku_id: log.sku_id || '(unknown)',
                amount: Number(log.amount) || 0,
                created_date: log.created_date,
                grant_type: log.grant_info?.type || null,
            }));
            return Response.json({
                preview: true,
                walletAddress: target,
                playerName,
                totalSpent,
                purchaseCount: spendLogs.length,
                lastPurchaseDate: spendLogs[0]?.created_date || null,
                recentPurchases,
            });
        }

        // --- Determine refund amount ---
        let refundAmount;
        if (mode === 'auto') {
            refundAmount = Math.floor(totalSpent);
        } else if (mode === 'manual') {
            refundAmount = Math.floor(Number(amount) || 0);
        } else {
            return Response.json({ error: 'mode must be preview | manual | auto' }, { status: 400 });
        }

        if (refundAmount <= 0) {
            return Response.json({ error: 'Refund amount must be greater than zero.' }, { status: 400 });
        }
        if (refundAmount > 100000) {
            return Response.json({ error: 'Refund amount exceeds safety cap (100,000 OMENX).' }, { status: 400 });
        }
        if (!reason || !reason.trim()) {
            return Response.json({ error: 'A reason is required for audit.' }, { status: 400 });
        }

        // --- Send the refund ---
        const apiKey = Deno.env.get('OMENX_REWARDS_API_KEY');
        let apiBaseUrl = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        if (!apiBaseUrl.startsWith('http')) apiBaseUrl = `https://${apiBaseUrl}`;

        // 30s timeout per attempt + one auto-retry on timeout/504/502/503.
        // Switched to single-grant endpoint (POST /v1/game-rewards/grant) for solo
        // refunds — batch endpoint was hanging the gateway on 1-payment requests
        // (Tijckers 2026-05-07, returned 504 with no way to tell if it processed).
        // Single-grant has a lighter pipeline.
        const sendOnce = async () => {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 30000);
            try {
                const r = await fetch(`${apiBaseUrl}/v1/game-rewards/grant`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({
                        walletAddress: target,
                        // 2026-08-03 — was String(refundAmount). Omen changed the Game
                        // Rewards API: amounts are token units as NUMBERS, decimals
                        // allowed (send 1.5, never "1500000000000000000"), and BOTH
                        // /grant and /grant-batch now reject a string with
                        // VALIDATION_ERROR. Matches the batch-endpoint fix applied
                        // across the distribute* functions the same day.
                        amount: refundAmount,
                        gameId: GAME_ID,
                        gameName: GAME_NAME,
                        metadata: {
                            type: 'single_player_refund',
                            playerName,
                            reason: reason.slice(0, 200),
                        },
                    }),
                    signal: ctrl.signal,
                });
                return r;
            } finally {
                clearTimeout(timer);
            }
        };

        let response;
        let attemptError = null;
        try {
            response = await sendOnce();
            if (response.status === 502 || response.status === 503 || response.status === 504) {
                console.warn(`[refundSinglePlayer] Got ${response.status} on first attempt — retrying once`);
                await new Promise(r => setTimeout(r, 1500));
                response = await sendOnce();
            }
        } catch (err) {
            attemptError = err;
            const isTimeout = err?.name === 'AbortError' || /timeout|abort/i.test(err?.message || '');
            if (isTimeout) {
                console.warn(`[refundSinglePlayer] First attempt timed out — retrying once`);
                await new Promise(r => setTimeout(r, 1500));
                try {
                    response = await sendOnce();
                    attemptError = null;
                } catch (err2) {
                    attemptError = err2;
                }
            }
        }

        if (!response || !response.ok) {
            // Both attempts failed (or one timed out + one returned bad status). The
            // payment status is UNKNOWN — could have processed silently or failed entirely.
            const status = response?.status;
            const detail = response ? `HTTP ${status}` : (attemptError?.message || 'network error');
            const msg = `Payment status UNKNOWN — verify on OMENX dev portal before retrying. (${detail})`;
            postDiscord('DISCORD_ECONOMY_WEBHOOK', 0xef4444, {
                title: '⚠️ Single-player refund — UNKNOWN STATUS',
                description: 'Both attempts failed or timed out. Verify whether the payment actually went through before retrying.',
                fields: [
                    { name: 'Player', value: playerName, inline: true },
                    { name: 'Amount', value: `${refundAmount.toLocaleString()} OMENX`, inline: true },
                    { name: 'Wallet', value: `\`${target}\``, inline: false },
                    { name: 'Failure', value: detail, inline: false },
                    { name: 'Triggered by', value: callerLabel, inline: false },
                ],
            });
            return Response.json({ error: msg, statusUnknown: true }, { status: 504 });
        }
        const result = await response.json();
        const txId = result?.transactionId || result?.txHash || '';

        // --- Audit log ---
        try {
            await base44.asServiceRole.entities.AdminChangesLog.create({
                wallet_address: callerWallet,
                action_type: 'other',
                description: `Single-player OMENX refund: ${refundAmount} to ${playerName}`,
                details: {
                    target_wallet: target,
                    target_player: playerName,
                    amount: refundAmount,
                    mode,
                    reason: reason.slice(0, 500),
                    tx_id: txId,
                    spend_history_total: totalSpent,
                },
            });
        } catch {}

        // --- Discord alert ---
        postDiscord('DISCORD_ECONOMY_WEBHOOK', 0xf59e0b, {
            title: '💸 Single-player OMENX refund',
            fields: [
                { name: 'Player', value: playerName, inline: true },
                { name: 'Amount', value: `${refundAmount.toLocaleString()} OMENX`, inline: true },
                { name: 'Mode', value: mode, inline: true },
                { name: 'Reason', value: reason.slice(0, 500), inline: false },
                { name: 'Triggered by', value: callerLabel, inline: false },
                { name: 'Tx', value: txId || '(none)', inline: false },
            ],
        });

        console.log(`[refundSinglePlayer] ${callerWallet} refunded ${refundAmount} OMENX to ${target} (${mode}) — reason: ${reason.slice(0, 80)}`);

        return Response.json({
            success: true,
            walletAddress: target,
            playerName,
            amount: refundAmount,
            txId,
        });
    } catch (error) {
        console.error('[refundSinglePlayer] Error:', error.message);
        postDiscord('DISCORD_ERROR_WEBHOOK', 0xef4444, {
            title: '❌ refundSinglePlayer failed',
            description: `\`\`\`${(error.message || String(error)).slice(0, 1500)}\`\`\``,
        });
        return Response.json({ error: error.message }, { status: 500 });
    }
});