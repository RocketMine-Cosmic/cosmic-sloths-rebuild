/**
 * THE SAVE-SHAPE PROJECTION — D-187's "largest remaining piece".
 *
 * load_save() returns the REBUILD's document. Every page, every component and
 * the engine read BASE44's save shape, out of localStorage.cosmic_sloth_save.
 * This module is the one place the two meet, and it goes in ONE direction:
 *
 *     load_save() document  ->  base44-shaped save
 *
 * 🔴 WHY THIS DIRECTION AND NOT 118 PAGE EDITS. base44Client.js's own header
 * states the seam's contract — "118 modules import { base44 } and none of them
 * has to change". The engine reads `this.save.gold`, `save.cosmetics.trail`,
 * `save.permanentTalents[characterId]` in its hot loop. Rewriting those is not
 * a rename, it is a rewrite of the game. So the adapter pays the translation
 * cost once, here, exactly as save.js already pays it in the other direction
 * (FROM_BASE44, seven client-owned keys).
 *
 * 🔴 AND THE RULE THIS FILE IS WRITTEN TO: A KEY THIS PROJECTION CANNOT FILL
 * IS NAMED, NOT SILENTLY OMITTED. `UNMAPPED` below is the list, it is exported,
 * and toBase44Save() logs it once. A silent omission here reads to every caller
 * as "the player owns nothing", which is the same failure class as `me()`
 * returning null: correct-looking, total, and invisible.
 *
 * ⚠️ VERIFIED AGAINST pg_get_functiondef('load_save'), 2026-08-14, not against
 * a document. The document said 25 top-level keys; the function returns ELEVEN:
 *   period · player · save · prefs · equipped · entitlements · progression ·
 *   discovery · kills · quotas · loadout_presets
 */

/**
 * base44 keys that are READ somewhere in the app and have NO source in
 * load_save()'s document. Each is a real gap, not an oversight, and each is
 * left ABSENT rather than defaulted — an absent key reads as "unknown" to the
 * call site, a zero reads as "known to be nothing".
 */
export const UNMAPPED = {
  // Four equipped cosmetic slots exist in base44's save.profile and have no
  // column in the rebuild: player_saves carries equipped_trail_id and
  // equipped_kill_fx_id only. Read at wardrobeData.jsx / Leaderboard.jsx.
  'profile.equipped_animated_icon': 'no column in player_saves',
  'profile.equipped_lb_frame': 'no column in player_saves',
  'profile.equipped_meteor_fx': 'no column in player_saves',
  'profile.equipped_title_style': 'no column in player_saves',
  // Client-derived discovery sets. base44 stored them on the save; the rebuild
  // tracks weapon/enemy discovery but not synergy/evolution discovery.
  discoveredSynergies: 'no table in the rebuild',
  discoveredEvolutions: 'no table in the rebuild',
  // Grants with no rebuild home yet.
  sessionBuffs: 'purchase-granted xp buff; no column yet',
  adminBuff: 'admin grant; no column yet',
  globalXpBuff: 'no column yet',
  squadMeteorBuffs: 'squad wars is being replaced (D-126/D-127)',
  meteorPoolBiasAllocations: 'squad wars is being replaced (D-126/D-127)',
  titleBuff: 'server-derived per run via cs_run_title_buff (D-156) — never on the save',
  bounties: 'no table in the rebuild',
  dailyTasks: 'no table in the rebuild',
  relicPrestige: 'present on entitlements.relics[].prestige — projected, see below',
  skinColorOverride: 'no column yet',
  newGamePlusUnlocked: 'no column yet',
  isNGPlus: 'client-session flag, never server state',
};

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** progression.stat_upgrades -> { damage: 3, health: 1, … } for one tree. */
function statTree(rows, tree) {
  const out = {};
  for (const r of rows || []) if (r?.tree === tree) out[r.stat_key] = num(r.level);
  return out;
}

/** progression.weapon_upgrades -> { pulse_rifle: { damage: 2, … } } for one tree. */
function weaponTree(rows, tree) {
  const out = {};
  for (const r of rows || []) {
    if (r?.tree !== tree) continue;
    (out[r.weapon_id] ||= {})[r.stat_key] = num(r.level);
  }
  return out;
}

/** progression.talents -> { neobyte: ['t1','t2'] } for one tree. */
function talentTree(rows, tree) {
  const out = {};
  for (const r of rows || []) {
    if (r?.tree !== tree) continue;
    (out[r.character_id] ||= []).push(r.talent_id);
  }
  return out;
}

