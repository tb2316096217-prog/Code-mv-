---
name: code-mv
description: 帧律 · code-mv — 用代码做一支短片/MV/歌词视频：设计、排版、镜头、色彩、声音设计全部按 Lemo-Opuscar 风格库（59 种，每种一份 STYLE.md 硬规范）；每一帧是时间的纯函数，用 headless Chrome 逐帧渲染、ffmpeg 编码；必须过反 PPT 门禁；声音用本机 ComfyUI（Qwen3-TTS 配音、ACE-Step 配乐、SA3/MMAudio 拟音）并做帧级对位。Use when the user asks for an MV、歌词视频、短片、科普片、宣传片、动态标题、片头，或者要用某个 Lemo 风格（油画厚涂、水彩、蓝图、浮世绘、像素 RPG…）做一支代码生成的片子。
whenToUse: 用户要的片子是"用代码画出来"的（而不是剪素材或视频模型生成），或指名要 Lemo-Opuscar 的某个风格；或要复现"Claude P(doom) / Claude Pop"那种代码 MV 工作流。
---

# code-mv · 帧律 × Lemo-Opuscar

一支成片里每个像素都由代码画出：没有素材库、没有视频模型、不用剪辑软件。
两条设计原则（缺一不可）：

1. **设计/排版完全按 Lemo-Opuscar**：选一个 `styles/<slug>/STYLE.md`，它的 §1–§11 是硬规范（外观、颜色、字体、运动、镜头语法、声音调色板、母题动作、坑）。
2. **画面是时间的纯函数**：`drawScene(t, ctx, U)`，任意顺序、并行、重渲不漂移。

审核层：**反 PPT 门禁**（G1–G9）必须先过。声音层：**studio（ComfyUI）生成 + lemo 的纪律**（声音设计表、cue map、0 ms 对位、−14 LUFS），并且**音效与画面同帧**。

## 能力边界（开工先说给用户）

- 擅长：确定性逐帧、程序化视觉、快速出图验证、节拍量化、声音与画面帧级对齐。
- 不擅长：听歌（我读不了音频情绪）、看动态（只能看渲染帧）、无参考的审美判断、写实人物。

## 包里有什么

| 路径 | 作用 |
|---|---|
| `references/style-index.md` | **59 种风格总索引**（中文名/英文名/类别/folder/示例片/渲染栈提示） |
| `references/styles/<slug>.md` | **59 张风格卡**：元信息 + 该风格 `STYLE.md` 全文（设计/排版/镜头/声音的唯一依据） |
| `references/style-binding.md` | STYLE.md 11 节 → `style.js` 令牌 / 镜头 / 声音 的落地规则 |
| `references/lemo-director.md` | 导演法中文版（brief/benchmark/treatment/节奏/镜头/表演/交付/版权） |
| `references/anti-ppt.md` | 反 PPT 门禁 G1–G9 + 逐镜决策清单模板 + 检查手段 |
| `references/self-check.md` | 交付前自检：声音重叠、字/图碰撞、抽帧碰撞清单（来自 pilot 真实事故） |
| `references/audio-studio.md` | cues.json、ComfyUI 声音、帧级对位、重叠与 crossfade、混音/母带 |
| `references/studio-pipeline.md` | **本机工作室环境与声音生产**（doctor/start/stop、gen/mix/mux/pipeline、模型选型、并行与 VRAM、排错、许可） |
| `references/production-notes.md` | **反 PPT 与制作经验**（故事结构、概念→机制→读数、节奏快剪、sound casting、QA 清单） |
| `references/engine.md` / `sync.md` | `U.*` 画笔 API / LRC、节拍、卡拉 OK、ffmpeg 音频 |
| `assets/starter/` | 项目骨架：`render.mjs`、`engine.js`、中性 `scene.js`、`style.js`、`events.js`、文档模板 |
| `scripts/new-mv.mjs` | 脚手架：`--style <slug>` 绑定风格、复制 STYLE.md、生成令牌骨架 |
| `scripts/export-sync.mjs` | `events.js`（帧号）→ `audio/events.json` + `cues.json`（样本级） |
| `scripts/check-cues.mjs` | 声音时间线自检：旁白/音乐/氛围重叠、crossfade、start_sample 一致性 |
| `scripts/check-anti-ppt.mjs` | DECISION-LIST 机械检查（G1/G2/G3/G4/G5/G6/G8/G9） |
| `scripts/build-style-cards.mjs` | 从本地库重新生成 59 张卡 + 索引 |
| `scripts/fetch-demos.mjs` | 一次性拉取 59 风格 demo 参考代码（git sparse clone，~46 MB） |
| `scripts/fetch-demos.ps1` | 同上（Windows/受限网络，Invoke-WebRequest 逐文件，可断点续传） |
| `vendor/lemo-demos/` | 各风格 demo 源码参考（只学技法；TREATMENT 后才读） |

