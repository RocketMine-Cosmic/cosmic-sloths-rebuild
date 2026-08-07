import { OmenXGameSDK } from '@omen.foundation/game-sdk';

const getBaseUrl = () => {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
};

export const omenx = new OmenXGameSDK({
  gameId: 'cosmic-sloths',
  apiBaseUrl: 'https://api.omen.foundation',
  oauthAuthorizeUrl: 'https://api.omen.foundation/v1/oauth/authorize',
  enableIframeAuth: true,
  onAuth: (authData) => {
    console.log('[OmenX] ✓ onAuth triggered with:', authData);
    try {
      // Merge — preserve user's profile customizations across re-auth.
      // The OAuth payload doesn't include player_title / pilot_icon / player_name,
      // so a naive overwrite wipes the equipped title every time auth refreshes,
      // making titles appear "stuck" reverting to blank/old values.
      let preserved = {};
      try {
        const existing = JSON.parse(localStorage.getItem('omenx_auth_data') || '{}');
        if (existing && typeof existing === 'object') {
          if (existing.player_title !== undefined) preserved.player_title = existing.player_title;
          if (existing.pilot_icon !== undefined) preserved.pilot_icon = existing.pilot_icon;
          if (existing.player_name !== undefined) preserved.player_name = existing.player_name;
          // Carry the EXISTING mint week forward — never stamp a new one here.
          // onAuth fires for any session the SDK surfaces, including iframe /
          // parent-pushed and restored-from-storage tokens where no PKCE flow ran
          // and Omen recorded no new session. Stamping here refreshed the week on
          // every boot, permanently exempting those players from
          // enforceWeeklyOmenSession — which is how a wallet ends up on a
          // months-stale Omen session. Only OmenXCallback (a real completed OAuth
          // flow) is allowed to stamp a fresh week.
          if (existing.auth_week !== undefined) preserved.auth_week = existing.auth_week;
        }
      } catch {}
      const merged = { ...authData, ...preserved };
      localStorage.setItem('omenx_auth_data', JSON.stringify(merged));
      // Fresh session recorded — the "why were you signed out" notice is done.
      try { localStorage.removeItem('omen_reauth_notice'); } catch {}
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'omenx_auth_data',
        newValue: JSON.stringify(merged),
        storageArea: localStorage,
      }));
    } catch (e) {
      console.error('[OmenX] Failed to store auth data', e);
    }
  },
  onAuthError: (err) => {
    console.error('[OmenX] ❌ onAuthError triggered:', {
      message: err.message,
      code: err.code,
      status: err.status,
      fullError: err,
    });
  },
  onLogout: () => {
    console.log('[OmenX] Logged out');
    try {
      localStorage.removeItem('omenx_auth_data');
    } catch (e) {
      console.error('[OmenX] Failed to clear auth data', e);
    }
  },
});

export const initOmenX = async () => {
  try {
    await omenx.init();
  } catch (err) {
    // Silently fail - expected in some environments
  }

  // If embedded in an iframe (e.g. Omen website), request auth token from parent
  if (window.self !== window.top) {
    try {
      window.parent.postMessage({ type: 'omenx_request_auth', gameId: 'cosmic-sloths' }, '*');
      console.log('[OmenX] Requested auth from parent iframe');
    } catch (e) {
      console.error('[OmenX] Failed to request auth from parent', e);
    }
  }
};

export const getRedirectUri = () => `${getBaseUrl()}/auth/callback`;