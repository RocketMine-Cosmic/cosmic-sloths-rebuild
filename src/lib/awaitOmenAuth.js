/**
 * 🔴 WHY THIS EXISTS: `omenx.authenticate()` NEVER RESOLVES IN THIS APP, AND THAT
 * IS NOT A BUG IN THE SDK — IT IS A CONTRACT WE DELIBERATELY DON'T MEET.
 *
 * Read from `@omen.foundation/game-sdk/dist/index.mjs`, not from a comment:
 * `authenticate()` opens a POPUP (`window.open(authUrl, "OmenX OAuth",
 * "width=500,height=600,…")`), then waits for the callback page to write
 *
 *     localStorage[`omenx_oauth_callback_${state}`] = { code, state, timestamp }
 *
 * It picks that up via a `storage` listener, a poll and a `visibilitychange`
 * re-check, validates `state` and a 30s freshness window, and then does its OWN
 * `exchangeCodeForToken()` before resolving.
 *
 * ⚠️ WE CANNOT LET IT DO THAT, AND WE MUST NOT WRITE THAT KEY. `OmenXCallback.jsx`
 * exchanges the code through the `omen-auth` Edge Function because that is what
 * MINTS THE SUPABASE SESSION (D-142/D-145) — without it every later RPC runs
 * anonymous and `load_save()` raises 42501. An OAuth authorization code is
 * single-use, so if we also handed it to the SDK, the SDK's exchange would fail
 * and it would reject. **So the promise hanging forever is the correct outcome of
 * a deliberate architectural choice, and callers must stop treating it as the
 * success signal.**
 *
 * 🔴 WHAT THIS REPLACED, AND WHY IT WAS WORSE THAN NOTHING. Both callers awaited
 * that promise and then ran a 1.5s heuristic whose own comment read *"Give the SDK
 * ~1.5s to actually trigger a page navigation (redirect flow)"* — written for a
 * REDIRECT flow that does not happen. A popup never navigates the opener, so
 * `navigated` was always false and the opener stayed visible, which meant
 * **"Connect didn't open. Please allow pop-ups and try again" fired on every
 * successful sign-in**, resetting the button while the user's popup was still open.
 * Rob: *"the game dosnt listen for the omen login so i have to refresh the page
 * after login to get anywhere."*
 *
 * ⚠️ AND THE LESSON, WHICH ALREADY EXISTS IN THIS PROJECT'S NOTES: when a comment
 * justifies a workaround by describing a third party, re-read the third party.
 * Those two comments asserting "redirect flow" are what made a session conclude the
 * SDK had no popup at all — off a `grep 'window\.open([^)]*)'` that could not match
 * across the call's own nested parens, and returned nothing. **A null result is
 * almost always a bad pattern.**
 *
 * So: watch for the auth actually landing. `OmenXCallback` postMessages the opener,
 * `App.jsx` writes `omenx_auth_data` and re-dispatches a StorageEvent in-window, and
 * `OmenXAuthContext` picks that up. This waiter listens to the same signals plus a
 * cheap poll, so it cannot miss whichever one arrives first.
 */

const KEY = 'omenx_auth_data';

function readAuth() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { raw: null, data: null };
    const data = JSON.parse(raw);
    return { raw, data: data?.walletAddress ? data : null };
  } catch {
    return { raw: null, data: null };
  }
}

/**
 * Resolves with the new authData once sign-in lands, or `null` on timeout.
 *
 * Compares against the RAW stored string captured at call time rather than the
 * wallet address, so a weekly re-auth for the SAME wallet still counts as new —
 * the tokens differ even when the wallet doesn't.
 *
 * Call this BEFORE opening the popup, so a fast completion cannot land in the gap.
 */
export function waitForOmenAuth({ timeoutMs = 120_000 } = {}) {
  const startingRaw = readAuth().raw;

  return new Promise((resolve) => {
    let settled = false;
    let pollId;
    let timeoutId;

    const cleanup = () => {
      try { window.removeEventListener('storage', onStorage); } catch {}
      try { window.removeEventListener('message', onMessage); } catch {}
      try { document.removeEventListener('visibilitychange', check); } catch {}
      if (pollId) clearInterval(pollId);
      if (timeoutId) clearTimeout(timeoutId);
    };

    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const check = () => {
      const { raw, data } = readAuth();
      if (data && raw !== startingRaw) finish(data);
    };

    const onStorage = (e) => {
      if (e.key && e.key !== KEY) return;
      check();
    };

    const onMessage = (e) => {
      const { type, authData } = e.data || {};
      if ((type === 'omenx_auth' || type === 'omenx_auth_response') && authData?.walletAddress) {
        // Let App.jsx's handler persist it first, then read back the merged value
        // so everyone agrees on one shape. If that hasn't landed yet, the poll gets it.
        setTimeout(check, 0);
      }
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('message', onMessage);
    document.addEventListener('visibilitychange', check);
    // Backstop: covers any path that writes localStorage without an event we hear
    // (and the popup closing without notifying at all).
    pollId = setInterval(check, 400);
    timeoutId = setTimeout(() => finish(null), timeoutMs);

    check();
  });
}

/** True when the SDK's rejection is the genuine "popups are blocked" case. */
export function isPopupBlockedError(err) {
  return /popup/i.test(err?.message || '');
}
