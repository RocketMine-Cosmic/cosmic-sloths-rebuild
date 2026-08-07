# Cosmic Sloths â€” Supabase + Vercel rebuild

**This is NOT the base44 mirror.** That repo (`RocketMine-Cosmic/cosmic-sloths`)
is base44's own auto-push mirror of the live game and is retired with base44.
Nothing here is pushed there â€” see D-73 in `docs/migration/DECISIONS.md`.

**Dark until cutover.** Private on purpose.

Seeded 2026-08-07 from mirror commit `79d69f9`, plus:

* all 124 game assets local in `public/assets/` â€” they used to be hotlinked
  from `media.base44.com` with no copy anywhere (D-71). The manifest lives in
  the Supabase catalogue tables; the DB stores a **path**, never the bytes.
* `@base44/vite-plugin` decoupled â€” the `@/` alias now lives in
  `vite.config.js` and 412 imports depend on it.
* `vercel.json` â€” SPA rewrite, immutable asset caching, no-cache HTML,
  `frame-ancestors` scoped to Omen. **Never `X-Frame-Options: DENY`** â€”
  the game is deliberately embeddable.

## Backend
Supabase project `cosmic-sloths` (`zrcijchnlsyxlptrhmlh`).
ðŸ”´ **No `/api` proxy to base44 and no `VITE_BASE44_APP_BASE_URL`** â€” the dark
build talks only to Supabase (D-74).

`npm install && npm run build`
