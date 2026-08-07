import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { OmenXServerSDK } from 'npm:@omen.foundation/game-sdk@1.0.34';

// Scheduled probe of OmenX settlement. Auto-flips the omenx_purchases_disabled
// kill-switch based on probe results.
//
// Policy (intentionally conservative to avoid flapping):
//   • 3 consecutive failures (~15 min) → DISABLE purchases.
//     Bumped from 2 → 3 (2026-05-15) after observing thirdweb BSC node blips
//     that recover within 60–90s. We'd rather let a couple of player purchases
//     fail than yo-yo the kill-switch on transient flakiness.
//   • 3 consecutive successes (~15 min) → RE-ENABLE purchases.
//   • If an admin manually flipped the flag in the last 30 min → AUTO STAYS OUT.
//     (Manual overrides win — operator is in charge.)
//
// State stored in AppConfig key 'omenx_probe_state':
//   { consecutiveFailures, consecutiveSuccesses, lastResult, lastProbeAt, lastAutoFlipAt }

const FAILURE_THRESHOLD = 3;
const SUCCESS_THRESHOLD = 3;
const MANUAL_OVERRIDE_GRACE_MS = 30 * 60 * 1000; // 30 minutes

async function postDiscord(msg) {
    const url = Deno.env.get('DISCORD_ERROR_WEBHOOK');
    if (!url) return;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: msg }),
        });
    } catch (_) { /* swallow */ }
}

