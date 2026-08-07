# FPS Audit — 2026-08-07 (second pass, deep)

## SHIPPED SO FAR (2026-08-07)

- ✅ **§1 pooled-enemy state reset** — `EnemySpawner.resetPooledEnemy()` wipes every
  own key before `Object.assign(template)`; `EnemyAI` no longer pools bosses.
- ✅ **Elite aura gradient cached by radius** (`EnemyRenderer`) — no visual change,
  the per-elite per-frame `createRadialGradient` is gone.
- ✅ **§7 particle layer split** — three lists (combat / trail / killfx) instead of
  three full-array passes over one tagged array.
- ✅ **§2 init-race cancellation** (`Game.jsx`) — no more orphaned game loops.
- ✅ **§6 bind-once** for the boss-ability callbacks.
- ✅ **§3 React bridge** — `onHpChange` / `onTimeChange` / `onGoldChange` are no-ops;
  the existing 100 ms poll reads hp/maxHp/gold/time/level off the engine.
  `UIOverlay` is now `React.memo`.
- ✅ **§4 particle textures + tint/glow/outline caches shared across runs.**
- ✅ **§5 DPS ring buffer** — 20 × 0.5 s `Float64Array` buckets, zero alloc per hit.

Verified in a live preview run: 0:15 elapsed, 16 kills, DPS 18, max-HP upgrade
applied and reflected in the polled HUD, no console errors.

### Batch 2 (2026-08-07, after first publish)

- ✅ **§7 spatial hash integer keys** — `cellKey(cx, cy) = cx * 4194304 + cy` in
  `GameEngine` / `ProjectileSystem` / `EnemyAI`. Thousands of throwaway strings
  per frame gone.
- ✅ **Major-pickup draw order** (`GameEngineDraw`) — nukes / shields / magnets /
  fragments now draw AFTER enemies, so mobs can't paint over them in a swarm
  (Briantjeuh). XP/gold litter deliberately stays below enemies.
- ✅ **§0 dead WebGL branch removed** — nothing ever assigned `engine.webglBg`, so
  both branches were unreachable. `WebGLBackground.js` is now an unused file
  (see "still open" — decide delete vs wire up).
- ✅ **§7 per-frame `filter()`** for `damageTexts`, `envParticles`, `hazards`
  (in-place compaction) and the env-particle cull list in the draw path (reuses
  one scratch array on the engine).

**Not verified in gameplay:** batch 2 was checked for build + page load only —
the preview browser lost its wallet session so no run could be launched.

### Batch 3 (2026-08-07)

- ✅ **Frame-tied ticks → real-time (S8-gated, same pattern as the S8 pool/shield
  fix).** `shieldBubble` mastery beam now fires on a 0.5s accumulator instead of
  `frameCount % 30`, and the `black_hole_tick` latch damages on a 0.5s
  accumulator instead of `frameCount % 30`. At 30fps both ran at HALF rate —
  the beam was a real DPS loss for low-end devices. S7-and-earlier keep the
  legacy tick so the in-flight leaderboard isn't retroactively changed.
- ✅ **`shadowBlur = 15` removed from animated particles** — replaced with one
  scaled-up low-alpha copy of the same frame. Canvas `shadowBlur` is a true
  per-draw Gaussian blur and explosions spawn these in bursts.
- ✅ **`checkAoe` Set allocation** — reuses one module-level scratch Set instead
  of allocating per AoE projectile per frame.

**Deliberately NOT changed:** projectile trail throttling (`frameCount % 2`) is
purely visual — fewer trail sparks at 30fps costs no damage, and making it
real-time would ADD particles on exactly the devices that are struggling.

---

## STILL OPEN (in rough priority order)

1. ~~**Frame-tied gameplay ticks**~~ — done in batch 3, except: — real output loss at low FPS, and the likely
   cause of "less kills than usual". Several systems still tick on `frameCount`
   rather than elapsed time, so at 30 fps they fire HALF as often:
   `frameCount % 2` projectile trails, `shieldBubble` mastery beam
   (`% 30`), `black_hole_tick` damage (`% 30`). S8 converted the pool/shield
   damage ticks to real-time accumulators; these were missed. **This is a
   fairness bug, not just perf — low-end devices are doing less damage.**
2. **`filter()` per frame in `updateProjectiles`** and `updatePickups` — still
   allocating a new array every frame. **Not a mechanical change:** the
   projectile loop PUSHES new projectiles mid-iteration (chain lightning,
   mastered napBeam), and `filter` deliberately doesn't visit those. A naive
   in-place compaction would visit and/or overwrite them. Needs a two-array
   swap, not a write-back. (`updatePickups` was attempted in batch 2 and backed
   out — same care needed, its magnet branch iterates the array it compacts.)
