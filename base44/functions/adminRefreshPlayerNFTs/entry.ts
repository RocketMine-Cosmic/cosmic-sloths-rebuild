import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Admin-only: force a fresh NFT pull from OmenX for ANY player's wallet, then
// stamp `_nftRefreshNonce` onto their PlayerSave so their next page load wipes
// the local NFT cache and pulls the new list. Returns the fresh NFT list so
// staff can verify what the player actually owns RIGHT NOW (incl. rarity).
//
// Auth: Base44 session + 'edit_players' permission, OR emergency master key.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const { walletAddress, adminKey } = body;

        if (!walletAddress) {
            return Response.json({ error: 'walletAddress required' }, { status: 400 });
        }

        let callerWallet = 'EMERGENCY_KEY';
        if (!(adminKey && adminKey === Deno.env.get('AdminDash'))) {
            const me = await base44.auth.me();
            if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            callerWallet = me.wallet_address?.toLowerCase();
            if (!callerWallet) return Response.json({ error: 'No wallet linked' }, { status: 401 });
            const records = await base44.asServiceRole.entities.AdminWallet.filter({ wallet_address: callerWallet });
            if (records.length === 0) return Response.json({ error: 'Forbidden — not an admin' }, { status: 403 });
            const perms = records[0].permissions || [];
            if (!perms.includes('edit_players') && !perms.includes('owner')) {
                return Response.json({ error: "Forbidden — 'edit_players' permission required" }, { status: 403 });
            }
        }

        // Fetch fresh NFTs from OmenX upstream (same logic as functions/getNFTs).
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

        let nfts = null;
        let lastStatus = 0;
        for (const key of shuffled) {
            const res = await fetch(`${apiBaseUrlEnv}/v1/players/${walletAddress}?chainId=56`, {
                headers: { 'Authorization': `Bearer ${key}` },
            });
            if (res.ok) {
                const data = await res.json();
                nfts = data?.nfts || [];
                break;
            }
            lastStatus = res.status;
            if (res.status !== 429 && res.status < 500) break;
        }

        if (nfts === null) {
            return Response.json({ error: `OmenX upstream failed (HTTP ${lastStatus})` }, { status: 502 });
        }

        // Stamp nonce on PlayerSave so the client invalidates its local NFT cache
        // on next load. Find the save record (lowercased wallet match).
        const walletLower = walletAddress.toLowerCase();
        const records = await base44.asServiceRole.entities.PlayerSave.filter({ wallet_address: walletLower });
        let stamped = false;
        if (records.length > 0) {
            const row = records[0];
            const currentSave = (typeof row.save_data === 'string' ? JSON.parse(row.save_data) : row.save_data) || {};
            const nonce = Date.now();
            const newSaveData = { ...currentSave, _nftRefreshNonce: nonce, updated_at: nonce };
            await base44.asServiceRole.entities.PlayerSave.update(row.id, {
                save_data: newSaveData,
                updated_at: nonce,
            });
            stamped = true;
        }

        // Audit log
        try {
            await base44.asServiceRole.entities.AdminChangesLog.create({
                wallet_address: callerWallet,
                action_type: 'player_action',
                description: `Force-refreshed NFTs for ${walletAddress}`,
                details: { target_wallet: walletAddress, nft_count: nfts.length, stamped },
            });
        } catch (e) { console.error('[adminRefreshPlayerNFTs] audit log failed:', e.message); }

        // Build a tidy summary of NFTs (name + rarity) for the admin UI
        const summary = nfts.map(nft => {
            const name = nft.metadata?.name || 'Unknown';
            const rarityAttr = nft.metadata?.attributes?.find(a => a.trait_type === 'rarity');
            const rarity = rarityAttr?.value || '—';
            return { name, rarity, tokenId: nft.tokenId || '' };
        });

        console.log(`[adminRefreshPlayerNFTs] ${callerWallet} refreshed ${walletAddress} — ${nfts.length} NFTs, stamped=${stamped}`);
        return Response.json({ success: true, nftCount: nfts.length, summary, stamped });
    } catch (error) {
        console.error('[adminRefreshPlayerNFTs]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});