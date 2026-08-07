// Profile field source-of-truth: cosmic_sloth_save.profile (Option A, 2026-05-08).
// omenx_auth_data is OAuth-only (wallet, tokens, oauth username). Profile reads
// pull player_name / player_title / pilot_icon from the save; profile writes
// route through SaveManager → syncSave → mirrorProfileFanOut.

import { getAuthFromIndexedDB } from './indexedDbAuth.js';

function readSave() {
    try {
        const s = localStorage.getItem('cosmic_sloth_save');
        return s ? JSON.parse(s) : null;
    } catch { return null; }
}

function buildUserFromAuthAndSave(authData, save) {
    if (!authData?.walletAddress) return null;
    const profile = save?.profile || {};
    // PRIVACY: never fall back to authData.username (OAuth real name). Use anon handle.
    const anonName = `Pilot_${authData.walletAddress.slice(-6).toUpperCase()}`;
    const playerName = profile.player_name || save?.player_name || anonName;
    const playerTitle = profile.player_title || save?.player_title || '';
    const pilotIcon = profile.pilot_icon || save?.pilot_icon || '🦥';
    return {
        walletAddress: authData.walletAddress,
        wallet_address: authData.walletAddress,
        username: authData.username,
        full_name: playerName,
        player_name: playerName,
        pilot_icon: pilotIcon,
        data: {
            player_name: playerName,
            player_title: playerTitle,
            pilot_icon: pilotIcon,
        },
    };
}

/**
 * Synchronous user read — uses localStorage only. Safe in game callbacks.
 */
export function getOmenXUserSync() {
    try {
        const stored = localStorage.getItem('omenx_auth_data');
        if (!stored) return null;
        const authData = JSON.parse(stored);
        return buildUserFromAuthAndSave(authData, readSave());
    } catch {
        return null;
    }
}

/**
 * Async user read — prefers IndexedDB, falls back to localStorage.
 */
export async function getOmenXUser() {
    try {
        let authData = await getAuthFromIndexedDB();
        if (!authData) {
            authData = JSON.parse(localStorage.getItem('omenx_auth_data') || 'null');
        }
        return buildUserFromAuthAndSave(authData, readSave());
    } catch {
        return null;
    }
}

/**
 * Update profile fields. Single writer for player_name / player_title / pilot_icon —
 * persists to cosmic_sloth_save.profile and triggers SaveManager's debounced cloud
 * sync (which calls syncSave; the entity automation mirrors to RunScore/SquadMember/
 * SquadMessage server-side).
 *
 * Caller passes any subset of: { player_name, player_title, pilot_icon }.
 * Other fields are ignored (legacy callers may pass extra keys).
 */
export async function updateOmenXUser(updates) {
    if (!updates || typeof updates !== 'object') return;
    try {
        // Lazy-import to avoid a circular module init.
        const { SaveManager } = await import('@/game/SaveManager');
        const save = SaveManager.load();
        const profile = { ...(save.profile || {}) };
        if (updates.player_name !== undefined) profile.player_name = updates.player_name;
        if (updates.player_title !== undefined) profile.player_title = updates.player_title;
        if (updates.pilot_icon !== undefined) profile.pilot_icon = updates.pilot_icon;
        save.profile = profile;
        // Mirror legacy aliases so any read paths that haven't moved over still work.
        if (updates.player_name !== undefined) save.player_name = updates.player_name;
        if (updates.player_title !== undefined) save.player_title = updates.player_title;
        if (updates.pilot_icon !== undefined) save.pilot_icon = updates.pilot_icon;
        SaveManager.save(save); // dispatches saveUpdated; debounced syncSave follows
        // Notify in-flight UI listeners — CurrencyContext merges this into omenxUser.
        window.dispatchEvent(new CustomEvent('omenxUserUpdated', { detail: { ...profile } }));
    } catch (e) {
        console.error('[updateOmenXUser] failed:', e?.message || e);
    }
}