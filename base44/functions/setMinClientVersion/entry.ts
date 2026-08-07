// Admin-gated setter for the forced-update gate.
// Writes AppConfig row { key: 'min_client_version', value: { version, message } }.
// Clients compare APP_VERSION (lib/version.js) against this value and show a
// blocking "Update Required" modal if outdated. See components/MaintenanceGate.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const VERSION_RE = /^\d+(\.\d+){0,3}$/; // e.g. "1.0.2" or "1.0.2.3"

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const me = await base44.auth.me();
        if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
        if (me.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

        const { version, message } = await req.json();
        const cleanVersion = String(version || '').trim();

        // Empty version clears the gate (no forced update).
        if (cleanVersion && !VERSION_RE.test(cleanVersion)) {
            return Response.json({ error: 'Invalid version. Use numeric semver, e.g. "1.0.2".' }, { status: 400 });
        }

        const value = {
            version: cleanVersion,
            message: (message || '').toString().slice(0, 280),
            updated_at: new Date().toISOString(),
        };

        const existing = await base44.asServiceRole.entities.AppConfig.filter({ key: 'min_client_version' });
        if (existing.length > 0) {
            await base44.asServiceRole.entities.AppConfig.update(existing[0].id, {
                value,
                updated_by: me.wallet_address || me.email,
            });
        } else {
            await base44.asServiceRole.entities.AppConfig.create({
                key: 'min_client_version',
                value,
                updated_by: me.wallet_address || me.email,
            });
        }

        return Response.json({ success: true, version: cleanVersion, message: value.message });
    } catch (error) {
        console.error('[setMinClientVersion]', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});