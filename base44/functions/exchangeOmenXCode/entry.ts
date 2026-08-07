import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ISO week id (Mon-start), same formula as periodIds.js / purchaseSku.
function getWeekId(d: Date) {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const isoYear = tmp.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
}

Deno.serve(async (req) => {
  try {
    const { code, codeVerifier, redirectUri } = await req.json();

    if (!code) {
      return Response.json({ error: 'No code provided' }, { status: 400 });
    }

    if (!redirectUri) {
      return Response.json({ error: 'No redirectUri provided' }, { status: 400 });
    }
    const apiBaseUrl = 'https://api.omen.foundation';
    const clientSecret = Deno.env.get('OMENX_AUTH_API_KEY');

    if (!clientSecret) {
      return Response.json({ error: 'Missing OMENX_API_KEY secret' }, { status: 500 });
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(`${apiBaseUrl}/v1/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: 'cosmic-sloths',
        client_secret: clientSecret,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json();
      console.error('[exchangeOmenXCode] Token exchange failed:', error);
      return Response.json({ error: 'Token exchange failed', details: error }, { status: tokenResponse.status });
    }

    const tokenData = await tokenResponse.json();
    console.log('[exchangeOmenXCode] raw token response:', JSON.stringify(tokenData));

    // Check token expiry before responding
    if (tokenData.expires_in && tokenData.expires_in <= 0) {
      return Response.json({ error: 'Token expired immediately', details: tokenData }, { status: 400 });
    }

    // wallet/username are nested inside tokenData.user
    const user = tokenData.user || {};
    const wallet = user.walletAddress || user.wallet_address || null;

    // Stamp proof that a REAL PKCE flow completed for this wallet. This is the
    // only place a genuine Omen session gets minted, so a row here means the
    // player truly re-logged in. Without it we can't tell "never re-logged in"
    // apart from "re-logged in and Omen still 404s them" (an Omen-side bug).
    // Non-fatal — a logging failure must never block a successful sign-in.
    if (wallet) {
      try {
        const base44 = createClientFromRequest(req);
        const now = new Date();
        await base44.asServiceRole.entities.OmenAuthEvent.create({
          wallet_address: String(wallet).toLowerCase(),
          at_ms: now.getTime(),
          week_id: getWeekId(now),
        });
      } catch (e) {
        console.error('[exchangeOmenXCode] OmenAuthEvent stamp failed:', e?.message);
      }
    }

    return Response.json({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      walletAddress: wallet,
      username: user.profileName || user.username || user.name || null,
      userId: user.userId || null,
    });
  } catch (error) {
    console.error('[exchangeOmenXCode] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});