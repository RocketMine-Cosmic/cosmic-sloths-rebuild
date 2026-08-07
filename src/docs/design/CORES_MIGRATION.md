# In-Game Currency Migration (Cores)

**Date:** 2026-05-19  
**Status:** Design Phase  
**Owner:** Engineering  

---

## Executive Summary

Currently in-run purchases (rerolls, banishes, revives, ULTs, XP buff) hit OmenX settlement mid-gameplay. When the chain is slow or down, players experience failed purchases and fail-open free grants. The root cause: settlement is on the critical path.

**Proposed fix:** Introduce an in-game currency ("Cores") that players top up at the menu once, then spend instantly during runs. Settlement becomes async and off the critical path.

---

## Current Pain Points

- **Mid-run settlement latency** — 2-8s for OmenX txs, but players die in <2s
- **Panic-mashing** — players mash ULT buttons during combat = multiple billable calls
- **Outage cascades** — OmenX down = purchases disabled = players can't play
- **Complex retry logic** — 3 attempts per in-run purchase, 24s of latency on failure
- **Technical debt** — circuit breaker, kill-switch probe, anti-mash cooldown, fail-open grants all band-aids

---

## Proposed Model

### Currency Definition

**Cores** = in-game spendable credits. Players purchase Core bundles with OMENX, then spend Cores instantly during gameplay.

### Top-Up Bundles

Fixed pricing at menu:

| Cores | OMENX | Bonus | Tier |
|-------|-------|-------|------|
| 100   | 100   | —     | Base |
| 550   | 500   | 10%   | Standard |
| 2400  | 2000  | 20%   | Deluxe |
| 6500  | 5000  | 30%   | Premium |

Example: Player spends 5 OMENX to top up → gets 5.5 Cores (local credit) → can reroll 11 times at 0.5 Cores each (or other SKU).

### Spend Profile (In-Game)

Current OMENX buttons become Core buttons:

| Feature | Cost | Notes |
|---------|------|-------|
| Reroll choice | 0.5 Cores | ✓ instant |
| Banish choice | 1.5 Cores | ✓ instant |
| Revive (mid-run) | 5 Cores | ✓ instant |
| Squad ULT Lite | 5 Cores | ✓ instant |
| Squad ULT Full | 10 Cores | ✓ instant |
| XP Buff (full run) | 2.5 Cores | ✓ instant |
| Bias Respec (menu) | 3 Cores | ✓ instant |

---

## Architecture Changes

### Backend

#### PlayerSave Schema

Add new field:
```json
{
  "cores": 0,  // float, server-authoritative
  "cores_lifetime": 0  // total ever purchased (display/metrics)
}
```

#### New Functions

**1. `topupCores`**
- Input: player wallet, bundle tier (100/550/2400/6500)
- Flow: Charge OMENX via settlement (one tx, menu context, patient user)
- Output: Grant Cores to PlayerSave
- Logging: Create `CoreTopupLog` entity for analytics + TokenPool tracking

**2. `spendCores`**
- Input: player wallet, feature (reroll/banish/revive/ult_lite/ult_full/xp_buff/bias_respec), amount
- Flow: Deduct Cores from PlayerSave, apply effect
- Retry: Up to 3 times on 429 (but run won't crash if this fails — user just can't buy)
- Logging: Create `CoreSpendLog` for audit

#### Deprecated / Simplified

- ❌ `purchaseSku` (replace with spendCores + topupCores)
- ❌ Circuit breaker logic (move to topupCores only)
- ❌ `autoToggleOmenxPurchases` probe (demote to "topup available" banner)
- ❌ Anti-mash cooldown in UI (still keep it, but lower risk)

#### New Entities

**CoreTopupLog**
```json
{
  "wallet_address": "0x...",
  "bundle_tier": 100,  // OMENX spent
  "cores_granted": 110,
  "timestamp": "2026-05-19T...",
  "week_id": "2026-W21",
  "season_id": "2026-S6"
}
```

**CoreSpendLog**
```json
{
  "wallet_address": "0x...",
  "feature": "reroll",
  "amount": 0.5,
  "cores_balance_before": 50,
  "cores_balance_after": 49.5,
  "timestamp": "2026-05-19T...",
  "run_id": "optional"  // if in-game spend
}
```

#### TokenPool Integration

TokenPool fed by **Core top-ups only** (not individual spends):

```
Weekly TokenPool = sum(OMENX spent on Core top-ups) × 0.7  // 70% to player/staff payouts
```

Rationale: Players decide to spend X OMENX → that's the commitment. How many Cores they convert to in-game features is their choice (some will hoard, some will spend freely).

### Frontend

#### Menu (Top-Up Screen)

New modal/page in Settings or Hub:
- Show current Core balance
- Display bundle options with bonuses
- Handle OMENX settlement (same current logic, but outside gameplay)
- Confirmation dialog for top-ups

Component: `components/menu/CoreTopupPanel`

#### In-Game (Spend Buttons)

