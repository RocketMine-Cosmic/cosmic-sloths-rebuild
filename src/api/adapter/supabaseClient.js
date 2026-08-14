/**
 * The one Supabase client.
 *
 * 🔴 D-76: this repo is PUBLIC. Both values below are publishable by design —
 * the URL and the anon/publishable key are in every client bundle of every
 * Supabase app — but they still arrive from Vercel environment variables and
 * are NEVER committed (D-70, 25_SECRETS_RUNBOOK.md §2). There is no fallback
 * literal here on purpose: a missing env var must break the build loudly rather
 * than silently point a dark build at nothing.
 *
 * 🔴 D-45/D-46: identity comes from the JWT and from nothing else. No RPC in
 * this adapter takes a wallet, a player id or a subject argument, because none
 * of the server functions accept one (D-150/D-152). If you find yourself
 * wanting to pass one, the server side is what needs the conversation.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env?.VITE_SUPABASE_URL;
const key = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    '[adapter] VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set ' +
      '(Vercel → project → Environment Variables). They are publishable, but they ' +
      'are still not committed — D-70/D-76.'
  );
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // The game is embedded in an Omen iframe and signs in through omen-auth,
    // not through a Supabase redirect, so there is no URL fragment to parse and
    // parsing one would be a way in for a token nobody minted.
    detectSessionInUrl: false,
  },
});

/** Edge Function base. `functions.invoke` on supabase-js resolves this itself. */
export const FUNCTIONS_BASE = `${url}/functions/v1`;
