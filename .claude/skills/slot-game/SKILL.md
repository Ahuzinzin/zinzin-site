---
name: slot-game
description: >-
  Build or reskin a playable browser slot demo for the ZinZin site and wire it
  into the portfolio. Use when the user wants a new slot game, a reskin of an
  existing one, changes to slot math/RTP/features, or help with the symbol
  animation (alpha video) pipeline. Covers the single-file Canvas 2D
  architecture, the reel math, the opening showcase, mobile layout, the
  stacked-alpha H.264 video pipeline, site wiring, and deploy.
---

# Building a slot demo

A slot demo is **one self-contained `<game_dir>/index.html`** — Canvas 2D,
no framework, no build. It ships two things: the playable file and a
`games/<slug>/index.html` landing page, both wired into `index.html`.

Reference implementation: `saga_of_valhalla/index.html` (architecture) and
`jokers-madhouse/index.html` (latest, with the alpha-video pipeline).

## 0. Before writing code

Ask the user for, or pin down:

- **Theme / slug / display name** (e.g. `jokers-madhouse`, "Joker's Madhouse")
- **Grid + lines** (default 5×3, 20 lines)
- **Mechanics**: wild behaviour (expanding? sticky?), scatter → free spins
  count (user has said "3 max" before — confirm), retrigger cap
- **Symbol list**: 2 specials (wild id 0, scatter id 1) + ~10 paying symbols,
  ordered high→low. Which get video animation (usually 2–3 premium symbols
  + the logo); the rest use the canvas glow/pump.
- **Target RTP** (base ~0.94 before the showcase; landing page usually
  quotes ~96%) and **volatility**
- **Art**: background, reel frame PNG (blank sign area for the animated
  logo), symbol PNGs, win-tier PNGs (big/mega/super), music + win jingle

If it's a **reskin**: copy the closest existing game dir, swap `assets/`,
adjust `SYMS` pay table / `glow` colours / `STRIPS`, keep the engine.

## 1. The engine (what every slot file has)

Layout — never scale the HUD:

```
#wrap (flex column, 100vh)
  #gw   (flex:1)  → <canvas> absolute inset:0, hidden <video>s inserted behind it
  #ui   (fixed height, e.g. 84px) → real-size HUD: menu, balance/bet, WIN,
                                    turbo/auto, spin button, bet steppers
```

Core state and functions (names are stable across games — match them):

- `SYMS[]` — `{id, k, pay:[0,0,0,x3,x4,x5], glow:'#rrggbb', wild?, scat?}`
- `STRIPS[]` — one reel strip per column, ids only. Tune the mix so wins
  land on every symbol, not just low cards. Jokers Madhouse landed on
  ~56% low / ~19% premium after a "same symbol keeps winning" complaint.
- `LINES[]` — payline row-index patterns
- `handleSpin()` → per-reel `reelPhase` spin→brake→done, then `onDone()`
- `onDone()` — expanding wild resolution, then `checkWins()`, then schedule
  next spin (free spins / autospin)
- `checkWins()` — line eval + scatter count; sets `totalWin`, triggers free
  spins, fires win-tier popups and the symbol win-animations
- `evalLine()` — left-aligned, wild substitutes, scatter never pays on lines
- `draw(ts)` — clear → bg → spotlights → motes → frame → symbols → win FX →
  particles → big-win → FS badge, `requestAnimationFrame` loop

### RTP / win tiers

- Base RTP target ~0.94. After changing `STRIPS` or `SYMS.pay`, **simulate**:
  run ~1e6 spins headless, print return and hit-rate per symbol. Adjust the
  strips, not just the pay table.
- Win-tier thresholds (multiple of bet): BIG ≥10, MEGA ≥20, SUPER ≥40.
  If you move these, update **all** of: the `mult>=10/20/40` checks in
  `checkWins`, the `burst()` particle counts, the `onDone` delay, and the
  `OPENING` `m:` values.

### Opening showcase

`OPENING` object keyed by `sessSpin` forces specific grids + pinned wins on
the first handful of spins (e.g. 4→BIG, 9→MEGA, 13→Free Spins, 18→SUPER)
so a demo player always sees the tiers early, then it drops to pure RNG.
Grids come from `OPEN_GRID`, the amount from `scriptSpin.m`.

## 2. Symbol / logo animations — stacked-alpha H.264

Animated symbols and the logo are `.mp4` clips where each frame is
**RGB on top, greyscale alpha matte on the bottom**, recombined per frame on
an offscreen canvas (`composited(v)` in `jokers-madhouse/index.html`).

Do **not** use VP9+alpha WebM drawn to a canvas: Android Chrome drops the
alpha (black box), Safari doesn't decode it at all.

Producing the clips (from AE ProRes 4444 masters, or existing alpha WebM):
see **`alpha-video.md`** in this skill folder — it has the exact `ffmpeg`
command and how to get a working `ffmpeg` in this environment.

Wiring: copy the `ANIM_KEYS` / `initSymAnims` / `composited` / `symFrame`
block from `jokers-madhouse/index.html`. Files land in `<game_dir>/assets/`
as `<key>-idle.mp4`, `<key>-win.mp4`, `logo.mp4`. When a clip isn't loaded
the code falls back to the symbol PNG, so the game is never broken by a
missing file.

iOS decodes only ~4 videos at once (3 idle + logo = 4, +1 on a win). If a
symbol goes missing on iPhone, pause off-screen idle videos.

## 3. Mobile

- HUD/controls are real fixed-size elements **outside** any `transform:scale`
  container.
- No forced-landscape lock.
- On phones, hide secondary art (character, oversized logo) that steals room
  and widen the reel/board. `MOBILE` flag computed once on load
  (`innerWidth <= 600`), not on resize — these games never reflow.

## 4. Wire it into the site

1. `<game_dir>/index.html` — the playable file.
2. `games/<slug>/index.html` — copy the newest landing page, update every
   title/description/keyword/canonical/OG/JSON-LD field, specs, features,
   tags, badge.
3. `assets/<slug>.jpg` — card + hero art.
4. `index.html`:
   - add a `.gc` card in `#gamesGrid` (newest first) → `onclick="openModal(<id>)"`
   - add an entry to the `games` array: `id, name, slug, category, image,
     demoUrl:"<game_dir>/", badge, short, desc, tags, specs, features`
     (`heroPos:"50% 38%"` to nudge the modal hero crop)
5. `vercel.json` — add `{ "source": "/<game_dir>", "destination": "/<game_dir>/", "permanent": true }`
6. `sitemap.xml` — add `/games/<slug>/` (with `<image:image>`) and `/<game_dir>/`.

## 5. Verify, then deploy

1. `python3 -m http.server 8899` in the repo root.
2. Static check: open the demo, spin, watch console for errors.
3. For anything touching the video pipeline: reconstruct a frame with ffmpeg
   and eyeball it on the game's background colour (automation Chrome freezes
   on hidden-video decode — don't trust a blank result).
4. Hand the user the `localhost` + LAN URL and ask them to test on **real
   Chrome + Android + iPhone Safari**.
5. Only after they approve: commit (separate, well-scoped commits) and
   `vercel --prod --yes --scope zinzinstudios`.
6. Update the project memory with anything that surprised you — a mechanic
   the user changed their mind on, a device quirk, a tuning value.
