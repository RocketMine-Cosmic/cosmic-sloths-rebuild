// Shared data model for the Wardrobe page.
//
// Pulls the existing trail / kill / skin catalogue from Constants.js and adds
// chest-tier placeholders for the categories that don't have any assets yet
// (animated icons, LB frames, title flair, mythic trails/kills, meteor FX).
//
// Chest-tier items are LOCKED at launch — no purchase, no preview asset yet.
// They show as "Drops from {tier} chests" in the grid so players know they exist.
//
// Once chest assets land in CosmeticAsset, we'll wire URLs in via the
// cosmetic_id → CosmeticAsset.url lookup the Wardrobe page already does.

import { TRAIL_COSMETICS, KILL_COSMETICS, SKIN_COSMETICS, CHARACTERS } from '@/game/Constants';
import {
    STANDARD_LB_FRAMES,
    STANDARD_ANIMATED_ICONS,
    STANDARD_TITLE_FLAIRS,
} from '@/lib/standardCosmetics';

export const CATEGORY_TABS = [
    { id: 'pilot_icon', label: 'Pilot Icon', icon: '🎭' },
    { id: 'skin', label: 'Skin', icon: '👤' },
    { id: 'trail', label: 'Trail', icon: '✨' },
    { id: 'kill_fx', label: 'Kill FX', icon: '💥' },
    { id: 'lb_frame', label: 'LB Frame', icon: '🖼️' },
    { id: 'title_flair', label: 'Title Flair', icon: '🎨' },
    { id: 'meteor_fx', label: 'Meteor FX', icon: '☄️' },
];

export const SOURCE_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'owned', label: 'Owned' },
    { id: 'standard', label: 'Standard' },
    { id: 'chest', label: 'Chest' },
    { id: 'locked', label: 'Locked' },
];

// All standard (soon-to-be-GMT) cosmetics share one flat tier — they'll all
// cost the same at GMT launch, so showing varied rarity badges just confuses
// players into thinking some are pricier than others.
const goldCostToRarity = (goldCost) => {
    if (goldCost === 0) return 'free';
    return 'standard';
};

// Convert an existing TRAIL_COSMETICS / KILL_COSMETICS entry into a Wardrobe
// item with the shared shape the grid expects.
const trailToItem = (t) => ({
    id: t.id,
    category: 'trail',
    source: t.goldCost === 0 ? 'free' : 'standard',
    name: t.name,
    desc: t.desc,
    icon: t.icon,
    rarity: goldCostToRarity(t.goldCost),
    goldCost: t.goldCost,
});

const killToItem = (k) => ({
    id: k.id,
    category: 'kill_fx',
    source: k.goldCost === 0 ? 'free' : 'standard',
    name: k.name,
    desc: k.desc,
    icon: k.icon,
    rarity: goldCostToRarity(k.goldCost),
    goldCost: k.goldCost,
});

const skinToItem = (s) => ({
    id: s.id,
    category: 'skin',
    source: s.isSeasonalReward ? 'reward' : (s.goldCost === 0 ? 'free' : 'standard'),
    name: s.name,
    desc: s.desc,
    icon: s.icon || '👤',
    rarity: s.isSeasonalReward ? 'reward' : goldCostToRarity(s.goldCost),
    goldCost: s.goldCost,
    charId: s.charId,
    color: s.color,
    isSeasonalReward: !!s.isSeasonalReward,
});

// Chest-tier placeholders (LOCKED until chest webhook → grant pipeline + assets).
// Matches the catalogue in docs/COSMETICS_REWORK_DESIGN.md sections B + C.
// Locked 2026-06-26 — see COSMETICS_REWORK_DESIGN.md § B. Cuts: Pulsing Heart,
// Cosmic Egg, Starfield (too generic / too close to the game's own background).
const CHEST_PILOT_ICONS_EPIC = [
    { id: 'animated_pilot_orbiting_moon',      name: 'Orbiting Moon',  desc: 'A small moon orbits a planet.' },
    { id: 'animated_pilot_glitch_skull',       name: 'Glitch Skull',   desc: 'Cyan skull with RGB-split glitch.' },
    { id: 'animated_pilot_rotating_blackhole', name: 'Black Hole',     desc: 'Slow-spin accretion disc.' },
    { id: 'animated_pilot_phoenix_wing',       name: 'Phoenix Wing',   desc: 'A single glowing wing emerges and retracts.' },
    { id: 'animated_pilot_eye_of_void',        name: 'Eye of the Void', desc: 'Slit-pupil eye that blinks and tracks.' },
    { id: 'animated_pilot_plasma_core',        name: 'Plasma Core',    desc: 'Pulsing cyan orb wrapped in arcing lightning.' },
];

const CHEST_LB_FRAMES_EPIC = [
    { id: 'lb_frame_gold_filigree', name: 'Gold Filigree', desc: 'Thin gold filigree border + cyan inner glow.' },
    { id: 'lb_frame_electric_arc',  name: 'Electric Arc',  desc: 'Animated arcs travelling around the border.' },
    { id: 'lb_frame_nebula_swirl',  name: 'Nebula Swirl',  desc: 'Thick nebula gradient with stars travelling around the border.' },
    { id: 'lb_frame_glitch_rgb',    name: 'RGB Glitch',    desc: 'RGB-split border that pulses.' },
];

