import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// Auth is handled explicitly via the Sign In button (base44.auth.redirectToLogin).
// requiresAuth:false prevents the SDK from auto-redirecting to login on app load
// or after logout — users browse the carousel anonymously until they sign in.
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});