# Engine reference

The engine is ~250 lines of vanilla canvas 2D. There are only three contracts:

1. `window.CONFIG` (from `src/config.js`) is read once by `render.mjs` for `fps`, `duration`, and `audio`.
2. `window.drawScene(t, ctx, U)` draws the whole frame for time `t` and returns nothing.
3. `window.renderAt(t, mime, q)` on the page returns a data URL — the renderer only ever calls this.

`window.ready = true` is set after `engine.js` loads; the renderer waits for it. Any uncaught error during load leaves it `false` and the render times out — open `studio.html` in Chrome and read the console.

---

## `U` helpers

All helpers draw on the main canvas context (the same one passed to `drawScene`).

### math

| Call | Returns |
|---|---|
| `U.clamp(x, a=0, b=1)` | clamped |
| `U.lerp(a, b, k)` | interpolated |
| `U.inv(a, b, x)` | normalized position |
| `U.smoothstep(a, b, x)` | 0→1 with zero slope at both ends (use for fades) |
| `U.easeOut(k)` / `U.easeIn(k)` / `U.easeInOut(k)` | eased 0→1 |
| `U.hash(n)` | deterministic 0..1 from a number — **the** randomness |
| `U.rand(seed)` | factory returning a deterministic 0..1 generator |
| `U.noise(x)` | smooth 1-D value noise, 0..1 |
| `U.beat(t, bpm)` | fractional beat count |
| `U.kick(t, bpm, decay=0.28)` | 1 on each beat, exponential decay — use for pulses |
| `U.pulse(t, bpm, decay=7)` | same idea, phase-based |

### colour

| Call | Notes |
|---|---|
| `U.rgba('#6ee7ff', .4)` | hex → `rgba()` string |
| `U.mix('#04050e', '#2a1030', .5)` | hex blend → `rgb()` string |
| `U.gradient(x0,y0,x1,y1,[[0,'#000'],[1,'#fff']])` | `CanvasGradient` |
| `U.glow(x, y, r, color, alpha=1)` | additive radial bloom; `color` should already carry alpha |
| `U.vignette(strength=.85)` | full-frame radial darkening |
| `U.grain(t, alpha=.06)` | cached noise tile, offset deterministically per frame |

### type

```js
U.text('把整片夜', x, y, {
  size: 96, weight: 800, family: U.FONT, spacing: 8,
  align: 'center',            // left | center | right
  color: '#fff', alpha: 1,
  glow: 'rgba(110,231,255,.35)', glowBlur: 26,
  blur: 0,                    // px, applied with ctx.filter
  baseline: 'alphabetic',
});

U.reveal(line, x, y, { ...same, t, at: 0, per: 0.036, dur: 0.5, rise: 24 });
```

- `U.text` draws per character so `spacing` works for CJK and Latin alike; returns the drawn width.
- `U.reveal(str, x, y, opts)` draws characters in sequence: character `i` starts at `at + i*per`, fades from `blur` to sharp while rising `rise` px. `t` is the **local** time (e.g. `t - line.at`).
- `U.measure(str, opts)` returns the laid-out width for manual composition.
- `U.FONT` is a CJK-safe stack (`Microsoft YaHei`, `PingFang SC`, `Noto Sans SC`, then system). `U.MONO` for labels.
- Use a full-width space `　` between phrases when you want a real pause.

---

## Composition recipes

**Sky that changes with the song.** Keep 3-colour palettes per section, then interpolate:

```js
const PAL = [['#04050e','#140f30','#6ee7ff'], /* … */];
const p = U.clamp(t / 4.8, 0, 4);         // one palette per 4.8 s
const i = Math.min(4, Math.floor(p));
const k = U.smoothstep(0, 1, p - i);
const acc = U.mix(PAL[i][2], PAL[i + 1][2], k);
```

**Breathing camera.** Scale everything around a pivot by `1 + 0.006 * U.kick(...)`; wrap it in `save/restore` and draw type outside it so the text stays rock-steady while the world pulses.

**Legibility over a bright background.** Put a soft dark band behind the type before drawing it:

```js
ctx.fillStyle = U.gradient(0, 120, 0, 470, [[0,'rgba(0,0,0,0)'],[0.46,'rgba(0,0,0,.34)'],[1,'rgba(0,0,0,0)']]);
ctx.fillRect(0, 120, W, 350);
```

**Chromatic fringe on type.** Draw the glyphs twice with `globalCompositeOperation='lighter'`, offset ±2 px in cyan/magenta at ~0.3 alpha, then the white pass with `source-over`.

**Grain + vignette + fade.** Last three calls of the scene, always in that order.

---

## Performance

Measured on a laptop with the bundled demo (1920×1080): **20–40 ms/frame**; the 720-frame 24 s film renders in ~23 s, including JPEG encoding and piping to ffmpeg. Cost is dominated by large `shadowBlur`/`filter` blurs and the number of fills — not by JS.

Practical limits: keep total particles in the low hundreds, avoid `ctx.filter` on full-frame draws, don't call `createPattern` per frame (the grain helper caches it), and don't build gradients inside tight loops if you can hoist them.

## Gotchas

- **No state, ever.** Frames are rendered out of order and on N pages. A module-level accumulator produces different frames per worker.
- **Never name a top-level function `text`, `line`, `scale`, `filter`, `color`, `stroke`, `image`.** Some of these already exist on `window`; redeclaring them breaks the page.
- **`U.reveal` sets `globalAlpha` per character** (absolute), while `U.text` multiplies it. Reset `globalAlpha = 1` after a section if you rely on the outer value.
- **`U.glow` uses `lighter`**; stacking glows on the same spot saturates to white — useful for a hot core, ugly as a background.
- **Fonts are whatever the machine has.** If you need a specific face, drop a `.woff2` in `assets/` and `@font-face` it in `studio.html`, then wait for `document.fonts.ready` before setting `window.ready`.
- **`toDataURL` is the hidden cost** in stills mode; JPEG q≈0.92 is the sweet spot for frames, PNG only for inspection.