3. **Decide the background** — `WebGLBackground.js` is now provably unused. Either
   delete it, or wire it up as its own stacked canvas (NOT `drawImage`d into the
   2D context). The current 150-star fallback loop does 150 `globalAlpha` state
   changes + fillRects per frame and doesn't parallax correctly anyway.
4. **§8 small stuff** — `SpritePreloader.preload()` fires a network+decode burst
   exactly as the run starts; `SFXManager.playGoldPickup` schedules up to 7
   `setTimeout`s per call; the 100 ms HUD poll + 500 ms watchdog keep running
   after game-over while the modal is up; `handleResume`'s 1500 ms timeout is
   never cleared on unmount.

**No FPS baseline exists.** Nothing here has a measured before/after — all of it
is "work removed per frame", reasoned from the code. If numbers are wanted, an
in-game frame-time readout needs to land first so real devices can be compared
across batches.

---

First pass covered per-frame hot paths. This pass covers **lifecycle, object reuse,
per-run setup and the React bridge** — where the worse problems actually are.

> ⚠️ **Correction to the first pass.** I listed "WebGL background copied to the 2D
> canvas every frame" as a top cost. **It is not — that code never runs.** See §0.

---

## ⭐ PLAYER REPORT (Briantjeuh, Discord, 2026-08-07 07:26–07:30)

> "my fps got worse **since the update** mate"
> "also looks like **i get less kills** then usual"
> "**the more mobs spawn the lower my fps goes**"
> "idk maybe its because of **the red circles around them, they look different**"

This is a near-perfect diagnostic. Taken literally it identifies the regression:

**"the red circles around them, they look different" = the elite aura, changed by
this very update.** `EnemyRenderer.js` C8 (2026-08-03) did two things at once:

1. Flipped the aura from `globalCompositeOperation = 'screen'` to `'source-over'`
   — which is exactly why it now reads as a solid **red circle** instead of a soft
   additive glow. He is describing the C8 change verbatim.
2. **Doubled the stroked ring work**: the rune rings are now drawn *twice* — a dark
   backing pass (`lineWidth 4`) and then the colour pass (`lineWidth 2`) — so each
   elite went from 2 stroked arcs to **4 stroked arcs plus a radial gradient built
   fresh every frame**.

**"the more mobs spawn the lower my fps" is then explained by §1 (the pool bug).**
`isElite` is never cleared when an enemy object is recycled, so as a run progresses
an ever-growing share of ordinary mobs render the full (now doubled, now opaque)
elite aura. Elite cost per mob went up ~2× in the same update where the *number* of
mobs paying that cost grows over time. That compounding is precisely the curve he
describes, and it explains why it tracks mob count rather than being a flat drop.

**Second regression from the same update: the particle layer split.** Before
2026-08-03, `particleManager.draw()` ran **once** per frame. The cosmetic-layer work
(`_cosmeticLayer` = trail / killfx) made it run **three times**, each pass iterating
the *entire* particle array (cap 800) to filter by tag. Particle count scales with
mob count too — so this is a second "more mobs = worse FPS" term added by the update.
See §7.

**Third: boss AoE telegraphs** (also 2026-08-03) added per-frame filled disc +
stroked ring draws that previously did not exist. Correct fix for a real bug, but
it is new per-frame cost.

**"less kills than usual" — likely real, and *probably not* a balance change.** Two
candidates, in order of suspicion:
- Lower FPS itself. Several systems still tick on `frameCount`, not real time —
  projectile trail spawns (`frameCount % 2`), `shieldBubble`'s mastery beam
  (`frameCount % 30`), `black_hole_tick` damage (`frameCount % 30`), and on S7-and-
  earlier the pool/shield damage ticks. At 30 fps instead of 60 these fire **half as
  often**. S8 converted the pool/shield ticks to real-time accumulators, but the
  others were not converted — so a frame-rate drop still directly reduces output.
- §1 again: recycled mobs spawning `burrowed` (un-hittable, never un-burrows) or
  `hacked` would distort kill counts in both directions.

**Recommended response to this report:** §1 (pool reset) + revert/optimise the C8
elite aura (cache the gradient by radius, and drop the doubled ring pass — keep the
`source-over` readability fix, it was the point) + §7 particle layer arrays. Those
three target exactly what he described.

---

## 0. 🔴 `engine.webglBg` is NEVER ASSIGNED — dead branch, wrong fallback active

`GameEngineDraw.js` branches on `this.webglBg && this.webglBg.gl` in two places.
**Nothing in the codebase ever sets `engine.webglBg`.** `GameEngine.js` doesn't
import `WebGLBackground` and never assigns the property. So:

- `WebGLBackground.js` — the entire shader, its parallax stars, nebula drift and
  bloom — is **dead code that has never rendered**. Someone believes this feature
  is live; it isn't.
