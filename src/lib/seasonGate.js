// Single source of truth for "are we on S6 or later?" — used by client-side
// gameplay code to switch between S5 (legacy) and S6+ (rebalanced) behaviour
// at the W20→W21 rollover (Mon May 18 2026 00:00 UTC). MUST agree with the
// server-side check in functions/saveScore.js (`runSeasonId !== '2026-S5'`).
//
// Used by: GameEngine.js, PickupSystem.js, pages/Game.js (HUD score mirror).
import { getCurrentPeriodIds } from './periodIds';

// Numeric season compare — string compare breaks at 2026-S10 vs 2026-S7 ('1' < '7').
function seasonAtLeast(seasonId, year, seas) {
    const m = String(seasonId || '').match(/^(\d{4})-S(\d{1,2})$/);
    if (!m) return false;
    const y = Number(m[1]);
    const s = Number(m[2]);
    if (y > year) return true;
    if (y < year) return false;
    return s >= seas;
}

export function isS6OrLater() {
    try {
        const { season_id } = getCurrentPeriodIds();
        return season_id !== '2026-S5';
    } catch {
        // Defensive — if period calc ever throws, fall back to legacy behaviour.
        return false;
    }
}

// Boss-drop XP auto-vacuum feature gate — activates at the W21→W22 weekly
// rollover (Mon May 25 2026 00:00 UTC). When enabled, the XP orb a boss drops
// at death is tagged with `magnetSweep` so it auto-vacuums to the player
// (reuses the existing magnet_power vacuum mechanic in PickupSystem.js — no
// new code paths). Held back until W22 so the in-flight W21 leaderboard
// stays fair. Only the boss's OWN XP drop is swept; scattered mob loot still
// needs walking, so magnet-stat investment still matters throughout the run.
// Used by: game/EnemyAI.js. Anubis feedback 2026-05-22.
export function isBossVacuumEnabled() {
    try {
        const { week_id } = getCurrentPeriodIds();
        return week_id >= '2026-W22';
    } catch {
        return false;
    }
}

// S7 rebalance gate — activates at the W24→W25 rollover (Mon Jun 15 2026
// 00:00 UTC, season_id flips '2026-S6' → '2026-S7'). Used for the v4
// brainstorm package (docs/S7_DESIGN_BRAINSTORM.md):
//   §4a   Pushback CD floor (shieldBubble/aegisMatrix/burningBarrier)
//   §4a-bis Softer pushback base damage cuts (15→12, 40→28, 18→15)
//   §4b   Pushback decay in final 25% of shield lifetime
//   §4c   Nuke damage maxHp × 10 → × 2.5
//   §4d   Nuke drop rate halved
//   §4e   Outer Galaxy mob HP curve flattened
//   §4f   DD peak spawn → +1.0× score "heat" bonus (server-side mirror in saveScore.js)
//   §4g   DD enabled on Normal + Hard with scaled params (was Cosmic-only)
//   §4i   Armor → % reduction with sector-scaled cap (25-35%)
//   §4j   Sector-scaled max HP cap (2000 → up to 4600 at S20)
// Used by: GameEngine, WeaponSystem, ProjectileSystem, PickupSystem,
//          EnemyAI, EnemySpawner, UpgradeSystem, functions/saveScore.js
//          (server-side mirrors this against `season_id` it already derives).
// MUST agree with the server-side check in functions/saveScore.js.
export function isS7OrLater() {
    try {
        const { season_id } = getCurrentPeriodIds();
        return seasonAtLeast(season_id, 2026, 7);
    } catch {
        return false;
    }
}

// S8 FPS-fairness gate — activates at the W28→W29 rollover (Mon Jul 13 2026
// 00:00 UTC, season_id flips '2026-S7' → '2026-S8'). Converts frame-rate-dependent
// damage/heal ticks to real-time accumulators so 144Hz PCs, 60Hz laptops, and
// 30Hz phones all deal/heal the same DPS per real second:
//   - AoE damage pools (Flaming Lash / Napalm / Hellfire / Toxic / Venom Lash)
//     → 4Hz fixed tick (0.25s) instead of frameCount % 15
//   - Player HP regen → 1× regen per real second instead of frameCount % 60
//   - Boss HP regen (bossModifiers.regen) → 1% max HP per real second
// Held back until S8 so the in-flight S7 leaderboard stays fair — enabling
// mid-season would retroactively change every high-refresh player's DPS.
// Used by: ProjectileSystem.js, GameEngine.js, EnemyAI.js.
// Force-ON in both the builder-preview iframe AND any *.base44.app preview
// domain so all S8 UI (Sandbox tile, Fragment Express card, revive
// escalation) renders for review before W29. The live custom domain (real
// players) still uses the season check. Server saveScore independently
// enforces season_id → leaderboard safe regardless.
export function isS8OrLater() {
    if (typeof window !== 'undefined') {
        if (window.self !== window.top) return true;
        try {
            if (window.location.hostname.endsWith('.base44.app')) return true;
        } catch {}
    }
    try {
        const { season_id } = getCurrentPeriodIds();
        return seasonAtLeast(season_id, 2026, 8);
    } catch {
        return false;
    }
}