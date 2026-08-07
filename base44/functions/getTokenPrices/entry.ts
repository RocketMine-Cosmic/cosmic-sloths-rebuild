// Live USD spot price for GMT (GoMining Token) on BNB Smart Chain.
// Source: CoinGecko (free public API, no key) → DexScreener fallback.
// Switched away from OmenX SDK 2026-05-19 — their endpoint requires a
// `prices:read` scope we don't have yet. Can re-add OmenX as a primary
// source later if/when the scope is granted.
//
// Cached server-side (60s TTL) — prices barely move on this scale and we
// want to keep CoinGecko's free-tier rate-limit happy.

const CHAIN_ID = 56;

// Token contract addresses on BSC. BNB is the native token — convention is
// the zero address as a placeholder when querying alongside ERC-20s.
const TOKENS = {
    OMENX: '0x992a09877b619b4755Cabe9edaf5092A956F0317',
    GMT:   '0x7Ddc52c4De30e94Be3A6A0A2b259b2850f421989',
    BNB:   '0x0000000000000000000000000000000000000000',
};

const CACHE_TTL_MS = 60 * 1000;
let _cache = null;
let _cacheExpiresAt = 0;

Deno.serve(async (_req) => {
    try {
        const now = Date.now();
        if (_cache && now < _cacheExpiresAt) {
            return Response.json({ ...(_cache), cached: true });
        }

        // ====================================================================
        // GMT price: CoinGecko (free public API, no key needed).
        // OmenX SDK doesn't have `prices:read` scope yet — until they grant it,
        // we use CoinGecko as the source for GoMining Token's USD spot price.
        // ====================================================================
        let gmtUsd = null;
        let gmtSource = null;
        let cgErr = null;
        try {
            const cgRes = await fetch(
                'https://api.coingecko.com/api/v3/simple/price?ids=gomining-token&vs_currencies=usd',
                { headers: { 'Accept': 'application/json' } }
            );
            if (cgRes.ok) {
                const cgData = await cgRes.json();
                const price = cgData?.['gomining-token']?.usd;
                if (typeof price === 'number' && price > 0) {
                    gmtUsd = price;
                    gmtSource = 'coingecko';
                }
            } else {
                cgErr = `CoinGecko HTTP ${cgRes.status}`;
            }
        } catch (e) {
            cgErr = e?.message || String(e);
        }

        // Fallback: DexScreener (no key, pulls from PancakeSwap liquidity).
        if (gmtUsd === null) {
            try {
                const dsRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKENS.GMT}`);
                if (dsRes.ok) {
                    const dsData = await dsRes.json();
                    const pairs = dsData?.pairs || [];
                    // Pick the deepest-liquidity pair to avoid weird thin-pool prices.
                    const best = pairs
                        .filter(p => p?.priceUsd)
                        .sort((a, b) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0))[0];
                    const price = best?.priceUsd ? parseFloat(best.priceUsd) : null;
                    if (price && price > 0) {
                        gmtUsd = price;
                        gmtSource = 'dexscreener';
                    }
                }
            } catch (e) {
                cgErr = (cgErr || '') + ' | DexScreener: ' + (e?.message || String(e));
            }
        }

        if (gmtUsd === null) {
            console.error('[getTokenPrices] all external sources failed:', cgErr);
            return Response.json({
                error: 'Could not fetch GMT price from CoinGecko or DexScreener.',
                detail: cgErr,
            }, { status: 502 });
        }

        console.log(`[getTokenPrices] GMT=$${gmtUsd} (source=${gmtSource})`);

        const payload = {
            chainId: CHAIN_ID,
            fetchedAt: now,
            prices: {
                GMT: { usd: gmtUsd, source: gmtSource },
            },
        };
        _cache = payload;
        _cacheExpiresAt = now + CACHE_TTL_MS;

        return Response.json(payload);
    } catch (error) {
        console.error('[getTokenPrices]', error?.message || error);
        return Response.json({ error: error?.message || 'Failed to fetch token prices' }, { status: 500 });
    }
});