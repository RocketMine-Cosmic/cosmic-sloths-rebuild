import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Admin-only diagnostic: fetches the live OmenX products catalog and reports
// the registered price for the 'bias-respec' SKU. Compares it against the
// client-side displayed cost (RESPEC_COST_OMENX = 10) so we can confirm the
// dev portal price matches what players see in the UI.

function getPaymentKeys() {
    const keys = [
        Deno.env.get('OMENX_PAYMENT_API_KEY'),
        Deno.env.get('OMENX_PAYMENT_API_KEY_2'),
        Deno.env.get('OMENX_PAYMENT_API_KEY_3'),
        Deno.env.get('OMENX_PAYMENT_API_KEY_4'),
        Deno.env.get('OMENX_PAYMENT_API_KEY_5'),
        Deno.env.get('OMENX_PAYMENT_API_KEY_6'),
        Deno.env.get('OMENX_PAYMENT_API_KEY_7'),
        Deno.env.get('OMENX_PAYMENT_API_KEY_8'),
    ].filter(Boolean);
    return keys;
}

const CLIENT_DISPLAYED_COST = 10; // mirrors RESPEC_COST_OMENX in lib/poolBias.js
const TARGET_SKU = 'bias-respec';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        // base44.auth.me() THROWS when there's no auth context — catch it for a clean 401.
        let me = null;
        try { me = await base44.auth.me(); } catch {}
        if (!me) return Response.json({ error: 'Auth required' }, { status: 401 });
        if (me.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

        let apiBaseUrl = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
        if (!apiBaseUrl.startsWith('http')) apiBaseUrl = `https://${apiBaseUrl}`;

        const keys = getPaymentKeys();
        if (keys.length === 0) {
            return Response.json({ error: 'No payment API keys configured' }, { status: 500 });
        }

        let res;
        for (const key of keys) {
            res = await fetch(`${apiBaseUrl}/v1/products`, {
                headers: { 'Authorization': `Bearer ${key}` },
            });
            if (res.ok) break;
            if (res.status !== 429 && res.status < 500) break;
        }
        if (!res || !res.ok) {
            return Response.json({ error: `Catalog fetch failed: HTTP ${res?.status}` }, { status: 500 });
        }

        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.products || data?.skus || data?.items || []);

        const target = list.find(s => {
            const id = s.sku || s.skuId || s.id || s.productId;
            return id === TARGET_SKU;
        });

        if (!target) {
            return Response.json({
                ok: false,
                error: `SKU '${TARGET_SKU}' not found in OmenX catalog`,
                catalogSize: list.length,
                sampleSkuIds: list.slice(0, 20).map(s => s.sku || s.skuId || s.id || s.productId),
            }, { status: 404 });
        }

        const portalPrice = parseFloat(
            target.pricesInCurrency?.OMENX ?? target.priceInOmenx ?? target.price ?? 0
        );

        const matches = portalPrice === CLIENT_DISPLAYED_COST;

        return Response.json({
            ok: true,
            sku: TARGET_SKU,
            portalPrice,
            clientDisplayedCost: CLIENT_DISPLAYED_COST,
            matches,
            verdict: matches
                ? `✅ Prices match — players will be charged ${portalPrice} OMENX, exactly what the UI shows.`
                : `❌ MISMATCH — UI shows ${CLIENT_DISPLAYED_COST} OMENX but dev portal will charge ${portalPrice} OMENX. Update either the portal SKU price or RESPEC_COST_OMENX in lib/poolBias.js.`,
            rawProduct: target,
        });
    } catch (error) {
        console.error('[checkBiasRespecPrice]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});