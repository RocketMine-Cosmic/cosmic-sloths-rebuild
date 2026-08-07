// Admin-only authoring tool: generates a cosmetic asset image via Hugging Face
// Inference Providers, uploads it to file storage, persists a CosmeticAsset row,
// returns the static URL.
//
// Routing (2026-06-26): HF's free `hf-inference` shared endpoint deprecated all
// the premium models. So we route:
//   - FLUX.1-schnell → legacy /hf-inference/ endpoint (still hosted, uses the
//     OAuth connector token, free).
//   - Everything else → multi-provider router (fal-ai for FLUX.1-dev, etc.)
//     using a personal fine-grained HF token (HF_INFERENCE_PROVIDERS_TOKEN).
//     Billed against the token owner's HF Pro credits.
//
// Body: {
//   model_id, prompt, negative_prompt?, width?, height?,
//   cosmetic_id?, category?, rarity?, attempt?
// }
// Returns: { url, model_id, prompt, asset_id }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// model_id (the value the UI sends) → { provider URL path, body shape }.
// `path` is appended to https://router.huggingface.co — provider-native model
// IDs are baked in here so the studio UI keeps using a single friendly id.
const PROVIDER_ROUTES = {
    'black-forest-labs/FLUX.1-schnell': {
        path: '/hf-inference/models/black-forest-labs/FLUX.1-schnell',
        tokenSource: 'connector', // legacy endpoint, OAuth token
        bodyShape: 'hf-inference',
    },
    'black-forest-labs/FLUX.1-dev': {
        // No ?_subdomain=queue — that returns a queue token that HF won't
        // proxy back to. Plain /fal-ai/ blocks until the image is ready.
        path: '/fal-ai/fal-ai/flux/dev',
        tokenSource: 'pro_token',
        bodyShape: 'fal',
    },
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

        const {
            model_id,
            prompt,
            negative_prompt,
            width,
            height,
            cosmetic_id,
            category,
            rarity,
            attempt,
        } = await req.json();

        if (!model_id || !prompt) {
            return Response.json({ error: 'model_id and prompt are required' }, { status: 400 });
        }
        const route = PROVIDER_ROUTES[model_id];
        if (!route) {
            return Response.json({ error: `Model ${model_id} not in routing table` }, { status: 400 });
        }

        // Pick the right token for this provider.
        let token;
        if (route.tokenSource === 'connector') {
            const conn = await base44.asServiceRole.connectors.getConnection('hugging_face');
            token = conn.accessToken;
        } else {
            token = Deno.env.get('HF_INFERENCE_PROVIDERS_TOKEN');
            if (!token) return Response.json({ error: 'HF_INFERENCE_PROVIDERS_TOKEN not set' }, { status: 500 });
        }

        // Body shape differs per provider.
        let body;
        if (route.bodyShape === 'hf-inference') {
            body = {
                inputs: prompt,
                parameters: {
                    ...(negative_prompt ? { negative_prompt } : {}),
                    ...(width ? { width } : {}),
                    ...(height ? { height } : {}),
                },
            };
        } else if (route.bodyShape === 'fal') {
            // fal-ai uses image_size as a width/height object, not separate params.
            body = {
                prompt,
                ...(width && height ? { image_size: { width: Number(width), height: Number(height) } } : {}),
                ...(negative_prompt ? { negative_prompt } : {}),
                sync_mode: true, // wait for the image, return PNG directly
            };
        }

        const hfRes = await fetch(`https://router.huggingface.co${route.path}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'image/png',
            },
            body: JSON.stringify(body),
        });

        if (!hfRes.ok) {
            const text = await hfRes.text();
            return Response.json({ error: `HF Inference ${hfRes.status}: ${text.slice(0, 500)}` }, { status: 502 });
        }

        // fal-ai with sync_mode often returns JSON containing an image URL or
        // base64 data URI instead of raw PNG bytes. Handle both.
        const contentType = hfRes.headers.get('content-type') || '';
        let imageBlob;
        if (contentType.startsWith('image/')) {
            imageBlob = await hfRes.blob();
        } else if (contentType.includes('application/json')) {
            let json = await hfRes.json();

            // fal-ai queue mode: { status: 'IN_QUEUE', status_url, response_url }.
            // Poll status_url until COMPLETED, then GET response_url for the result.
            if (json?.status === 'IN_QUEUE' || json?.status === 'IN_PROGRESS') {
                // fal-ai returns status/response URLs pointing at queue.fal.run,
                // but our token only authenticates against the HF router. Rewrite
                // the host so the polling calls go through the router too.
                const rewriteToRouter = (u) => u.replace('https://queue.fal.run/', 'https://router.huggingface.co/fal-ai/');
                const statusUrl = json.status_url ? rewriteToRouter(json.status_url) : null;
                const responseUrl = json.response_url ? rewriteToRouter(json.response_url) : null;
                if (!statusUrl || !responseUrl) {
                    return Response.json({ error: `fal-ai queue response missing URLs: ${JSON.stringify(json).slice(0, 400)}` }, { status: 502 });
                }
                const start = Date.now();
                const timeoutMs = 90_000;
                while (Date.now() - start < timeoutMs) {
                    await new Promise(r => setTimeout(r, 1500));
                    const stRes = await fetch(statusUrl, { headers: { 'Authorization': `Bearer ${token}` } });
                    if (!stRes.ok) {
                        const stBody = await stRes.text();
                        return Response.json({ error: `fal-ai status poll ${stRes.status}: ${stBody.slice(0, 300)} (url: ${statusUrl})` }, { status: 502 });
                    }
                    const st = await stRes.json();
                    if (st.status === 'COMPLETED') {
                        const finalRes = await fetch(responseUrl, { headers: { 'Authorization': `Bearer ${token}` } });
                        if (!finalRes.ok) return Response.json({ error: `fal-ai result fetch ${finalRes.status}` }, { status: 502 });
                        json = await finalRes.json();
                        break;
                    }
                    if (st.status === 'FAILED' || st.status === 'ERROR') {
                        return Response.json({ error: `fal-ai job failed: ${JSON.stringify(st).slice(0, 400)}` }, { status: 502 });
                    }
                }
                if (json?.status === 'IN_QUEUE' || json?.status === 'IN_PROGRESS') {
                    return Response.json({ error: 'fal-ai job timed out after 90s' }, { status: 504 });
                }
            }

            // fal-ai shapes: { images: [{ url }] } or { images: [{ content_type, data: 'base64...' }] }
            const first = json?.images?.[0];
            if (!first) {
                return Response.json({ error: `Unexpected fal-ai response: ${JSON.stringify(json).slice(0, 400)}` }, { status: 502 });
            }
            if (first.url) {
                const imgRes = await fetch(first.url);
                if (!imgRes.ok) return Response.json({ error: `Image fetch failed: ${imgRes.status}` }, { status: 502 });
                imageBlob = await imgRes.blob();
            } else if (typeof first === 'string' && first.startsWith('data:')) {
                // Sometimes the array entry is itself a data URI string.
                const b64 = first.split(',')[1];
                const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
                imageBlob = new Blob([bytes], { type: 'image/png' });
            } else {
                return Response.json({ error: `fal-ai image entry has neither url nor data URI: ${JSON.stringify(first).slice(0, 400)}` }, { status: 502 });
            }
        } else {
            return Response.json({ error: `Unexpected content-type: ${contentType}` }, { status: 502 });
        }

        const file = new File([imageBlob], `cosmetic-${Date.now()}.png`, { type: 'image/png' });

        const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({ file });
        const url = uploadRes?.file_url || uploadRes?.data?.file_url;
        if (!url) return Response.json({ error: 'UploadFile returned no file_url', uploadRes }, { status: 500 });

        let asset_id = null;
        try {
            const row = await base44.asServiceRole.entities.CosmeticAsset.create({
                cosmetic_id: cosmetic_id || `adhoc_${Date.now()}`,
                category: category || 'other',
                rarity: rarity || 'standard',
                url,
                model_id,
                prompt,
                negative_prompt: negative_prompt || '',
                width: width || null,
                height: height || null,
                status: 'pending_review',
                attempt: attempt || 1,
                generated_by: user.email || user.wallet_address || '',
            });
            asset_id = row?.id || null;
        } catch (persistErr) {
            console.error('[generateCosmeticAsset] CosmeticAsset.create failed:', persistErr?.message);
        }

        return Response.json({ url, model_id, prompt, asset_id });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});