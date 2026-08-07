// Admin perk: tiny +2% boost to all base stats while playing.
// Client-side only — admins are trusted. Cached per-session so we don't
// hammer the admin endpoint on every run.
//
// Save shape: save.adminBuff = { mult: 0.02 } (or null when not an admin).
//
// IMPORTANT: This buff is S5 ONLY. At S6 rollover (2026-05-18) it auto-disables
// — S6 is a clean-slate, no-bias season. See getAdminBuff() below.

import { base44 } from '@/api/base44Client';

const ADMIN_BUFF_MULT = 0.02; // 2% to all base stats
const SESSION_KEY = 'cosmic_sloth_is_admin_v1'; // sessionStorage cache

// Compute current season id locally (mirror of lib/periodIds.js — small enough
// not to be worth an import dependency in this tiny module).
function getCurrentSeasonId() {
    const now = new Date();
    const tmp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const isoYear = tmp.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    const seasonNum = Math.floor((isoWeek - 1) / 4) + 1;
    return `${isoYear}-S${seasonNum}`;
}

let inflight = null;

async function checkIsAdmin() {
    // Try cached value first (per browser session).
    try {
        const cached = sessionStorage.getItem(SESSION_KEY);
        if (cached !== null) return cached === '1';
    } catch { /* ignore */ }

    if (inflight) return inflight;
    inflight = base44.functions.invoke('getAdminData', { type: 'adminWallets' })
        .then(res => {
            const ok = !res?.data?.error;
            try { sessionStorage.setItem(SESSION_KEY, ok ? '1' : '0'); } catch { /* ignore */ }
            return ok;
        })
        .catch(() => {
            try { sessionStorage.setItem(SESSION_KEY, '0'); } catch { /* ignore */ }
            return false;
        })
        .finally(() => { inflight = null; });
    return inflight;
}

// Returns the buff object to attach to save.adminBuff (or null).
// S5 ONLY — auto-disabled at S6 rollover (clean-slate season, no bias).
export async function getAdminBuff() {
    if (getCurrentSeasonId() !== '2026-S5') return null;
    const isAdmin = await checkIsAdmin();
    return isAdmin ? { mult: ADMIN_BUFF_MULT } : null;
}