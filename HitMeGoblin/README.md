# Hit Me, Goblin! — asset & maintenance guide

Single-file PixiJS game. Everything lives in two places:

| | |
|---|---|
| Game code | `../hit-me-goblin.html` (one file, PixiJS 7.3.2 from CDN, no build step) |
| Assets | this `HitMeGoblin/` folder |
| Play locally | `cd .. && npx serve .` → http://localhost:8934/hit-me-goblin |

**Distribution:** link-only. The page carries `<meta name="robots" content="noindex,nofollow">` and is not linked from `index.html` or `/games`. Only people given the direct URL can reach it. Do **not** add it to the games grid or sitemap.

---

## Swapping the visuals (the usual future job)

Every image is a plain PNG/JPG loaded by path. To reskin the game, replace the file **keeping the same name and folder**, ideally at the same aspect ratio. The code scales everything to the canvas, so exact pixel size is not critical — aspect ratio is.

### Background

| File | Size now | Used as |
|---|---|---|
| `bg.jpg` | 1672×940 | Full-screen CSS background on `#wrap` (`cover`, centred). Any 16:9-ish image works. |

### The crate / machine

| File | Size now | Notes |
|---|---|---|
| `Machine/Machine_empty.png` | 656×780 | The wooden crate. **Portrait.** The 4 holes are positioned as fractions of this image — the cream wood panel is assumed to run ~y 0.22–0.54 and widen toward the bottom. If a new crate has a differently-placed panel, tune `rowY` / `colXTop` / `colXBot` in `buildScene()`. |
| `Machine/Hole.png` | 217×158 | The purple hole ring a goblin pops out of. One per slot. |
| `Machine/cover_1..4.png` | ~160×110 | 4-frame iris/shutter animation that closes over a hole between rounds. Played in order to close, reverse to open. |
| `Machine/cover_half.png` | 217×94 | Currently **unused**. |

### Goblins (characters)

8 goblins, each with a normal + an "injured" version. All **660×620**.

| id in code | normal | injured (shown after a successful hit) |
|---|---|---|
| pirate | `Characters/Pirate.png` | `Characters/injured/pirate.png` |
| mafia | `Characters/Mafia.png` | `Characters/injured/Mafia.png` |
| punk | `Characters/Punk.png` | `Characters/injured/Punk.png` |
| madam | `Characters/madam.png` | `Characters/injured/madam.png` |
| hippie | `Characters/hippie.png` | `Characters/injured/hippie.png` |
| girl | `Characters/girl.png` | `Characters/injured/girl.png` |
| girl2 | `Characters/girl_2.png` | `Characters/injured/girl_2.png` |
| drunk | `Characters/drunk.png` | `Characters/injured/drunk.png` |

- Filename casing matters (`Pirate.png` vs `pirate.png`) — match the `CHARACTERS` array in the code exactly.
- To add/remove goblins, edit the `CHARACTERS` array. The game picks `targets` distinct random ones per round.
- Art should sit centred with headroom at the top — anchor is `(0.5, 0.62)`, so the lower ~38% is what tucks into the hole.

### Hammer

| File | Size now | Used as |
|---|---|---|
| `Hands/hand_1.png` | 297×500 | swing frame 1 (raised) |
| `Hands/hand_2.png` | 261×500 | swing frame 2 (mid) |
| `Hands/hand_3.png` | 246×500 | swing frame 3 (impact — `hammer.mp3` fires here) |
| `Hands/hand_okey.png` | 308×400 | **unused** (thumbs-up, removed per earlier request) |

### FX

| File | Size now | Used as |
|---|---|---|
| `crap.png` | 420×420 | Big splat thrown at the camera on a miss (also a small one per hole). |
| `Stars/star.png`, `star-1.png`, `star-2.png` | 122×122 | Particle burst on a successful hit. |
| `Stars/line-1..5.png`, `line.png` | — | Speed-line particles in the same burst (code uses `line-1..3`). |
| `logo.png` | 613×350 | Title on the intro overlay. |

---

## Sounds — `Sounds/*.mp3`

Replace keeping the same name. Preloaded on page load.

| File(s) | When it plays |
|---|---|
| `appear.mp3` | goblins rise (round start + after every successful hit) |
| `hammer.mp3` | every hammer swing, on the impact frame |
| `defeated_1.mp3`, `defeated_2.mp3` | successful hit (random pick) |
| `angry_grunt_1..3.mp3` | miss (random pick) |
| `shit-throw.mp3`, `throw_splat.mp3` | miss — goblin throws, then the splat lands |
| `win_chime.mp3` | collect |
| `voice_*.mp3` (×8) | goblin heckling — a random one ~0.8 s after goblins appear, then every 5–7 s while they're up waiting to be picked. Silent when the board is empty and during the swing. |
| `taunt_1..3.mp3` | preloaded but **currently unused** (kept for future mixing) |

Background music is **procedural** (Web Audio, generated in code — no file). The mute button toggles everything.

---

## Game logic (don't change unless matching the reference)

Modelled 1:1 on Ludo "Whack a Goblin" v1.1.0. RTP **97%**.

| Difficulty | goblins shown | that lose | survive chance p | 1st multiplier |
|---|---|---|---|---|
| Easy | 4 | 1 | 3/4 | ×1.29 |
| Medium | 3 | 1 | 2/3 | ×1.45 |
| Hard | 2 | 1 | 1/2 | ×1.94 |
| Expert | 3 | 2 | 1/3 | ×2.91 |
| Master | 4 | 3 | 1/4 | ×3.88 |

Multiplier: first hit pays `RTP / p`, every hit after multiplies by `1 / p`. After *n* hits the multiplier is `RTP / pⁿ`. Winnings are floored to 2 decimals. It's a demo — balance is fake (`FUN`), resets on reload, no server.
