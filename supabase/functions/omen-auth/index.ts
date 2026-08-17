// =====================================================================
// supabase/functions/omen-auth — THE OAUTH EXCHANGE. 24_AUTH_DESIGN.md.
//
// One Omen login and nothing else. No email, no password, no Supabase
// screen, no second account, no linking step (`24` §7). The Supabase
// session is invisible plumbing minted server-side from an already-
// verified Omen token.
//
// 🔴 THIS FUNCTION MUST BE DEPLOYED WITH `verify_jwt` OFF, WHICH IS THE
//    OPPOSITE OF `purchase`. It mints the FIRST session — the caller has
//    no JWT yet, by definition. Deploying it with verify_jwt on produces
//    a 401 on every sign-in and looks exactly like a broken OAuth
//    config. It is the one deployment property of this file that cannot
//    be asserted from inside it.
//
// ⚠️ AND UNTIL 2026-08-17 THIS FILE EXISTED NOWHERE BUT THE DEPLOYED
//    VERSION — no copy in the repo, so no diff, no history and no review.
//    It now lives in the delivery bundle too. If you are reading a copy,
//    the deployed one is still the one serving sign-ins: check
//    `get_edge_function` before assuming they match.
//
// TWO ENTRY POINTS, ONE VERIFICATION PRIMITIVE, ONE SESSION-MINTING PATH
// (`24` §4, §6). Different beginnings, same ending:
//
//   mode 'pkce'   standalone — the player clicked Sign in with Omen and
//                 came back to /auth/callback with a code. Exchanged
//                 server-side with the client secret. THIS IS THE ONLY
//                 MODE THAT MAY STAMP omen_auth_events.
//   mode 'token'  embedded — the game is running inside the Omen site and
//                 the parent frame pushed a token. Verified with
//                 sdk.verifyOAuthUser(). Mints NOTHING; stamps NOTHING.
//
// =====================================================================
// 🔵 LATENCY WORK — v5, 2026-08-17. Rob: *"its not fast enough i can
//    switch pages and all sorts before the client updates to loged in."*
//    Three changes, all measured or read from source, none touching the
//    invariants below:
//
//    1. THE OMEN SDK IMPORT IS NOW DYNAMIC. It was a top-level
//       `npm:@omen.foundation/game-sdk@1.0.34`, but it is used ONLY by
//       viaToken() — the embedded/iframe path. Every standalone PKCE
//       sign-in paid for loading it and never called it. Measured: this
//       endpoint took 1.0–2.1s merely to REJECT an empty body across
//       three consecutive calls, i.e. before any of its own work — that
//       is isolate boot plus module load.
//
//    2. THE 1000-ROW USER SCAN IS OFF THE HOT PATH, AND IT WAS ALSO A
//       CORRECTNESS CLIFF. The old shape was: createUser() → fails
//       because a returning player already exists → then
//       `listUsers({ page: 1, perPage: 1000 })` and a .find() in JS, on
//       EVERY returning sign-in. 🔴 It read page 1 only, so at 1000+ auth
//       users the existing player would simply not be found, `existing`
//       would be undefined and it would throw CREATE_USER_FAILED —
//       sign-in breaking for everyone past that page, with an error
//       message pointing at user creation. Now: one indexed read of
//       players.auth_user_id by wallet resolves the common case, and the
//       listUsers fallback is PAGINATED and bounded.
//
//    3. THE STAMP AND THE MAGIC LINK RUN IN PARALLEL. Independent work
//       that was two sequential round trips.
//
//    ⚠️ What is NOT fixed and cannot be: the outbound
//       POST /v1/oauth/token to Omen. That is a third-party network hop
//       and it is a floor, not an inefficiency.
// =====================================================================
//
// 🔴 THE STAMP RULE IS NOT A PREFERENCE — IT IS omen_auth_events' OWN
//    TABLE COMMENT, and base44 learned it the hard way:
//
//      "ONLY A COMPLETED PKCE FLOW MAY WRITE source = 'pkce'. That is the
//       only event Omen actually records its side... stamping on every
//       onAuth permanently exempted iframe players from the weekly sweep,
//       which is how a wallet ends up on a months-stale session."
//
//    The Omen developer API refuses wallets with no recorded session in
//    30 days — player reads, purchases and NFT custody all 404 at once.
//    A token pushed by the parent frame records nothing Omen-side, so
//    logging it as a mint tells authz.omen_session_state() a lie that
//    only surfaces as a total, simultaneous failure weeks later.
//
// ⚠️ AND THE FRESHNESS RULE ALREADY MOVED, so do not port base44's:
//    base44 keys the sweep off the ISO WEEK stamped in localStorage
//    (omenxSessionWeek.js). The rebuild keys it off the DATABASE —
//    authz.omen_session_state(wallet) returns never|fresh|stale on a
//    21-DAY window over source='pkce' rows. Different rule, better home,
//    and `24` §99's "key it off the mint week" is satisfied by the
//    minted_at column rather than by a week id. This function's only job
//    in that story is to write an honest row.
//
// 🔴 WHAT THE DATABASE TRUSTS — D-45, and it has no error message.
//    authz.current_wallet() reads `app_metadata.wallet_address` from the
//    JWT and NOTHING else. user_metadata is ignored deliberately, because
//    a signed-in user can rewrite it. Get this wrong and the player logs
//    in fine, is provisioned fine, and sees zero rows of their own data.
//
// ⚠️ WHAT THIS FILE DOES NOT DO, named rather than counted:
//    · NO TOGGLE, and that is a decision. `purchase` ships disabled
//      behind app_config.omenx_purchases_enabled (D-134) because a switch
//      that gates MONEY must fail closed. A switch that gates ACCESS
//      fails closed into a locked-out player base with nothing to steal,
//      and — the part that settles it — the control that governs "can
//      players get in" is ALREADY DESIGNED: the maintenance gate,
//      SOFT/HARD/OFF, `27_ADMIN_SURFACE.md` panel 28. Adding an
//      auth_enabled boolean now would be a second gate with a different
//      vocabulary, which is the two-copies failure this project keeps
//      paying for. When panel 28 exists, this function reads it.
//    · NO RATE LIMIT, and on the 'token' path that is a real exposure
//      rather than a shrug — see the RATE LIMIT note below.
//    · NO BREAKER PARTICIPATION. Whether auth failures should trip
//      omenx_breaker is D-139's surviving half and is undecided. It is
//      not silently answered here.
//    · The synthesised email domain is UNTESTED against GoTrue's
//      validator. If sign-in fails with an "invalid email" from
//      admin.createUser, WALLET_EMAIL_DOMAIN is the one line to change.
//
// 🔴 TWO CONSTRAINTS THE p3_038 PRE-FLIGHT FOUND, both of which this file
//    is the only thing standing between and a broken sign-in:
//    1. `players.auth_user_id` FKs to `auth.users`. THE AUTH USER MUST
//       EXIST BEFORE PROVISIONING. Provision first and you get a 23503
//       naming auth.users, with no hint the sequence is the bug.
//    2. `players_player_name_shape` caps player_name at 24 CHARACTERS and
//       Omen's profileName is not capped at all. The truncation belongs
//       HERE, in the caller — p3_038's B6 asserts the cap so nobody
//       "fixes" it by widening the constraint instead.
// =====================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const API_BASE_URL = Deno.env.get('DEVELOPER_API_BASE_URL') ?? 'https://api.omen.foundation';

