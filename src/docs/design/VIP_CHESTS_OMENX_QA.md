# VIP Chest Integration — Open Questions for OmenX

**To:** Marco / OmenX dev team
**From:** Cosmic Sloths dev team
**Date sent:** 2026-06-25
**Answered:** 2026-06-25 (Marco, Discord)
**Status:** ✅ All 12 answered. Ready to start handler build.

> Marco's replies are inlined under each question in **green-quoted blocks**. Build-impact notes (what each answer changes in our plan) follow each one.

---

## A. Webhook contract (need before we start the handler)

**Q1 — Sample payload.** What does the `vip_chest.reward_granted` body actually look like? Need exact field names (`wallet` vs `wallet_address`, `reward_key` vs `reward_id`, etc.) before we can write the parser.

> **Marco:** Working on a tool in the developer Webhooks section that lets you test a webhook without opening a chest, so you can see and work with the various payloads.

**Build impact:** ⏳ **Blocker until the test tool ships.** We don't have to wait — we can scaffold the handler against assumed field names and finalise once the tool is live. We'll check the portal periodically; ping Marco if it takes more than a week.

---

**Q2 — Retry policy.** If our handler returns 500, does OmenX retry? With what backoff? Is there a dead-letter queue, or do failed grants just vanish?

> **Marco:** You should never return a 500 to our service from the webhook. Retries should be tracked and performed on your side.

**Build impact:** 🔴 **Important — changes the handler architecture.** We MUST always return 200 (or 4xx for genuinely bad payloads like signature failure) and own retries internally. Plan:
- Webhook handler does signature check → if invalid, return 401. If valid, immediately persist the raw event to a new `VipChestWebhookEvent` entity (idempotent on `tx_id`) and return 200.
- A separate background process (scheduled automation, every 1–5 min) consumes unprocessed events and applies grants. Failures retry with backoff. Permanently-failed events get flagged for admin review.
- This decouples "received" from "applied" — exactly the right shape given OmenX doesn't retry for us.

---

**Q3 — Test harness.** Is there a "send test event" button somewhere in the dev portal?

> **Marco:** See Q1 — that's what we're making.

**Build impact:** Same as Q1. Until it ships, we can mock test events locally by hand-crafting payloads + signing them with our own secret in dev. Not blocking.

---

**Q4 — Concurrency.** If 100 chests open in the same second, does OmenX fan out 100 parallel webhook calls or queue them?

> **Marco:** We do not queue them, so you need to handle all requests coming in without rate limiting. Because of large loot tables it's very unlikely you'd get this many concurrent.

**Build impact:** ✅ Fine. The "persist raw event → return 200 → process async" pattern from Q2 already handles concurrent fan-out cleanly — the only contended write is the `tx_id` uniqueness check, which is cheap. No throttling needed.

---

**Q5 — URL change policy.** Can the URL be edited later without invalidating the signing secret?

> **Marco:** I don't believe the signing secret changes with URL changes.

**Build impact:** ✅ Confirmed. Custom domain is the right call — future host migrations stay cheap.

---

## B. Chest mechanics (affect how we tune EV)

**Q6 — Soulbound or tradable?**

> **Marco:** This is up to you. You can list NFTs which are tradable, you can also make product SKUs for non-purchasable, non-tradable, and just represents an item a player can gain through natural progression. But it does need to be defined in the products section.

**Build impact:** ✅ Our call per item. **Plan:** Stat pips, talent/respec tokens, and pending-grant currencies → non-purchasable / non-tradable SKUs (soulbound). Cosmetics → also non-tradable (Mythic tier in particular should never be transferable, or we lose the chase). Currency drops (gold/fragments) → no SKU needed since they're not items, they're balance bumps applied by our handler.

We'll need to register each reward as a Product SKU on the OmenX side before it can appear in a reward row.

---

**Q7 — Single open vs rip-multiple animation.**

> **Marco:** I believe chests can only be open one at a time.

**Build impact:** ✅ Simplifies our (eventual) grant-history view. One reveal per webhook event. No batching UI required.

---

**Q8 — Can a single chest roll multiple categories?**

