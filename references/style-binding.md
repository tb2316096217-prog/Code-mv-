# 风格绑定：STYLE.md 的 11 节怎么落到代码、镜头与声音

> 本文件是"设计 → 实现"的桥。风格唯一依据是 `references/styles/<slug>.md`（= 库里的 `STYLE.md` 全文）；本文件只规定**怎么用**，不替代它。
> 铁律（来自 lemo `AGENTS.md`）：**STYLE.md 是固定的**——外观、颜色、字号、运动、镜头语法、声音调色板、母题动作、坑，全部保留；故事/结构/角色/镜头具体内容由你按用户主题导演。

## 0. 读的顺序（不要从头读到尾平均用力）

```
§1 本质与禁区 → §10 引擎 → §3 颜色 → §4 排版 → §5 运动 → §6 镜头
→ §7 声音 → §8 母题动作 → §9 坑 → §11 变化空间
```

- **§1/§10 先读**：判断这风格能不能做、用什么栈做，避免做到一半才发现要 3D/素材。
- **§8 在写 TREATMENT 时读**：母题动作要"反推"进故事（见反 PPT G7）。
- **§9 在定调/交付时当检查表**。

## 1. 映射总表

| STYLE.md | 落到哪里 | 具体做法 |
|---|---|---|
| §1 Essence / not | `STYLE-SPEC` 自检 + 定调关 | 抄下"它是什么"与"它不是什么"各 3 条；定调样张逐条对照；"不是什么"里出现的效果直接砍 |
| §2 Materials & rendering | `style.materials[]` + 实现笔记 | 决定绘制方式（笔触/网点/纸/墨/3D 材质）；写清每帧成本与降级方案 |
| §3 Colour logic | `src/style.js` → `palette` | **全片唯一取色源**，scene 里禁止散落 hex；颜色事件（如灰→彩）写成显式函数 |
| §4 Type & subtitles | `style.js` → `type` | **排版唯一来源**：字形、字号区间、字距、大小写、位置、以及每条字幕的停留；覆盖通用字号规则 |
| §5 Motion quality | `style.js` → `motion` | fps、缓动、静置呼吸、粒子/环境运动；直接对应反 PPT G3（环境持续变化） |
| §6 Camera grammar | `style.js` → `camera[]` + shot list | 每镜记录运镜与理由（G4）；2D 也按 §6 的推拉/视差/画中画实现 |
| §7 Sound palette | `style.js` → `sound` → `cues.json` | 乐器/氛围/材质声的选型写进声音设计表；选 backend 时遵守该调色板 |
| §8 Native moves | `style.js` → `nativeMove` + TREATMENT | 选一个母题动作放在情绪峰值；TREATMENT 里标注"这一镜是从 §8 反推的"（G7） |
| §9 Pitfalls | 审核清单 | 变成逐镜检查项（定调/逐段/交付各查一次） |
| §10 Engine | 实现档位 | 判断 2D 优先 / 3D（three.js/WebGL）/ 需真实素材；决定脚手架 `--engine` 与工作量 |
| §11 Variation space | 定调候选设计 | 2–4 个候选必须落在 §11 允许的变化空间内，不能跑出风格 |

## 2. 令牌：`src/style.js`

脚手架会生成骨架，**在定调阶段填满**（定调批准后不再改，除用户要求）：

