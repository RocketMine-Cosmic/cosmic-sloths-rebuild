// Shared maintenance/kill-switch state.
//
// Problem this solves: every OMENX-spending surface used to call
// getMaintenanceMode independently (kill-switch hook + confirmation hook +
// gate banner + confirmation modal). On the Upgrades page that was 4 polls
// firing on a 15-30s loop per player → rate-limited 429 storm → kill-switch
// flag failed to load → buttons stayed enabled.
//
// Now: ONE poller, module-level cache, ~60s refresh, persisted to localStorage
// so a 429 storm or page reload doesn't lose the last known state. Every
// component reads from the cache (cheap) instead of firing its own request.
//
// Public API:
//   getStatus()         → current cached status (sync, never throws)
//   subscribe(fn)       → fires fn(status) on each refresh, returns unsubscribe
//   refreshNow()        → force an out-of-band fetch (e.g. before a purchase)
//   isOmenxDisabled()   → convenience boolean
//
// Status shape: { omenxPurchasesDisabled, omenxPurchasesMessage, mode, message,
//                 globalXpBuff, _loadedAt }
import { base44 } from '@/api/base44Client';

const LS_KEY = 'omenx_maintenance_status_v1';
const POLL_INTERVAL_MS = 5 * 60_000; // 5 min — server cache TTL is 60s, this is plenty
const STALE_AFTER_MS = 30 * 60 * 1000; // 30 min — older cache is ignored on boot

let _status = readPersisted() || {
    omenxPurchasesDisabled: false,
    omenxPurchasesMessage: '',
    mode: 'normal',
    message: '',
    globalXpBuff: null,
    minClientVersion: '',
    minClientVersionMessage: '',
    _loadedAt: 0,
};
let _inFlight = null;
let _pollerStarted = false;
const _subscribers = new Set();

function readPersisted() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (Date.now() - (parsed._loadedAt || 0) > STALE_AFTER_MS) return null;
        return parsed;
    } catch { return null; }
}

function writePersisted(status) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(status)); } catch {}
}

function notify() {
    _subscribers.forEach(fn => { try { fn(_status); } catch {} });
}

async function fetchWithRetry() {
    const delays = [400, 900, 1800];
    let lastErr = null;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
        try {
            const res = await base44.functions.invoke('getMaintenanceMode', {});
            return res.data;
        } catch (err) {
            lastErr = err;
            const status = err?.response?.status || err?.status;
            const msg = String(err?.message || '').toLowerCase();
            // 404 is classified as transient: per Base44 docs, an existing function
            // can briefly 404 during the app-redeploy routing-table swap window or
            // when a Deno isolate cold-start fails (ISOLATE_INTERNAL_FAILURE). The
            // function code itself is fine — a quick retry resolves it.
            const isTransient = status === 404 || status === 429 || status === 502 || status === 503 || status === 504
                || msg.includes('rate limit') || msg.includes('not found');
            if (!isTransient || attempt === delays.length) throw err;
            await new Promise(r => setTimeout(r, delays[attempt]));
        }
    }
    throw lastErr;
}

async function doFetch() {
    if (_inFlight) return _inFlight; // dedupe parallel callers
    _inFlight = (async () => {
        try {
            const data = await fetchWithRetry();
            _status = {
                omenxPurchasesDisabled: !!data?.omenxPurchasesDisabled,
                omenxPurchasesMessage: data?.omenxPurchasesMessage || '',
                mode: data?.mode || 'normal',
                message: data?.message || '',
                globalXpBuff: data?.globalXpBuff || null,
                minClientVersion: data?.minClientVersion || '',
                minClientVersionMessage: data?.minClientVersionMessage || '',
                _loadedAt: Date.now(),
            };
            writePersisted(_status);
            notify();
            return _status;
        } catch {
            // Keep last-known state — DO NOT clear flags on error. A 429 storm
            // must not flip the kill-switch off.
            return _status;
        } finally {
            _inFlight = null;
        }
    })();
    return _inFlight;
}

function startPollerOnce() {
    if (_pollerStarted) return;
    _pollerStarted = true;
    // Initial fetch (only if cache is missing or stale).
    if (Date.now() - _status._loadedAt > 30_000) doFetch();
    // Skip the poll entirely when the tab is hidden — backgrounded tabs were
    // a huge chunk of baseline QPS. The visibilitychange listener below will
    // do a fresh fetch as soon as the player comes back, so they'll still see
    // admin flag changes promptly.
    setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        doFetch();
    }, POLL_INTERVAL_MS);
    // Re-fetch when the tab regains focus so admins flipping the switch get
    // picked up promptly when the player comes back from another tab.
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && Date.now() - _status._loadedAt > 60_000) doFetch();
        });
    }
}

export function getStatus() {
    startPollerOnce();
    return _status;
}

export function subscribe(fn) {
    startPollerOnce();
    _subscribers.add(fn);
    // Fire immediately with current cache so the consumer is in sync.
    try { fn(_status); } catch {}
    return () => { _subscribers.delete(fn); };
}

export function refreshNow() {
    return doFetch();
}

export function isOmenxDisabled() {
    return !!getStatus().omenxPurchasesDisabled;
}