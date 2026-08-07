// Shared lookup: cosmetic_id → asset URL for chest cosmetics.
//
// Reads approved CosmeticAsset rows once on first use and caches the map.
// Used by:
//   - Wardrobe (cards + preview modal show real art instead of emoji)
//   - Leaderboard (LB frames wrap rows, animated icons replace pilot icon)
//   - Profile / squad chat (animated icons)
//
// Falls back to empty map on any failure — UI keeps working with emoji placeholders.

import { base44 } from '@/api/base44Client';

let _cachePromise = null;
let _cache = {};
let _lastFetch = 0;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — chest assets change rarely

async function fetchAssets() {
    try {
        // Only the most recent approved row per cosmetic_id wins (later attempts
        // supersede earlier rerolls). Sorted by -created_date so the first row
        // we encounter for any given cosmetic_id is the freshest approved one.
        const rows = await base44.entities.CosmeticAsset.filter(
            { status: 'approved' },
            '-created_date',
            500,
        );
        const map = {};
        for (const r of rows) {
            if (!r.cosmetic_id || !r.url) continue;
            if (!map[r.cosmetic_id]) map[r.cosmetic_id] = r.url;
        }
        _cache = map;
        _lastFetch = Date.now();
        return map;
    } catch (e) {
        console.warn('[chestCosmeticAssets] fetch failed (non-fatal):', e?.message);
        return _cache;
    }
}

// React hook-friendly synchronous accessor — returns whatever's cached and
// kicks off a background refresh if stale. Callers that need fresh data on
// first paint should await ensureChestAssetsLoaded() first.
export function getChestAssetUrl(cosmeticId) {
    if (!cosmeticId) return null;
    if (Date.now() - _lastFetch > CACHE_TTL_MS && !_cachePromise) {
        _cachePromise = fetchAssets().finally(() => { _cachePromise = null; });
    }
    return _cache[cosmeticId] || null;
}

// Force a fetch; returns the populated map. Safe to call repeatedly — coalesces.
export async function ensureChestAssetsLoaded() {
    if (Date.now() - _lastFetch < CACHE_TTL_MS) return _cache;
    if (!_cachePromise) {
        _cachePromise = fetchAssets().finally(() => { _cachePromise = null; });
    }
    return _cachePromise;
}

// Read the whole map (already-loaded only). Useful for one-shot lookups in
// components that subscribe to chestAssetsLoaded events instead of awaiting.
export function getAllChestAssets() {
    return _cache;
}