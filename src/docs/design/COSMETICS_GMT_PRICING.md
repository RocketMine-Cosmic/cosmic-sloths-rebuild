# Cosmetics GMT Pricing & Standalone Cosmetics Page

**Status:** Documented, not implemented yet.

## Overview
Promote cosmetics into a first-class destination by:
1. Splitting the **Cosmetics tab out of `pages/Upgrades`** into its own standalone page accessible from the **WarpMenu**, so players can find it without digging through Upgrades.
2. Offering cosmetics **GMT-only** — no OMENX or gold. This positions them as pure developer support (not gameplay-impacting).
3. Displaying live USD-to-GMT conversion on each button so players understand the cost.
4. Framing cosmetics as **direct developer support** — these purchases are intentionally **NOT pooled** into the weekly payout `TokenPool`, so 100% of the revenue supports the devs rather than being redistributed back to players/staff.

---

## Part 1: Standalone Cosmetics Page

### Why split it out?
- Cosmetics are currently buried inside the Upgrades page under a tab — players don't realise the catalogue exists.
- Promoting it to its own WarpMenu slide gives it visibility equal to Profile / Jukebox / Titles (all already standalone).
- Lets us theme the page differently (showcase trails/kills/skins with live previews) without cramping the Upgrades UI.

### Implementation Plan
1. Create `pages/Cosmetics.jsx` — copy the cosmetics tab content out of `pages/Upgrades`.
2. Add the new route to `App.jsx` and add a carousel slide entry so it shows up in `PlayCarousel` / WarpMenu.
3. Keep the cosmetics tab in `pages/Upgrades` for now (or replace it with a "→ Visit Cosmetics" CTA) — decide once the standalone page is live.
4. Add an icon + label for the WarpMenu entry (e.g. ✨ Cosmetics).

### Wireframe (WarpMenu)
```
... Profile | Jukebox | Titles | ✨ Cosmetics | ...
```

---

## Part 2: GMT-Only Pricing Display

### Data Flow
1. Cosmetic SKU has `Price (USD)` configured in the OmenX dev dashboard.
2. Frontend calls `getTokenPrices` → receives `{ prices: { GMT: { usd: 0.2932, source: 'dexscreener' } } }`.
3. Convert USD to GMT: `gmtAmount = usdPrice / gmtUsd`.
4. Button displays only GMT: `"~10.23 GMT"` — no USD, no multi-currency picker.

### Why GMT-Only?
- Cosmetics are framed as **pure developer support**, separate from the gameplay economy.
- GMT is a real utility token (not in-game), reinforcing the "real money" / "direct support" positioning.
- Simpler UX — no currency switching, no balance checks against OMENX pools.

### Edge Cases
- **Price lock vs re-quote:** Decide if GMT amount locks at render-time or updates before settlement.
- **Rounding buffer:** Consider +2% buffer to protect against mid-transaction price drops.
- **Confirmation:** Verify OmenX SDK actually settles GMT payments before wiring `purchaseSku`.

### Related Backend Function
- `getTokenPrices` — already deployed, returns live GMT/USD rate with fallback (CoinGecko → DexScreener).

### Wireframe (Cosmetic Card)
```
[Fire Trail]
~10.23 GMT
[Buy]
```

---

## Part 3: Pool Exclusion (Dev Support Model)

### The Decision
All cosmetic purchases — **regardless of currency** — are flagged `excluded_from_pool: true` on the `TokenSpendLog`. This means they:
- ✅ ARE logged in the audit trail (visible to admins in the Economy tab)
- ❌ Do NOT contribute to `TokenPool.total_spent`
- ❌ Are NOT redistributed via `distributeRewards` to players/staff

### Why?
- Cosmetics are positioned as **direct developer support** — players buying skins/trails/kill effects are tipping the devs, not feeding a payout cycle.
- Keeps the weekly OMENX pool focused on **gameplay-impacting purchases** (stat upgrades, revives, biases, ult-lites) — the things that actually generate gameplay engagement worth rewarding.
- Avoids the weird optics of cosmetic purchases being looped back to the player base.

### UI Communication
On the standalone Cosmetics page, add a small banner/footer explaining:
> 💜 **Supporting the devs** — cosmetic purchases go directly to development costs and aren't included in the weekly player/staff payout pool.

This sets expectations clearly so power-users don't think their cosmetic spend will boost their payout share.

---

## Part 4: Backend — Reuse `purchaseSku`, Don't Duplicate

**Decision:** Extend `purchaseSku` rather than creating a separate `cosmeticSku` function.

### Why
- `purchaseSku` is ~960 lines with circuit breakers, idempotency keys, settlement retries, rate-limit handling, price drift detection, talent prerequisite checks, and atomic save updates. Cloning it would inevitably drift.
- `TokenSpendLog` already has the `excluded_from_pool` flag (currently used for admin self-purchases) — exactly the right tool for this.
- The OmenX SDK settlement call already takes a currency argument; the cosmetic flow (verify SKU → settle on-chain → grant cosmetic → log spend) is identical regardless of token.

### Minimal Backend Change Required
In `purchaseSku`, when the SKU grant type is `cosmetic`:
- Always set `excluded_from_pool: true` on the resulting `TokenSpendLog` row.
- Skip the `TokenPool.total_spent` update entirely.

That's it — ~5-10 lines guarded by a `if (grantType === 'cosmetic')` block around the pool-write section.

### Bonus
The Audit Trail breakdown added on 2026-05-20 (`AdminEconomy.jsx` — "X in pool + Y excluded") will naturally surface cosmetic + admin self-purchases together as "excluded", keeping admin finance UX honest with zero extra work.

---

## Implementation Checklist (when ready)

- [ ] Create `pages/Cosmetics.jsx` extracted from `pages/Upgrades`
- [ ] Register route in `App.jsx`
- [ ] Add WarpMenu / `PlayCarousel` slide for Cosmetics
- [ ] Add dev-support banner on Cosmetics page
- [ ] Wire `getTokenPrices` into cosmetic buttons → show `~X GMT` under USD price when GMT is an allowed currency
- [ ] Add payment-method selector dropdown (OMENX / BNB / GMT) per cosmetic
- [ ] Add `if (grantType === 'cosmetic')` branch in `purchaseSku` → set `excluded_from_pool: true`, skip TokenPool write
- [ ] Test with a $1 GMT cosmetic SKU to verify on-chain GMT settlement works end-to-end
- [ ] Decide whether to remove or keep the cosmetics tab in `pages/Upgrades` once standalone page ships