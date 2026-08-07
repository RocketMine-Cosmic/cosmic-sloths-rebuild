# Cosmic Sloths — System Requirements

**Last reviewed:** 2026-06-25 (S7 Outer Galaxy build)

Cosmic Sloths is a browser-native HTML5 game. There's no install — it runs entirely in your browser tab. These specs are what we've actually observed across our playerbase (Discord reports + telemetry), not theoretical numbers.

---

## TL;DR

**If your device can play YouTube in 1080p smoothly, you can play Cosmic Sloths.** Outer Galaxy sectors (S11–S20) are heavier than Inner Galaxy because of higher enemy counts and projectile density, so very old phones might dip to 30 fps in late sectors — still fully playable.

---

## Minimum requirements

The game will run, but you may see occasional frame drops in dense fights (40+ enemies on screen, S15+ sectors, late endless).

### Desktop / Laptop
| Component | Minimum |
|---|---|
| **CPU** | Dual-core 2.0 GHz (Intel Core i3-3000 series / AMD A6 / Apple M-series of any generation) |
| **RAM** | 4 GB |
| **GPU** | Anything with WebGL2 support — Intel HD 4000, integrated AMD Vega, any discrete GPU from 2014+ |
| **Display** | 1024 × 600 |
| **Browser** | Chrome 90+, Firefox 88+, Edge 90+, Safari 15+ |
| **Connection** | 500 kbps stable (game state syncs to cloud every ~30s; you can lose connection mid-run and still save) |

### Mobile / Tablet
| Component | Minimum |
|---|---|
| **iOS** | iPhone 8 / iPad (6th gen, 2018) running iOS 15+ |
| **Android** | Android 9+, 3 GB RAM, Adreno 506 / Mali-G71 or equivalent |
| **Browser** | Safari 15+ (iOS), Chrome 100+, Samsung Internet 18+ |

> Note: very old Samsung Internet and Discord in-app browsers occasionally pause the render loop in background — we auto-detect and resume, but you may briefly see "Run paused" if you Alt-Tab on Android.

---

## Recommended requirements

Smooth 60 fps in all content including S20 Cosmic, long endless runs, raid bosses with 8 squadmates, and Squad Meteor 3-min DPS checks.

### Desktop / Laptop
| Component | Recommended |
|---|---|
| **CPU** | Quad-core 2.5 GHz+ (Intel Core i5-7000 / Ryzen 5 / Apple M1+) |
| **RAM** | 8 GB |
| **GPU** | Anything from the last 6 years — Intel Iris Xe, GTX 1050+, RX 560+, integrated Apple Silicon |
| **Display** | 1920 × 1080 or higher |
| **Browser** | Latest Chrome, Edge, or Firefox; Safari 16.4+ on macOS |
| **Connection** | 2 Mbps |

### Mobile / Tablet
| Component | Recommended |
|---|---|
| **iOS** | iPhone 12 / iPad Air (4th gen, 2020) or newer, iOS 17+ |
| **Android** | Android 12+, 6 GB RAM, Snapdragon 778G / Dimensity 1080 / Tensor G1+ |
| **Browser** | Latest Safari (iOS) or Chrome |

### Controller (optional but supported)
Any Bluetooth or USB controller that the browser exposes via the Gamepad API — Xbox, PlayStation, 8BitDo, Backbone, GameSir all work. The game auto-detects on first input.

---

## Desktop deep dive

### Browser-specific notes

