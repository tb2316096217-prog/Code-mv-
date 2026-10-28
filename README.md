# code-mv · 帧律 × Lemo-Opuscar

**用代码做一支短片 / MV / 歌词视频**：每个像素由代码逐帧画出——没有素材库、没有视频模型、不用剪辑软件。

设计层照 [Lemo-Opuscar](https://github.com/lemomo-ai/lemo-opuscar) 的 59 种风格硬规范执行；管线层是纯 `f(t)` 的逐帧渲染（headless Chrome + ffmpeg）；审核层是反 PPT 门禁 G1–G9；声音层做帧号 → 样本号的 0 误差对位。

**版本**：v0.3.0 · **许可**：MIT（设计层与参考 demo 来自上游，见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)）

---

## 1. 三层分工

```
设计层 = Lemo-Opuscar（STYLE.md + DIRECTOR.md）   ← 长什么样
审核层 = 反 PPT 门禁 + 自检（G1–G9 / check-cues / 碰撞抽帧）
管线层 = code-mv（纯 f(t) / render.mjs / 脚手架）
声音层 = 可选：本机 ComfyUI（Qwen3-TTS / ACE-Step / SA3 / MMAudio）+ 帧级对位
```

- **纯函数画面**：`drawScene(t, ctx, U)`，任意顺序、并行、重渲都不漂移；没有跨帧状态、没有 `Math.random()`。
- **声音与画面同源**：`src/events.js` 一份整数帧号同时驱动切点和音效；`start_sample = round(frame × 48000 / fps)`，fps ∈ {24,25,30,50,60} 时整除，**误差 0 样本**。
- **反 PPT**：每个镜头必须写清"什么在变"，禁止"有什么"；机械检查不过就不许写实现。

## 2. 安装

```bash
git clone https://github.com/tb2316096217-prog/Code-mv-.git ~/.claude/skills/code-mv
```

- **Claude Code**：放到 `~/.claude/skills/code-mv`（Windows：`C:\Users\<你>\.claude\skills\code-mv`），新开会话即可。
- **其他 harness（DSH 等）**：复制或软链到该 harness 的 skills 目录；入口是 `SKILL.md`（YAML frontmatter 里有 `name` / `description` / `whenToUse`）。
- 只想看规范、不装技能：直接读 `references/styles/` 与 `references/lemo-director.md`。

### 依赖

| 必需 | 说明 |
|---|---|
| Node.js ≥ 18 | 渲染器、脚手架、检查脚本（无 npm 依赖） |
| Chrome / Edge | `render.mjs` 走 DevTools Protocol 驱动 headless 浏览器 |
| ffmpeg | 编码、抽帧、响度测量（需 libx264 + aac） |

| 可选 | 说明 |
|---|---|
| ComfyUI + 本地模型 | 旁白 / 配乐 / 拟音生成。**studio 代码不随本仓库分发**，见 `references/studio-pipeline.md` 的环境说明 |
| Python 3.10+ | 仅当你要跑 studio 音频流水线 |

## 3. 快速开始

```bash
# 1) 脚手架：绑定一个风格（slug 见 references/style-index.md）
node scripts/new-mv.mjs "D:/path/to/项目名" --style blueprint

# 2) 先写 TREATMENT.md（3 候选结构 + shot list + beat sheet + cue map）
#    再写 DECISION-LIST.md（逐镜 G1–G9），过门禁才写代码
node scripts/check-anti-ppt.mjs "D:/path/to/项目名"

# 3) 照 style/STYLE.md 填 src/style.js 令牌；渲 2–4 张定调样张 → 定方向
cd "D:/path/to/项目名"
node render.mjs --stills=2.2 --out=out/look

# 4) 实现 scene.js / events.js；逐段联系表 + 0.2s 运动条
# 5) 声音：帧号 → cues → 生成 → mix → 两道检查
node "<skill>/scripts/export-sync.mjs" .
node "<skill>/scripts/check-cues.mjs" .

# 6) 全片渲染 + 编码（参数是「秒」不是帧号）
node render.mjs --frames=0:20 --workers=3 --force
node render.mjs --encode --audio=audio/mix.wav    # → out/mv.mp4
```

`render.mjs` 的主要用法：

| 命令 | 作用 |
|---|---|
| `--stills=7.5` | 出单帧 |
| `--sheet=1,5,9,13 --cols=4 --w=640` | 联系表（参数是秒） |
| `--clip=0:8` | 预览片段 |
| `--frames=0:24 --workers=3 --force` | 全片逐帧（**0:24 是秒**；改过场景必须 `--force`，否则跳过已有帧） |
| `--encode [--audio=x.wav]` | 编码成 mp4 |

## 4. 交付前四道自检（缺一不可）

| 门 | 命令 | 判据 |
|---|---|---|
| 反 PPT | `check-anti-ppt.mjs` | G1–G9；有 FAIL 不写代码、不交付 |
| 声音重叠 | `check-cues.mjs` | 旁白×旁白 >0.3s、音乐×音乐重叠未声明 crossfade、start_sample 不一致 → FAIL |
| 帧级对位 | `sync_audit.py`（studio） | 每个声音起点 = 期望样本（0 误差） |
| 字/图碰撞 | 抽帧人看（`references/self-check.md` §2） | 逐字显现中段 / 画注出现消失 / 章落定 / 整张图纸，逐项查压线、孤行、注框压图 |

