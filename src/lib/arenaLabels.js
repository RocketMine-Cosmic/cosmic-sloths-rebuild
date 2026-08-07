// Shared admin display helper — turns raw arena_id values into human-friendly
// labels that match the actual in-game UI (so admins triaging scores aren't
// guessing which "void" or "plasma" map a player ran).
//
// Order MUST mirror functions/saveScore.js ARENA_ORDER + game/Constants.js ARENAS.

const SECTOR_ORDER = ['station', 'asteroid', 'nebula', 'void', 'plasma', 'crystal', 'moon', 'blackhole', 'mothership', 'dimension', 'galactic_core', 'pillars', 'saturnian', 'andromeda', 'painters_spiral', 'harmony', 'chromatic', 'stormfront', 'supernova', 'devourer'];

const NAMES = {
    station:    'Azure Expanse',
    asteroid:   'Mystic Cosmos',
    nebula:     'Ethereal Nebula',
    void:       'Crimson Void',
    plasma:     'Solar Storm',
    crystal:    'Emerald Galaxy',
    moon:       'Shattered Core',
    blackhole:  'Abyssal Vortex',
    mothership: 'Turquoise Drift',
    dimension:  'Rainbow Rift',
    galactic_core: 'The Galactic Core',
    pillars:    'Pillars of Creation',
    saturnian:  'Saturnian Reach',
    andromeda:  'Andromeda\'s Edge',
    painters_spiral: 'The Painter\'s Spiral',
    harmony:    'Harmony Drift',
    chromatic:  'Chromatic Tides',
    stormfront: 'Stormfront Nebula',
    supernova:  'Supernova Heart',
    devourer:   'The Devourer',
    endless:    'Endless Mode',
    world_boss_arena: 'Global Raid',
};

// Returns "S1 · Azure Expanse" for sectors, "♾️ Endless" for endless,
// "👑 Global Raid" for world boss, or the raw id if unknown.
export function arenaLabel(id) {
    if (!id) return '—';
    const idx = SECTOR_ORDER.indexOf(id);
    if (idx >= 0) return `S${idx + 1} · ${NAMES[id]}`;
    if (id === 'endless') return '♾️ Endless';
    if (id === 'world_boss_arena') return '👑 Global Raid';
    return id;
}

// Short version for tight columns: "S1", "♾️", "👑", or raw id.
export function arenaShortLabel(id) {
    if (!id) return '—';
    const idx = SECTOR_ORDER.indexOf(id);
    if (idx >= 0) return `S${idx + 1}`;
    if (id === 'endless') return '♾️';
    if (id === 'world_boss_arena') return '👑';
    return id;
}