import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Returns ONLY the player's NFT inventory. Manual-refresh from NFT Dashboard, 24h client cooldown.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const me = await base44.auth.me();
        if (!me) return Response.json({ nfts: [] });

        const walletAddress = me.wallet_address;
        if (!walletAddress) return Response.json({ nfts: [] });

        let apiBaseUrlEnv = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        if (!apiBaseUrlEnv.startsWith('http')) apiBaseUrlEnv = `https://${apiBaseUrlEnv}`;

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
        const shuffled = apiKeys.map(k => ({ k, r: Math.random() })).sort((a, b) => a.r - b.r).map(x => x.k);

        let lastStatus = 0;
        for (const key of shuffled) {
            const res = await fetch(`${apiBaseUrlEnv}/v1/players/${walletAddress}?chainId=56`, {
                headers: { 'Authorization': `Bearer ${key}` },
            });
            if (res.ok) {
                const data = await res.json();
                const nfts = data?.nfts || [];
                console.log(`[getNFTs] wallet=${walletAddress} nfts=${nfts.length}`);
                return Response.json({ nfts });
            }
            lastStatus = res.status;
            // 404 is WALLET-dependent, not key-dependent (all 9 keys returned 200 for
            // a live wallet, verified 2026-07-31), so retrying across keys can never
            // succeed — it just multiplies one 404 into nine.
            if (res.status !== 429 && res.status < 500) {
                console.error(`[getNFTs] HTTP ${res.status} wallet=${walletAddress} player=${me.full_name || 'unknown'} — not retrying`);
                return Response.json({ error: `HTTP ${res.status}`, nfts: null, reason: `http_${res.status}` }, { status: 502 });
            }
            console.warn('[getNFTs] HTTP', res.status, '— trying next key');
        }
        console.error('[getNFTs] All keys exhausted, last status:', lastStatus);
        return Response.json({ error: `HTTP ${lastStatus}`, nfts: null }, { status: 502 });
    } catch (error) {
        console.error('[getNFTs]', error.message);
        return Response.json({ error: error.message, nfts: null }, { status: 502 });
    }
});