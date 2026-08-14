/**
 * functions.invoke — the dispatcher. 201 of the 291 call sites arrive here.
 *
 * Contract kept from 01 §B.5, because the call sites are written against it and
 * are NOT being edited: invoke() resolves to { data }, and it accepts a DYNAMIC
 * name (SquadWars.jsx:68 passes a variable).
 */
import { REGISTRY } from './registry';
import { NotPortedError, RetiredError, AdapterError } from './errors';
import { supabase } from './supabaseClient';
import { loadSave, syncSave } from './save';
import { saveScore } from './run';
import { toBase44Save } from './shape';
import { fromPostgrest } from './errors';

const warned = new Set();

const HANDLERS = {
  /**
   * 🔴 FIXED 2026-08-14, session 042 — THE ENVELOPE, not just the shape.
   *
   * This returned load_save()'s bare document. Its caller is SaveManager.js:225:
   *
   *     const response = res.data;
   *     ...
   *     if (response?.saveData) { …merge cloud into local… }
   *
   * `saveData` was undefined, so that whole branch was SKIPPED — no error, no
   * warning, no throw. The player silently ran on local-only data with their
   * cloud progress never loaded. Four components read `res.data.saveData` the
   * same way (FragmentExpressCard, MysteryForgeCard, RelicPrestigeBadge, …).
   *
   * So the handler returns base44's envelope — { saveData, wipeEpoch } — with
   * the document PROJECTED into base44's save shape by ./shape.js. That is
   * D-187's "largest remaining piece", and it lives in one file rather than in
   * 118 page edits.
   *
   * ⚠️ wipeEpoch is deliberately 0: the rebuild has no wipe-epoch concept, and
   * SaveManager treats 0 as "no epoch" and skips the wipe branch entirely.
   * Sending a real timestamp would clear every player's local save on first
   * load. Named here because the obvious "helpful" value is the destructive one.
   */
  loadSave: async () => {
    const doc = await loadSave();
    return { saveData: toBase44Save(doc), wipeEpoch: 0, _document: doc };
  },

  /**
   * ⚠️ THE VERSION LIVES AT save.version, NOT AT THE TOP LEVEL. H-20's
   * optimistic-concurrency version is required and sync_save raises on null.
   * The projection in ./shape.js lifts it to the top of the base44-shaped save,
   * so `p.saveData.version` now resolves — but a caller that hands us the RAW
   * document still needs the nested read, hence both.
   * (save.js's own comment says to carry it from load_save().period. That is
   * wrong and is corrected there.)
   */
  syncSave: async (p) =>
    syncSave(
      p?.saveData ?? p,
      p?.expectedVersion ?? p?.saveData?.version ?? p?.saveData?.save?.version ?? p?.version
    ),

  /**
   * 🔴 THE ENTIRE SIGN-IN PATH, AND IT WAS ONE REGISTRY LINE.
   *
   * This was `['not_ported', 'OMENX code redemption is unported.']` — a note
   * that reads as promo-code redemption. It is the OAuth AUTHORIZATION-CODE
   * EXCHANGE: the one call standing between a player and a session. It was
   * triaged by its name.
   *
   * `omen-auth` is deployed, verify_jwt off, probed green (D-145). Its contract,
   * read from the deployed source rather than from a document, differs from
   * base44's exchangeOmenXCode in three ways that all matter:
   *
   *   1. It returns TWO token pairs. `accessToken`/`refreshToken` are the
   *      SUPABASE session; `omenAccessToken`/`omenRefreshToken`/`omenExpiresIn`
   *      are Omen's. base44 only ever had Omen's, so OmenXCallback.jsx stores
   *      `tokenData.accessToken` into omenx_auth_data — which under the rebuild
   *      would store the SUPABASE token as if it were the Omen one.
   *   2. It returns `playerName`, not `username`.
   *   3. 🔴 NOTHING CALLS supabase.auth.setSession(). Without it the Supabase
   *      session is never installed in the client and EVERY subsequent RPC runs
   *      anonymous — load_save() raises 42501 "no player for this session" and
   *      it looks like a database problem.
   *
   * So this handler installs the Supabase session itself and then hands
   * OmenXCallback.jsx back exactly the base44 shape it already parses. Zero
   * page edits: that is what the seam is for.
   */
  exchangeOmenXCode: async (p) => {
    const code = p?.code;
    const redirectUri = p?.redirectUri;
    if (!code || !redirectUri) {
      throw new AdapterError('[adapter] exchangeOmenXCode needs { code, redirectUri }.', 400);
    }
    const { data, error } = await supabase.functions.invoke('omen-auth', {
      body: { mode: 'pkce', code, codeVerifier: p?.codeVerifier ?? null, redirectUri },
    });
    // omen-auth answers 401/500 with { error }. Return it rather than throwing:
    // OmenXCallback.jsx already renders `tokenData.error` with a debug panel,
    // and that panel is the only diagnostic a player-facing failure has.
    if (error) return { error: error.message || 'Sign-in failed.' };
    if (!data || data.error) return { error: data?.error || 'Sign-in failed.' };

    // 🔴 THE STEP NOTHING ELSE DOES. Every RPC after this reads the caller from
    // the JWT (D-45); without setSession there is no JWT.
    const { error: sessErr } = await supabase.auth.setSession({
      access_token: data.accessToken,
      refresh_token: data.refreshToken,
    });
    if (sessErr) {
      return { error: `Signed in with Omen, but the session could not be installed: ${sessErr.message}` };
    }

    // base44's shape, so the callback page does not change. The Omen tokens are
    // the ones that belong in omenx_auth_data — NOT the Supabase pair above.
    return {
      accessToken: data.omenAccessToken,
      refreshToken: data.omenRefreshToken,
      expiresIn: data.omenExpiresIn,
      walletAddress: data.walletAddress,
      username: data.playerName || '',
      sessionMinted: !!data.sessionMinted,
    };
  },

  /**
   * 🔴 THE ONE NAME THE SEAM CANNOT MAKE TRANSPARENT, and it is worth saying
   * plainly rather than papering over: base44's saveScore payload is a strict
   * SUBSET of what save_score needs. scoreData carries no boss kills, no elite
   * kills and no boss/pickup split, because base44's server recomputed or
   * ignored all three. The engine's _runStats() has them.
   *
   * So this handler takes { stats, isVictory } — the engine's own object — and
   * refuses the old shape with a message naming the change, rather than
   * submitting a run that would double-pay fragments.
   */
  saveScore: async (p) => {
    const stats = p?.stats;
    if (!stats) {
      throw new AdapterError(
        "[adapter] saveScore now takes { stats, isVictory } — the engine's _runStats() " +
          'object — not base44\'s scoreData. scoreData has no bossesKilled, no ' +
          'elitesKilled and no boss/pickup split, and save_score needs all three ' +
          '(D-78). Game.jsx builds scoreData at :205; pass stats instead.',
        400
      );
    }
    return saveScore({ ...stats, isVictory: p.isVictory ?? stats.isVictory });
  },

  spendGold: async (p) => {
    const grant = p?.grantInfo ?? p?.grant;
    if (!grant) throw new AdapterError('[adapter] spendGold needs grantInfo.', 400);
    // p_idempotency_key is REQUIRED and a replay returns the recorded result
    // without charging again. base44 had no such key, so the call sites do not
    // supply one — mint a stable key per grant attempt here.
    const key = p?.idempotencyKey || `sg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const { data, error } = await supabase.rpc('spend_gold', {
      p_grant: grant,
      p_idempotency_key: key,
    });
    if (error) throw fromPostgrest(error, 'spend_gold');
    return data;
  },

  purchaseSku: async (p) => {
    // 🔴 D-117: the purchase path DISPATCHES. Nothing here writes to a player
    // table, and nothing here prices anything — pricing stays in the caller
    // (D-118) and the SKU→grant binding is sku_grants, server-side (D-121).
    // ⚠️ D-134: the function ships DISABLED and refuses until
    // app_config.omenx_purchases_enabled is exactly true. Its refusals are not
    // a fault; they are the switch being off.
    const { data, error } = await supabase.functions.invoke('purchase', { body: p || {} });
    if (error) throw fromPostgrest(error, 'purchase');
    return data;
  },

  getWeeklyKillLeaderboard: async (p) => {
    const { data, error } = await supabase.rpc('cs_weekly_kills', {
      p_week_id: p?.weekId ?? null,
    });
    if (error) throw fromPostgrest(error, 'cs_weekly_kills');
    return data;
  },

  /**
   * The single `stubbed` name (D-185 — do not add a second). There is no
   * maintenance concept server-side yet and the dark build is never in
   * maintenance, so throwing would stop the game booting for a reason that is
   * not real. It warns once per session so the stub is visible rather than
   * forgotten — H-31's gate is a client fix that ships here.
   *
   * 🔴🔴 FIXED 2026-08-14 — THE STUB RETURNED THE WRONG SHAPE AND HARD-GATED THE
   * WHOLE APP. It returned base44's `{ enabled, message }`. Its consumer is
   * `lib/maintenanceStatus.js`, which reads `data?.mode || 'normal'` — a
   * DIFFERENT vocabulary — and `MaintenanceGate.jsx` then does:
   *
   *     if (state.mode === 'off')  return null;
   *     if (state.mode === 'soft') { …banner… }
   *     // hard
   *     return <full-screen overlay>;
   *
   * 🔴 **THE FALL-THROUGH IS THE HARD GATE.** Anything that is not exactly
   * 'off' or 'soft' renders the blocking overlay — including `maintenanceStatus`'s
   * OWN DEFAULT of 'normal'. So a stub with no `mode` field produced a
   * full-screen "Season 6 Rollout" lockout on a build with no maintenance state
   * at all, and the only escape is the admin bypass, which needs a `role` this
   * database has no public way to answer (see below).
   *
   * ⚠️ AND THE FILE'S OWN COMMENT SAYS THE OPPOSITE — "Fails OPEN — if the
   * function errors we treat it as 'off' so a backend hiccup never locks players
   * out." It fails CLOSED. base44 masks it by always sending a real `mode`.
   *
   * 🔴 SO RETURN THE CONSUMER'S VOCABULARY, NOT base44's. `enabled` is kept only
   * because it costs nothing; `mode: 'off'` is the field that is actually read.
   */
  getMaintenanceMode: async () => ({
    mode: 'off',
    message: '',
    omenxPurchasesDisabled: false,
    omenxPurchasesMessage: '',
    globalXpBuff: null,
    // Empty = no version gate. A non-empty value here would gate every client
    // whose APP_VERSION is lower, with the same non-admin-escapable overlay.
    minClientVersion: '',
    minClientVersionMessage: '',
    enabled: false,
    _adapterStub: true,
  }),
};

export async function invoke(name, payload) {
  const entry = REGISTRY[name];
  if (!entry) {
    // An unknown name is not a pass. 033: count the sites, do not find one.
    throw new NotPortedError(name, 'It is not even in the registry, which means nothing has read it.');
  }
  const [state, note] = entry;
  if (state === 'retired') throw new RetiredError(name, note);
  if (state === 'not_ported') throw new NotPortedError(name, note);
  if (state === 'stubbed' && !warned.has(name)) {
    warned.add(name);
    console.warn(`[adapter] '${name}' is a deliberate local stub: ${note}`);
  }
  const fn = HANDLERS[name];
  if (!fn) {
    throw new AdapterError(
      `[adapter] '${name}' is registered as '${state}' but has no handler. ` +
        'The registry and the dispatcher have drifted.',
      500
    );
  }
  return { data: await fn(payload) };
}
