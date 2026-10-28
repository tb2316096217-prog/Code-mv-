// scene.js — 中性技术骨架，不是风格演示。
//
// 它的作用：证明渲染管线（纯 f(t)、事件同源、色彩/排版令牌、环境持续运动、调色收尾）能跑。
// 风格长什么样，由 style/STYLE.md + src/style.js 决定；照着规范把这一份重写成你的片子。
//
// 规则：每帧是 t 的纯函数——不保留跨帧状态，不用 Math.random()/Date.now()，随机用 U.hash()。

function drawScene(t, ctx, U) {
  const { W, H, TAU } = U;
  const S = window.STYLE || {};
  const C = window.CONFIG || {};
  const P = S.palette || {};
  const T = S.type || {};
  const M = S.motion || {};
  const EVENTS = window.EVENTS || [];
  const fps = C.fps || 30;
  const dur = C.duration || 12;
  const frame = Math.round(t * fps);

  // §3 底色（纸/背景）——所有颜色来自令牌
  ctx.fillStyle = P.paper || '#f2e8d5';
  ctx.fillRect(0, 0, W, H);

  // §5 + 反 PPT G3：永远有一个环境元素在持续变化（这里：缓慢光斑 + 尘埃）
  const breathe = 0.5 + 0.5 * Math.sin(t * 0.5 * TAU / 8);
  const gx = W * (0.28 + 0.06 * Math.sin(t * 0.13));
  const gy = H * (0.34 + 0.05 * Math.cos(t * 0.17));
  U.glow(gx, gy, W * (0.45 + 0.05 * breathe), U.rgba(P.mid || '#9a8f80', 0.18));

  const dust = M.particles || 64;
  ctx.fillStyle = U.rgba(P.ink || '#3b2a1e', 0.5);
  for (let i = 0; i < dust; i++) {
    const speed = 0.005 + U.hash(i + 3) * 0.012;
    const x = (U.hash(i * 1.7) * W + t * (8 + U.hash(i) * 24)) % W;
    const y = (U.hash(i * 2.3 + 11) * H + t * (4 + U.hash(i + 5) * 14)) % H;
    const a = 0.10 + 0.25 * U.hash(i + 7) * breathe;
    ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(t * speed * 60 + U.hash(i + 31) * TAU));
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + U.hash(i + 41) * 1.8, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 事件驱动：切点标记与标题（与 events.js 同源，保证音画同帧）
  const cuts = EVENTS.filter(e => e.type === 'cut').map(e => e.frame / fps).sort((a, b) => a - b);
  let shot = 0;
  for (const c of cuts) if (t >= c) shot++;
  const sinceCut = cuts.length ? t - (cuts.filter(c => c <= t).pop() ?? 0) : t;

  // 节拍：时钟，不是频闪（只做很轻的呼吸）
  const kick = U.kick(t, C.bpm || 100, 0.25);
  ctx.strokeStyle = U.rgba(P.accent || '#c8432b', 0.25 + 0.25 * kick);
  ctx.lineWidth = 2;
  ctx.strokeRect(W * 0.06, H * 0.07, W * 0.88, H * 0.86);

  // §4 标题排版：字号/字距/字体全部来自令牌（此处仅骨架示意）
  const title = C.title || 'UNTITLED';
  const ty = T.place === 'center' ? H * 0.5 : H * 0.78;
  U.text(title, W / 2, ty, {
    size: T.titlePx || 96,
    family: T.family,
    spacing: T.tracking ?? 4,
    align: 'center',
    color: P.ink || '#3b2a1e',
    weight: 600,
  });

  // 骨架提示（定调通过后删掉这段）
  U.text(`${S.slug || 'no-style'} · shot ${shot} · ${frame}/${Math.round(dur * fps)}`,
    W / 2, H - 48, { size: 24, family: U.MONO, align: 'center', color: U.rgba(P.ink || '#3b2a1e', 0.55) });

  // 收尾：调色只做一次（如果该风格自带纸感/颗粒，按 style-binding 跳过通用调色）
  U.grain(t, 0.05);
  U.vignette(0.6);

  // 淡入淡出（片头片尾）
  const fade = Math.min(1, t / 0.6, (dur - t) / 0.6);
  ctx.fillStyle = U.rgba(P.paper || '#f2e8d5', 1 - Math.max(0, fade));
  ctx.fillRect(0, 0, W, H);
}
