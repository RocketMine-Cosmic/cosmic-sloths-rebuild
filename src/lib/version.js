// Single source of truth for the client build version.
// Bump this when shipping a release. The MainMenu reads it, and MaintenanceGate
// compares it against the server's `min_client_version` AppConfig row — if the
// client is older, a full-screen "please update" modal blocks gameplay until
// the user reloads (cache-busting URL → fresh Vite bundle).
//
// To force a forced update: set AppConfig row { key: 'min_client_version',
// value: { version: '1.0.2' } } in the DB or admin tools, then ship the new
// client with APP_VERSION bumped to 1.0.2. Old clients will see the gate within
// ~60s (maintenanceStatus poll interval) or instantly on next tab focus.
export const APP_VERSION = '1.0.8';

// Lightweight numeric semver compare. Returns:
//   -1 if a < b
//    0 if a === b
//    1 if a > b
// Tolerates missing parts ("1.0" vs "1.0.0" treated equal). Non-semver inputs
// (null, undefined, empty string) return 0 — so a missing server config means
// "no gate".
export function compareVersions(a, b) {
    if (!a || !b) return 0;
    const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const ai = pa[i] || 0;
        const bi = pb[i] || 0;
        if (ai < bi) return -1;
        if (ai > bi) return 1;
    }
    return 0;
}

// Cache-busting reload — appends a fresh timestamp so mobile browsers and
// in-app webviews refetch index.html instead of serving the cached HTML
// (which would still point at the OLD hashed JS bundle).
export function reloadToLatest() {
    try {
        window.location.href = window.location.pathname + '?v=' + Date.now();
    } catch {
        window.location.reload();
    }
}