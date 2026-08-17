/**
 * THE RUN LIFECYCLE — and the one place the adapter is not a translation.
 *
 * base44 has no run-start call. The rebuild does: cs_start_run() records the
 * run's PARAMETERS before it is played (arena, character, difficulty, sandbox
 * flag, boss modifiers) and cs_run_params_immutable() then refuses to let
 * save_score() change any of them. That is where H-7, H-8 and half of D-78 are
 * closed, so the adapter MUST make the call — a saveScore with no started run
 * is refused by design, not by accident.
 *
 * 🔴🔴 THE BOSS SPLIT, WHICH IS WHY THIS FILE EXISTS RATHER THAN BEING THREE
 * LINES IN functions.js. save_score()'s own comment states the contract:
 *
 *     p_pickup_gold       EXCLUDES the boss auto-credit
 *     p_boss_gold         the boss auto-credit, bounded at boss_kills * 3000
 *     p_pickup_fragments  EXCLUDES boss fragments
 *     boss fragments      NOT A PARAMETER — derived from cs_boss_reward() on
 *                         the modifiers recorded at run start, plus an NFT +1
 *                         roll the server performs itself
 *
 * The engine does not produce that split. EnemyAI.js credits boss gold into
 * `engine.gold` and boss fragments into `engine.runFragments` and keeps only
 * per-kill locals (`creditedGold` / `creditedFrags`) for the on-screen recap.
 * _runStats() therefore emits TOTALS.
 *
 * Sending those totals as the pickup figures is not a rounding error:
 *   · gold      — arithmetically right, but p_boss_gold's least(_, kills*3000)
 *                 bound is bypassed, which is the anti-cheat half of D-78.
 *   · fragments — DOUBLE-PAYS. v_frag_total = p_pickup_fragments + derived boss
 *                 fragments, and the engine's total already contains them.
 *
 * So the engine gained two accumulators (bossGold, bossFragments) and two
 * _runStats fields. This module REFUSES to submit a run whose stats lack them
 * rather than guessing — an under-credit is a bug report, an over-credit is
 * money, and a guess here is indistinguishable from either.
 */
import { supabase } from './supabaseClient';
import { AdapterError, fromPostgrest } from './errors';

const RUN_KEY = 'cs_open_run';

/** boss modifiers live on the save as {frenzy:true,…}; cs_start_run takes text[]. */
export function modifiersToArray(mods) {
  if (Array.isArray(mods)) return mods.slice().sort();
  return Object.keys(mods || {})
    .filter((k) => !!mods[k])
    .sort();
}

function newRunUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Old WebViews in the Omen iframe. Not security-relevant — the server pins
  // the uuid to the caller's own player row, so a collision is refused, not
  // exploited.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Called once, before the engine is constructed.
 * Returns the run uuid, which saveScore needs and which the offline queue must
 * carry — a queued run replayed on the next launch is a no-op on the server
 * (save_score returns duplicate:true) instead of base44's 2-minute heuristic.
 */
export async function startRun({ arenaId, characterId, difficulty, bossModifiers, isSandbox }) {
  const clientRunUuid = newRunUuid();
  // 🔴 CLEAR THE OLD KEY BEFORE WE ASK, NOT AFTER WE SUCCEED — 043.
  // saveScore() defaults its uuid to openRunUuid(), so if cs_start_run refuses
  // (a character not owned, a locked arena, a dropped connection) and the
  // PREVIOUS run's key were still in localStorage, the run about to be played
  // would be submitted against that already-final run. save_score's H-21 branch
  // answers `duplicate: true` with `gold_credited: 0` — an ok response, no
  // credit, and a run that silently vanished. With no key at all buildScoreArgs
  // throws 409 and names the cause. Refuse loudly rather than score a run the
  // player did not play.
  clearOpenRun();
  const { data, error } = await supabase.rpc('cs_start_run', {
    p_client_run_uuid: clientRunUuid,
    p_arena_id: arenaId,
    p_character_id: characterId,
    p_difficulty: difficulty,
    p_boss_modifiers: modifiersToArray(bossModifiers),
    p_is_sandbox: !!isSandbox,
  });
  if (error) throw fromPostgrest(error, 'cs_start_run');
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify({ clientRunUuid, runId: data, startedAt: Date.now() }));
  } catch (_) {}
  return clientRunUuid;
}

