# Cosmetics Rework — Master Design Doc

**Status:** Design phase. No code written yet.
**Owner:** Cosmic Sloths dev team
**Date:** 2026-06-26
**Scope confirmed (06-26):**
1. **Full rework of every existing cosmetic** — pilot icons, weapon trails, kill effects, character skins, titles flair, jukebox tracks.
2. **ONE unified Wardrobe page for ALL cosmetics** — old standard cosmetics + new chest cosmetics live in the same place. The Cosmic Armoury's cosmetic tabs are retired; cosmetics leave the Armoury entirely.
3. **Old cosmetics become GMT-only "Support the Devs" tier** — purchase buttons disabled in the meantime, labelled "Coming soon". At GMT launch they reactivate, paid in GMT only (no gold, no OMENX). Framed as a donation tier — small permanent vanity rewards for backing the devs. Already-owned standard cosmetics behave exactly as today: equip, unequip, swap between owned ones, preview.
4. **Standard cosmetic catalogue expands** — since GMT support cosmetics are a recurring revenue stream, the standard pool grows so backers always have something new to pick up. Target ~2× the current catalogue size at GMT launch (see Section A).
5. **Preview works for every cosmetic** — owned, locked, and disabled-to-purchase alike. Click any tile → live in-canvas preview (reuses `CosmeticPreview` for trails/kill FX; new preview components for icons/frames/flair).
6. **Two visual identities — Epic vs Mythic.** Epics share one elevated baseline style; Mythics get a distinct, "this person spent" elevated look. (GMT support cosmetics sit *below* Epic — they're the "thanks for the donation" floor.)

---

## What we have today (audit)

Pulled from the live codebase so the rework plan covers everything that's actually shipped.

### Cosmetic systems already in production

| System | Where it lives | Storage on save | Render path |
|---|---|---|---|
| **Pilot Icons** | `EmojiPicker` — 20 emoji + URL upload | `user.data.pilot_icon` (emoji char OR URL) | `<img>` if URL, else emoji char. Shown on Profile, LB rows, squad chat, end-of-run modal. |
| **Squad Icons** | `EmojiPicker` — 20 emoji + URL upload | `Squad.icon` | Same dual-render path as pilot icons. |
| **Weapon Trails** | Cosmic Armoury (Upgrades page) — gold-cost tiers 3k/10k/20k/30k | `save.cosmetics.trail`, owned in `save.unlockedCosmetics[]` | `ParticleManager.createTrail(trailId, …)` — in-game during runs. |
| **Kill Effects** | Cosmic Armoury — gold tiers 3k/12k/25k | `save.cosmetics.killEffect`, `save.unlockedKillEffects[]` | `ParticleManager.createKillEffect(id)` — fires on enemy death. |
| **Character Skins** | Cosmic Armoury — gold tiers 5k/20k, per-character | `save.cosmetics.skins[charId]`, `save.unlockedSkins[]` | Sprite swap on the character renderer. |
| **Titles** | Star Callsigns page (`/titles`, slide 15) — 60+ titles, 7 tiers (Starter→Mythic) | `user.data.player_title` | Coloured badge — flat text only. Tier badges use Tailwind class sets from `TITLE_TIERS`. Most also confer small buffs (set in `playerTitles.js`). |
| **Jukebox Tracks** | Stellar Jukebox page (slide 14) | `save.musicTrack` | Audio playback only — no visual element. |

### Cosmetic systems referenced in the chest doc but NOT YET built

These are the "spectacular" categories the VIP Chest doc promises but that don't exist in code today:

- **Animated Pilot Icons** (frame-looping image instead of static emoji) — Epic
- **Leaderboard Banner Frames** (animated border around LB row) — Epic / Mythic
- **Title Flair / Gradients** (animated text effects on equipped titles) — Epic
- **Weapon Trail Renders** (chest-tier variants on top of the existing trail system) — Mythic
- **Kill Effect Renders** (chest-tier variants on top of the existing kill effect system) — Mythic
- **Squad Meteor Strike FX** (custom render in the squad activity feed) — Mythic
- **Custom Title** (player-submitted, mod-approved) — Mythic, Elite-chest-only

So the rework expands the cosmetic surface area roughly 2×.

---

## Visual identity — Epic vs Mythic split

### Epic line — "Cosmic Veteran"

The standard chest cosmetic look. Feels premium but not overwhelming. Used for the 60–70% of chest cosmetic rolls that land on Epic.

- **Palette:** Deep space blues + cyans, cool purples. Limited gold accents only on edges.
- **Motion:** Subtle. Slow rotations, gentle glows, soft particle drift. Nothing that strobes.
- **Silhouette:** Recognisable as a cohesive set — every Epic shares the same edge treatment (a thin gradient border with a soft cyan inner glow).
- **Animation budget:** ≤ 6 frames per loop. Loops at 1–2 fps so it never distracts from gameplay.
- **Reads as:** "I have chest cosmetics." Other players see it and know you're a chest opener, not the difference between a Bronze and an Elite.

### Mythic line — "Ascendant"

Reserved for the top ~15% of cosmetic rolls. Visibly elevated. Players should screenshot these.

- **Palette:** Gold + obsidian + deep crimson. Saturated. High contrast against the cosmic blue backdrop of the game.
- **Motion:** Bold. Heavy parallax, lens flare, golden particle trails, animated runes. Reads even at small sizes on mobile.
- **Silhouette:** Ornate filigree edges, double-stroke borders, occasional embedded "rare artifact" iconography (constellations, broken halos, eclipse glyphs).
- **Animation budget:** 8–16 frames, 8–12 fps loop. More elaborate but still cheap to render.
- **Reads as:** "I opened a Legend or Elite chest." High flex value. Chase tier.

### Why a split rather than one unified style?

1. The chest doc EV math depends on rarity feeling earned. If a Mythic looks identical-but-shinier to an Epic, the Elite chest's appeal collapses.
2. The Epic line needs to feel cohesive across 13 launch cosmetics; the Mythic line needs to feel one-of-one even though there are 7.
3. Different palettes mean we can re-use the Epic style across seasons (it's the baseline chest look) while rotating Mythic seasons (gold→silver→void→solar themes per season).

---

## Full cosmetic catalogue — design specs

### A. Standard cosmetics — the GMT "Support the Devs" tier

These are the existing Armoury cosmetics, **repositioned** as a small-donation vanity tier paid in GMT at GMT launch. Until then, purchase buttons stay disabled with "Coming soon".

**Positioning:** below Epic. Visually clean and pleasant but never elevated. The pitch is "throw the devs a few GMT, get a permanent unlock you can swap to whenever". The catalogue intentionally has *many* small items so a regular backer always has something fresh to grab.

**Pricing:** **flat 15 GMT per item** across every category and rarity. One price, no tiers — keeps the "donation" framing clean and the UI simple (no per-item price lookups, no rarity-based price math).

**SKU strategy:**
- **Save schema stays 100% intact** — `save.cosmetics.*` and `save.unlockedCosmetics[]` keep the same cosmetic IDs. Already-owned cosmetics equip / swap / preview exactly as today.
- **All cosmetic entries in `lib/skuMap.js` get replaced with the new GMT-only SKUs** registered in the OmenX dev portal. The old gold-tier / OMENX SKUs are dead — they can't be purchased anymore so the mapping is useless. One GMT SKU per cosmetic ID, all priced at 15 GMT in the portal.
- `getCosmeticSku(...)` keeps the same signature but now returns GMT SKUs only. Gold-cost / OMENX purchase paths for cosmetics are removed from the Armoury (which is losing its cosmetic tabs anyway).
- The existing rarity label (Basic/Advanced/Epic/Legendary) survives as a *visual badge only* — it no longer drives any price logic. Players see the badge but pay the same 15 GMT regardless.

**⚠️ Blocker:** the GMT integration needs the `price:read` API scope before we can show / charge GMT prices live. Currently not granted on our key. **Action:** request `price:read` scope from OmenX before Phase 4 (webhook / GMT activation).

#### A.1 — Existing catalogue (kept as-is, repriced for GMT)

| ID | Category | Visual tier | Visual direction |
|---|---|---|---|
| `pilot_icon_*` (20 emoji) | Pilot Icon | Free | Keep emoji. No rework — emoji is the right "default" floor. |
| `trail_basic_*` (5 variants) | Weapon Trail | Basic | Solid colour, low particle density. Clean. |
| `trail_advanced_*` (5) | Weapon Trail | Advanced | Two-colour gradient, mild glow. |
| `trail_epic_*` (5) | Weapon Trail | Epic-look | Animated colour shift, particle puffs. |
| `trail_legendary_*` (5) | Weapon Trail | Legendary-look | Beam-style with sparks. |
| `kill_basic_*` (5) | Kill Effect | Basic | Single-colour burst. |
| `kill_advanced_*` (5) | Kill Effect | Advanced | Multi-particle ring burst. |
| `kill_epic_*` (5) | Kill Effect | Epic-look | Themed shapes (coin burst, shard burst). |
| `skin_basic_*` (per char, 10 chars) | Character Skin | Basic | Re-colour of base sprite. |
| `skin_advanced_*` (per char, 10 chars) | Character Skin | Advanced | Outfit / armour swap. |

#### A.2 — Expansion catalogue (NEW, ships at GMT launch)

Roughly doubles the standard pool so backers always have unbought options. Reuses the existing render systems — **no new render code**, just more configs.

| New IDs | Category | Visual tier | Count | Visual direction |
|---|---|---|---|---|
| `trail_basic_v2_*` | Weapon Trail | Basic | 5 | Alt colour palettes — pastel, monochrome, neon. |
| `trail_advanced_v2_*` | Weapon Trail | Advanced | 5 | New two-tone gradients (sunset, aurora, ocean, magma, frost). |
| `trail_epic_v2_*` | Weapon Trail | Epic-look | 5 | Themed (autumn leaves, snowflakes, embers, bubbles, petals). |
| `trail_legendary_v2_*` | Weapon Trail | Legendary-look | 5 | Beam-style with new spark palettes (electric, ghostly, holy, void, prism). |
| `kill_basic_v2_*` | Kill Effect | Basic | 5 | Alt-colour single bursts. |
| `kill_advanced_v2_*` | Kill Effect | Advanced | 5 | New ring patterns (heart-ring, star-ring, square-burst, double-ring, slowmo-puff). |
| `kill_epic_v2_*` | Kill Effect | Epic-look | 5 | Themed (snowflake burst, leaf burst, bubble pop, music notes, hearts). |
| `skin_v3_*` (per char) | Character Skin | Advanced | 10 | Third skin per character — alt outfit (winter / summer / festival / void / militia variants). |
| `pilot_icon_pack2_*` | Pilot Icon | Free addition | 20 | 20 new static emoji/icon options added to the picker. |

**Totals:**
- Existing: 70 paid items + 20 free pilot icons.
- Expansion: 45 paid items + 20 free pilot icons.
- **GMT-launch catalogue: 115 paid standard cosmetics + 40 free pilot icons.**

**Why ~2×, not more?**
- Each "v2" variant only needs a particle config / colour palette, not new render code. Cheap to ship.
- 115 paid items lets a heavy backer buy one cosmetic per week for ~2 years before running out — enough headroom that catalogue exhaustion isn't a near-term risk.
- New skins per character (10× v3) are the most expensive expansion item but also the highest-flex. Keep the count tight (one per char) — quality over quantity.

**SKU code:** every cosmetic in A.1 + A.2 gets one new GMT SKU registered in the OmenX dev portal at 15 GMT. The old gold/OMENX cosmetic rows in `skuMap.js` are deleted and replaced — there's no parallel-coexistence period since pre-GMT the cosmetics aren't purchaseable at all (just "Coming soon"). `getCosmeticSku(...)` is simplified to a flat ID → GMT SKU lookup.

### B. New Chest cosmetics — Epic line (13 launch items)

Lives on a **new dedicated page** (see Page Structure section below). NOT for sale in the Armoury — chest-only.

**Locked 2026-06-26** after a brutal cull of the original 13. Cuts: Pulsing Heart (Twitch-button vibe), Cosmic Egg (joke item), Starfield (looks like the game's own background), Static Gold Leaf (just a font color). Reframed Nebula Swirl with a higher-contrast brief.

| # | ID | Category | Visible where | Description |
|---|---|---|---|---|
| 1 | `animated_pilot_orbiting_moon` | Animated Pilot Icon | LB row, squad chat, end-of-run | A small moon orbits a planet. 6-frame loop. |
| 2 | `animated_pilot_glitch_skull` | Animated Pilot Icon | Same | Cyan skull with intermittent RGB-split glitch. |
| 3 | `animated_pilot_rotating_blackhole` | Animated Pilot Icon | Same | Slow-spin black hole with accretion disc. |
| 4 | `animated_pilot_phoenix_wing` | Animated Pilot Icon | Same | Single glowing wing emerging and retracting from a dark circle. Orange-gold gradient. |
| 5 | `animated_pilot_eye_of_void` | Animated Pilot Icon | Same | Unsettling slit-pupil eye that blinks slowly inside a black circle. Pupil tracks subtly. |
| 6 | `animated_pilot_plasma_core` | Animated Pilot Icon | Same | Pulsing cyan energy orb with arcing electric lightning around it. |
| 7 | `lb_frame_gold_filigree` | LB Banner Frame | Weekly LB row | Thin gold filigree border + soft cyan inner glow. |
| 8 | `lb_frame_electric_arc` | LB Banner Frame | Same | Animated electric arcs travelling around the border. |
| 9 | `lb_frame_nebula_swirl` | LB Banner Frame | Same | Thick nebula gradient with bright stars travelling along the border (high-contrast — was previously too subtle). |
| 10 | `lb_frame_glitch_rgb` | LB Banner Frame | Same | RGB-split border that pulses. Pairs with the Glitch Skull pilot icon as a set. |
| 11 | `title_style_rainbow_shimmer` | Title Flair | Wherever title renders | Hue-shift gradient across the title text. |
| 12 | `title_style_blue_flame` | Title Flair | Same | Blue-flame outline that flickers. |
| 13 | `title_style_liquid_chrome` | Title Flair | Same | Animated chrome reflection that travels across the text. |

### C. New Chest cosmetics — Mythic line (7 launch items)

| # | ID | Category | Visible where | Description |
|---|---|---|---|---|
| 14 | `weapon_trail_void` | Weapon Trail (Mythic) | In-run projectiles | Deep violet trail with golden particle sparks. |
| 15 | `weapon_trail_solar` | Weapon Trail (Mythic) | Same | Solar-flare orange with white-hot core. |
| 16 | `weapon_trail_phoenix_fire` | Weapon Trail (Mythic) | Same | Orange→white→cyan gradient with feather-shaped particles. Replaced the original Eclipse Trail — black-on-black read too poorly. |
| 17 | `kill_fx_coin_burst` | Kill Effect (Mythic) | On every kill | Gold coin shower with screen-shake-free particle pop. |
| 18 | `kill_fx_supernova` | Kill Effect (Mythic) | Same | Bright white expansion ring + golden shards. |
| 19 | `meteor_fx_gold_lightning` | Meteor Strike FX (Mythic) | Squad activity feed line for your strikes | Animated gold lightning bolt on the line. |
| 20 | `lb_frame_eclipse_crown` | LB Banner Frame (Mythic) | Weekly LB row | Ornate eclipse crown — Elite-chest-only. |

### D. Mythic + custom (Elite chest only)

- `custom_title_pending` — player-submitted text. Admin approval workflow. **Not generated, not in the visual catalogue.** Separate moderation system (extends existing `AdminSquadChatModeration`).

---

## Page structure

### New page: **Wardrobe** (`/wardrobe`) — unified home for ALL cosmetics

One standalone page that owns every cosmetic in the game. Replaces the Cosmetic tabs in the Cosmic Armoury. Added as a new carousel slide (between Profile and Jukebox).

**Categories (tabs):**
1. Pilot Icon (emoji + uploaded URL + animated chest icons)
2. Character Skin (per-character skins — Armoury-style grid keyed by selected char)
3. Weapon Trail (standard tiers + Mythic chest variants)
4. Kill Effect (standard tiers + Mythic chest variants)
5. LB Banner Frame (chest-only)
6. Title Flair (chest-only)
7. Meteor Strike FX (chest-only)

**Source filter (independent of category tabs):**
- All
- Owned
- Standard (Armoury-tier — disabled to purchase)
- Chest (Epic + Mythic)
- Locked

**Layout:**

```
┌─ Wardrobe ────────────────────────────────────────────────────┐
│  [← Back]                                  [Currency Header]   │
│                                                                │
│  ┌─ Category tabs ───────────────────────────────────────┐    │
│  │ Pilot Icon │ Skin │ Trail │ Kill FX │ Frame │ Flair │ … │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌─ Source filter ─────────────────────────────────────┐      │
│  │ All │ Owned │ Standard │ Chest │ Locked              │      │
│  └─────────────────────────────────────────────────────┘      │
│                                                                │
│  ┌── Cosmetic grid (responsive 2-4 cols) ─────────────┐       │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐             │       │
│  │  │ thumb   │  │ thumb   │  │ thumb   │  …          │       │
│  │  │ Epic    │  │ Standard│  │ Mythic  │             │       │
│  │  │[Equipped]│ │[Preview]│  │[Preview]│             │       │
│  │  │         │  │ "GMT    │  │ "Chest  │             │       │
│  │  │         │  │ soon"   │  │ only"   │             │       │
│  │  └─────────┘  └─────────┘  └─────────┘             │       │
│  └────────────────────────────────────────────────────┘       │
│                                                                │
│  Click any tile → opens live preview modal                    │
│   (canvas / sprite / CSS demo, depending on category)         │
└────────────────────────────────────────────────────────────────┘
```

**Purchase states for each tile:**
| State | When | Button |
|---|---|---|
| Owned + equipped | already owned, currently equipped | "Equipped" (tap again to unequip if category allows) |
| Owned + unequipped | already owned | "Equip" |
| Standard (not owned, pre-GMT) | Armoury cosmetic, GMT not yet live | Disabled — "Coming soon" |
| Standard (not owned, post-GMT) | Armoury cosmetic, GMT live | "Support the Devs — 15 GMT" |
| Chest (not owned) | Epic/Mythic chest reward | Disabled — "Drops from {chest tier}+ chests" |

**Preview always works** regardless of state. Click the tile (not the button) to open the preview modal.

### Cosmic Armoury → Upgrades only

The Armoury page keeps stat / weapon / talent upgrades. **Its cosmetic tabs (Trails / Kill Effects / Skins) get removed** — those cosmetics relocate to the Wardrobe with purchase disabled.

### Profile page

Add an "Equipped Cosmetics" section showing current chest cosmetic selections + a "Manage in Wardrobe →" link. Existing pilot-icon edit flow stays.

### Star Callsigns (titles page)

When a player equips a title with a `title_style_id` set on their profile, the title renders with that flair. The page itself stays unchanged — flair is a separate purchase from the title.

---

## Save schema additions

Adds to `PlayerSave.save_data.profile`:

```js
{
  // existing fields stay
  pilot_icon: '🦥' | '<url>',          // unchanged
  player_title: 'Eternal Sovereign',   // unchanged

  // NEW chest cosmetic equip slots (null when nothing equipped)
  equipped_animated_icon: null,        // 'animated_pilot_orbiting_moon'
  equipped_lb_frame: null,             // 'lb_frame_gold_filigree'
  equipped_title_style: null,          // 'title_style_blue_flame'
  equipped_weapon_trail_mythic: null,  // 'weapon_trail_void' — overrides standard trail when set
  equipped_kill_fx_mythic: null,       // 'kill_fx_coin_burst' — overrides standard kill fx
  equipped_meteor_fx: null,            // 'meteor_fx_gold_lightning'
}
```

Adds top-level on `save_data`:

```js
{
  owned_chest_cosmetics: [],   // ['animated_pilot_orbiting_moon', 'lb_frame_gold_filigree', …]
}
```

A single array keyed by cosmetic id covers all categories. The category is decoded from the id prefix at render time — keeps the schema flat and easy to grant from the chest webhook.

---

## Asset production plan

Generation happens via `functions/generateCosmeticAsset` (already built + tested 2026-06-26). Admin-only.

### Production status (resume point)

**Pipeline locked 2026-06-26:** FLUX.1-dev via fal-ai (HF Inference Providers router, billed against `HF_INFERENCE_PROVIDERS_TOKEN`). FLUX.1-schnell still available in the studio dropdown for cheap iteration but the default for all chest-tier work is FLUX.1-dev. Generation is synchronous (`sync_mode: true`) — ~3–8s per image, no polling.

**Chest Epic — Animated Pilot Icons (6/6 approved ✅ — category complete):**

| # | ID | Status | Asset ID |
|---|---|---|---|
| 1 | `animated_pilot_orbiting_moon` | ✅ approved | `6a3e83f416a004285f5ab76c` |
| 2 | `animated_pilot_glitch_skull` | ✅ approved | `6a3e83eee6e90c77450b6406` |
| 3 | `animated_pilot_rotating_blackhole` | ✅ approved | `6a3e83ed1a455b9670cbd72f` |
| 4 | `animated_pilot_phoenix_wing` | ✅ approved | `6a3e83ef910abde24e7aa858` |
| 5 | `animated_pilot_eye_of_void` | ✅ approved | `6a3e83eda1967d84b2eeb957` |
| 6 | `animated_pilot_plasma_core` | ✅ approved | `6a3e83edff5c37ed89545970` |

**Note on animation:** these are all hero/keyframe stills. The 6-frame loops promised in section B (CSS `steps(6)` sprite sheets) will be generated as follow-up passes against the approved hero frame, or hand-composed in code. Hero asset is the canonical "this is what the cosmetic looks like" image.

**LB Banner Frames (5/5 approved ✅ — category complete):** all 4 Epic frames + the Mythic Eclipse Crown generated at **1024×1024 with picture-frame prompts** (see "LB Frame generation finding #2" below for why square aspect was the unlock). 9-slice render handles the actual ~720×80 LB row size at runtime.

**Meteor FX (1/1 approved ✅ — generated 2026-06-27):** `meteor_fx_gold_lightning` at 256×128. Completes every AI-generated chest cosmetic.

**Code-only chest cosmetics — all DONE ✅ (2026-06-27):**
1. ✅ **Chest Epic — Title Flair (3):** `rainbow_shimmer`, `blue_flame`, `liquid_chrome` — CSS animations in `index.css` under `@layer utilities`. Applied via `.title-flair-<id>` class.
2. ✅ **Chest Mythic — Weapon Trails (3):** `weapon_trail_void`, `weapon_trail_solar`, `weapon_trail_phoenix_fire` — ParticleManager `createTrail` configs (eclipse cut → phoenix_fire per 06-26 design).
3. ✅ **Chest Mythic — Kill FX (2):** `kill_fx_coin_burst`, `kill_fx_supernova` — ParticleManager `createKillEffect` cases.

**Every chest cosmetic asset is now built.** Next: **Phase 2 — save schema additions (`equipped_*` slots + `owned_chest_cosmetics[]`) and Wardrobe page wiring** to make these previewable + equippable.

---

### LB Banner Frame — render strategy (resolved 2026-06-27)

Before generating the 5 frame assets we have to decide *how* the frame composites around a leaderboard row. The image-prompt brief depends entirely on this choice.

**Options considered:**

| Option | What the PNG is | Pros | Cons |
|---|---|---|---|
| A. Transparent inner cutout | Frame art is a thin ring; middle is fully transparent | Row content underneath shows perfectly; one PNG works on any LB row colour | FLUX struggles to keep the inner area cleanly transparent — usually fills it with vignette or gradient |
| B. Solid-colour inner ("punch-through" via CSS mask) | Frame is a full painted rectangle; we punch a transparent inner area in CSS with `mask-image: linear-gradient(...)` | FLUX paints the easier shape (just a full rect with ornate edges); we control the cutout precisely in CSS | Need a second tiny mask asset (or pure CSS mask) per frame size |
| C. Frame as background painted to fit | Frame is a full 1024×96 painted scene; row content sits on top with its own opaque dark background | Easiest prompt — "ornate cosmic border around dark centre"; no compositing tricks | Inner darkness has to be dark enough to read white text on, every time. Hit-and-miss on FLUX. |

**Decision: Option B — solid-frame PNG + CSS-driven inner cutout.**

Reasoning:
- FLUX is far more reliable at painting a complete 1024×96 image with detailed edges than at honouring a "leave the centre transparent" instruction.
- The cutout shape is **the same for every frame** (a centred 1000×72 rounded-rect window), so the mask is a single CSS rule applied at the `.lb-frame` wrapper — no per-frame mask asset.
- Means we generate one PNG per frame and only ever ship that one PNG. Wardrobe preview and live LB row both use the same asset.

**CSS sketch (for Phase 3 — not for now):**

```css
.lb-frame {
  position: absolute;
  inset: 0;
  background-image: var(--frame-url);
  background-size: 100% 100%;
  /* Punch a rounded-rect window in the centre so the LB row reads through */
  -webkit-mask-image:
    linear-gradient(#000, #000),                                   /* keep the frame */
    radial-gradient(closest-side at 50% 50%, #000 99%, transparent 100%);  /* hole */
  -webkit-mask-composite: source-out;
  mask-composite: subtract;
}
```

Exact mask geometry is a Phase 3 concern — for now we just need to lock the **prompt brief** for the painters.

### LB Frame prompt brief — locked

Every Epic + Mythic LB frame generates with this shared spec:

- **Dimensions:** 1024 × 96 px, landscape.
- **Composition:** ornate decorative border filling the full canvas. The middle horizontal band (~70% of height) is a **flat, very dark neutral fill** (`#0a0e1a`-ish — the colour our LB row background sits at). The decorative work — filigree, arcs, glitch, swirl, crown — lives in the **top and bottom ~15% bands** and the **left/right ~80px columns**.
- **Why dark centre, not transparent:** lets FLUX paint a complete image (its strength). The CSS mask punches the actual hole later — the centre fill is throwaway pixels we never see.
- **No text, no UI chrome, no LB row contents** (no rank numbers, no player names, no avatar). Just the frame itself.
- **Style baseline:** matches the pilot icons we just approved — deep space cosmic aesthetic, premium sci-fi game UI, sharp clean edges.

### LB Frame catalogue (4 Epic + 1 Mythic)

| # | ID | Rarity | Prompt direction | Negative prompt additions |
|---|---|---|---|---|
| 7 | `lb_frame_gold_filigree` | Epic | "Ornate gold filigree decorative border, 1024×96 horizontal banner. Thin baroque vine-and-laurel goldwork along the top and bottom edges, mirrored corner flourishes on each side. Centre 70% of the image is a flat dark navy fill (#0a0e1a). Soft cyan inner glow where gold meets dark. Premium MMO leaderboard frame, deep space cosmic aesthetic, crisp metallic detail, no text, no UI." | `text, numbers, names, faces, characters, content inside frame, hand drawn, photo, 3d render` |
| 8 | `lb_frame_electric_arc` | Epic | "Sci-fi electric arc decorative border, 1024×96 horizontal banner. Glowing cyan and white-hot lightning arcs travelling along the top and bottom edges of the frame, with bright nodes at the four corners. Centre 70% is a flat dark navy fill (#0a0e1a). Crackling energy detail, premium futuristic UI frame, sharp glow, deep space aesthetic, no text, no UI." | `text, numbers, characters, content inside frame, hand drawn, photo, 3d render` |
| 9 | `lb_frame_nebula_swirl` | Epic | "Nebula gradient decorative border, 1024×96 horizontal banner. Swirling cosmic clouds in deep purple, magenta and cyan along the top and bottom edges, with bright tiny stars scattered through the nebula. Centre 70% is a flat dark navy fill (#0a0e1a) so the nebula reads as a contained border, not a full background. Premium space MMO frame, vivid high-contrast nebula colours, crisp star detail, no text, no UI." | `text, numbers, characters, content inside frame, washed out, low contrast, blurry centre, hand drawn` |
| 10 | `lb_frame_glitch_rgb` | Epic | "Cyberpunk RGB glitch decorative border, 1024×96 horizontal banner. Top and bottom edges show a digital interference pattern with red/green/blue chromatic split, scan lines, data-corruption artefacts. Bright cyan and magenta glow on the corners. Centre 70% is a flat dark navy fill (#0a0e1a). Premium cyberpunk game UI frame, sharp digital detail, no text, no UI." | `text, numbers, characters, content inside frame, hand drawn, photo, soft, blurred` |
| 20 | `lb_frame_eclipse_crown` | **Mythic** | "Ornate mythic eclipse crown decorative border, 1024×96 horizontal banner. A central golden crown silhouette at the very top centre with a black eclipse disc behind it radiating golden corona rays. Baroque golden filigree extends along the entire top and bottom edges, with deep crimson accents in the corners. Centre 70% is a flat dark navy fill (#0a0e1a). Mythic ascendant tier — saturated, high-contrast, premium god-tier MMO leaderboard frame, exquisite metallic detail, no text, no UI." | `text, numbers, characters, content inside frame, hand drawn, photo, 3d render, washed out, multiple crowns` |

**Generation order:** Epic 7→10 first in one batch (cheapest to iterate on), Mythic 20 last (highest stakes — we want to settle the Epic baseline before painting the chase tier).

**Resume here next session if interrupted:** Generate frames 7→10 against the locked brief above. Review in Cosmetic Studio. Reroll any that bleed the decoration into the centre band (most likely failure mode) by adding `, dark centre, contained border decoration` to the prompt.

---

### LB Frame generation finding (2026-06-27) — aspect ratio matters

**Problem hit on first pass:** Generated all 5 frames at exactly 1024×96 (the target render size). FLUX read 10.6:1 as "wide banner header" and painted ornate decoration only along the **top edge**, leaving the bottom totally blank. They look like the upper half of a picture frame — gorgeous, but not a full enclosing border.

**Root cause:** at extreme aspect ratios FLUX has a strong "banner header" prior. "Top band" / "bottom band" instructions in the prompt couldn't override it.

**Fix — generate taller, downscale via 9-slice:**
- **Source resolution: 1024 × 256** (4:1) — an aspect FLUX reliably treats as "rectangular frame around a contained scene".
- **Render size in the UI: unchanged** — 9-slice (`border-image`) doesn't care about source pixel height. It slices by ratio. The 24 / 80 / 24 / 80 slice fractions just become `64 / 80 / 64 / 80` against the 256px source.
- **Prompt rewrite:** drop "1024×96 horizontal banner" and "top 24 pixel band / bottom 24 pixel band". Replace with "fully enclosed rectangular frame, decoration mirrored on top AND bottom edges, symmetrical four-sided border". Centre still flat `#0a0e1a`.

**File-size impact:** 1024×256 PNG ≈ 4× the pixels of 1024×96, but still under 200KB each at FLUX's typical compression. Acceptable.

**Reroll batch ran 2026-06-27 — all 5 frames regenerated at 1024×256 with rewritten prompts.** Old 96px assets superseded; review the new ones in the studio.

---

### LB Frame generation finding #2 (2026-06-27) — 4:1 still too wide

**Problem hit on second pass:** at 1024×256 (4:1) the frames now paint decoration concentrated in the **left and right end caps** with the top and bottom edges nearly empty — they read as "side panels with a centre gap" rather than fully enclosed four-sided borders. The 9-slice would stretch that empty middle band horizontally and the rendered LB row would have an obvious unornamented strip across the top and bottom.

**Root cause:** FLUX's "horizontal banner" prior is still dominant at 4:1. The "fully enclosed rectangular frame" language in the prompt wasn't enough to override it. Same problem as the 10.6:1 pass, just shifted from "top edge only" to "left/right edges only".

**Fix — go fully square + prompt for "ornate picture frame":**
- **Source resolution: 1024 × 1024** (1:1). At square aspect, FLUX reliably treats the brief as "ornate picture frame surrounding a central scene" — the strongest prior we have for four-sided symmetrical decoration.
- **Render strategy unchanged.** 9-slice via `border-image` doesn't care about source aspect ratio — `border-image-slice: 24 80 24 80` still describes the slice region as a fraction of the source. At 1024×1024 the corners are 80×24 fractional units (still pixel-equivalent at our render size). Centre still gets discarded.
- **File size:** 1024×1024 PNG ≈ 4× a 1024×256 PNG (~800KB worst-case). Still acceptable — these load once at app start and are cached.
- **Prompt rewrite (third pass):** drop all banner language. Lead with "ornate decorative picture frame" / "rectangular border surrounding a dark centre". Add explicit "four-sided symmetrical decoration, equal ornamentation on top edge, bottom edge, left edge, and right edge."

**Resume here next session:** regenerate all 5 frames (Epic 7-10 + Mythic 20) at 1024×1024 with picture-frame-language prompts. Watch for the failure mode flipping again — if FLUX now paints something *inside* the dark centre (treating it as a painting subject), strengthen "empty centre" / "centre is plain dark fill, no subject" in the prompt.

---

### LB Frame responsive scaling (resolved 2026-06-27)

The LB row stretches with viewport — desktop ~720px wide, tablet ~500px, mobile ~340px. A naive `background-size: 100% 100%` stretch on a 1024×96 PNG squashes the corner ornaments horizontally and looks awful on mobile.

**Solution: CSS `border-image` 9-slice.** Standard technique for ornate UI borders. The browser slices the PNG into 9 regions — 4 corners stay fixed pixel size, 4 edges stretch (or tile) along their own axis only, centre is discarded. Corners never distort regardless of row width.

**Slice geometry — locked across all 5 frames:**

```
   ┌─────────────────────────────────────────┐
80 │ TL  │        top edge          │  TR    │  ← 24px tall
   ├─────┼─────────────────────────┼────────┤
   │     │                          │        │
48 │  L  │     centre (discarded)   │   R    │  ← 48px tall
   │     │                          │        │
   ├─────┼─────────────────────────┼────────┤
24 │ BL  │      bottom edge         │   BR   │  ← 24px tall
   └─────┴─────────────────────────┴────────┘
     80           864                 80
```

- **Corner regions: 80×24 px** (top corners) and 80×24 px (bottom corners). Big enough to hold meaningful ornament detail.
- **Top/bottom edge regions: stretch horizontally** (decorative bands repeat or stretch — `border-image-repeat: stretch` is fine for nebula/gradient art, `round` better for filigree).
- **Left/right edge regions: fixed height, stretch vertically** if row grows taller (it doesn't currently, but covers future).
- **Centre: discarded** (`fill` keyword omitted). The CSS mask cutout from Option B still applies — the LB row content sits inside the discarded area.

**Prompt impact — important:**

The brief in the table above already places "mirrored corner flourishes" in the corners and "decorative bands along the top/bottom edges" — that **happens to match the 9-slice layout**. Reinforce it explicitly in the regenerated prompts:

> "Decorative detail must be **concentrated in the top 24px band, bottom 24px band, and 80px-wide left and right columns**. Centre of the image can be plain dark fill — it will be discarded by the UI."

This is a hard requirement, not a stylistic note. A frame with detail in the centre will visibly clip when 9-sliced. Reroll any output where ornament strays past the 80px edge columns into the middle.

**CSS sketch (Phase 3 — not for now):**

```css
.lb-frame {
  position: absolute;
  inset: 0;
  border: 24px solid transparent;        /* matches top/bottom slice height */
  border-left-width: 80px;               /* matches left slice width */
  border-right-width: 80px;
  border-image-source: var(--frame-url);
  border-image-slice: 24 80 24 80;        /* top right bottom left, px */
  border-image-repeat: stretch;           /* tweak per frame: round for filigree */
  pointer-events: none;
}
```

The 24px top/bottom + 80px left/right border-widths consume the frame's painted ornament; the LB row's actual content lives in the inner content box untouched by the frame at any viewport width.

**Why not SVG instead?**
- We considered it. SVG would scale perfectly without 9-slice. But our pipeline generates raster PNGs from FLUX — converting to clean SVG would need a vector tracing pass per frame, which loses the painterly detail that makes the frames feel "premium". 9-slice on the raster is the cheaper, better-looking path.

**Mobile-specific check:** at ~340px row width, the centre region collapses to `340 - 80 - 80 = 180px`. That's still wide enough to render rank + name + score legibly inside the inner content box. No layout breaks expected. Confirmed against `components/game/Leaderboard` row dimensions during design.

**Wardrobe preview:** the preview tile is square-ish (~240×80 in the grid). Same 9-slice rule applies — corners stay crisp, edges stretch to fit the smaller box. One asset, every render context covered.



| Category | Model | Output | Render strategy |
|---|---|---|---|
| Animated Pilot Icon | FLUX.1-schnell, 256×256 | 6 PNG frames | CSS `steps(6)` sprite sheet, 1.5s loop |
| LB Banner Frame | FLUX.1-dev, 1024×96 | Single PNG | CSS `mask-image` for the inner cutout + CSS animation for arcs/glitch |
| Title Flair | (none — code-only) | n/a | Pure CSS — gradient / glow / text-stroke |
| Weapon Trail Mythic | (none — code-only) | n/a | `ParticleManager` extension with colour palettes per id |
| Kill Effect Mythic | (none — code-only) | n/a | Same — particle config per id |
| Meteor FX | FLUX.1-schnell, 256×128 | Single PNG | Used as an `<img>` overlay on the meteor activity feed line |
| Custom Title | n/a | text | Pure CSS gold-leaf style |

**Why mix art and code-only:**
- Code-only categories (title flair, trails, kill fx) compose existing systems we already have. Code is the cheapest path and renders crisply at any zoom.
- Image categories are where AI excels — ornate borders and animated icons are 10× the work to draw in code.

---

## What changes vs. the chest doc

Where this design supersedes `VIP_CHEST_GAME_ITEMS.md` § Cosmetics Overhaul:

- The chest doc proposed 5 new categories. This doc adds **6** (it splits weapon trail / kill FX into "standard" and "mythic-only" so the Armoury rework stays distinct).
- The chest doc had 20 cosmetics in a single pool. This doc has **20 total** but **13 Epic + 7 Mythic**, matching the weight tables in the chest doc's per-tier roll percentages.
- The chest doc placed cosmetic wardrobe on the Profile page. This doc moves it to a **dedicated `/wardrobe` page** based on the 06-26 decision.
- The chest doc didn't address reworking the existing Armoury. This doc covers it.

---

## Implementation phases (not for now — design only)

Reference plan for once design is signed off. Do not start any of this until the design is approved.

1. **Phase 1 — Asset generation.** Run the cosmetic studio against the 20-item Epic/Mythic catalogue + the Armoury rework list. Saves URLs to a `CosmeticAsset` entity.
2. **Phase 2 — Save schema + Wardrobe page.** Add the new profile fields, build `pages/Wardrobe.jsx`, add to App.jsx routes + carousel.
3. **Phase 3 — Render integration.** LB row frame, title flair CSS, animated pilot icon sprite renderer, ParticleManager mythic variants, meteor strike feed render.
4. **Phase 4 — Webhook integration.** `onVipChestRewardGranted` writes cosmetic grants to `owned_chest_cosmetics`. (Tracked separately in `VIP_CHEST_GAME_ITEMS.md`.)
5. **Phase 5 — Armoury art swap.** Replace the standard cosmetic art with the reworked set. Code unchanged — only URLs swap.
6. **Phase 6 — Custom title moderation.** Admin queue for Elite-chest custom titles.

---

## Resolved design decisions

All seven open questions answered 2026-06-26. Locked in for build phase:

1. **Animated pilot icons on leaderboard** — ✅ no perf concern. LB is hard-capped at 20 rows (`payoutCfg.top_n` default 20 + `KILL_BOARD_LIMIT = 20`). Animate freely, no top-10 fallback.
2. **GMT migration timeline** — TBD, blocked on `price:read` API scope from OmenX. Until then, standard cosmetic purchase buttons stay disabled with label **"Coming soon"**. No teaser pricing. At GMT launch the standard pool reactivates as the "Support the Devs" donation tier — **flat 15 GMT per item** (see Section A).
3. **Already-owned standard cosmetics during disable window** — ✅ stay equippable, swappable, and previewable. Only the *purchase* path is disabled.
4. **Title flair pricing post-launch** — **Chest-only at launch.** May become purchaseable much later — explicitly out of scope for this rework.
5. **Mythic seasonality** — Not decided yet. Build season 1 (launch) only. Season 2 art planning deferred — no S2 placeholders in the catalogue or schema.
6. **Squad icons** — ✅ confirmed untouched. Emoji + upload only, no animated chest-tier squad icons.
7. **Armoury page rename** — ✅ keep the name "Cosmic Armoury" even after cosmetics leave.

---

## Summary

ONE unified Wardrobe page that owns every cosmetic — **standard** (Armoury-style trails / kill FX / skins, becoming the GMT-paid "Support the Devs" donation tier at GMT launch; expanded to ~115 paid items so backers always have something fresh) + **chest** (13 Epic + 7 Mythic). Purchase disabled in the interim with "Coming soon". The Cosmic Armoury page loses its cosmetic tabs entirely; cosmetics relocate to Wardrobe. Live preview works for every tile regardless of ownership / purchase state. Save schema extends `profile` with 6 equipped chest-cosmetic slots + one owned-chest-cosmetic array; existing trail / kill / skin schema fields stay untouched. ~half the chest catalogue is code-only (title flair, trails, kill FX), ~half is AI-generated art; the standard expansion is entirely config-only (no new render code).