// "Gold Leaf" (static) cut — a font colour isn't a chest reward.
const CHEST_TITLE_FLAIR_EPIC = [
    { id: 'title_style_rainbow_shimmer', name: 'Rainbow Shimmer', desc: 'Hue-shift gradient across the title text.' },
    { id: 'title_style_blue_flame',      name: 'Blue Flame',      desc: 'Flickering blue-flame outline.' },
    { id: 'title_style_liquid_chrome',   name: 'Liquid Chrome',   desc: 'Animated chrome reflection travelling across the text.' },
];

const CHEST_MYTHIC = [
    { id: 'weapon_trail_void',          category: 'trail', name: 'Void Trail',         desc: 'Deep violet with golden sparks.' },
    { id: 'weapon_trail_solar',         category: 'trail', name: 'Solar Trail',        desc: 'Solar-flare orange with white-hot core.' },
    { id: 'weapon_trail_phoenix_fire',  category: 'trail', name: 'Phoenix Fire Trail', desc: 'Orange→white→cyan gradient with feather particles.' },
    { id: 'kill_fx_coin_burst',    category: 'kill_fx',   name: 'Coin Burst',     desc: 'Gold coin shower on every kill.' },
    { id: 'kill_fx_supernova',     category: 'kill_fx',   name: 'Supernova',      desc: 'Bright white ring + golden shards.' },
    { id: 'meteor_fx_gold_lightning', category: 'meteor_fx', name: 'Gold Lightning', desc: 'Animated gold bolt on your strike line.' },
    { id: 'lb_frame_eclipse_crown',   category: 'lb_frame', name: 'Eclipse Crown', desc: 'Ornate eclipse crown — Elite chest only.' },
];

const chestEpicPilot = CHEST_PILOT_ICONS_EPIC.map(x => ({ ...x, category: 'pilot_icon', source: 'chest', rarity: 'epic', icon: '✨' }));
const chestEpicFrame = CHEST_LB_FRAMES_EPIC.map(x => ({ ...x, category: 'lb_frame', source: 'chest', rarity: 'epic', icon: '🖼️' }));
const chestEpicFlair = CHEST_TITLE_FLAIR_EPIC.map(x => ({ ...x, category: 'title_flair', source: 'chest', rarity: 'epic', icon: '🎨' }));
const chestMythic = CHEST_MYTHIC.map(x => ({ ...x, source: 'chest', rarity: 'mythic', icon: x.category === 'trail' ? '✨' : x.category === 'kill_fx' ? '💥' : x.category === 'meteor_fx' ? '☄️' : '🖼️' }));

// Standard ("Support the Devs" GMT tier) items for the chest-only categories
// that previously had no standard variants. Pure CSS / emoji — no assets.
const standardLbFrames = STANDARD_LB_FRAMES.map(x => ({
    id: x.id, name: x.name, desc: x.desc,
    category: 'lb_frame', source: 'standard', rarity: 'standard', icon: '🖼️',
}));
const standardAnimatedIcons = STANDARD_ANIMATED_ICONS.map(x => ({
    id: x.id, name: x.name, desc: x.desc,
    category: 'pilot_icon', source: 'standard', rarity: 'standard', icon: x.emoji,
}));
const standardTitleFlairs = STANDARD_TITLE_FLAIRS.map(x => ({
    id: x.id, name: x.name, desc: x.desc,
    category: 'title_flair', source: 'standard', rarity: 'standard', icon: '🎨',
}));

// Pilot-icon catalogue is the emoji picker — we don't store these as items,
// they're handled via the existing pilot_icon save field. The Wardrobe shows
// chest animated icons here.
export const ALL_WARDROBE_ITEMS = [
    ...TRAIL_COSMETICS.map(trailToItem),
    ...KILL_COSMETICS.map(killToItem),
    ...SKIN_COSMETICS.map(skinToItem),
    ...standardLbFrames,
    ...standardAnimatedIcons,
    ...standardTitleFlairs,
    ...chestEpicPilot,
    ...chestEpicFrame,
    ...chestEpicFlair,
    ...chestMythic,
];

// Determine whether a save row owns a given Wardrobe item.
// Mirrors the existing flags so already-purchased standard cosmetics stay
// equippable in the Wardrobe.
export function isItemOwned(item, save) {
    if (!item || !save) return false;
    if (item.source === 'free') return true;
    switch (item.category) {
        case 'trail':
            return (save.unlockedCosmetics || ['default']).includes(item.id);
        case 'kill_fx':
            return (save.unlockedKillEffects || ['none']).includes(item.id);
        case 'skin':
            return item.goldCost === 0 || (save.unlockedSkins || []).includes(item.id);
        case 'pilot_icon':
        case 'lb_frame':
        case 'title_flair':
        case 'meteor_fx':
            // Chest cosmetics live in the new owned_chest_cosmetics array.
            return (save.owned_chest_cosmetics || []).includes(item.id);
        default:
            return false;
    }
}

// What's currently equipped for this item's category? Returns the equipped id
// for that slot, or null. Skin slot is per-character so callers need to pass
// the active character id.
export function getEquippedId(category, save, charId) {
    if (!save) return null;
    const cosmetics = save.cosmetics || {};
    const profile = save.profile || {};
    switch (category) {
        case 'trail':       return cosmetics.trail || 'default';
        case 'kill_fx':     return cosmetics.killEffect || 'none';
        case 'skin':        return charId ? (cosmetics.skins?.[charId] || `${charId}_default`) : null;
        case 'pilot_icon':  return profile.equipped_animated_icon || null;
        case 'lb_frame':    return profile.equipped_lb_frame || null;
        case 'title_flair': return profile.equipped_title_style || null;
        case 'meteor_fx':   return profile.equipped_meteor_fx || null;
        default: return null;
    }
}