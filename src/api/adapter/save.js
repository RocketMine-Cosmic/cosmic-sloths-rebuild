/**
 * loadSave / syncSave.
 *
 * 🔴 sync_save IS DEFAULT-DENY AND AN UNKNOWN KEY RAISES (D-77). The client-owned
 * surface is exactly seven keys. base44's syncSave took the whole save blob and
 * merged it; sending that blob here does not partially succeed — it 400s the
 * whole call, on purpose. So the adapter PROJECTS rather than forwards, and the
 * projection is the allow-list itself.
 *
 * ⚠️ ADDING A KEY HERE IS NOT A CLIENT CHANGE. c_allowed is server-side and
 * widening it needs a D-number and two tests (see sync_save's comment).
 */
import { supabase } from './supabaseClient';
import { AdapterError, fromPostgrest } from './errors';

/**
 * 🔴🔴 THE SYNC BREAKER — 2026-08-14, and it is paid for.
 *
 * A client whose stored version had gone stale called `sync_save` **1.6 million
 * times in about half an hour** — roughly 870/second, six concurrent PostgREST
 * backends, every single call correctly REFUSED by H-20's version check.
 *
 * ⚠️ THE CHECK WORKED PERFECTLY AND THAT IS THE WHOLE LESSON. Not one bad write
 * landed; the incident was pure noise. But a loud, harmless failure repeated
 * 870 times a second is still an outage, and **nothing anywhere between the
 * caller and the database had any notion of "this already failed, stop asking".**
 * `SaveManager`'s retry ladder does not, because it treats a version conflict as
 * non-transient and throws immediately — the loop was somewhere else, and a
 * guard that only exists in one caller protects one caller.
 *
 * 🔴 SO IT LIVES IN THE SEAM. This module is the single path to `sync_save`, so
 * a breaker here binds every caller that exists or will ever exist — which is
 * the same argument that put the starter grant in `provision_player` (D-225).
 *
 * ⚠️ It is deliberately NOT a retry. It refuses, loudly, with the time
 * remaining, and lets the caller decide. Retrying a version conflict without a
 * fresh `load_save()` is the thing that caused this.
 */
const BREAKER_AFTER = 3;            // consecutive failures before it opens
const BREAKER_BASE_MS = 2_000;      // first pause
const BREAKER_MAX_MS = 60_000;      // ceiling: one attempt a minute, not hundreds a second
let _consecutiveFailures = 0;
let _breakerUntil = 0;

/** Exposed so a deliberate user action ("Retry now") can clear the pause. */
export function resetSyncBreaker() {
  _consecutiveFailures = 0;
  _breakerUntil = 0;
}

/** For diagnostics — what the breaker thinks, without having to trigger it. */
export function syncBreakerState() {
  return {
    consecutiveFailures: _consecutiveFailures,
    openForMs: Math.max(0, _breakerUntil - Date.now()),
  };
}

/** sync_save's c_allowed, mirrored. Kept as data so the projection cannot drift silently. */
export const CLIENT_OWNED = [
  'prefs',
  'welcome_seen',
  'equipped_trail_id',
  'equipped_kill_fx_id',
  'equipped_skins',
  'equipped_relics',
  'loadout_presets',
];

/** base44 save key -> the rebuild's client-owned key. Only these seven cross. */
const FROM_BASE44 = {
  prefs: 'prefs',
  welcomeSeen: 'welcome_seen',
  equippedTrailId: 'equipped_trail_id',
  equippedKillFxId: 'equipped_kill_fx_id',
  equippedSkins: 'equipped_skins',
  equippedRelics: 'equipped_relics',
  loadoutPresets: 'loadout_presets',
};

export function projectClientOwned(save) {
  const out = {};
  for (const [b44, key] of Object.entries(FROM_BASE44)) {
    if (save == null) continue;
    const v = save[b44] !== undefined ? save[b44] : save[key];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

export async function loadSave() {
  const { data, error } = await supabase.rpc('load_save');
  if (error) throw fromPostgrest(error, 'load_save');
  return data;
}

/**
 * H-20's optimistic-concurrency version is REQUIRED — sync_save raises if it is
 * null. The caller must carry the version it last saw, not invent one.
 *
 * 🔴 CORRECTED 042: an earlier version of this comment said load_save().period.
 * The version is at load_save().save.version — read from
 * pg_get_functiondef('load_save'), where `period` holds only week/season/day ids.
 */
export async function syncSave(save, expectedVersion) {
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new AdapterError(
      '[adapter] syncSave needs the version it is writing against (H-20). ' +
        'Carry it from the last load_save()/sync_save() result — sync_save refuses null.',
      400
    );
  }
  if (_breakerUntil > Date.now()) {
    throw new AdapterError(
      `[adapter] sync_save is paused for ${Math.ceil((_breakerUntil - Date.now()) / 1000)}s after ` +
        `${_consecutiveFailures} consecutive failures. Reload to pick up a fresh version — ` +
        'a stale one once produced 1.6M refusals in half an hour.',
      503
    );
  }

  const payload = projectClientOwned(save);
  const { data, error } = await supabase.rpc('sync_save', {
    p_client: payload,
    p_expected_version: expectedVersion,
  });
  if (error) {
    _consecutiveFailures += 1;
    if (_consecutiveFailures >= BREAKER_AFTER) {
      const backoff = Math.min(
        BREAKER_MAX_MS,
        BREAKER_BASE_MS * 2 ** (_consecutiveFailures - BREAKER_AFTER)
      );
      _breakerUntil = Date.now() + backoff;
      console.error(
        `[adapter] sync_save failed ${_consecutiveFailures}× consecutively — pausing ` +
          `${Math.round(backoff / 1000)}s. Reason: ${error.message}`
      );
    }
    throw fromPostgrest(error, 'sync_save');
  }
  _consecutiveFailures = 0;
  _breakerUntil = 0;
  // Returns {version, updated_at} and NOT the save — deliberately. Do not
  // "helpfully" merge it back; that is what forced base44's client to keep a
  // CLIENT_OWNED_OVERRIDES list to survive its own server's response.
  return data;
}
