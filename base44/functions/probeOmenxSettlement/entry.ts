import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { OmenXServerSDK } from 'npm:@omen.foundation/game-sdk@1.0.34';

// Admin-only one-shot probe of OmenX's /v1/purchases endpoint, bypassing our
// internal kill-switch and circuit breaker.
//
// Status semantics (confirmed by live probe against dev portal 2026-05-15):
//   • 5xx (502/503/504) → settlement DOWN. Keep purchases disabled.
//   • 402 + code=INSUFFICIENT_FUNDS → HEALTHY. OmenX accepted the request,
//     looked up the wallet, and rejected it for empty balance (expected for
//     our dead-wallet probe). Service is fine.
//   • 402 + any other code (e.g. SETTLEMENT_UNAVAILABLE) → DOWN. Upstream
//     thirdweb / Cloudflare outage; OmenX is alive but can't settle.
//   • 422 PAYMENT_FAILED → HEALTHY (legacy code, same idea as 402 INSUFFICIENT_FUNDS).
//   • 400/404 → HEALTHY (request validation working).
// We send paymentAmount=1 against the dead-wallet `0x...dEaD` so a real charge
// can never go through — we only care about which error class comes back.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        let apiBaseUrl = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        if (!apiBaseUrl.startsWith('http')) apiBaseUrl = `https://${apiBaseUrl}`;

        const apiKey = Deno.env.get('OMENX_PAYMENT_API_KEY');
        if (!apiKey) return Response.json({ error: 'No payment key configured' }, { status: 500 });

        // Optional body params:
        //   { wallet: "0x...", skuId: "...", paymentAmount: 1 }
        // When `wallet` is provided, we probe with a real funded wallet so the
        // thirdweb settlement layer actually fires. Default = dead-wallet 1 OMENX
        // probe (short-circuits at balance check, can't detect thirdweb outage).
        let body = {};
        try { body = await req.json(); } catch {}
        const wallet = body.wallet || '0x000000000000000000000000000000000000dEaD';
        const skuId = body.skuId || 'ingame-xp-buff';
        const paymentAmount = Number(body.paymentAmount) || 1;
        const deepProbe = wallet !== '0x000000000000000000000000000000000000dEaD';

        const sdk = new OmenXServerSDK({ apiKey, apiBaseUrl });
        const idempotencyKey = `probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const start = Date.now();
        try {
            const res = await sdk.createPurchase({
                playerWallet: wallet,
                skuId,
                quantity: 1,
                idempotencyKey,
                paymentCurrency: 'OMENX',
                paymentAmount,
            });
            return Response.json({
                healthy: true,
                durationMs: Date.now() - start,
                deepProbe,
                wallet,
                skuId,
                paymentAmount,
                res,
                verdict: deepProbe
                    ? '🟢 DEEP probe SUCCEEDED — settlement (thirdweb) is fully working'
                    : '🟢 Shallow probe succeeded unexpectedly (dead wallet was charged?!)',
            });
        } catch (err) {
            const msg = err?.message || String(err);
            const is5xx = /\b50[02-4]\b/.test(msg) || /bad gateway|gateway timeout|service unavailable/i.test(msg);
            const is402 = /\b402\b/.test(msg);
            const is422 = /\b422\b/.test(msg);
            const is4xxOther = /\b40[01345-9]\b/.test(msg); // 400/401/403/404/405...409

            // Parse the OmenX error code from the body, e.g.
            //   "402 Payment Required - {"error":{"code":"INSUFFICIENT_FUNDS",...}}"
            const codeMatch = msg.match(/"code"\s*:\s*"([A-Z_]+)"/);
            const code = codeMatch ? codeMatch[1] : null;

            // CRITICAL: OmenX reuses `PAYMENT_FAILED` for BOTH user-side failures
            // (insufficient balance, etc.) AND thirdweb RPC outages. The status
            // code alone (422/402) doesn't distinguish them — we have to look at
            // the error message body. If the message mentions an RPC error,
            // thirdweb node, eth_sendRawTransaction, etc, the settlement layer
            // is down even though OmenX's own API is responding cleanly.
            const isSettlementRpcError =
                /rpc[_ ]?error/i.test(msg)
                || /thirdweb\.com/i.test(msg)
                || /eth_sendRawTransaction/i.test(msg)
                || /eth_call/i.test(msg)
                || /chain[_ ]?node|node[_ ]?unavailable/i.test(msg)
                || /upstream[_ ]?error|gateway[_ ]?error|settlement[_ ]?unavailable/i.test(msg);

            // CRITICAL nuance for deep probes against a KNOWN-FUNDED wallet:
            // INSUFFICIENT_FUNDS is itself a symptom of the RPC outage. If OmenX
            // can't reach thirdweb to read the on-chain balance, it falls back
            // to "balance = 0" and reports INSUFFICIENT_FUNDS even though the
            // wallet has plenty. So for a deep probe, INSUFFICIENT_FUNDS is
            // a RED flag, not a green one. For the shallow dead-wallet probe,
            // INSUFFICIENT_FUNDS is correct and means settlement is healthy.
            const isInsufficient = code === 'INSUFFICIENT_FUNDS';
            const isPaymentFailed = code === 'PAYMENT_FAILED';
            const isHealthyCode = !isSettlementRpcError && (
                (isInsufficient && !deepProbe) // empty dead wallet: healthy
                || (isPaymentFailed && !deepProbe) // legacy: dead-wallet PAYMENT_FAILED is healthy too
            );
            // Codes that explicitly signal a settlement outage upstream.
            const isDownCode = code === 'SETTLEMENT_UNAVAILABLE' || code === 'UPSTREAM_ERROR' || code === 'GATEWAY_ERROR';
            // Deep probe + INSUFFICIENT_FUNDS = lying balance read = RPC outage.
            const isDeepProbeFalseEmpty = deepProbe && isInsufficient;
            // Deep probe + PAYMENT_FAILED (no RPC error string) = settlement
            // rejected an on-chain transfer for a funded wallet, which is also
            // an outage symptom (gas estimation, nonce fetch, or send failed).
            const isDeepProbePaymentFailed = deepProbe && isPaymentFailed && !isSettlementRpcError;

            const settlementDown =
                is5xx
                || isDownCode
                || isSettlementRpcError
                || isDeepProbeFalseEmpty
                || isDeepProbePaymentFailed
                || (is402 && !isHealthyCode);
            const healthy =
                !settlementDown
                && (isHealthyCode || is4xxOther);

            let verdict;
            if (is5xx) verdict = '🔴 Settlement DOWN (5xx from OmenX gateway)';
            else if (isSettlementRpcError) verdict = `🔴 Settlement DOWN — thirdweb RPC error (BSC node unreachable). Code=${code || 'unknown'}`;
            else if (isDownCode) verdict = `🔴 Settlement DOWN (${code} — upstream outage)`;
            else if (isDeepProbeFalseEmpty) verdict = '🔴 Settlement DOWN — OmenX reported INSUFFICIENT_FUNDS for a funded wallet (thirdweb balance read failed)';
            else if (isDeepProbePaymentFailed) verdict = '🔴 Settlement DOWN — funded wallet hit PAYMENT_FAILED (likely RPC outage during settle)';
            else if (is402 && isHealthyCode) verdict = `🟢 Settlement is UP — OmenX returned 402 ${code} for the dead wallet (expected)`;
            else if (is402) verdict = `🔴 Settlement DOWN (402 with code=${code || 'unknown'})`;
            else if (is422 && isHealthyCode) verdict = '🟢 Settlement is UP — OmenX returned 422 PAYMENT_FAILED (clean user-side rejection)';
            else if (healthy) verdict = '🟢 Settlement is UP — OmenX rejected our fake SKU as expected';
            else verdict = '🟡 Unexpected response — neither down-signal nor a clean 4xx';

            return Response.json({
                healthy,
                settlementDown,
                code,
                rpcError: isSettlementRpcError,
                durationMs: Date.now() - start,
                error: msg.slice(0, 800),
                verdict,
            });
        }
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});