**库位置**：`$LEMO_OPUSCAR_HOME`，或 `<workspace>/lemo-opuscar`，或 `~/lemo-opuscar`。技能只读库，不写库。

## 工作流（顺序固定，不跳步）

### 0. Intake（最多问一次）

一句话问清：**主题/歌**、**想要的感觉**、**必须出现/必须避免**、**时长/画幅/语言**、**有没有自有素材**（录音/照片/logo/数据/扫描）。
再给风格建议：没有指定就从 `references/style-index.md` 里**按主题推荐 2–3 个**；用户有歌就直接进入 MV 模式（时长 = 整小节）。

- 有 LRC 时**绝不自己编歌词**；只有文本没时间轴，自己做时间表并说明。
- 无歌/无旁白：`make-audio.mjs` 合成音轨或静音片；默认 30–60 s，超过 2–3 分钟先告诉用户成本。
- 默认 1920×1080 / 24 fps（STYLE.md 指定 fps 则以它为准）；响度 −14 LUFS。
- 用户的语言 = 配音/字幕语言。

### 1. 选风格 + Benchmark

- 读 `references/styles/<slug>.md` 的 **§1 本质/禁区** 与 **§10 引擎**，先判断能不能做、用什么栈做。
- 找 1–2 部参考（学构图/节奏/镜头/颜色/配乐；不学角色/设计/旋律/镜头/logo/字体）——见 `lemo-director.md` §2。

### 2. TREATMENT.md（画之前）

按 `lemo-director.md` §4 写：**3 个候选结构 + 选择理由、logline/arc、benchmark、shot list（景别/角度/运镜/时长/为什么）、beat sheet、cue map、声音设计表、字幕与标题设计**。
**TREATMENT 写完之前不读 `DEMO.md`、不读 demo 代码。**

### 2.5 反 PPT 决策清单（门禁）

写 `DECISION-LIST.md`（模板在 `assets/starter/`），一镜头一条：变化三姿态、环境持续变化、相机+理由、删镜测试、情绪→参数、技法稳定性、声音对位帧号。
跑 `node scripts/check-anti-ppt.mjs <project>`，**机械检查通过 + 人看过**才允许写实现。
规则细节见 `references/anti-ppt.md`：只描述"什么在变"，禁止描述"有什么"。

### 3. 定调（Look）

- 照 STYLE.md 把 `src/style.js` 填满：`palette`（§3）、`type`（§4）、`motion`（§5）、`camera`（§6）、`sound`（§7）、`nativeMove`（§8）、`pitfalls`（§9）。
- 用真实代码渲 2–4 个方向（`render.mjs --stills` / `--sheet`，可临时改 `style.js` 或建 `look/` 页面），逐条对照 §1/§3/§4；**不许用别的工具拼 mockup**。
- 用户选定后冻结令牌，进入实现。

### 4. 实现 scene

