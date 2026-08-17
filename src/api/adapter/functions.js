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
import { clearMeCache } from './auth';
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
   * ./shape.js lifts it to the top of the base44-shaped save so
   * `p.saveData.version` resolves; a caller handing us the RAW document still
   * needs the nested read, hence both.
   *
   * 🔴🔴 FIXED 2026-08-14 — THE VERSION HANDSHAKE WAS OPEN-ENDED, AND IT IS
   * D-219's SHAPE FOR THE THIRD TIME: THE SEAM MUST RETURN THE *CALLER'S*
   * ENVELOPE, NOT THE RPC'S.
   *
   *   · `sync_save` bumps the row and returns `{version, updated_at}` — and
   *     DELIBERATELY not the save (its own comment says so: returning it is
   *     what forced base44's client to keep a CLIENT_OWNED_OVERRIDES list).
   *   · `SaveManager.syncToBackend` adopts `res.data.saveData` over its local
   *     copy — that adoption is the ONLY way a cloud-owned field reaches
   *     localStorage after a sync.
   *   · So when this handler returned sync_save's raw object, the client's
   *     stored `version` NEVER ADVANCED. The next sync sent the stale one and
   *     `sync_save` raised `version conflict — reload` (its line 89) on every
   *     call from then on.
   *
   * 🔴 AND THE SYMPTOM WAS NOT AN ERROR MESSAGE. SaveManager dispatches
   * `saveSyncStart` up front, `saveSyncSuccess` only on success, and
   * `syncFailed` only after THREE failures — so `SaveStatusIndicator` sat on
   * "syncing" forever. The save was not stuck; the HANDSHAKE was, and the UI
   * had no vocabulary for "failing but not yet three times".
   *
   * ⚠️ `updated_at` MUST BE EPOCH MILLISECONDS. `sync_save` returns a
   * timestamptz string and the client does `Number(localData.updated_at)` to
   * compare staleness — a string there yields NaN and every later comparison
   * silently reads as "local is older". Same class of bug as D-224: two
   * vocabularies for one idea.
   *
   * 🔴 `saveData` carries ONLY the version, on purpose. SaveManager merges
   * `{...freshLocal, ...res.data.saveData}`, so a partial is exactly right —
   * it adopts the cloud-owned field and touches nothing the player just
   * edited. Returning the whole projected save here would re-introduce the
   * clobber that comment at SaveManager:405 exists to prevent.
   */
  syncSave: async (p) => {
    const data = await syncSave(
      p?.saveData ?? p,
      p?.expectedVersion ?? p?.saveData?.version ?? p?.saveData?.save?.version ?? p?.version
    );
    return {
      saveData: { version: data?.version },
      updated_at: data?.updated_at ? Date.parse(data.updated_at) || Date.now() : Date.now(),
      version: data?.version,
    };
  },

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

    // A fresh sign-in must never be answered from the previous identity's cache.
    clearMeCache();

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
    // 🔴 THE QUEUED RUN CARRIES ITS OWN UUID — 043. saveScore()'s default is
    // openRunUuid(), which reads localStorage AT CALL TIME. flushPendingScores()
    // runs on launch, on tab focus and on `walletLinked`, i.e. concurrently with
    // a fresh startRun() — so a queued run resolved through the default would be
    // submitted against whichever run happens to be open, finalising it with
    // another run's numbers before it had been played. An explicit uuid, or the
    // default only when the caller genuinely means "the run I just finished".
    const result = await saveScore(
      { ...stats, isVictory: p.isVictory ?? stats.isVictory },
      p.clientRunUuid ?? undefined
    );

    // 🔴🔴 THE RETURN IS snake_case AND EVERY CONSUMER READS camelCase — 043.
    //
    // This is D-218/D-219's shape for the third time, and it fails SILENTLY,
    // which is why it earns the paragraph. Game.jsx's two run-end handlers
    // (:465 game-over, :577 victory) both open with:
    //
    //     saveScore(stats, …).then((res) => { if (res?.success) { … } })
    //
    // save_score() returns `ok`, not `success`. So on a perfectly credited run
    // that branch is skipped whole: the modal never leaves its spinner, the
    // recovery snapshot in `pending_run_snapshot` is never cleared, and
    // `_serverConfirmed` never becomes true. No error, no warning, nothing in
    // the console — the row is in the database and the player is told nothing.
    //
    // 🟢 The good news, and why this is a mapping rather than a page edit: the
    // modals ALREADY read the server's figures instead of the engine's, and
    // Game.jsx sets `stats.score = null` up front on purpose so no prediction is
    // ever shown. D-183 is satisfied the moment the names line up.
    //
    // ⚠️ `saveData` is base44's, not ours. base44's saveScore returned the whole
    // updated save and SaveManager adopts it; save_score DELIBERATELY does not
    // (returning it is what forced base44's CLIENT_OWNED_OVERRIDES list), so it
    // is read here with load_save() and projected by shape.js. BEST-EFFORT on
    // purpose: the run is already credited by the time we reach this line, so a
    // failed read must not turn a successful run into a `_saveFailed` modal.
    // Omitted on failure, which makes Game.jsx skip its merge and keep the local
    // save — stale gold until the next load, never a lost run.
    let saveData;
    try {
      saveData = toBase44Save(await loadSave());
    } catch (e) {
      console.warn(
        '[adapter] saveScore: the run WAS credited, but the post-run load_save() failed. ' +
          'The modal shows the server figures and the local save is left alone:',
        e?.message || e
      );
    }

    // Nothing on the client reads these three yet, and a silent drop reads as
    // "nothing was dropped" — save_score's own words about unknown enemy ids.
    // Print them rather than pretend they do not exist.
    if (Array.isArray(result?.unknown_enemy_ids) && result.unknown_enemy_ids.length) {
      console.warn(
        '[adapter] save_score DROPPED unknown enemy ids — this build named enemies the database has no row for:',
        result.unknown_enemy_ids
      );
    }
    if (Array.isArray(result?.titles_unlocked) && result.titles_unlocked.length) {
      console.log('[adapter] call signs unlocked by this run (D-153/D-162, permanent):', result.titles_unlocked);
    }
    if (result?.nft_bonus_fragments) {
      console.log(
        `[adapter] the server's own NFT relic roll added ${result.nft_bonus_fragments} fragment(s). ` +
          "The HUD's figure was the CLIENT's roll and is not authoritative — D-183."
      );
    }

    return {
      // base44's envelope, because the call sites are written against it.
      success: !!result?.ok,
      score: result?.score,
      goldCredited: result?.gold_credited,
      killsCredited: result?.kills_credited,
      fragmentsCredited: result?.fragments_credited,
      grantedCharacter: result?.granted_character ?? null,
      unlockedArena: result?.unlocked_arena ?? null,
      ...(saveData ? { saveData } : {}),
      // ⚠️ DELIBERATELY ABSENT, NOT ZERO: base44 also returned `timeSurvived`
      // and three `*Capped` flags. save_score returns none of them — its caps
      // are applied inside the score rather than reported beside it. Game.jsx
      // falls back with `res.timeSurvived ?? s.time`, so absent is the value
      // that keeps the engine's own duration on the modal; a 0 here would read
      // as "the server says the run lasted no time" (D-222's rule, one domain
      // over).
      //
      // The rebuild's own result under its real names, for anything written
      // against the server instead of against base44.
      _result: result,
    };
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