## 5. 声音规则（摘要）

- **帧级单一事实源**：`EVENTS` 用整数帧号，画面切点与音效读同一份。
- **旁白**：克隆音色 + 同 seed；每句 ASR 回读；两句之间 ≥0.3s 气口。
- **音乐**：相邻 cue 交叉淡化必须显式写 `crossfade`，或留 ≥0.2s 空；不声明 = 直接相加 = 双倍能量。
- **程序化音效**：一个音效簇 ≤3 个，用 pan / 音高 / 帧偏移错开。
- **母带**：峰值限制 → 两遍 loudnorm → −14 LUFS / TP ≤ −1.2 dBFS。

## 6. 包内容

| 路径 | 数量/大小 | 作用 |
|---|---|---|
| `SKILL.md` | — | 技能入口：Intake → Treatment → 门禁 → 定调 → 实现 → 声音 → 交付 |
| `references/style-index.md` | 1 | 59 风格中文索引（编号/中英名/类别/folder/渲染栈提示） |
| `references/styles/<slug>.md` | **59 张** | 元信息 + 该风格 `STYLE.md` 全文 |
| `references/style-binding.md` | 1 | STYLE.md 11 节 → `style.js` 令牌的落地规则 |
| `references/lemo-director.md` | 1 | 导演法中文改编（brief/benchmark/treatment/节奏/镜头/交付/版权） |
| `references/anti-ppt.md` | 1 | 反 PPT 门禁 G1–G9 + DECISION-LIST 模板 |
| `references/self-check.md` | 1 | 交付前自检：声音重叠、字/图碰撞、抽帧清单 |
| `references/audio-studio.md` | 1 | cues/events、声音生成、帧级对位、重叠与 crossfade、母带 |
| `references/studio-pipeline.md` | 1 | 本机工作室环境与声音生产（doctor/gen/mix/mux、模型选型、并行、排错） |
| `references/production-notes.md` | 1 | 反 PPT 与制作经验（故事结构、概念→机制→读数、快剪、QA） |
| `references/engine.md` / `sync.md` / `director-prompt.md` | 3 | 画笔 API / LRC 节拍 / 一击式导演 brief |
| `assets/starter/` | 12 文件 | 项目骨架：render.mjs、engine、中性 scene、style 令牌、events、文档模板、演示音轨 |
| `scripts/` | 7 文件 | 脚手架 `new-mv.mjs`、`export-sync.mjs`、`check-anti-ppt.mjs`、`check-cues.mjs`、`build-style-cards.mjs`、`fetch-demos.mjs/.ps1` |
| `vendor/lemo-demos/` | **1522 文件 / 20 MB** | 59 风格的 demo 源码参考（只学技法，TREATMENT 之后才读） |

合计：**1614 文件 / 26 MB**。

## 7. 风格支持与边界（诚实版）

- **59 种全部可选**：`new-mv.mjs --style <slug>` 对 59 个 slug 都可用；每种都有风格卡（STYLE.md 全文）+ demo 参考代码（已随仓库下发）。
- **不是一键滤镜**：第一次用某个风格，仍需按它的 STYLE.md 实现/校准画面。2D 风格通常快；3D（three.js）与素材型成本更高。
- 已跑通的试点：**blueprint**（canvas 2D 近似 cyanotype，见下方"已知边界"）。
- 技能**只读**你的 `lemo-opuscar/` 库与 `studio/`，不改它们。

## 8. 已知边界

1. **cyanotype 近似**：blueprint 试点用 canvas 2D 程序化纸纹，不是上游 §2/§10 的 WebGL2 compositor。
2. **中文手写字体**：画注依赖系统字体（如 Segoe Print + SimSun 回退），没有内置中文手写 OFL 字体。
3. **布局碰撞**目前靠抽帧人工检查，还没有自动"注框避让"算法。
4. **studio 声音栈不随仓库分发**：`references/studio-pipeline.md` 只是环境说明与方法；ComfyUI、模型权重、`studio/` 脚本需自备。

## 9. 维护

- 风格卡从上游库重新生成：`node scripts/build-style-cards.mjs`（需本地 `lemo-opuscar`）。
- 重新拉 demo 参考代码：`node scripts/fetch-demos.mjs`，或 `powershell -File scripts\fetch-demos.ps1`（受限网络，可断点续传）。
- demo 快照钉在上游 commit `413a6bd6d78e…`（记录见 `vendor/lemo-demos/MANIFEST.json`）。

## 10. 许可与署名

- **本仓库代码与文档**：MIT，见 [LICENSE](LICENSE)。
- **设计层**（`references/styles/*.md`、`lemo-director.md` 的规范部分）：来自 [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar)（MIT）。
- **`vendor/lemo-demos/`**：同上，上游 MIT，逐文件保留原有 OFL 等字体许可文件。
- **字体**：风格卡推荐的字体会在成片项目的 `CREDITS` 里列出；商用前自行核对许可。
- **声音模型**（若你自建 studio）：Qwen3-TTS（Apache-2.0）、ACE-Step（MIT）、Stable Audio 3（Stability AI Community License，发布需标注并注册）、MMAudio（CC-BY-NC，仅非商业）。详见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

原作者不要求在成片中署名；第三方资产按各自许可写进项目 `CREDITS`。