| Browser | Status | Notes |
|---|---|---|
| **Chrome / Edge / Brave / Opera** (Chromium) | ✅ Best | Reference target. Hardware acceleration on by default. Full WebGL2, full Gamepad API, smoothest audio. |
| **Firefox** | ✅ Great | WebGL2 perf is ~5–10% behind Chromium on the same machine, mostly invisible. Gamepad API works but rumble is sometimes ignored on Linux. |
| **Safari (macOS)** | ✅ Good | 16.4+ required for full WebGL2 perf. Audio has slightly higher latency (~30 ms vs Chrome's ~10 ms) — noticeable only on rhythm-heavy Synthbeats builds. PlayStation controllers connect cleanly; Xbox controllers need macOS Sonoma+. |
| **Arc** | ✅ Works | Same as Chromium. |
| **Internet Explorer** | ❌ No | Doesn't exist anymore. |
| **In-app browsers** (Discord desktop overlay, Steam overlay) | ⚠️ Avoid | Render loop throttling, missing Gamepad API. Always "Open in browser." |

### Multi-monitor / ultrawide / non-standard aspect

- The game canvas is **fixed 16:9 internally** and letterboxes on ultrawide (21:9, 32:9) or 16:10 laptops. Black bars on the sides, but no functionality is cropped.
- 1440p, 4K, and 5K all render natively — we respect `devicePixelRatio` for HUD crispness, capped at 2x to keep particle-heavy scenes smooth on 4K.
- Multi-monitor: drag the tab to your fastest display (the one with the highest refresh rate). Chrome composites at the refresh rate of whichever monitor the tab is on, even in windowed mode.
- 120 Hz / 144 Hz / 240 Hz: game logic is decoupled from render rate, so high-refresh displays just look smoother — no gameplay advantage or disadvantage.

### Linux

Works on all major distros with no special setup:
- **Chrome / Chromium / Firefox** — full perf, identical to Windows.
- **WebGL2** requires the proprietary or Mesa 22+ drivers. Steam Deck / SteamOS works out of the box.
- **Gamepad rumble** is hit-and-miss on Firefox+Linux — switch to Chrome if your controller doesn't rumble.
- **Wayland vs X11** — both work. Wayland sometimes has v-sync hiccups in Firefox; Chrome is fine.

### Streaming / recording (OBS, Streamlabs, Twitch Studio)

A lot of top-tier players stream their runs. Recommended capture setup:

| Setting | Recommended |
|---|---|
| **Capture method** | Browser Source (best quality, low CPU) **or** Window Capture |
| **Resolution** | 1920 × 1080 — matches our internal render target |
| **Frame rate** | 60 fps |
| **Encoder** | NVENC / AV1 / QuickSync (hardware) — avoid x264 software encode while playing |
| **Bitrate** | 6000 kbps for Twitch 1080p60, 12000 kbps for YouTube |
| **Audio capture** | Capture the tab audio separately if possible — avoids picking up Discord notifications |

OBS itself can use significant GPU. If you see frame drops only while streaming, lower OBS to 30 fps capture or use the NVENC P1 preset.

### Reference machines (actually tested)

What we've benchmarked. Sustained fps in S20 Cosmic with a maxed Synthbeats build (worst case for particles):

| Machine | S20 Cosmic | Endless 30+ min | Notes |
|---|---|---|---|
| **MacBook Air M1** (2020, 8GB) | 60 locked | 60 locked | Fanless, doesn't even warm up |
| **MacBook Pro M3** (2023) | 60 locked | 60 locked | Headroom for streaming + Discord on the side |
| **Desktop, Ryzen 5 5600 + RTX 3060** | 60 locked | 60 locked | Reference dev box |
| **Steam Deck** (LCD, desktop mode, Chrome) | 55–60 | 50–55 | Plays great with controller; battery ~3 hrs |
| **ROG Ally** (Z1 Extreme) | 60 locked | 60 locked | High-refresh display feels excellent |
| **Lenovo ThinkPad T14 (2019, i5-8365U, Intel UHD 620)** | 50–55 | 45–55 | Integrated GPU, mild dips in big AoE |
| **Chromebook (Intel N4500, 2022)** | 40–50 | 40–50 | Playable, occasional dips |
| **Old MacBook Pro 2015 (Intel Iris)** | 35–45 | 30–40 | Min spec territory — works but feels heavy |
| **Raspberry Pi 4** | ❌ Don't | ❌ Don't | WebGL2 perf is too low; ~15 fps at best |

---

## What actually affects performance

In rough order of impact:

1. **Late-sector enemy density** — S15+ spawns 80–120 simultaneous enemies. CPU-bound — single-core speed matters more than core count.
2. **Particle count** — capped at 800 in `ParticleManager`, but bigger AoE builds (Synthbeats + Bass Cannon overforge, mastered Nap Beam) push the cap constantly. GPU-bound.
3. **WebGL2 background** — the parallax starfield runs on GPU. On devices without WebGL2, we fall back to Canvas 2D (slightly less pretty, ~10% lower CPU).
4. **Browser tab count** — Chrome with 30+ tabs eats RAM and throttles background work. Close some tabs before a long endless run.
5. **Battery saver / power mode** — most laptops + phones cap RAF to 30 fps when on battery saver. Plug in or disable for 60 fps.
6. **Background apps** — Discord, OBS, and Zoom in particular use a lot of GPU. Close them during competitive runs.

---

## Known device-specific notes

- **Older iPads (pre-2018):** WebGL2 unsupported → Canvas 2D fallback. Playable, but particles look chunkier. S20 Cosmic may drop to ~45 fps.
- **Samsung Galaxy S20 and older:** Samsung Internet can pause RAF aggressively when scrolling. We've built mitigations (auto-resume) but recommend Chrome on these devices.
- **Steam Deck / handhelds:** Works great in desktop mode (Chrome / Firefox). 800p with controller is the default we tune for. ~55–60 fps in S20.
- **Chromebooks:** Anything from 2020+ runs fine. Pre-2020 ARM Chromebooks may dip in S18+.
- **In-app browsers (Discord, Twitter, Instagram):** Discouraged — they throttle audio + reduce frame rate. Always tap "Open in browser" before playing.

---

## What we DON'T need

- No GPU dedicated VRAM minimum — game uses <100 MB GPU memory
- No HDD/SSD specs — game is fully in-browser, no install
- No specific OS version beyond what your browser supports
- No microphone, camera, or any special permissions

---

## Internet usage (full disclosure)

| Action | Data transferred |
|---|---|
| Initial page load (cached after first visit) | ~3–5 MB |
| Saving a run | ~5–20 KB |
| Squad chat poll | ~1 KB every 5s |
| Leaderboard load | ~10–30 KB |
| OmenX balance / NFT check | ~2 KB |

A 1-hour play session typically uses **5–10 MB of bandwidth** after the initial load. Perfectly fine on mobile data.

---

## Quick "will it run?" test

If unsure, open the live preview at https://cosmic-sloths.example and try a 3-minute Squad Meteor run. If it sustains 50+ fps with no audio stutter, you're set for everything including S20 Cosmic.