// `24` §8: Client ID is the Game ID, and it is the same identity
// distributeRewards already uses as GAME_ID. Not a new registration.
const CLIENT_ID = 'cosmic-sloths';

// The auth user needs *an* email because Supabase wants a unique handle.
// It is never shown, never sent to, and never used. `.invalid` is
// reserved by RFC 6761 and can never resolve, which is the point.
const WALLET_EMAIL_DOMAIN = 'wallet.cosmic-sloths.invalid';

// players_player_name_shape. Read from the constraint, not invented here.
const PLAYER_NAME_MAX = 24;

const WALLET_RE = /^0x[0-9a-f]{40}$/;

// The outbound Omen calls. base44's exchangeOmenXCode has no timeout at
// all; `purchase` established that a Promise.race cancels nothing, so the
// budget goes on the request itself via AbortController.
const OMEN_TIMEOUT_MS = 8_000;

// listUsers fallback paging. 200 per page keeps a single page cheap; the
// hard page bound is a runaway guard, not a capacity statement — see
// LATENCY WORK note 2 for why an UNPAGINATED version was a live cliff.
const USER_PAGE_SIZE = 200;
const USER_PAGE_MAX  = 25;   // 5000 auth users before this needs revisiting

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// A misconfiguration is worth one Discord line per isolate, and no more.
// 🔴 This endpoint is UNAUTHENTICATED by necessity, so anything that posts
//    to Discord on a CLIENT-triggered error is a spam amplifier somebody
//    else holds the trigger for. Only internal faults notify, once.
let notified = false;
async function notifyOnce(title: string, description: string) {
  if (notified) return;
  notified = true;
  const url = Deno.env.get('DISCORD_ERROR_WEBHOOK');
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [{ title, description, color: 0xcc3333 }] }),
    });
  } catch { /* a failed alert must never fail a sign-in */ }
}