export function openRunUuid() {
  try {
    return JSON.parse(localStorage.getItem(RUN_KEY) || 'null')?.clientRunUuid || null;
  } catch (_) {
    return null;
  }
}

export function clearOpenRun() {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch (_) {}
}

/**
 * Build save_score's arguments from the engine's stats.
 * Exported separately from the call so it is unit-testable without a database
 * — the split is the part that can be wrong quietly.
 */
export function buildScoreArgs(stats, clientRunUuid) {
  if (!clientRunUuid) {
    throw new AdapterError(
      '[adapter] saveScore with no open run. cs_start_run() must be called before ' +
        'the engine is constructed — the run parameters are recorded there and are ' +
        'immutable afterwards (H-7/H-8, D-78).',
      409
    );
  }
  const hasSplit =
    Number.isFinite(stats?.bossGold) && Number.isFinite(stats?.bossFragments);
  if (!hasSplit) {
    throw new AdapterError(
      '[adapter] run stats carry no boss split (bossGold / bossFragments). ' +
        'save_score needs pickup figures that EXCLUDE the boss auto-credit; the ' +
        "engine's totals include it, so submitting them would double-pay fragments " +
        'and bypass the boss-gold bound. Refusing rather than guessing — D-78, and ' +
        'the A2/A3 pair in p3_021 is the test.',
      409
    );
  }
  const totalGold = Math.max(0, Math.floor(stats.gold || 0));
  const totalFrags = Math.max(0, Math.floor(stats.fragments || 0));
  const bossGold = Math.max(0, Math.floor(stats.bossGold));
  const bossFrags = Math.max(0, Math.floor(stats.bossFragments));

  // Clamp rather than allow a negative through: p_pickup_* < 0 is refused by
  // save_score with "negative quantity on the submission", which would lose the
  // player a whole run over an engine arithmetic slip.
  const pickupGold = Math.max(0, totalGold - bossGold);
  const pickupFrags = Math.max(0, totalFrags - bossFrags);

  return {
    p_client_run_uuid: clientRunUuid,
    p_kills: Math.max(0, Math.floor(stats.kills || 0)),
    p_elite_kills: Math.max(0, Math.floor(stats.elitesKilled || 0)),
    p_level: Math.max(1, Math.floor(stats.level || 1)),
    p_duration_s: Math.max(1, Math.floor(stats.time || 0)),
    p_pickup_gold: pickupGold,
    p_boss_gold: bossGold,
    p_pickup_fragments: pickupFrags,
    p_boss_kills: Math.max(0, Math.floor(stats.bossesKilled || 0)),
    p_is_victory: !!stats.isVictory,
    p_dd_peak_spawn_mult: Number(stats.ddPeakSpawnMult || 1),
    p_enemy_kills: stats.enemyKills || {},
    // D-37 / D-64 strip 'voidring' and 'squad_meteor_target' at import;
    // save_score drops unknown ids itself and RETURNS them, so nothing is
    // stripped here — a silent client-side strip would hide a real drift.
    p_encountered: Array.isArray(stats.encountered) ? stats.encountered : [],
  };
}

/**
 * 🔴 THE RETURN IS THE AUTHORITATIVE RUN RESULT AND THE UI MUST READ IT.
 * fragments_credited is NOT the number the HUD showed: the NFT relic +1 is
 * rolled server-side from player_saves.nft_relic_multiplier (cs_boss_reward is
 * IMMUTABLE and cannot hold a roll), so the client's roll and the server's are
 * independent. The end-of-run modal reads fragments_credited / gold_credited,
 * never the engine's totals.
 */
export async function saveScore(stats, clientRunUuid = openRunUuid()) {
  const args = buildScoreArgs(stats, clientRunUuid);
  const { data, error } = await supabase.rpc('save_score', args);
  if (error) throw fromPostgrest(error, 'save_score');
  clearOpenRun();
  return data;
}
