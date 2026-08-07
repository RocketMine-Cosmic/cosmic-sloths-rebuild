import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// DIAGNOSTIC — hits /v1/players/:wallet with EVERY balance key for the same
// wallet and reports each key's HTTP status, so we can see whether 404s are
// key-dependent or genuinely wallet/session-dependent.

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    let me = null;
    try { me = await base44.auth.me(); } catch {}
    if (!me || me.role !== 'admin') return Response.json({ error: 'admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));

    let apiBaseUrl = Deno.env.get('DEVELOPER_API_BASE_URL') || 'https://api.omen.foundation';
    if (!apiBaseUrl.startsWith('http')) apiBaseUrl = `https://${apiBaseUrl}`;

    // Sweep mode — one key, many wallets. Answers "which ACTIVE wallets 404?"
    if (Array.isArray(body.wallets)) {
        const key = Deno.env.get('OMENX_BALANCE_API_KEY');
        const sweep = [];
        for (const w of body.wallets.slice(0, 20)) {
            try {
                const res = await fetch(`${apiBaseUrl}/v1/players/${String(w).toLowerCase()}?chainId=56`, {
                    headers: { 'Authorization': `Bearer ${key}` },
                });
                sweep.push({ wallet: w, status: res.status });
            } catch (e) {
                sweep.push({ wallet: w, status: 'fetch error' });
            }
        }
        return Response.json({ sweep });
    }

    const wallet = (body.wallet || me.wallet_address || '').toLowerCase();
    if (!wallet) return Response.json({ error: 'no wallet' }, { status: 400 });

    // Chain mode — one wallet, one key, many chainId variants (plus no chainId
    // and mixed-case address). Answers "is the 404 caused by OUR query shape?"
    if (Array.isArray(body.chainIds)) {
        const key = Deno.env.get('OMENX_BALANCE_API_KEY');
        const variants = [
            ...body.chainIds.map(c => ({ label: `chainId=${c}`, url: `${apiBaseUrl}/v1/players/${wallet}?chainId=${c}` })),
            { label: 'no chainId', url: `${apiBaseUrl}/v1/players/${wallet}` },
            { label: 'checksum-case', url: `${apiBaseUrl}/v1/players/${body.wallet}?chainId=56` },
        ];
        const chain = [];
        for (const v of variants) {
            try {
                const res = await fetch(v.url, { headers: { 'Authorization': `Bearer ${key}` } });
                let preview = '';
                try { preview = (await res.text()).slice(0, 160); } catch {}
                chain.push({ variant: v.label, status: res.status, body: res.ok ? 'ok' : preview });
            } catch (e) {
                chain.push({ variant: v.label, status: 'fetch error', body: String(e?.message).slice(0, 120) });
            }
        }
        return Response.json({ wallet, chain });
    }

    const keyNames = ['OMENX_BALANCE_API_KEY', 'OMENX_BALANCE_API_KEY_2', 'OMENX_BALANCE_API_KEY_3',
        'OMENX_BALANCE_API_KEY_4', 'OMENX_BALANCE_API_KEY_5', 'OMENX_BALANCE_API_KEY_6',
        'OMENX_BALANCE_API_KEY_7', 'OMENX_BALANCE_API_KEY_8', 'OMENX_BALANCE_API_KEY_9'];

    const results = [];
    for (const name of keyNames) {
        const key = Deno.env.get(name);
        if (!key) { results.push({ key: name, status: 'not set' }); continue; }
        try {
            const res = await fetch(`${apiBaseUrl}/v1/players/${wallet}?chainId=56`, {
                headers: { 'Authorization': `Bearer ${key}` },
            });
            let bodyPreview = '';
            try { bodyPreview = (await res.text()).slice(0, 200); } catch {}
            results.push({ key: name, prefix: key.slice(0, 12), status: res.status, body: res.ok ? 'ok' : bodyPreview });
        } catch (e) {
            results.push({ key: name, prefix: key.slice(0, 12), status: 'fetch error', body: String(e?.message).slice(0, 120) });
        }
    }
    return Response.json({ wallet, results });
});