- `drawScene(t, ctx, U)` 分段时间区间写清楚，每段注释；画面变化落在小节线/可命名的拍上。
- 所有颜色/字体/字号/运镜从 `STYLE` 取；禁止散落 hex。
- 声音事件写进 `src/events.js`（帧号），视觉切点读同一份 `EVENTS`。
- 每段至少一张联系表 + 关键动作 0.2 s 运动条；带事件帧要抽帧核对。

### 5. 声音（studio + 帧级对位）

1. `node scripts/export-sync.mjs <project>`：校验 fps/帧号，生成 `audio/events.json` 与 `cues.json`（`start_sample` 精确到样本）。
2. `cues.json` 里为旁白/音乐/氛围补 `backend`（`comfy:qwen3_tts` / `comfy:ace_step15` / `comfy:stable_audio3` / `comfy:mmaudio` / `native:proc`）。
3. 生成 → mix → mux：`studio-plugin\plugin\scripts\studio.ps1 gen|mix|mux`，或 `python studio\scheduler\pipeline.py --project <project>`。环境/模型/并行细节见 **`references/studio-pipeline.md`**。
4. 跑 `sync_audit` 核对每个声音的起点 = 期望样本（0 误差），再看完整片带声音。
5. **跑重叠自检**：`node scripts/check-cues.mjs <project>`——旁白×旁白重叠 >0.3s、音乐×音乐重叠且未声明 crossfade、start_sample 不一致都会 FAIL。**移动过任何 cue 的起点后必须重跑**（pilot 就是这样叠了 0.55s）。
6. 配音：casting → 第一句成品做 voice clone reference → 全片同 seed；每句 ASR 回读；字幕停留 ≥1.8 s 且 ≥ 语音+0.6 s。

### 6. 渲染

```bash
node render.mjs --stills=7.5 --out=out/check
node render.mjs --sheet=1,5,9,13,17,21 --cols=3 --w=640 --out=out/check/sheet.jpg
node render.mjs --sheet=5,5.2,5.4,5.6 --cols=4 --w=480 --out=out/check/strip.jpg
node render.mjs --clip=0:8 --out=out/preview.mp4
node render.mjs --frames=0:24 --workers=3 --force
node render.mjs --encode --audio=audio/mix.wav --out=out/mv.mp4
```

改过场景后必须 `--force`（`--frames` 会跳过已存在帧，静默交付旧画面）。渲完 `ffprobe` 验证时长/分辨率/帧率，抽一帧看。

### 7. 自检与交付

按 `lemo-director.md` §11：联系表、关键动作条、完整带声观看、一轮修复；风格逐条核对 STYLE.md；反 PPT 复检；帧级对位报告；无黑帧/无 NaN；响度 −14 LUFS。
再按 `references/self-check.md` 过四道门：**反 PPT 门禁 → check-cues 重叠 → sync_audit 对位 → 碰撞高发时刻抽帧（逐字显现中段 / 画注出现消失 / 章落定 / 整张图纸）**，四道全过才交付。
交付：`out/<name>.mp4`、`poster.jpg`、`<name>.srt`、`TREATMENT.md`、`DECISION-LIST.md`、`CREDITS`、`audio/timeline-check.json`、`audio/sync-report.json`、源码 + build 说明。

## 反 PPT 门禁（摘要）

| ID | 判据（可机械检查） |
|---|---|
| G1 变化三姿态 | 每镜写清 A → P1 → P2 → P3 → B（至少 3 个可辨认中间状态） |
| G2 数字化 | 禁用"轻微/微微/缓慢地/大约"；程度必须给 px/秒/帧/度/dB |
| G3 环境持续变化 | 每镜至少 1 个环境元素持续变化 + 公式/频率 |
| G4 相机有理由 | 每镜记录运镜 + 为什么；"固定"也必须写理由 |
| G5 删镜测试 | 删掉这镜会缺哪一拍；缺得不够狠就砍 |
| G6 情绪→参数 | 情绪翻译成速度/幅度/粒子/阴影/色温等数字 |
| G7 技法反推 | 全片至少 1 处情节是从渲染器能稳定做的技法反推出来的 |
| G8 稳定性优先 | 高风险连续动作要有降级方案（切镜/特写/材质/粒子） |
| G9 可勾选 | 每条验收都能打勾；"美/精彩/有意境"不算 |