function normaliseWallet(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const w = raw.trim().toLowerCase();
  return WALLET_RE.test(w) ? w : null;
}

// Omen imposes no length limit on profileName; players.player_name is
// capped at 24. Truncate rather than refuse — a long display name is not
// a reason to lock somebody out of their own account.
function safePlayerName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const n = raw.trim();
  if (!n) return null;
  return [...n].slice(0, PLAYER_NAME_MAX).join('');
}

async function omenFetch(path: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), OMEN_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE_URL}${path}`, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

type Verified = { wallet: string; name: string | null; accessToken: string;
                  refreshToken?: string; expiresIn?: number; minted: boolean };

// ---------------------------------------------------------------------
// PATH 1 — the authorization-code exchange. Ported from base44's
// exchangeOmenXCode, which is a working implementation and is why `24` §3
// ruled out Supabase's generic OAuth2 provider: the UserInfo endpoint uses
// a non-standard `X-OmenX-Access-Token` header that the provider config
// cannot express, and the iframe path cannot be modelled at all.
//
// `minted: true` — and this is the ONLY place it is ever true.
// ---------------------------------------------------------------------
async function viaCode(code: string, codeVerifier: string | null,
                       redirectUri: string, clientSecret: string): Promise<Verified> {
  const res = await omenFetch('/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      client_secret: clientSecret,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`OMEN_TOKEN_EXCHANGE_FAILED ${res.status}`);
  }
  const data = await res.json();
  if (data.expires_in !== undefined && data.expires_in <= 0) {
    throw new Error('OMEN_TOKEN_EXPIRED_ON_ARRIVAL');
  }
  const user = data.user ?? {};
  const wallet = normaliseWallet(user.walletAddress ?? user.wallet_address);
  if (!wallet) throw new Error('OMEN_TOKEN_CARRIED_NO_WALLET');
  return {
    wallet,
    name: safePlayerName(user.profileName ?? user.username ?? user.name),
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    minted: true,
  };
}

// ---------------------------------------------------------------------
// PATH 2 — the parent-pushed token. Ported from base44's linkWalletToUser,
// minus the base44 account it used to link to.
//
// 🔵 THE SDK IMPORT IS DYNAMIC AND BELONGS HERE, NOT AT THE TOP. It is
//    the only consumer of @omen.foundation/game-sdk in this function, and
//    hoisting it made every standalone PKCE sign-in wait for a module it
//    never calls. See LATENCY WORK note 1.
//
// 🔴 THE CLAIMED WALLET IS REQUIRED AND COMPARED, exactly as base44 does
//    it. It is not ceremony: it is the free structural filter that lets a
//    malformed request be refused before it spends an OMENX API call.
//
// ⚠️ RATE LIMIT — the exposure base44 did not have. Every OMENX key is
//    100 calls/min and OMENX_AUTH_API_KEY is a SINGLE key, not a rotation
//    pool — and D-144 closed the other option: Rob cannot issue a second
//    one, because it is his authorisation bearer and that permission is
//    not delegable. base44's linkWalletToUser required an authenticated
//    base44 user BEFORE it called verifyOAuthUser; removing the base44
//    account (`24` §7, and it is the right call) removes that gate with
//    it, so this path is an unauthenticated caller spending a shared
//    100/min budget. The wallet-shape check below is the only free
//    filter; a real throttle needs state, a table and a decision, and is
//    on 14_PICK_UP_HERE.md rather than invented here. NOT a claimed
//    incident — an exposure read off the key model, and bounded: one call
//    per embedded sign-in at 11-16 DAU is nowhere near the limit.
//
// `minted: false` — ALWAYS. See the stamp rule at the top of this file.
// ---------------------------------------------------------------------
async function viaToken(accessToken: string, claimedWallet: string,
                        apiKey: string): Promise<Verified> {
  const { OmenXServerSDK } = await import('npm:@omen.foundation/game-sdk@1.0.34');
  const sdk = new OmenXServerSDK({ apiKey, apiBaseUrl: API_BASE_URL });
  const verify = await sdk.verifyOAuthUser(accessToken);
  if (!verify?.success) throw new Error('OMEN_TOKEN_REJECTED');
  const wallet = normaliseWallet(verify.user?.walletAddress);
  if (!wallet) throw new Error('OMEN_VERIFY_CARRIED_NO_WALLET');
  if (wallet !== claimedWallet) throw new Error('OMEN_WALLET_MISMATCH');
  return {
    wallet,
    name: safePlayerName(verify.user?.profileName ?? verify.user?.username ?? verify.user?.name),
    accessToken,
    minted: false,
  };
}

// ---------------------------------------------------------------------
// Resolve the auth user for this wallet, creating them on first sign-in.
//
// 🔴 THE ORDER MATTERS AND IT IS NOT PREFERENCE: players.auth_user_id FKs
//    to auth.users, so the auth user must exist before provisioning
//    (p3_038 B0). This function is the whole of "make sure they exist".
//
// 🔵 FAST PATH — one indexed read. A returning player already has
//    players.auth_user_id, and the ONLY writer of that column is
//    cs_provision_player, which this function calls immediately after
//    setting app_metadata. So a non-null value implies the claim was
//    written. We still confirm it with a single getUserById rather than
//    assume, because D-45's failure mode is silent (signs in fine, sees
//    no data) and one cheap call is worth removing that class of bug.
//
// ⚠️ SLOW PATH — createUser, then a PAGINATED search. The previous
//    version's unpaginated `listUsers({page:1, perPage:1000})` ran on
//    every returning sign-in AND broke outright past 1000 users. Here it
//    is a fallback only: reached when players has no row yet but the auth
//    email already exists, i.e. a half-provisioned account.
// ---------------------------------------------------------------------
async function findAuthUserByEmail(svc: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= USER_PAGE_MAX; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: USER_PAGE_SIZE });
    if (error) throw new Error(`LIST_USERS_FAILED ${error.message}`);
    const users = data?.users ?? [];
    const hit = users.find((u) => u.email === email);
    if (hit) return hit;
    if (users.length < USER_PAGE_SIZE) return null;   // last page
  }
  // Bounded rather than unbounded, and LOUD rather than a silent miss —
  // which is exactly how the unpaginated version failed.
  throw new Error(`LIST_USERS_EXHAUSTED after ${USER_PAGE_MAX} pages`);
}

async function resolveAuthUserId(
  svc: ReturnType<typeof createClient>, wallet: string, email: string,
): Promise<string> {
  // ---- fast path: we already know this wallet.
  const { data: known } = await svc
    .from('players').select('auth_user_id')
    .eq('wallet_address', wallet).maybeSingle();

  const knownId = (known as { auth_user_id?: string } | null)?.auth_user_id ?? null;
  if (knownId) {
    const { data: got } = await svc.auth.admin.getUserById(knownId);
    if (got?.user) {
      const meta = (got.user.app_metadata ?? {}) as Record<string, unknown>;
      if (meta.wallet_address !== wallet) {
        const { error: updErr } = await svc.auth.admin.updateUserById(knownId, {
          app_metadata: { ...meta, wallet_address: wallet },
        });
        if (updErr) throw new Error(`APP_METADATA_WRITE_FAILED ${updErr.message}`);
      }
      return knownId;
    }
    // players points at an auth user that no longer exists. Fall through and
    // rebuild rather than throwing — the FK would have stopped a bad write.
  }

  // ---- first sign-in: create, writing the ONE claim the database trusts.
  const created = await svc.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { wallet_address: wallet },
  });
  if (created.data?.user) return created.data.user.id;

  // ---- fallback: the email exists but players did not know about it.
  const existing = await findAuthUserByEmail(svc, email);
  if (!existing) throw new Error(`CREATE_USER_FAILED ${created.error?.message ?? 'unknown'}`);

  const meta = (existing.app_metadata ?? {}) as Record<string, unknown>;
  if (meta.wallet_address !== wallet) {
    const { error: updErr } = await svc.auth.admin.updateUserById(existing.id, {
      app_metadata: { ...meta, wallet_address: wallet },
    });
    if (updErr) throw new Error(`APP_METADATA_WRITE_FAILED ${updErr.message}`);
  }
  return existing.id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405);

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // ---- 0. THE PROBE. D-135, and `26` §299 says give every future Edge
  //         Function the same branch: it costs ten lines and it is the
  //         only thing that turns "the checklist says so" into evidence.
  //         COUNTS AND BOOLEANS ONLY — never a value, prefix or length.
  if (new URL(req.url).searchParams.get('probe') === '1') {
    const { error: rpcErr } = await svc.rpc('cs_current_week_id');
    // Does the wrapper p3_038 added actually answer over PostgREST? This is
    // the ONE thing no migration could assert — A1 proves the function is in
    // `public` with the right grants; only an HTTP call proves PostgREST
    // agrees. A deliberately invalid wallet, so a success is impossible:
    // 22023 back means the RPC was REACHED and refused by its own rule.
    const { error: provErr } = await svc.rpc('cs_provision_player', { p_wallet: 'probe' });
    return json({
      probe: true,
      version: 5,
      auth_key:            !!Deno.env.get('OMENX_AUTH_API_KEY'),
      error_webhook:       !!Deno.env.get('DISCORD_ERROR_WEBHOOK'),
      api_base_default:    !Deno.env.get('DEVELOPER_API_BASE_URL'),
      db_reachable:        !rpcErr,
      // true = reached and refused by authz.provision_player's own rule.
      // false = PostgREST cannot see it, which is p3_038's whole purpose.
      provision_rpc_reachable: provErr?.code === '22023',
      provision_rpc_code:  provErr?.code ?? null,
      service_key:         !!SERVICE_ROLE,
      anon_key:            !!ANON_KEY,
    });
  }

  const clientSecret = Deno.env.get('OMENX_AUTH_API_KEY');
  if (!clientSecret) {
    await notifyOnce('omen-auth: OMENX_AUTH_API_KEY is not set',
                     'Every sign-in is failing. This is a secrets problem, not a code problem.');
    return json({ error: 'Sign-in is temporarily unavailable. Please try again shortly.' }, 503);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: 'Malformed request.' }, 400); }

  // ---- 1. VERIFY WITH OMEN. Neither branch trusts anything the client said.
  let v: Verified;
  try {
    const mode = body.mode ?? (body.code ? 'pkce' : body.accessToken ? 'token' : null);
    if (mode === 'pkce') {
      const code        = typeof body.code === 'string' ? body.code : '';
      const redirectUri = typeof body.redirectUri === 'string' ? body.redirectUri : '';
      // `24` §5: getRedirectUri() is `${origin}/auth/callback` and Omen
      // requires it pre-registered, so it must be echoed back on exchange.
      if (!code || !redirectUri) return json({ error: 'Missing code or redirectUri.' }, 400);
      v = await viaCode(code, typeof body.codeVerifier === 'string' ? body.codeVerifier : null,
                        redirectUri, clientSecret);
    } else if (mode === 'token') {
      const token  = typeof body.accessToken === 'string' ? body.accessToken : '';
      const claimed = normaliseWallet(body.walletAddress);
      // Free filter before an API call is spent — see the RATE LIMIT note.
      if (!token || !claimed) {
        return json({ error: 'Missing accessToken or a well-formed walletAddress.' }, 400);
      }
      v = await viaToken(token, claimed, clientSecret);
    } else {
      return json({ error: 'Send either { code, redirectUri } or { accessToken, walletAddress }.' }, 400);
    }
  } catch (e) {
    // The reason is logged; the player is told one thing, because every
    // distinguishable message here is an oracle for an unauthenticated caller.
    console.error('[omen-auth] verification failed:', (e as Error)?.message);
    return json({ error: 'We could not confirm your Omen sign-in. Please try again.' }, 401);
  }

  const email = `${v.wallet}@${WALLET_EMAIL_DOMAIN}`;

  try {
    // ---- 2. FIND-OR-CREATE THE AUTH USER, and write the ONE claim the
    //         database trusts (D-45). app_metadata is admin-only; the
    //         player cannot touch it. user_metadata is never used.
    //
    //         🔴 THIS MUST HAPPEN BEFORE PROVISIONING — players.auth_user_id
    //         FKs to auth.users (p3_038 B0).
    const authUserId = await resolveAuthUserId(svc, v.wallet, email);

    // ---- 3. PROVISION. p3_038's wrapper, because authz is not a schema
    //         PostgREST exposes. The name is already truncated to 24.
    const { error: provErr } = await svc.rpc('cs_provision_player', {
      p_wallet: v.wallet, p_auth_user_id: authUserId, p_player_name: v.name,
    });
    if (provErr) throw new Error(`PROVISION_FAILED ${provErr.code} ${provErr.message}`);

    // ---- 4. STAMP (PKCE ONLY) AND MINT, IN PARALLEL.
    //
    //         omen_auth_events' table comment is the stamp rule and
    //         base44's regression is the reason. week_id comes from
    //         cs_current_week_id() rather than a second ISO-week
    //         implementation in TypeScript: one resolver, not two.
    //
    //         Non-fatal, exactly as base44 has it — a logging failure must
    //         never block a successful sign-in. But it is a RECORD with no
    //         watcher, the same shape as C-17's pool_credited_at, and the
    //         drainable set is "a wallet whose omen_session_state says
    //         never while it plainly signed in".
    //
    // 🔵 The stamp and generateLink are INDEPENDENT — nothing in the
    //    session mint reads omen_auth_events — so they were two sequential
    //    round trips for no reason. Awaited together, not fire-and-forget:
    //    an un-awaited promise can be killed when the response returns.
    const stamp = async () => {
      if (!v.minted) return;
      try {
        const { data: weekId } = await svc.rpc('cs_current_week_id');
        const { error: stampErr } = await svc.from('omen_auth_events').insert({
          wallet_address: v.wallet, minted_at: new Date().toISOString(),
          week_id: weekId, source: 'pkce',
        });
        if (stampErr) console.error('[omen-auth] stamp failed:', stampErr.message);
      } catch (e) {
        console.error('[omen-auth] stamp threw:', (e as Error)?.message);
      }
    };

    // ---- 5. MINT THE SUPABASE SESSION SERVER-SIDE. `24` §7 steps 4-5.
    //         generateLink RETURNS the token_hash and sends no email;
    //         verifyOtp redeems it here, so nothing is ever delivered
    //         anywhere and the player sees no Supabase screen at all.
    const [, linkRes] = await Promise.all([
      stamp(),
      svc.auth.admin.generateLink({ type: 'magiclink', email }),
    ]);
    const { data: link, error: linkErr } = linkRes;
    if (linkErr || !link?.properties?.hashed_token) {
      throw new Error(`GENERATE_LINK_FAILED ${linkErr?.message ?? 'no token_hash'}`);
    }
    const asAnon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: sess, error: otpErr } = await asAnon.auth.verifyOtp({
      token_hash: link.properties.hashed_token, type: 'email',
    });
    if (otpErr || !sess?.session) throw new Error(`VERIFY_OTP_FAILED ${otpErr?.message ?? 'no session'}`);

    // The client calls supabase.auth.setSession() with the first two.
    //
    // 🔴 AND THE FIELD THAT IS DELIBERATELY NOT HERE: omenSessionState.
    //    The obvious thing to return is authz.omen_session_state(wallet),
    //    so the client never computes freshness from a stored week id again
    //    — that localStorage dependency is exactly what the rebuild is
    //    removing. It cannot be returned yet, and the reason is p3_038's
    //    reason a second time: **authz.omen_session_state is in `authz`,
    //    which PostgREST does not expose, so svc.rpc() 404s on it too.**
    //    Caught here rather than shipped, because the tempting fix — wrap
    //    the call and let the field fall back to null — produces a client
    //    that reads "freshness unknown" forever and a sweep that never
    //    runs, which is precisely base44's iframe regression by a new
    //    route. It needs its own public wrapper; it is on 14 and in the
    //    next session's list, NOT hidden behind a null.

    return json({
      accessToken:  sess.session.access_token,
      refreshToken: sess.session.refresh_token,
      expiresAt:    sess.session.expires_at,
      walletAddress: v.wallet,
      playerName:   v.name,
      omenAccessToken:  v.accessToken,
      omenRefreshToken: v.refreshToken ?? null,
      omenExpiresIn:    v.expiresIn ?? null,
      sessionMinted:    v.minted,
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? 'unknown';
    console.error('[omen-auth] server-side failure:', msg);
    await notifyOnce('omen-auth: sign-in is failing server-side', msg.slice(0, 400));
    return json({ error: 'Sign-in failed on our side. Please try again shortly.' }, 500);
  }
});
