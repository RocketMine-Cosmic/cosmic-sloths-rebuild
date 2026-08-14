/**
 * auth.* — the four methods the game calls (21 call sites).
 *
 * Sign-in is Omen OAuth through the `omen-auth` Edge Function, which mints the
 * FIRST session and therefore runs with verify_jwt OFF by definition
 * (D-142/D-145 — and there is no way to disable it short of deleting it, so do
 * not add an auth_enabled flag). Everything after that is an ordinary Supabase
 * session and every RPC identifies the caller from the JWT (D-45).
 *
 * 🔴 me() DOES NOT SYNTHESISE A PSEUDONYM FROM THE WALLET. D-154: base44's
 * erasure handle is the last six characters of the wallet, and 20 §5 forbids
 * wallets on public pages two paragraphs above the section specifying it. The
 * reserved ^pilot_[0-9a-f]{6}$ shape belongs to cs_set_profile and is refused
 * to players.
 */
import { supabase } from './supabaseClient';
import { fromPostgrest } from './errors';

export async function isAuthenticated() {
  const { data } = await supabase.auth.getSession();
  return !!data?.session;
}

/**
 * 🔴 FIXED 2026-08-14, session 042. This returned `load_save().profile`, and
 * load_save() HAS NO `profile` KEY — read from pg_get_functiondef, not from a
 * document. It returns eleven top-level keys and the profile fields live under
 * `player`. The consequence was not a missing name on a screen:
 *
 *   SaveManager.js:139 polls me()?.wallet_address eight times over four seconds
 *   to decide `walletLinked`. It never became true, so SaveManager logged
 *   "Wallet not linked to Base44 user after 4s — skipping cloud load" and
 *   RETURNED BEFORE LOADING THE CLOUD SAVE AT ALL. Every signed-in player would
 *   have been silently dropped into local-only mode. No error, no throw.
 *
 * ⚠️ The shape returned here is base44's user record as its nine call sites
 * read it — `wallet_address`, `player_name`, `player_title`, `pilot_icon` —
 * because those call sites are not being edited (the seam's whole contract).
 */
/**
 * 🔴 me() IS CACHED, AND THAT IS NOT AN OPTIMISATION — IT IS A CORRECTION.
 *
 * base44's me() was a cheap session lookup. Here the only RPC that returns the
 * player is `load_save()`, which is **27 SELECTs across 23 table reads** — it
 * assembles the whole save document to answer "what is your wallet".
 *
 * There are EIGHT call sites, and one of them is not a call site but a loop:
 * `SaveManager.js:137` polls me() up to 8 times in 4 seconds at boot to decide
 * `walletLinked`. Uncached, a cold boot fires up to ~216 subqueries before the
 * game draws anything. `useSessionKeepAlive` then repeats it every 10 minutes,
 * and MaintenanceGate, AuthContext, Game, PageNotFound and two components each
 * add their own.
 *
 * ⚠️ SAFE TO CACHE BECAUSE OF WHAT IT RETURNS, NOT BECAUSE IT IS CONVENIENT:
 * identity (id, wallet, founder flag) cannot change inside a session, and the
 * three mutable fields — player_name, player_title, pilot_icon — are written by
 * `cs_set_profile` / `cs_equip_title`, which are the client's own calls. The
 * TTL is short and `logout()` clears it outright, so a sign-out can never be
 * served from cache.
 *
 * 🔴 The IN-FLIGHT dedupe matters more than the TTL here: SaveManager's loop and
 * MaintenanceGate's mount fire in the same tick, and without it they issue two
 * full load_save() calls that race.
 *
 * ⚠️ NOT a general result cache. `loadSave()` — the save itself — is deliberately
 * NOT cached: it is the thing that changes.
 */
const ME_TTL_MS = 15_000;
let _meAt = 0;
let _meValue = null;
let _meInflight = null;

/** Called by logout() and after a fresh sign-in — never leave a stale identity. */
export function clearMeCache() {
  _meAt = 0;
  _meValue = null;
  _meInflight = null;
}

export async function me() {
  if (_meValue && Date.now() - _meAt < ME_TTL_MS) return _meValue;
  if (_meInflight) return _meInflight;
  _meInflight = (async () => {
    try {
      const v = await _meUncached();
      _meValue = v;
      _meAt = Date.now();
      return v;
    } finally {
      _meInflight = null;
    }
  })();
  return _meInflight;
}

async function _meUncached() {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess?.session) return null;
  const { data, error } = await supabase.rpc('load_save');
  if (error) throw fromPostgrest(error, 'load_save(me)');
  const p = data?.player;
  if (!p) return null;
  return {
    id: p.id,
    wallet_address: p.wallet_address,
    player_name: p.player_name,
    player_title: p.player_title,
    pilot_icon: p.pilot_icon,
    has_set_profile_name: !!p.has_set_profile_name,
    is_founder: !!p.is_founder,
    vip_level: p.vip_level ?? 0,
    // base44's user record carried the display name under `full_name` in a few
    // older call sites. Same value, no second source of truth.
    full_name: p.player_name,
  };
}

export async function logout() {
  clearMeCache();
  await supabase.auth.signOut();
}

/**
 * 🔴 REWRITTEN 2026-08-14, session 042. This used to redirect to `/auth/start`,
 * a route that has never existed in this app and was never going to — the
 * project's own recurring lesson, THE ANSWER IS ALREADY IN ROB'S CODE:
 *
 *   · `/auth/callback` DOES exist — App.jsx:254 routes it to OmenXCallback.jsx,
 *     a complete PKCE callback. Three documents said it did not.
 *   · The authorize redirect is the SDK's job. lib/omenx.js constructs
 *     OmenXGameSDK with oauthAuthorizeUrl and both OmenXGate.jsx:58 and
 *     OmenXAuthButton.jsx:86 already call omenx.authenticate({ redirectUri,
 *     enablePKCE: true }) as the fallback when THIS function throws.
 *
 * So this delegates to the same call those two sites fall back to, which makes
 * the primary path and the fallback path one path. `24` §5: getRedirectUri() is
 * `${origin}/auth/callback` and that URI is ALREADY REGISTERED for
 * cosmic-sloths.com, www., and cosmic-sloths-rebuild.vercel.app — do not ask
 * Rob to register anything before reading §5.
 *
 * ⚠️ returnTo is accepted and deliberately not forwarded: the Omen authorize
 * endpoint round-trips `state`, not an arbitrary return path, and OmenXCallback
 * uses `state` to recover the PKCE verifier. Smuggling a return path through it
 * would break verifier recovery for a convenience nothing currently uses.
 */
export async function redirectToLogin(_returnTo) {
  const { omenx, getRedirectUri } = await import('@/lib/omenx');
  return omenx.authenticate({ redirectUri: getRedirectUri(), enablePKCE: true });
}

/** Freshness of the Omen session: fresh | stale | never. Takes no argument, ever (D-150). */
export async function omenSessionState() {
  const { data, error } = await supabase.rpc('cs_omen_session_state');
  if (error) throw fromPostgrest(error, 'cs_omen_session_state');
  return data;
}