> **Marco:** Yes, if you define it that way you can add multiple category items in the chest reward. For example you can give a currency + an NFT at the same time as a single reward. But this would reflect in the payload sent to the webhook. All items granted to the player will be in the payload.

**Build impact:** 🟡 **Payload is an ARRAY, not a single item.** Plan adjusts:
- Webhook payload will carry a list of granted items (we'd previously assumed one). Our handler iterates the list and applies each grant individually.
- Each item in the list still has its own `reward_key` + `tx_id`-equivalent for idempotency. (Need to confirm whether idempotency keys are per-item or per-chest in Q1's test tool.)
- The `PendingChestGrant` table needs a `chest_event_id` group field so we can reconstruct "this player got these 3 items from one Elite chest" when we eventually build the reveal screen.

---

## C. Cosmetics policy

**Q9 — Cosmetic seasons.**

> **Marco:** I think that is up to you and not at the platform level. We do not dictate anything in the games.

**Build impact:** ✅ Decision: **sunset model.** Per-season cosmetic pool, old cosmetics retire as "vintage" — drives chest demand each new season. Confirmed in the implementation doc.

---

**Q10 — Custom Title moderation.**

> **Marco:** I think that is up to you and not at the platform level. We do not dictate anything in the games.

**Build impact:** ✅ Decision: handled entirely on our side. Mythic Elite-only custom title submissions queue in a new admin moderation panel. We already have the admin chat-moderation infrastructure (see `AdminSquadChatModeration`), so this is a small extension, not net-new tooling.

---

## D. Edge case — wallets that have never played Cosmic Sloths

**Q11 — Never-played wallet.** Can we return 200 + queue the grant for first-login redemption? Any way to surface "not activated yet" back to OmenX?

> **Marco:** The player's wallet address will be defined in the payload, but if that player is not in your system, you would have to keep track of the rewards for when that player enters your game so they can be granted to the player. This is also a form of user acquisition for games — because they'll get an item for a game they're not playing and then suddenly want to play the game so they can see the item.

**Build impact:** ✅ Confirms our `PendingChestGrant` plan is exactly what Marco expects. Always return 200; queue the grant; drain on first login. The "user acquisition" framing is good — we should surface a "🎁 You have unclaimed chest rewards waiting" banner aggressively on first-time login from a wallet with pending grants. No backchannel signal to OmenX needed.

---

**Q12 — Blacklist visibility.**

> **Marco:** That must be handled on your side. We do not care or control that. But that account should still be credited the item, even if that player cannot access the account.

**Build impact:** 🟡 **Policy refined.** OmenX credits the grant either way — we can't reject. Plan:
- Webhook still returns 200 + persists the grant for blacklisted wallets (we don't lie about receipt).
- Drain step at login is the enforcement point: if the wallet is on `BlacklistedWallet`, the grant stays in `PendingChestGrant` permanently (or is moved to a `BlockedChestGrant` audit table). Login is blocked anyway, so the player never sees the item.
- This matches Marco's wording: "the account is credited the item, even if the player cannot access the account."

---

## Resolved blockers + remaining unknowns

| Item | Status |
|---|---|
| Exact payload field names (Q1) | ⏳ Waiting on test tool |
| Retry/DLQ behaviour (Q2) | ✅ Owned by us — must return 200, retries internal |
| Test harness (Q3) | ⏳ Waiting on test tool |
| Concurrency (Q4) | ✅ Handle parallel, no throttling |
| URL change policy (Q5) | ✅ Secret persists across URL changes |
| Soulbound vs tradable (Q6) | ✅ Our call per SKU — soulbound for most |
| Open animation (Q7) | ✅ One chest at a time |
| Multi-category rewards (Q8) | ✅ Payload is array — handler iterates |
| Cosmetic seasons (Q9) | ✅ Sunset model, our policy |
| Custom title moderation (Q10) | ✅ Our side |
| Never-played wallet (Q11) | ✅ Always 200, queue, drain on login |
| Blacklist policy (Q12) | ✅ Credit but block on drain |

**Only true blocker is the payload sample (Q1).** We can begin handler scaffolding against assumed field names today and finalise the parser when the test tool ships.