- Every frame therefore takes the **fallback star loop**: 150 iterations, each
  doing a modulo pair, a `ctx.globalAlpha =` assignment (a canvas state change) and
  a `fillRect`. That's 150 state-change + draw-call pairs per frame for background
  dots that are also drawn *on top of* the arena image, in screen space, so they
  don't even parallax correctly with the camera.

**Decide which is true**, because right now you pay for the worse one and ship
none of the good one:
- If the WebGL background is wanted → wire it up (and composite it as its own
  stacked DOM canvas rather than `drawImage`-ing it into the 2D context).
- If not → delete `WebGLBackground.js` and both dead branches, and either drop the
  star loop (the arena image already fills the screen) or batch it into a single
  path with one `globalAlpha` bucket per alpha tier.

## 1. 🔴 The enemy object pool recycles STALE STATE — bugs, not just slowness

`EnemySpawner` reuses pooled objects with `Object.assign(newEnemy, template)`.
`Object.assign` only overwrites keys **present on the template** — every field the
AI wrote at runtime survives into the next enemy that reuses that object. Nothing
is reset, and `EnemyAI` pushes *every* dead enemy into the pool (`enemyPool.push(e)`),
**including bosses and elites**.

Fields that persist and are NOT on templates:

| Stale field | Consequence when reused |
|---|---|
| `isBoss` (bosses are pooled!) | A trash mob spawns flagged as a boss → 80px HP bar, boss telegraph loop, `bossesKilled++`, and on death it sets **`sectorBossDefeated = true`, which ENDS THE SECTOR RUN**. |
| `isElite`, `eliteGoldBonus` | Trash mobs render the full elite aura (radial gradient + 4 stroked arcs per frame) and pay elite gold. Costs grow as the run goes on. |
| `hacked` | Spawns green, infights other mobs, self-damages 5%/s — free kills the player never earned. |
| `latched` | Instantly glued to the player, dealing damage every 30 frames, regardless of type. |
| `burrowed`, `burrowTimer` | Spawns invisible and un-hittable, never un-burrows (only `void_crawler` ticks the timer). |
| `slowTimer`, `attackTimer`, `dataLeeched`, `diveTimer`, `speedMult`, `heads` | Wrong speed / can't attack / wrong render. |
| `_lastWeaponId`, `damageBuffer`, `_regenAcc`, `_bombWarning` etc. | Mis-credited kills in the post-run breakdown; leftover telegraphs. |

This is the most serious thing in this audit — it's a correctness bug with a
perf tail. **Fix:** reset the object explicitly on reuse (assign a fixed
`RESET_FIELDS` list to `undefined`/`0`/`false` before `Object.assign`), and don't
pool bosses at all.

## 2. 🔴 A restart / quit during init leaks a SECOND game loop for the whole session

`Game.jsx`'s init effect runs `initGame()`, which `await`s several things
(`SaveManager.initialize()`, boss fetch, 4 dynamic imports) before constructing the
engine. The effect's cleanup only calls `engineRef.current.cleanup()`.

If the component unmounts or `runId` bumps **while `initGame` is still awaiting**
— quitting fast, double-tapping "Try Again", a slow cloud load — cleanup runs
against the *old* (or null) engine, and then the pending `initGame` resolves and
constructs a **brand-new engine whose `requestAnimationFrame` loop nobody owns**.
It keeps ticking, updating and drawing to a detached canvas **forever**, competing
with the real game for the main thread. Every occurrence stacks another loop.

**Fix:** a cancellation token — `let cancelled = false;` in the effect, set it in
cleanup, and after `new GameEngine(...)` do `if (cancelled) { engine.cleanup(); return; }`.
Same guard before the `setGameState` / `setIsInitializing` calls.

## 3. 🔴 React re-render storm from engine callbacks *(carried over — still #1 for steady-state FPS)*

`onHpChange` fires on every hit and every regen tick; `onGoldChange` on every gold
pickup **and every boss credit**; both call `setGameState`. Add the 100 ms interval
and the whole in-game React tree reconciles tens of times per second, on the same
thread as the canvas loop.

Worse: `CurrencyProvider` wraps the **entire app** and re-renders on every
`saveUpdated` window event — which `SaveManager.save()` dispatches synchronously.
So any in-run save (kill throttle, token pickup, an SFX/jukebox toggle) re-renders
the app root *and* everything under `<Router>`, mid-run.

**Fix:** drop the setState from `onHpChange` / `onGoldChange` (read `engine.player.hp`
/ `engine.gold` in the existing 100 ms poll instead) and wrap `UIOverlay` in
`React.memo`.

## 4. 🟠 `ParticleManager` is rebuilt from scratch every single run

