import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { OmenXServerSDK } from 'npm:@omen.foundation/game-sdk@1.0.33';

// Links the OmenX wallet to the currently-authenticated Base44 user.
// Called once after OmenX + Base44 login both succeed.
// Verifies the OmenX accessToken to prevent users from claiming arbitrary wallets.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS when there's no auth context — catch it for a clean 401.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { walletAddress: clientWallet, accessToken } = await req.json();
        if (!clientWallet || !accessToken) {
            return Response.json({ error: 'walletAddress and accessToken required' }, { status: 400 });
        }

        // Verify the OmenX token actually owns this wallet
        let apiBaseUrl = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        if (!apiBaseUrl.startsWith('http')) apiBaseUrl = `https://${apiBaseUrl}`;
        const sdk = new OmenXServerSDK({
            apiKey: Deno.env.get('OMENX_AUTH_API_KEY'),
            apiBaseUrl,
        });
        const verify = await sdk.verifyOAuthUser(accessToken);
        if (!verify.success) {
            return Response.json({ error: 'Invalid OmenX token' }, { status: 401 });
        }

        const verifiedWallet = verify.user.walletAddress.toLowerCase();
        if (verifiedWallet !== clientWallet.toLowerCase()) {
            return Response.json({ error: 'Wallet mismatch' }, { status: 401 });
        }

        // Write wallet to the Base44 user record (only if not already set or different)
        if (me.wallet_address !== verifiedWallet) {
            await base44.auth.updateMe({ wallet_address: verifiedWallet });
        }

        return Response.json({ success: true, wallet: verifiedWallet, userId: me.id });
    } catch (error) {
        console.error('[linkWalletToUser]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});