Replace all OMENX buttons with Core buttons:
- `LevelUpModal` (reroll/banish) → show Core cost
- `PauseModal` (revive) → show Core cost
- `UIOverlay` (ULT buttons) → show Core cost + balance
- Squad/Mastery pages (XP buff, bias respec) → show Core cost

Script: Find/replace OMENX references with Cores in spend paths.

#### HUD

- Top-right corner: Replace OMENX balance display with **Cores** display
- If Cores < cost, disable button (like before)
- No kill-switch banner needed (settlement independent)

---

## Migration Phases

### Phase 1: Preparation (1 day)

- [ ] Create `CoreTopupLog` and `CoreSpendLog` entities
- [ ] Update `PlayerSave` schema (add `cores`, `cores_lifetime`)
- [ ] Backfill all existing players with 0 cores
- [ ] Write `topupCores` and `spendCores` backend functions
- [ ] Feature-flag: `useInGameCores` (default false, toggled via AppConfig)

### Phase 2: Frontend Integration (1 day)

- [ ] Create `CoreTopupPanel` component
- [ ] Update `UIOverlay` to display Cores balance + disable buttons on insufficient balance
- [ ] Replace OMENX buttons in `LevelUpModal`, `PauseModal`, ULT buttons
- [ ] Add Core cost to all spend paths (tooltips, descriptions)
- [ ] Update `OmenXConfirmation` flow to route through Core spends instead

### Phase 3: Dual-Run Testing (1 day)

- [ ] Toggle feature flag on in dev/staging
- [ ] Run a game loop with both OMENX (menu) and Cores (in-game) simultaneously
- [ ] Verify `topupCores` charges and grants correctly
- [ ] Verify `spendCores` deducts and applies effects
- [ ] Verify CoreTopupLog and CoreSpendLog populate
- [ ] Check TokenPool recalc pulls from CoreTopupLog

### Phase 4: Player Rollout (1 week)

- [ ] Feature flag rolled out incrementally (10% → 50% → 100%)
- [ ] Communication: "New Cores currency rolls out — same cost, better reliability"
- [ ] Monitor: omenx_probe_state stays calm (fewer settlement calls)
- [ ] Incentive: Bonus Cores for first top-up bundle in each season

### Phase 5: Cleanup (1 week later)

- [ ] Deprecate `purchaseSku` if all in-run paths are Core-based
- [ ] Remove circuit breaker, kill-switch probe, anti-mash logic (optional, can keep as belt-and-suspenders)
- [ ] Archive old OMENX logic in comments for reference

---

## Risk / Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Players confused by new currency | Medium | Clear tutorial at rollout + "1 Core = 1 cent" pricing |
| Top-up settlement still fails | Medium | Retry in topupCores (same as before), but isolated to menu |
| Cores balance desync between client and server | Medium | Authoritative source is PlayerSave; UI polls on state change |
| Lower monetization (players bulk-buy fewer times) | Low | Bundle bonuses + seasonal sales can offset |
| Accounting/audit burden (now tracking two currencies) | Low | CoreTopupLog and CoreSpendLog are designed for this |

---

## Metrics to Watch

- **Topup funnel:** % of players who top up → conversion
- **Spend distribution:** How many Cores are Cores hoarded vs. spent per week
- **Settlement success rate:** `topupCores` success % (should be 99%+ like other menu transactions)
- **Revenue impact:** OMENX top-up volume vs. historical purchaseSku volume
- **Outage resilience:** Players able to play during OmenX outages (Cores balance unaffected)

---

## Example User Flow

1. **Player joins game** → sees Cores balance: 0
2. **Clicks Settings → Top Up Cores**
3. **Selects "550 Cores for 500 OMENX"** → full OMENX settlement flow (3-8s okay here, player patient)
4. **Top-up succeeds** → PlayerSave.cores = 550, CoreTopupLog created, TokenPool credited
5. **Enters run**
6. **Dies, wants revive** → clicks "Revive (5 Cores)" → spendCores call deducts 5 instantly → Cores = 545
7. **Buys reroll** → spendCores(0.5) → Cores = 544.5
8. **Finishes run, quits**
9. **Can top up again anytime at menu**

---

## Timeline Estimate

- **Prep:** 1 day
- **Frontend:** 1 day
- **Testing:** 1 day
- **Rollout:** 1 week (staged)
- **Cleanup:** 1 week (optional)

**Total: ~3 weeks for full launch, ~2 weeks for core functionality.**

---

## Decision Points

1. **Name:** Cores? Shards? Credits? Fuel? Tokens?
2. **Bundle tiers:** Fixed as above, or configurable via AppConfig?
3. **Spending rights:** Can players spend Cores they haven't purchased yet (credit system)?
4. **Refund policy:** Can players convert unused Cores back to OMENX?
5. **Staff payouts:** Should Core spends count toward TokenPool, or only top-ups?

---

## Open Questions

- Should Season 5 players get a free starter bundle (100 Cores) to reduce friction?
- Is `cores` a float or integer? (Float allows granular costs like 0.5, integer is simpler)
- Should admin have "grant Cores" capability in admin panel?
- How to handle legacy OMENX balance if this goes live? (Separate? Auto-convert?)