async function runProbe() {
    let apiBaseUrl = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
    if (!apiBaseUrl.startsWith('http')) apiBaseUrl = `https://${apiBaseUrl}`;
    const apiKey = Deno.env.get('OMENX_PAYMENT_API_KEY');
    if (!apiKey) throw new Error('No payment key configured');

    const sdk = new OmenXServerSDK({ apiKey, apiBaseUrl });
    // Owner wallet — has balance, so probe exercises real settlement path
    const wallet = '0xd2EBE0C69df70b97E3218fecFFA8295a00dd9B21';
    const idempotencyKey = `auto-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const start = Date.now();
    try {
        await sdk.createPurchase({
            playerWallet: wallet,
            skuId: 'ingame-xp-buff',
            quantity: 1,
            idempotencyKey,
            paymentCurrency: 'OMENX',
            paymentAmount: 1,
        });
        // Successful settlement — settlement path is healthy
        return { result: 'success', durationMs: Date.now() - start, detail: 'settlement_confirmed' };
    } catch (err) {
        const msg = err?.message || String(err);
        const is5xx = /\b50[02-4]\b/.test(msg) || /bad gateway|gateway timeout|service unavailable/i.test(msg);
        const codeMatch = msg.match(/"code"\s*:\s*"([A-Z_]+)"/);
        const code = codeMatch ? codeMatch[1] : null;
        // Probe-side issues (don't count toward streak, just log)
        const isProbeIssue = /\b401\b|INVALID_API_KEY|invalid[_ ]?key|rate[_ ]?limit|429|\b404\b|SKU_NOT_FOUND|VALIDATION_ERROR|\b400\b|IDEMPOTENCY_KEY/.test(msg);
        if (isProbeIssue) {
            return {
                result: 'inconclusive',
                durationMs: Date.now() - start,
                detail: `[${code || 'PROBE_ISSUE'}] ${msg}`.slice(0, 300),
            };
        }
        // Settlement RPC errors — OmenX/thirdweb is down
        const isSettlementRpcError =
            /rpc[_ ]?error/i.test(msg)
            || /thirdweb\.com/i.test(msg)
            || /eth_sendRawTransaction/i.test(msg)
            || /eth_call/i.test(msg)
            || /chain[_ ]?node|node[_ ]?unavailable/i.test(msg)
            || /upstream[_ ]?error|gateway[_ ]?error|settlement[_ ]?unavailable/i.test(msg);
        const isDownCode = code === 'SETTLEMENT_UNAVAILABLE' || code === 'UPSTREAM_ERROR' || code === 'GATEWAY_ERROR'
            || code === 'PAYMENT_FAILED' || code === 'BALANCE_CHECK_FAILED';
        // PAYMENT_FAILED (HTTP 422) = on-chain tx reverted / could not be broadcast.
        // Terminal "do not retry" per OmenX docs — definitive proof settlement is down.
        // BALANCE_CHECK_FAILED (HTTP 503) = RPC error reading balance — also a settlement-side failure.
        const settlementDown = is5xx || isDownCode || isSettlementRpcError;
        return {
            result: settlementDown ? 'failure' : 'inconclusive',
            durationMs: Date.now() - start,
            detail: `${code ? `[${code}${isSettlementRpcError ? '/RPC' : ''}] ` : ''}${msg}`.slice(0, 300),
        };
    }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Probe (service-role context — this function is called by a scheduled automation)
        const probe = await runProbe();

        // Load probe state
        const stateRows = await base44.asServiceRole.entities.AppConfig.filter({ key: 'omenx_probe_state' });
        const prevState = stateRows[0]?.value || {
            consecutiveFailures: 0,
            consecutiveSuccesses: 0,
            lastResult: null,
            lastProbeAt: null,
            lastAutoFlipAt: null,
        };

        // Load current kill-switch state
        const killRows = await base44.asServiceRole.entities.AppConfig.filter({ key: 'omenx_purchases_disabled' });
        const killRow = killRows[0];
        const killValue = killRow?.value || { disabled: false, message: '', updated_at: null };
        const currentlyDisabled = !!killValue.disabled;
        const killUpdatedAt = killValue.updated_at ? new Date(killValue.updated_at).getTime() : 0;

        // Was the last flip done by AUTO? If the kill-switch was changed more recently
        // than our last auto-flip (and outside the grace window), assume a human did it.
        const lastAutoFlipAt = prevState.lastAutoFlipAt ? new Date(prevState.lastAutoFlipAt).getTime() : 0;
        const manuallyChangedRecently =
            killUpdatedAt > lastAutoFlipAt + 5000 && // 5s slop for clock drift
            (Date.now() - killUpdatedAt) < MANUAL_OVERRIDE_GRACE_MS;

        // Update consecutive counters (only on conclusive results, ignore inconclusive)
        const newState = { ...prevState };
        if (probe.result === 'success') {
            newState.consecutiveSuccesses = (prevState.consecutiveSuccesses || 0) + 1;
            newState.consecutiveFailures = 0;
        } else if (probe.result === 'failure') {
            newState.consecutiveFailures = (prevState.consecutiveFailures || 0) + 1;
            newState.consecutiveSuccesses = 0;
        }
        // else: inconclusive — don't change either counter
        newState.lastResult = probe.result;
        newState.lastProbeAt = new Date().toISOString();
        newState.lastDetail = probe.detail;
        newState.lastDurationMs = probe.durationMs;

        // Decide if we should flip (only on confirmed success/failure, never on inconclusive)
        let flipTo = null; // null = no change, true = disable, false = enable
        if (!manuallyChangedRecently && probe.result !== 'inconclusive') {
            if (!currentlyDisabled && newState.consecutiveFailures >= FAILURE_THRESHOLD) {
                flipTo = true;
            } else if (currentlyDisabled && newState.consecutiveSuccesses >= SUCCESS_THRESHOLD) {
                flipTo = false;
            }
        }

        // Apply flip if needed
        if (flipTo !== null) {
            const newKillValue = {
                disabled: flipTo,
                message: flipTo
                    ? 'OMENX purchases automatically paused — settlement service returning errors. Will retry shortly.'
                    : '',
                updated_at: new Date().toISOString(),
            };
            if (killRow) {
                await base44.asServiceRole.entities.AppConfig.update(killRow.id, {
                    value: newKillValue,
                    updated_by: 'auto-toggle',
                });
            } else {
                await base44.asServiceRole.entities.AppConfig.create({
                    key: 'omenx_purchases_disabled',
                    value: newKillValue,
                    updated_by: 'auto-toggle',
                });
            }
            newState.lastAutoFlipAt = newKillValue.updated_at;

            const emoji = flipTo ? '🔴' : '🟢';
            const action = flipTo ? 'DISABLED' : 'RE-ENABLED';
            const reason = flipTo
                ? `${newState.consecutiveFailures} consecutive probe failures`
                : `${newState.consecutiveSuccesses} consecutive probe successes`;
            await postDiscord(`${emoji} **OMENX purchases auto-${action}** — ${reason}. Latest probe: ${probe.healthy ? 'healthy' : 'down'} (${probe.durationMs}ms). Detail: \`${probe.detail || 'n/a'}\``);

            // Audit log
            try {
                await base44.asServiceRole.entities.AdminChangesLog.create({
                    wallet_address: 'auto-toggle',
                    action_type: 'other',
                    description: `Auto-toggle OMENX purchases → ${action}`,
                    details: {
                        flipTo,
                        consecutiveFailures: newState.consecutiveFailures,
                        consecutiveSuccesses: newState.consecutiveSuccesses,
                        probe,
                    },
                });
            } catch (_) {}
        }

        // Persist updated probe state
        if (stateRows[0]) {
            await base44.asServiceRole.entities.AppConfig.update(stateRows[0].id, {
                value: newState,
                updated_by: 'auto-toggle',
            });
        } else {
            await base44.asServiceRole.entities.AppConfig.create({
                key: 'omenx_probe_state',
                value: newState,
                updated_by: 'auto-toggle',
            });
        }

        return Response.json({
            success: true,
            probe,
            currentlyDisabled: flipTo !== null ? flipTo : currentlyDisabled,
            flipped: flipTo !== null,
            manuallyChangedRecently,
            state: newState,
        });
    } catch (error) {
        console.error('[autoToggleOmenxPurchases]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});