/** quotas is a LIST of rows; the call sites want one row by key. */
function quota(quotas, key) {
  return (quotas || []).find((q) => q?.quota_key === key) || null;
}

let warned = false;

/**
 * The projection. Pure — no I/O, no localStorage, no globals — so it is unit
 * testable, which is the same reason buildScoreArgs() is separate from the RPC
 * call it feeds.
 *
 * @param {object} doc  load_save()'s return value
 * @returns {object}    a base44-shaped save
 */
export function toBase44Save(doc) {
  if (!doc || typeof doc !== 'object') return null;

  const period = doc.period || {};
  const player = doc.player || {};
  const s = doc.save || {};
  const eq = doc.equipped || {};
  const ent = doc.entitlements || {};
  const prog = doc.progression || {};
  const disc = doc.discovery || {};
  const kills = doc.kills || {};

  if (!warned && typeof console !== 'undefined') {
    warned = true;
    console.warn(
      `[adapter/shape] ${Object.keys(UNMAPPED).length} base44 save keys have no source in ` +
        'load_save() and are left ABSENT rather than zeroed. See UNMAPPED in ' +
        'src/api/adapter/shape.js — each is a schema gap, not a projection bug.',
      UNMAPPED
    );
  }

  // ---- relics: entitlements.relics carries level and prestige per relic ----
  const relicLevels = {};
  const relicPrestige = {};
  const unlockedRelics = [];
  for (const r of ent.relics || []) {
    if (!r?.relic_id) continue;
    unlockedRelics.push(r.relic_id);
    relicLevels[r.relic_id] = num(r.level, 1);
    relicPrestige[r.relic_id] = num(r.prestige);
  }

  // ---- forge augments ----
  const forgeWeaponAugments = {};
  for (const f of prog.forge_weapon_augments || []) {
    if (!f?.weapon_id) continue;
    (forgeWeaponAugments[f.weapon_id] ||= {})[f.augment_id] = num(f.copies, 1);
  }
  const forgeCharAugments = {};
  for (const f of prog.forge_char_augments || []) {
    if (!f?.character_id) continue;
    (forgeCharAugments[f.character_id] ||= []).push(f.augment_id);
  }

  // ---- quotas the client reads by name ----
  const raidQ = quota(doc.quotas, 'raid_runs_daily');
  const fragQ = quota(doc.quotas, 'fragment_batches_weekly');

  const out = {
    // ---- identity. 🔴 THE BUG THIS FILE WAS WRITTEN FOR: load_save() has no
    // `profile` key. It has `player`. save.profile is read in 17 places and
    // me() read `.profile` and therefore returned null for every signed-in
    // player, which stopped SaveManager's cloud load before it began.
    profile: {
      player_name: player.player_name ?? null,
      player_title: player.player_title ?? null,
      pilot_icon: player.pilot_icon ?? null,
    },
    pilotName: player.player_name ?? '',
    hasSetProfileName: !!player.has_set_profile_name,
    player_name: player.player_name ?? null,
    player_title: player.player_title ?? null,
    pilot_icon: player.pilot_icon ?? null,
    vipLevel: num(player.vip_level),
    isFounder: !!player.is_founder,
    wallet_address: player.wallet_address ?? null,

    // ---- currencies and lifetime aggregates ----
    gold: num(s.gold),
    omenxBalance: num(s.omenx_balance),
    cosmicTokens: num(s.omenx_balance), // base44's older name for the same figure
    relicFragments: num(s.relic_fragments),
    starFragments: num(s.star_fragments),
    seasonalPoints: num(s.seasonal_points),
    totalKills: num(s.total_kills),
    totalGoldEarned: num(s.total_gold_earned),
    maxLevelReached: num(s.max_level_reached),
    // ⚠️ NAME CHANGE: the column is max_time_survived_S (seconds) and base44's
    // key is unit-less. Same unit, different name — do not rescale.
    maxTimeSurvived: num(s.max_time_survived_s),
    astralPullCount: num(s.astral_pull_count),

    // ---- multipliers and buffs the engine reads ----
    nftGoldMultiplier: num(s.nft_gold_multiplier, 1),
    nftRelicMultiplier: num(s.nft_relic_multiplier, 1),
    nftRefreshedAt: s.nft_refreshed_at ?? null,
    astralBuffs: {
      damageMult: num(s.astral_damage_mult, 1),
      maxHp: num(s.astral_max_hp),
      cooldownMult: num(s.astral_cooldown_mult, 1),
    },

    // ---- world boss ----
    worldBossCloudLevel: num(s.world_boss_cloud_level),
    worldBossCloudMaxHp: num(s.world_boss_cloud_max_hp),
    worldBossCloudCurrentHp: num(s.world_boss_cloud_current_hp),

    // ---- entitlements ----
    unlockedCharacters: (ent.characters || []).map((c) => c?.character_id).filter(Boolean),
    // 🔴 D-63: player_characters is materialised at import and the starter IS a
    // row, so this list is complete. Do NOT re-add a default starter here.
    foundCharacters: (ent.characters || []).map((c) => c?.character_id).filter(Boolean),
    unlockedCosmetics: (ent.cosmetics || []).slice(),
    unlockedTitles: (ent.titles || []).slice(),
    unlockedArenasByCharacter: { ...(ent.arenas_by_character || {}) },
    unlockedRelics,
    relicLevels,
    relicPrestige,

    // ---- equipped ----
    // base44 nests all three under `cosmetics`; the rebuild has them as
    // separate columns plus a per-character skin map.
    cosmetics: {
      trail: eq.trail_id || 'default',
      killEffect: eq.kill_fx_id || 'none',
      skins: { ...(eq.skins || {}) },
    },
    equippedRelics: Array.isArray(eq.relics) ? eq.relics.slice() : [],

    // ---- progression: three trees x three kinds ----
    permanentUpgrades: statTree(prog.stat_upgrades, 'permanent'),
    weeklyUpgrades: { weekId: period.week_id, ...statTree(prog.stat_upgrades, 'weekly') },
    seasonalUpgrades: { seasonId: period.season_id, ...statTree(prog.stat_upgrades, 'seasonal') },
    permanentWeaponUpgrades: weaponTree(prog.weapon_upgrades, 'permanent'),
    weeklyWeaponUpgrades: { weekId: period.week_id, ...weaponTree(prog.weapon_upgrades, 'weekly') },
    seasonalWeaponUpgrades: {
      seasonId: period.season_id,
      ...weaponTree(prog.weapon_upgrades, 'seasonal'),
    },
    permanentTalents: talentTree(prog.talents, 'permanent'),
    weeklyTalents: { weekId: period.week_id, ...talentTree(prog.talents, 'weekly') },
    seasonalTalents: { seasonId: period.season_id, ...talentTree(prog.talents, 'seasonal') },
    // ⚠️ The periodic trees are FILTERED server-side to the CURRENT period
    // (load_save's own header, property 3), so a weekId mismatch is impossible
    // here — SaveManager.load()'s rollover branch simply never fires on cloud
    // data. That is correct and is the rollover working, not a bug.
    forgeWeaponAugments,
    forgeCharAugments,
    forgeConvertedToday:
      s.forge_converted_date === period.day_id ? num(s.forge_converted_today) : 0,

    // ---- discovery and kill tallies ----
    encounteredEnemies: (disc.enemies || []).slice(),
    discoveredWeapons: (disc.weapons || []).slice(),
    enemyKills: { ...(kills.by_enemy || {}) },
    characterKills: { ...(kills.by_character || {}) },

    // ---- quotas the client reads directly off the save ----
    raidRuns: raidQ ? { [period.day_id]: num(raidQ.used) } : {},
    weekly_fragment_batches: fragQ ? num(fragQ.used) : 0,
    weekly_fragment_batches_week_id: period.week_id,

    // ---- daily counters ----
    dailyKills: s.daily_kills_date === period.day_id ? num(s.daily_kills) : 0,
    dailyLoginStreak: num(s.daily_login_streak),

    // ---- respec bookkeeping (D-168/D-169) ----
    poolBiasGoldRespecCount: num(s.pool_bias_gold_respec_count),
    freeBiasRespecUsed: !!s.free_bias_respec_used,

    // ---- client-owned surface, round-tripped (sync_save's c_allowed, D-77) ----
    prefs: doc.prefs ?? {},
    welcomeSeen: !!s.welcome_seen,
    loadoutPresets: Array.isArray(doc.loadout_presets) ? doc.loadout_presets.slice() : [],

    // ---- concurrency. 🔴 H-20: sync_save REFUSES a null version, and the
    // version lives at save.version — NOT at the top level and NOT on period.
    // save.js's own comment says load_save().period and is wrong.
    version: s.version ?? null,
    updated_at: s.updated_at ? Date.parse(s.updated_at) || Date.now() : Date.now(),

    // ---- period, so the client never recomputes an ISO week (D-104's trap) ----
    weekId: period.week_id,
    seasonId: period.season_id,
    dayId: period.day_id,
  };

  return out;
}

export default toBase44Save;