```js
// src/style.js —— 本片风格的唯一参数源。所有取色/字号/运镜/声音选择从这里取。
export const STYLE = {
  slug: 'impasto',
  name: '油画厚涂 Impasto Oil Painting',
  // §1
  essence: '……', never: ['……', '……'],
  // §2
  materials: ['palette-knife strokes', '...'],
  render: { engine: 'canvas2d', supersample: 2, perFrameBudgetMs: 12 },
  // §3 —— 只允许在这里出现颜色
  palette: { paper: '#f2e8d5', ink: '#3b2a1e', accent: '#c8432b', ... },
  // §4 —— 排版唯一来源（数值必须写成数字）
  type: {
    family: '"Cormorant", "SimSun", serif',
    titlePx: 96, subtitlePx: 52, minPx: 44,
    tracking: 4, lineCharsMax: 14, align: 'center',
    place: 'lower-third',  // 依 §4 描述
    holdSec: 2.0,          // 至少；且 ≥ 语音+0.6s（DIRECTOR §7）
  },
  // §5
  motion: { fps: 24, easing: 'easeOutCubic', idleBreath: 0.4, particleField: 64 },
  // §6
  camera: [ { id: 'push', why: '...' }, { id: 'parallax', why: '...' } ],
  // §7
  sound: { instruments: ['felt piano', 'glass'], ambience: 'rain', duckDb: 12 },
  // §8
  nativeMove: '……',
  // §9
  pitfalls: ['……'],
  // §10
  engine: { tier: '2d', needs: [] },
};
```

规则：

1. **数值化**：§4/§5/§6 里的"轻微、缓慢、大约"一律换成 px / 秒 / 帧 / 度。
2. **单源**：scene 中不许再写颜色、字体名、字号；全部 `STYLE.palette/type`。
3. **可追踪**：每个令牌字段上方注释 `§3` 这样的节号，审核时能倒查。
4. **定调后锁定**：定调样张通过后，令牌冻结；改动算用户新需求。

## 3. 排版（§4）——本技能里最容易跑偏的部分

- 逐风格执行：有的风格标题要压在画面里、有的要 DOM 清晰小字、有的要把字切成笔画。
- 通用可读性只作为**审核底线**（不是设计来源）：最小字号、每行字数、字距、对比度，按 §4 的数值执行；§4 没写的，用"1× 手机宽能读"作验收。
- 字幕停留按 DIRECTOR §7：≥1.8 s 且 ≥ 语音+0.6 s；中文 hold ≈ 字数 ÷ 4.5 + 1.5 s；标题 ≥4 s。
- 字幕不挡主体（DIRECTOR §10）。

## 4. Demo 的用法（只学技法）

- **TREATMENT 写完之前不读 `DEMO.md`、不读 demo 代码**。
- 读的时候只提取：笔触引擎、骨架/rig、shader、混音结构这类**技法**；故事、开场、镜头、道具、时间线一律不搬。
- 交付前对照 demo：结构/开场/签名镜头/相机路径/配乐形状/结尾六项里至少四项不同（DIRECTOR §11）。
- 参考代码在 `vendor/lemo-demos/styles/<slug>/`（本地，只读参考）。

## 5. 与审核层（反 PPT）的边界

| 问 | 谁回答 |
|---|---|
| 这一镜"长什么样"？颜色/字号/运镜/声音选型 | STYLE.md + `style.js` |
| 这一镜"有没有发生"？变化三姿态/环境运动/删镜测试/情绪→参数 | anti-ppt.md + `DECISION-LIST.md` |
| 能不能开工？ | 反 PPT 门禁 + 定调样张都过 |

两者冲突时：**STYLE.md 决定设计，门禁只决定"过/不过"**，不能用门禁去改风格（例如不能为了"有变化"就加一个风格里没有的动效；应该换一镜）。

## 6. 引擎档位（§10）

| 档 | 表现 | 本技能做法 |
|---|---|---|
| 2D 优先 | 多数手绘/印刷/图形/信息类 | canvas 2D + `engine.js`；`render.mjs` 逐帧 |
| 3D | 低多边形/HD-2D/玻璃/纸片立体书等 | three.js 页面（`--page` + `window.renderAt(t)`），先做 smoke 再扩展 |
| 素材/数据 | 剪辑与纪实、实证影像（卫星/点云/档案/显微…） | 先集素材（用户提供优先）+ 数据处理脚本；再实现 |

若某风格首次使用：先按 §10 与 demo 参考实现一个最小可渲版本，再进定调；不要边做边猜风格。
