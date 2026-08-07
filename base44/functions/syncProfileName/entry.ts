import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// SHIM (Option A, 2026-05-08).
// The client now writes profile fields (player_name / player_title / pilot_icon)
// through SaveManager.save → syncSave → save_data.profile. The mirrorProfileFanOut
// entity automation propagates changes to RunScore / SquadMember / SquadMessage.
//
// This endpoint is kept for ~1 week to absorb traffic from in-flight tabs running
// the previous client. It returns success without doing anything destructive.
// Delete this file once dashboards confirm no more calls.

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const me = await base44.auth.me();
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        // Best-effort log so we can track when old clients stop calling.
        try {
            const body = await req.json().catch(() => ({}));
            console.log('[syncProfileName SHIM] legacy call from', me.wallet_address, 'fields:', Object.keys(body || {}).join(','));
        } catch {}

        return Response.json({ success: true, deprecated: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});