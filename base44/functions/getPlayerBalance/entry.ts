import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Returns ONLY the live OMENX balance — fast, called frequently after purchases.
// Auth: Base44 session. Wallet: from linked User.wallet_address.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS when there's no auth context — catch it cleanly.
        // Returning ok:false (not ok:true with balance=0) so the client doesn't
        // overwrite a real cached balance with a phantom zero during a page-load race.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ balance: 0, ok: false, reason: 'unauthenticated' });

        const walletAddress = me.wallet_address;
        if (!walletAddress) return Response.json({ balance: 0, ok: false, reason: 'no_wallet' });

        let apiBaseUrlEnv = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        if (!apiBaseUrlEnv.startsWith('http')) apiBaseUrlEnv = `https://${apiBaseUrlEnv}`;

        // Load balance across multiple balance API keys (each 100 req/min). Pick one at random
        // per request so concurrent users distribute evenly; on rate-limit (429), try the next.
        const apiKeys = [
            Deno.env.get('OMENX_BALANCE_API_KEY'),
            Deno.env.get('OMENX_BALANCE_API_KEY_2'),
            Deno.env.get('OMENX_BALANCE_API_KEY_3'),
            Deno.env.get('OMENX_BALANCE_API_KEY_4'),
            Deno.env.get('OMENX_BALANCE_API_KEY_5'),
            Deno.env.get('OMENX_BALANCE_API_KEY_6'),
            Deno.env.get('OMENX_BALANCE_API_KEY_7'),
            Deno.env.get('OMENX_BALANCE_API_KEY_8'),
            Deno.env.get('OMENX_BALANCE_API_KEY_9'),
        ].filter(Boolean);

        if (apiKeys.length === 0) {
            console.error('[getPlayerBalance] No balance API keys configured');
            return Response.json({ balance: 0, ok: false, reason: 'no_keys' });
        }

        // Shuffle keys so retries hit different ones
        const shuffled = apiKeys.map(k => ({ k, r: Math.random() })).sort((a, b) => a.r - b.r).map(x => x.k);

        let lastStatus = 0;
        for (const key of shuffled) {
            const res = await fetch(`${apiBaseUrlEnv}/v1/players/${walletAddress}?chainId=56`, {
                headers: { 'Authorization': `Bearer ${key}` },
            });
            if (res.ok) {
                const data = await res.json();
                const omenxToken = data?.balances?.tokens?.find(t => t.symbol === 'OMENX');
                const balance = parseFloat(omenxToken?.balance ?? '0');
                return Response.json({ balance, ok: true });
            }
            lastStatus = res.status;
            // 404 is WALLET-dependent, NOT key-dependent — verified 2026-07-31 by
            // probing all 9 balance keys against a live wallet: every key returned
            // 200. So retrying a 404 across keys can never succeed; it just turns
            // one 404 into nine (nine billable calls + nine dev-portal log entries
            // per poll). Bail on the first 404 and let the client latch off polling.
            // Other non-retryable client errors (e.g. 401) — bail immediately.
            // Returning ok:false so the client preserves its cached balance instead of
            // flashing "0 OMENX" to a player whose real balance just temporarily failed to fetch.
            if (res.status !== 429 && res.status < 500) {
                console.error(`[getPlayerBalance] HTTP ${res.status} wallet=${walletAddress} player=${me.full_name || 'unknown'} — not retrying`);
                return Response.json({ balance: 0, ok: false, reason: `http_${res.status}` });
            }
            console.warn('[getPlayerBalance] HTTP', res.status, '— trying next key');
        }
        console.error('[getPlayerBalance] All', shuffled.length, 'keys exhausted, last status:', lastStatus);
        return Response.json({ balance: 0, ok: false, reason: `exhausted_${lastStatus}` });
    } catch (error) {
        console.error('[getPlayerBalance]', error.message);
        return Response.json({ balance: 0, ok: false, reason: 'exception' });
    }
});