// engine.js — tiny canvas engine for code-drawn music videos.
// A frame is a pure function of time: your scene file defines drawScene(t).
// The renderer requests arbitrary times, so never keep state between frames.

(() => {
  const cfg = window.CONFIG || {};
  const W = cfg.width || 1920;
  const H = cfg.height || 1080;
  const canvas = document.getElementById('c');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });

  // ------------------------------------------------------------ utilities
  const U = {
    W, H, TAU: Math.PI * 2,
    clamp: (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)),
    lerp: (a, b, k) => a + (b - a) * k,
    inv: (a, b, x) => (x - a) / (b - a),
    smoothstep: (a, b, x) => { const k = U.clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); },
    easeOut: (k) => 1 - Math.pow(1 - U.clamp(k), 3),
    easeIn: (k) => Math.pow(U.clamp(k), 3),
    easeInOut: (k) => { k = U.clamp(k); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; },
    // deterministic randomness — never Math.random()
    hash: (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); },
    rand: (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
    noise: (x) => { const i = Math.floor(x), f = x - i; const u = f * f * (3 - 2 * f); return U.lerp(U.hash(i), U.hash(i + 1), u); },
    beat: (t, bpm = cfg.bpm || 100) => (t * bpm) / 60,
    // 1 on the beat, decaying to 0
    pulse: (t, bpm = cfg.bpm || 100, decay = 7) => Math.exp(-((t * bpm / 60) % 1) * decay),
    // smooth kick envelope: 1 for decay seconds after each beat
    kick: (t, bpm = cfg.bpm || 100, decay = 0.28) => { const p = ((t * bpm / 60) % 1) * (60 / bpm); return Math.exp(-p / decay * 3); },

    rgba: (hex, a = 1) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    },
    mix: (c1, c2, k) => {
      const p = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      const a = p(c1), b = p(c2);
      const c = a.map((v, i) => Math.round(U.lerp(v, b[i], k)));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    },
    gradient: (x0, y0, x1, y1, stops) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      stops.forEach(([o, c]) => g.addColorStop(o, c));
      return g;
    },
    glow: (x, y, r, color, alpha = 1) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, U.TAU);
      ctx.fill();
      ctx.restore();
    },

    FONT: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Source Han Sans SC", system-ui, sans-serif',
    MONO: '"Cascadia Mono", "JetBrains Mono", Consolas, monospace',

    measure: (str, o = {}) => {
      ctx.save();
      ctx.font = `${o.italic ? 'italic ' : ''}${o.weight || 700} ${o.size || 80}px ${o.family || U.FONT}`;
      const chars = [...String(str)];
      const w = chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + (o.spacing || 0) * (chars.length - 1);
      ctx.restore();
      return w;
    },

    // letter-spaced text, drawn per character so CJK + Latin both keep the spacing
    text: (str, x, y, o = {}) => {
      const size = o.size || 80;
      ctx.save();
      ctx.font = `${o.italic ? 'italic ' : ''}${o.weight || 700} ${size}px ${o.family || U.FONT}`;
      ctx.textBaseline = o.baseline || 'alphabetic';
      ctx.textAlign = 'left';
      ctx.globalAlpha *= (o.alpha ?? 1);
      if (o.blur) ctx.filter = `blur(${o.blur}px)`;
      if (o.color) ctx.fillStyle = o.color;
      const chars = [...String(str)];
      const widths = chars.map((c) => ctx.measureText(c).width);
      const total = widths.reduce((a, b) => a + b, 0) + (o.spacing || 0) * (chars.length - 1);
      let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
      const starts = chars.map((_, i) => { const s = cx; cx += widths[i] + (o.spacing || 0); return s; });
      if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.glowBlur || size * 0.5; }
      chars.forEach((c, i) => { if (c !== ' ') ctx.fillText(c, starts[i], y); });
      ctx.restore();
      return total;
    },

    // draw text char-by-char with a per-character delay (typographic reveal)
    reveal: (str, x, y, o = {}) => {
      const t = o.t || 0, at = o.at || 0, per = o.per ?? 0.05, dur = o.dur ?? 0.55;
      const chars = [...String(str)];
      const size = o.size || 80;
      const total = U.measure(str, o);
      const w = chars.reduce((a, c) => a + U.measure(c, o), 0) + (o.spacing || 0) * (chars.length - 1);
      let cx = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
      ctx.save();
      ctx.font = `${o.weight || 700} ${size}px ${o.family || U.FONT}`;
      ctx.textBaseline = o.baseline || 'alphabetic';
      chars.forEach((c, i) => {
        const k = U.easeOut((t - at - i * per) / dur);
        if (k <= 0) { cx += ctx.measureText(c).width + (o.spacing || 0); return; }
        ctx.globalAlpha = (o.alpha ?? 1) * k;
        ctx.fillStyle = o.color || '#fff';
        if (o.blur) ctx.filter = `blur(${o.blur * (1 - k)}px)`;
        ctx.shadowColor = o.glow || 'transparent';
        ctx.shadowBlur = o.glow ? (o.glowBlur || size * 0.5) * k : 0;
        ctx.fillText(c, cx, y + (1 - k) * (o.rise ?? size * 0.35));
        cx += ctx.measureText(c).width + (o.spacing || 0);
      });
      ctx.restore();
      return w;
    },

    vignette: (strength = 0.85) => {
      const g = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.5, H * 0.95);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${strength})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    },

    // static film grain (cached), offset per frame by a deterministic jitter
    grain: (t, alpha = 0.06) => {
      if (!U._grain) {
        const tile = document.createElement('canvas');
        tile.width = tile.height = 512;
        const g = tile.getContext('2d');
        const img = g.createImageData(512, 512);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = (U.hash(i * 0.37) * 255) | 0;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        U._grain = tile;
      }
      const pat = ctx.createPattern(U._grain, 'repeat');
      const ox = Math.floor(U.hash(Math.floor(t * 24)) * 512);
      const oy = Math.floor(U.hash(Math.floor(t * 24) + 7) * 512);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = 'overlay';
      ctx.translate(-ox, -oy);
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W + 512, H + 512);
      ctx.restore();
    },
  };
  window.U = U;

  // ------------------------------------------------------------ frame api
  function draw(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    window.drawScene(t, ctx, U);
    ctx.restore();
  }

  window.renderAt = (t, mime = 'image/jpeg', q = 0.92) => {
    draw(t);
    return canvas.toDataURL(mime, q);
  };

  // contact sheet for fast visual review
  window.renderSheet = (times, cols = 3, cellW = 640) => {
    const rows = Math.ceil(times.length / cols);
    const cellH = Math.round((cellW * H) / W);
    const sheet = document.createElement('canvas');
    sheet.width = cols * cellW;
    sheet.height = rows * cellH;
    const g = sheet.getContext('2d');
    g.fillStyle = '#101014';
    g.fillRect(0, 0, sheet.width, sheet.height);
    const ms = [];
    times.forEach((t, i) => {
      const t0 = performance.now();
      draw(t);
      ms.push(performance.now() - t0);
      const x = (i % cols) * cellW;
      const y = Math.floor(i / cols) * cellH;
      g.drawImage(canvas, x, y, cellW, cellH);
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.font = '600 16px Consolas, monospace';
      g.fillText(t.toFixed(2) + 's', x + 10, y + cellH - 10);
    });
    return { url: sheet.toDataURL('image/jpeg', 0.9), ms };
  };

  // ------------------------------------------------------------ live preview
  if (!location.search.includes('render')) {
    const audio = cfg.audio ? new Audio(cfg.audio) : null;
    audio && (audio.loop = true);
    let start = performance.now() / 1000;
    let playing = false;
    const tick = () => {
      const t = playing && audio ? audio.currentTime : (performance.now() / 1000 - start) % (cfg.duration || 10);
      draw(t);
      requestAnimationFrame(tick);
    };
    tick();
    addEventListener('keydown', (e) => {
      if (e.code === 'Space' && audio) {
        playing = !playing;
        playing ? audio.play() : audio.pause();
      }
      if (e.code === 'KeyR') { start = performance.now() / 1000; }
    });
  }
  window.ready = true;
})();
