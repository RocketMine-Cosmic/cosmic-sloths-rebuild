// Scheduler-only flipper for the maintenance gate. Used by two one-time
// automations to turn SOFT on at 23:00 UTC and HARD on at 23:40 UTC the night
// of the S6 rollover (Sun May 17, 2026). Turning OFF stays manual — we never
// auto-revert because if rollover breaks the operator needs to stay locked
// until they manually clear it.
//
// Hardened: this fn ONLY accepts mode='soft' or 'hard'. It cannot turn the
// gate OFF. So even if the schedule misfires the worst case is "gate goes on
// when it shouldn't" — never "gate turns off mid-incident".
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ALLOWED_MODES = ['soft', 'hard'];

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        // Automation payload shape: { args: { mode, message } } at top level OR
        // direct { mode, message }. Accept either.
        const mode = body?.args?.mode || body?.mode;
        const message = body?.args?.message || body?.message || '';

        if (!ALLOWED_MODES.includes(mode)) {
            return Response.json({ error: `mode must be one of ${ALLOWED_MODES.join(', ')}` }, { status: 400 });
        }

        const value = {
            mode,
            message: message.toString().slice(0, 280),
            updated_at: new Date().toISOString(),
        };

        const existing = await base44.asServiceRole.entities.AppConfig.filter({ key: 'maintenance_mode' });
        if (existing.length > 0) {
            await base44.asServiceRole.entities.AppConfig.update(existing[0].id, {
                value,
                updated_by: 'scheduler',
            });
        } else {
            await base44.asServiceRole.entities.AppConfig.create({
                key: 'maintenance_mode',
                value,
                updated_by: 'scheduler',
            });
        }

        console.log(`[scheduledMaintenanceFlip] gate set to ${mode}`);
        return Response.json({ success: true, mode });
    } catch (error) {
        console.error('[scheduledMaintenanceFlip]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});