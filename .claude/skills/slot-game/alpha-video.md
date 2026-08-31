# Stacked-alpha H.264 pipeline

Goal: transparent symbol / logo animations that play **everywhere** —
desktop + Android Chrome + iOS Safari.

Why not VP9/AV1 + alpha WebM: when you `ctx.drawImage(video, …)` an
alpha WebM onto a 2D canvas, Android Chrome composites it opaque (black
box behind the sprite) and Safari doesn't decode it at all.

## The format

One plain H.264 `.mp4` (no alpha channel). Each frame is twice as tall as
the sprite: **top half = RGB colour, bottom half = greyscale alpha matte**
(white = opaque). The game recombines them per frame on an offscreen
canvas — `composited(v)` in `jokers-madhouse/index.html`:

```
draw top half   → getImageData → colour
draw bottom half → getImageData → matte
colour.data[i+3] = matte.data[i]   // matte luma becomes alpha
putImageData → drawImage that canvas
```

Recompute only when `video.currentTime` advanced; all on-screen copies of a
symbol share one buffer; cap the working size (`ACAP = 512`).

## Getting ffmpeg in this environment

No Homebrew, `evermeet.cx` gives an SSL error. This works (Intel binary,
runs under Rosetta on the M4):

```
curl -sL -o /tmp/ffmpeg \
  https://github.com/eugeneware/ffmpeg-static/releases/latest/download/ffmpeg-darwin-x64
chmod +x /tmp/ffmpeg
```

Has `libvpx` + `libx264`. Don't install it permanently — it's a scratch tool.

## Converting

### From existing VP9+alpha WebM masters

The alpha only shows up with the **libvpx** decoder (`-c:v libvpx-vp9`);
the native `vp9` decoder reports `yuv420p` and silently drops alpha.

```bash
FF=/tmp/ffmpeg
conv () {  # conv <input.webm> <output-name> <width>
  "$FF" -y -c:v libvpx-vp9 -i "$1" -filter_complex \
   "[0:v]scale=$3:-2:flags=lanczos,setsar=1,format=yuva420p,split=2[c][a];\
    [c]format=yuv420p[top];\
    [a]alphaextract,format=yuv420p[bot];\
    [top][bot]vstack=inputs=2,setsar=1,format=yuv420p[v]" \
   -map "[v]" -an -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 18 \
   -preset slow -movflags +faststart "<game_dir>/assets/$2.mp4"
}
conv RABBIT-idle.webm  rabbit-idle  600
conv RABBIT-win.webm   rabbit-win   600
# … saw, scatter …
conv "MADHOUSE LOGO TEXT.webm" logo 1000
```

Symbols ~600px wide is plenty (they render ~300px, capped at 512 in-game).
Logo ~1000px.

### From After Effects

Export a master with real alpha first — **ProRes 4444, RGB+Alpha, 30fps**,
Progressive (not interlaced). Then the same command but:
`-i master.mov` and drop `-c:v libvpx-vp9`; add `,unpremultiply=inplace=1`
right after `format=rgba` if AE wrote premultiplied alpha.

Do **not** export H.264/H.265 from AE — no alpha. Avoid the "PNG" codec
`.mov` (hundreds of MB).

## Verifying without a browser

Reconstruct one frame and composite it over the game's background colour:

```bash
FF=/tmp/ffmpeg
"$FF" -ss 1 -i clip.mp4 -frames:v 1 -vf "crop=iw:ih/2:0:0"      /tmp/c.png
"$FF" -ss 1 -i clip.mp4 -frames:v 1 -vf "crop=iw:ih/2:0:ih/2"   /tmp/a.png
"$FF" -i /tmp/c.png -i /tmp/a.png -filter_complex \
  "[0][1]alphamerge[m];color=c=0x2b1836:s=610x580[bg];[bg][m]overlay=(W-w)/2:(H-h)/2" \
  -frames:v 1 /tmp/check.png
```

Look for a dark rim around the sprite (H.264 chroma subsampling eating the
edge). If present, add `,dilation=3,dilation=3` on the `[top]` colour branch
to bleed colour outward before stacking.