## 技术规则（code-mv 管线）

1. **纯 `f(t)`**：无跨帧状态、无 `Math.random()`、无 `Date.now()`、无帧间增量物理；稳定随机用 `U.hash(i)`。
2. **一块画布、一个 context**；不要另建 canvas 指望 `U.*` 跟过去。
3. **别用 `text`/`line`/`scale`/`filter` 当顶层函数名**——会遮蔽 canvas 全局，页面崩，渲染超时。
4. **单一取色源**：颜色/字体/字号从 `STYLE` 令牌取。
5. **调色最后做一次**：颗粒/暗角/淡入淡出放 `drawScene` 末尾；风格自带纸感/颗粒的按 §2 跳过通用调色。
6. **没看过渲染帧，绝不说"对了"**。
7. **不修改** `lemo-opuscar/core`、`styles/`、`studio/` 既有逻辑；新代码写项目文件夹或 `studio/` 新文件。

## 帧级对位（为什么是 0 误差）

`start_sample = round(frame × 48000 / fps)`；fps ∈ {24,25,30,50,60} 时 48000 能整除，**样本号是整数**。所以只要画面和声音都从 `events.js` 的同一个 `frame` 出发，就没有"±1 帧"的模糊。
`export-sync.mjs` 负责换算与校验；`native:proc` 按样本铺程序化音效；`sync_audit` 复核；生成模型若有内部延迟会被检出并补偿。详见 `references/audio-studio.md`。

## 风格支持说明（重要）

- **59 种全部可选**：`new-mv.mjs --style <slug>` 对 59 个 slug 都可用；每种都有风格卡（含 STYLE.md 全文）和 demo 参考代码。
- 但 lemo 不是函数库，没有"一键滤镜"：**第一次用某个风格，仍需按它的 STYLE.md 实现/校准画面**。2D 风格通常快；3D（three.js）与素材型（纪录片/实证影像）成本更高。
- 生成方法都已落在技能里（`references/styles/` + `vendor/lemo-demos/`），不依赖联网。

## 排错

| 症状 | 原因 |
|---|---|
| `page never became ready` | 场景 JS 报错；Chrome 打开 `studio.html` 看控制台 |
| 帧全黑 | `drawScene` 在 `fillRect` 后抛异常 |
| 文字豆腐块 | 机器没该字体；改 `STYLE.type.family` 为已装字体 |
| `ffmpeg exited 1` | 缺 libx264；换完整 ffmpeg 或 `-c:v mpeg4` |
| 重渲还是旧画面 | `--frames` 跳过已存在帧；加 `--force` |
| export-sync 报 fps 误差 | fps 不是 24/25/30/50/60；换成整除值或接受取整 |
| 声音晚/早 | 跑 sync_audit；检查 cue 的 `start_sample` 与 conform 是否裁剪 |
| 渲染慢 | 每帧开销来自填充和大面积模糊；减少 `glow`/`filter`/粒子 |

## 许可与署名

- 设计层（STYLE.md/DIRECTOR.md/AGENTS.md）来自 [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar)（MIT）；卡片里保留来源与库版本。
- 成片**不加 LemoLab 署名**（DIRECTOR §11）；交付前列 `CREDITS` 第三方资产与许可。
- 声音模型许可见 `studio\LICENSE-NOTES.md`（MMAudio CC-BY-NC 等）。

## 适配

- **竖屏/短视频**：`CONFIG.width=1080, height=1920`，布局用 `U.W/U.H`。
- **真实素材/生成图**：`ctx.drawImage` 画进场景，其余不变。
- **three.js/WebGL**：页面暴露 `window.ready` 与 `window.renderAt(t)`；`render.mjs --page` 可直接渲。
- **水彩/手绘引擎**：p5.js/p5.brush 页面同理，保持 `renderAt(t)` 契约。
