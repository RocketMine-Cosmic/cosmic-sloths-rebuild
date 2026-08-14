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
  const payload = projectClientOwned(save);
  const { data, error } = await supabase.rpc('sync_save', {
    p_client: payload,
    p_expected_version: expectedVersion,
  });
  if (error) throw fromPostgrest(error, 'sync_save');
  // Returns {version, updated_at} and NOT the save — deliberately. Do not
  // "helpfully" merge it back; that is what forced base44's client to keep a
  // CLIENT_OWNED_OVERRIDES list to survive its own server's response.
  return data;
}
