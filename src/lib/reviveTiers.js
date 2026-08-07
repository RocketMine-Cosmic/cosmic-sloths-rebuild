// S8 revive escalation — single source of truth for tier boundaries + prices.
// Client uses these to show the price BEFORE the confirmation modal;
// server (purchaseSku) mirrors the same tiers to validate the incoming SKU
// against the run time on death. Any change here MUST be mirrored in
// purchaseSku's REVIVE_TIERS constant.
//
// Design (per docs/s8/PLAN_REVIVE_AND_FRAGMENTS.md §Sink 1):
//   0–4 min      → 4 OMENX  · ingame-revive
//   4–8 min      → 8 OMENX  · ingame-revive-8
//   8–11 min     → 15 OMENX · ingame-revive-15
//   11 min+ / any endless run → 25 OMENX · ingame-revive-25
//
// No weekly cap — one revive per run is already the hard limit, and each
// successive revive within a run is priced by the tier ladder above.
import { isS8OrLater } from '@/lib/seasonGate';

// timeSec = engine.time at death; arenaId lets us short-circuit endless to top tier.
export function getReviveTierForRun(timeSec, arenaId) {
    // Endless / world-boss runs → top tier straight away (any death in these
    // long-form modes is a genuine "save my progress" moment).
    if (arenaId === 'endless' || arenaId === 'world_boss_arena') {
        return { skuId: 'ingame-revive-25', cost: 25, label: '11 min+ / Endless' };
    }
    const t = Number(timeSec) || 0;
    if (t < 4 * 60)  return { skuId: 'ingame-revive',    cost: 4,  label: '0–4 min' };
    if (t < 8 * 60)  return { skuId: 'ingame-revive-8',  cost: 8,  label: '4–8 min' };
    if (t < 11 * 60) return { skuId: 'ingame-revive-15', cost: 15, label: '8–11 min' };
    return { skuId: 'ingame-revive-25', cost: 25, label: '11 min+' };
}

// S8+ uses the escalation. Before S8, everyone stays on the flat 4-OMENX SKU
// so the in-flight S7 leaderboard experience doesn't change mid-season.
export function getReviveForRun(timeSec, arenaId) {
    if (isS8OrLater()) return getReviveTierForRun(timeSec, arenaId);
    return { skuId: 'ingame-revive', cost: 4, label: 'Flat' };
}