import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { OmenXServerSDK } from 'npm:@omen.foundation/game-sdk@1.0.33';

// Admin-only: fetch a target wallet's NFT inventory + VIP level.
// Used by the AdminPlayers panel for player operations.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS when there's no auth context — catch it for a clean 401.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const callerWallet = me.wallet_address?.toLowerCase();
        if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });

        const adminWallets = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
        if (adminWallets.length === 0) return Response.json({ error: 'Forbidden' }, { status: 403 });

        const { walletAddress } = await req.json();
        if (!walletAddress || typeof walletAddress !== 'string') {
            return Response.json({ error: 'walletAddress required' }, { status: 400 });
        }
        const target = walletAddress.trim();

        let apiBaseUrlEnv = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        if (!apiBaseUrlEnv.startsWith('http')) apiBaseUrlEnv = `https://${apiBaseUrlEnv}`;

        // ---- NFTs ----
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

        let nfts = null;
        let nftError = null;
        let lastStatus = 0;
        for (const key of shuffled) {
            const res = await fetch(`${apiBaseUrlEnv}/v1/players/${target}?chainId=56`, {
                headers: { 'Authorization': `Bearer ${key}` },
            });
            if (res.ok) {
                const data = await res.json();
                nfts = data?.nfts || [];
                break;
            }
            lastStatus = res.status;
            if (res.status !== 429 && res.status < 500) {
                nftError = `HTTP ${res.status}`;
                break;
            }
        }
        if (nfts === null && !nftError) nftError = `HTTP ${lastStatus || 'unknown'}`;

        // ---- VIP ----
        const sdk = new OmenXServerSDK({
            apiKey: Deno.env.get('OMENX_AUTH_API_KEY'),
            apiBaseUrl: apiBaseUrlEnv,
        });
        const vipLevel = await sdk.getPlayerGameBonusPointsLevel(target).catch((e) => {
            console.error('[getPlayerNftsAndVip] vip failed:', e.message);
            return 0;
        });

        console.log(`[getPlayerNftsAndVip] admin=${callerWallet} target=${target} nfts=${nfts?.length ?? 'err'} vip=${vipLevel ?? 0}`);
        return Response.json({
            walletAddress: target,
            nfts: nfts || [],
            nftError,
            vipLevel: vipLevel ?? 0,
        });
    } catch (error) {
        console.error('[getPlayerNftsAndVip]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});