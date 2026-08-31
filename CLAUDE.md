# ZinZin Studios site — `00_zinzin_site`

Portfolio + playable browser demos for a slot / crash game art studio.
Static site, no build step. GitHub `Ahuzinzin/zinzin-site` (branch `main`),
hosted on Vercel (project `00_zinzin_site`, org `zinzinstudios`),
`zinzinstudios.com`.

## Hard rules

- **All user-facing copy is English.** Titles, buttons, toasts, error and
  status text — everything shipped to the page. Our chat is Turkish; the
  site is not.
- **Deploy needs explicit approval every time.** Never run a deploy
  because work "looks done". Wait for the user to say ship it.
- **Deploy is not triggered by `git push`.** To put changes live:
  ```
  vercel --prod --yes --scope zinzinstudios
  ```
  Plain `vercel --prod --yes` fails with `Not authorized` — the
  `--scope zinzinstudios` flag is required.
- Work in small steps. Show a diff / local preview before big changes.

## Layout

```
index.html                     Home. Games live in the `games` JS array (each
                               has id, slug, demoUrl, specs, features…) and a
                               matching `.gc` card in #gamesGrid.
<game-slug>.html               Legacy top-level landing pages (older games).
games/<slug>/index.html        Current landing-page pattern — SEO tags +
                               JSON-LD + `/games/game-page.css`. Copy the
                               newest one when adding a game.
games/game-page.css            Shared landing-page styles.
<game_dir>/index.html          The playable demo itself, self-contained,
                               served at `/<game_dir>/`.
assets/<slug>.jpg              Card / hero art (also referenced by sitemap).
vercel.json                    `redirects`: every playable dir needs a
                               `/<dir>` → `/<dir>/` entry.
sitemap.xml                    Add `/games/<slug>/` and `/<dir>/` entries.
```

Raw art / animation / video masters are **git-ignored** (`Joker's Madhouse/`,
`*.MOV`, `Bakerybonanza/Animation/*.mov`). The repo keeps only web exports.
`.vercelignore` also keeps big source dirs out of the deploy bundle.

## Playable slot demos

The good ones share one architecture (`saga_of_valhalla/index.html` is the
reference): a single HTML file, Canvas 2D, `#gw` (canvas + hidden `<video>`s
behind it) above a real fixed-size `#ui` HUD — **HUD is never inside a
scaled container**, or it shrinks to nothing on mobile. No forced-landscape
locks.

Full build steps: **`/slot-game` skill**. Symbol/logo video animations use
the "stacked alpha" H.264 pipeline — see `.claude/skills/slot-game/alpha-video.md`.

## Verifying game changes

Automation Chrome in this environment does **not** reliably decode hidden
`<video>` — it freezes at `readyState:0`. For anything touching the video
pipeline, verify by static frame reconstruction (ffmpeg) and then ask the
user to test on real Chrome + Android + iPhone Safari before deploy.
`python3 -m http.server 8899` in the repo root serves demos for local + LAN
(phone) testing.