`new GameEngine(...)` → `new ParticleManager()`, and the constructor:
- builds **5 texture canvases** via `loadTexture`, each doing a `getImageData` →
  128×128 = 16,384-pixel JS loop → `putImageData` on the main thread, and
- **throws away `tintCache`, `glowCache`, `outlineCache`**, so every tint variant
  (one canvas per colour per texture) and every glow is regenerated from zero and
  re-uploaded to the GPU during the first seconds of the next run.

The procedural sprite sheets are already module-cached (`proceduralSpriteSheetsCache`)
— the textures and caches should be too. This is a chunk of the "first 10 seconds
feel stuttery" and it repeats on every Try Again.

## 5. 🟠 `dpsWindow` allocates an object per damage event

`damageEnemy` does `this.dpsWindow.push({ t, dmg })` on **every hit** — an AoE
build lands hundreds per second, so this is hundreds of short-lived objects per
second purely to feed a HUD number. It's only trimmed inside `getRollingDps()`,
which is called from the 10 Hz interval **and only while unpaused** — so while a
level-up modal is open the array grows unbounded, and the trim uses `Array.shift()`
(O(n) per element removed).

**Fix:** two parallel `Float64Array` ring buffers (or simply accumulate damage into
fixed 0.5 s buckets — 20 numbers total). Zero allocation, O(1) trim.

## 6. 🟠 Per-frame closure allocation in the boss path

`EnemyAI` line ~513, for every boss, every frame:

```js
engine.addParticle.bind(engine), engine.addDamageText.bind(engine)
```

plus a fresh `bossTakeDamage` arrow — three function allocations per boss per
frame. Exactly the defect already fixed for `this.loop.bind(this)`. Bind once in
the engine constructor.

## 7. 🟠 Carried over from pass 1 (still valid)

- **Particles: 3 full-array passes per frame.** `particleManager.draw()` is called
  three times (combat / trail / killfx) and each iterates all ~800 particles to
  filter by tag → up to 2,400 iterations/frame just to skip. Use three arrays.
- **`ctx.shadowBlur = 15` on every coloured `anim_*` particle** — canvas shadow
  blur is a per-draw Gaussian; every explosion pays it. Bake the glow into the
  tinted variant instead.
- **Spatial hash uses template-string keys** — `` `${cx},${cy}` `` per enemy per
  frame plus up to 9 lookups per projectile (and `EnemyAI`'s `quantum_swarm` block
  does 9 more per swarm mob). Thousands of throwaway strings/frame. Use an integer
  key: `(cx + 512) * 4096 + (cy + 512)`.
- **`filter()`-per-frame** in `updateProjectiles`, `updatePickups`, `updateHazards`,
  `damageTexts`, `envParticles` — new array every frame each. In-place swap-remove
  (the pattern `ParticleManager.update` already uses) removes all of it.
- **EnemyRenderer elite aura** builds a `createRadialGradient` per elite per frame
  — cache by radius, as the enemy-bullet halo already does. (Made much worse by §1,
  which turns trash mobs into fake elites.)

## 8. 🟡 Smaller / opportunistic

- `SpritePreloader.preload()` is fired **inside `initGame`**, kicking off a network
  + decode burst for every character sprite exactly as the run starts.
- `SFXManager.playGoldPickup` schedules up to **7 `setTimeout`s per call** (100 ms
  throttle) — a steady drip of timer callbacks interleaved with frames.
- The 100 ms HUD interval and the 500 ms stuck-watchdog keep running after
  game-over / victory while the modal is up.
- `handleResume`'s 1500 ms `setTimeout` is never cleared on unmount.
- `checkAoe` allocates a `Set` + closure per AoE projectile per frame (the pulse
  path still runs it every frame while expanding).

## Verified NOT a problem

Canvas is sized in CSS pixels (no DPR multiply). SFX is throttled. Enemy /
projectile / pickup / particle / env culling is in place. The per-kill save write
is throttled to 30 s. The weapon-stats per-tick memo works. Enemy-bullet halos are
cached. The arena-image fallback is pre-rendered once.

## Suggested order

0. **Regression triage for the live report** (see ⭐ above): §1 pool reset +
   elite-aura gradient cache / un-double the rings + §7 particle layer arrays.
   These three are what Briantjeuh is feeling right now.
1. **§1 pool reset** — it's a correctness bug (runs can end early) *and* a growing
   render cost. Highest priority regardless of FPS.
2. **§2 init cancellation** — one leaked loop halves your frame budget for the
   rest of the session.
3. **§0 decide the background** — you're paying for the fallback and shipping
   none of the shader.
4. **§3 React bridge** — biggest steady-state win in heavy combat.
5. §4 cache the particle textures, §5 DPS ring buffer, §6 bind-once.
6. Batch §7/§8 opportunistically.