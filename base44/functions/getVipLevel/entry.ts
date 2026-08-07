import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { OmenXServerSDK } from 'npm:@omen.foundation/game-sdk@1.0.33';

// Returns ONLY the player's VIP level. Manual-refresh from Profile, 24h client cooldown.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS when there's no auth context — treat as unauthenticated.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ vipLevel: 0 });

        const walletAddress = me.wallet_address;
        if (!walletAddress) return Response.json({ vipLevel: 0 });

        let apiBaseUrlEnv = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        if (!apiBaseUrlEnv.startsWith('http')) apiBaseUrlEnv = `https://${apiBaseUrlEnv}`;

        const sdk = new OmenXServerSDK({
            apiKey: Deno.env.get('OMENX_AUTH_API_KEY'),
            apiBaseUrl: apiBaseUrlEnv,
        });

        const vipLevel = await sdk.getPlayerGameBonusPointsLevel(walletAddress).catch((e) => {
            console.error('[getVipLevel] failed:', e.message);
            return 0;
        });

        return Response.json({ vipLevel: vipLevel ?? 0 });
    } catch (error) {
        console.error('[getVipLevel]', error.message);
        return Response.json({ vipLevel: 0 });
    }
});