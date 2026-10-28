// style.js — 本片风格的唯一参数源（`new-mv.mjs --style <slug>` 生成骨架）。
//
// 填写依据：style/STYLE.md（完整规范；节号 §1–§11 与 references/style-binding.md 对应）。
// 规则：定调（look）通过后冻结；scene.js 里禁止散落颜色/字体/字号，全部从这里取。
// 提示：现在这些值是占位符（中性纸感），必须按所选风格 STYLE.md 改成它的真实数值。

window.STYLE = {
  slug: '',                 // 例如 impasto
  name: '',                 // 例如 油画厚涂 Impasto Oil Painting

  // §1 本质 / 禁区
  essence: {
    is: '',                 // 一句话：这风格是什么
    never: [],              // 它不是什么（逐条抄 §1 的 "not ..."）
  },

  // §2 材料与渲染
  materials: [],            // 笔触/网点/纸/墨/3D 材质…
  render: { engine: 'canvas2d', supersample: 2, perFrameBudgetMs: 12 },

  // §3 颜色逻辑 —— 唯一取色源
  palette: {
    paper: '#f2e8d5',
    ink: '#3b2a1e',
    mid: '#9a8f80',
    accent: '#c8432b',
  },

  // §4 字体与字幕 —— 排版唯一来源（数值必须写成数字）
  type: {
    family: '"SimSun", "Songti SC", "Noto Serif SC", serif',
    titlePx: 96, subtitlePx: 52, minPx: 44,
    tracking: 4, lineCharsMax: 14,
    align: 'center', place: 'lower-third',
    holdSec: 2.0,           // 至少；且 ≥ 语音时长 + 0.6s（DIRECTOR §7）
  },

  // §5 运动质感
  motion: {
    fps: 24,
    easing: 'easeOutCubic',
    idleBreath: 0.4,        // 静置时的持续运动幅度（防 PPT G3）
    particles: 64,
  },

  // §6 镜头语法（每镜在 shot list 里再写理由，对应反 PPT G4）
  camera: [
    // { id: 'push', why: '……' },
    // { id: 'parallax', why: '……' },
  ],

  // §7 声音调色板 → cues.json 选型
  sound: {
    instruments: [],        // 例如 ['felt piano', 'glass']
    ambience: '',           // 例如 'rain'
    duckDb: 12,
  },

  // §8 母题动作（TREATMENT 里标"从 §8 反推"的那一镜）
  nativeMove: '',

  // §9 典型坑（定调/逐段/交付各查一次）
  pitfalls: [],

  // §10 引擎
  engine: {
    tier: '2d',             // '2d' | '3d' | 'material'
    needs: [],              // 例如 ['three.module.js', '卫星影像']
  },
};
