/**
 * THE SEAM. One module, 118 importers, 291 call sites (01 §B.5, D-74).
 *
 * It is written against SUPABASE and there is no base44 delegation path — under
 * D-74 there is no deployment in which this frontend talks to base44, so a
 * delegation branch would be a branch that can never be taken.
 *
 * The exported object keeps the base44 SDK's SHAPE so no call site has to
 * change to keep compiling: base44.functions.invoke, base44.entities.X,
 * base44.auth.*, base44.integrations.*. What changes is what happens inside,
 * and what happens for an unported name is that it says so.
 */
import { invoke } from './functions';
import { entities, integrations } from './entities';
import * as auth from './auth';
import { startRun, saveScore, buildScoreArgs, openRunUuid, clearOpenRun } from './run';
import { loadSave, syncSave, projectClientOwned, CLIENT_OWNED } from './save';
import { REGISTRY } from './registry';
import { supabase } from './supabaseClient';

export const base44 = {
  functions: { invoke },
  entities,
  integrations,
  auth: {
    me: auth.me,
    isAuthenticated: auth.isAuthenticated,
    logout: auth.logout,
    redirectToLogin: auth.redirectToLogin,
  },
};

// The calls that have no base44 name and therefore no invoke() route.
export const cs = {
  startRun,
  saveScore,
  loadSave,
  syncSave,
  omenSessionState: auth.omenSessionState,
  async setProfile(playerName, pilotIcon) {
    const { data, error } = await supabase.rpc('cs_set_profile', {
      p_player_name: playerName ?? null,
      p_pilot_icon: pilotIcon ?? null,
    });
    if (error) throw error;
    return data;
  },
  async equipTitle(titleId) {
    // NULL unequips (D-149). Note the asymmetry with setProfile, where NULL
    // means unchanged — there is only one field here.
    const { data, error } = await supabase.rpc('cs_equip_title', { p_title_id: titleId ?? null });
    if (error) throw error;
    return data;
  },
  async runTitleBuff(clientRunUuid) {
    // 🔴 The client reads the buff from the RUN'S OWN SNAPSHOT instead of
    // deriving it from its save (D-155/D-156). The client's copy of its own
    // title is exactly the value not to trust.
    const { data, error } = await supabase.rpc('cs_run_title_buff', {
      p_client_run_uuid: clientRunUuid,
    });
    if (error) throw error;
    return data;
  },
  async freePoolBiasRespec() {
    // FREE, one-time, no argument (D-168/D-169). Not a spend_gold sink and it
    // must never advance pool_bias_gold_respec_count.
    const { data, error } = await supabase.rpc('cs_free_pool_bias_respec');
    if (error) throw error;
    return data;
  },
  async weeklyBoard(weekId, limit = 100) {
    const { data, error } = await supabase.rpc('cs_weekly_board', {
      p_week_id: weekId ?? null,
      p_limit: limit,
    });
    if (error) throw error;
    return data;
  },
};

export { REGISTRY, buildScoreArgs, openRunUuid, clearOpenRun, projectClientOwned, CLIENT_OWNED, supabase };
export default base44;
