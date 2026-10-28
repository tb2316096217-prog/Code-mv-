# 工作室环境与声音生产（studio-pipeline）

> 合并自原来的 `comfy-audio` 与 `opuscar-studio` 两个技能（2026-10-28 并入 code-mv）。
> 本文件管**“怎么在本机跑起来”**；声音的数据契约（events/cues/start_sample/重叠/母带）见 `audio-studio.md`；交付前检查见 `self-check.md`。
> 下文用 `<workspace>` 指你的工作区根目录（作者本机为 `D:\Deepseek Harness\code movie`，仅作示例）。
> 前提：工作区里有 `lemo-opuscar\`（风格库 + 渲染）与 `studio\`（ComfyUI 音频桥接、对位、混音、并行调度）。技能本身**不携带** `studio\` 代码与 ComfyUI 模型权重。

## 1. 开工前：环境体检

```powershell
$plugin = "<workspace>\studio-plugin\plugin"
powershell -File "$plugin\scripts\studio.ps1" doctor   # 库/studio/venv/Chrome/Git Bash/8188/关键模型
powershell -File "$plugin\scripts\studio.ps1" start    # 起 ComfyUI（127.0.0.1:8188）
# 结束只关自己启动的实例
powershell -File "$plugin\scripts\studio.ps1" stop
```

`doctor` 检查：库与 studio 目录、Python venv、Chrome、Git Bash、ComfyUI 端口、关键模型文件。缺模型：
`python studio\install\download.py --group all --verify-only`，缺的再 `--group <g>` 重下。

本机路径（换机器时改这里）：

- ComfyUI：`D:\Apps\ComfyUI\ComfyUI_windows_portable`（0.37.0）
- 音频 Python：`<workspace>\lemo-opuscar\.venv\Scripts\python.exe`
- 渲染 Chrome：`C:\Program Files\Google\Chrome\Application\chrome.exe`（`PLAYWRIGHT_CHROME`）
- 网络：pip 用 `NO_PROXY='*'` + 腾讯镜像；HF 用 `HF_ENDPOINT=https://hf-mirror.com` + `HF_HUB_DISABLE_XET=1`；GitHub 走代理镜像。

## 2. 铁律（不要违背）

1. **画面 = 代码**：每帧是 `window.render(t)` 纯函数，headless Chrome 逐帧渲染；不要插入生成视频画面（MiniMax H3 只当素材/参考）。
2. **声音 = 素材 + 时间**：ComfyUI 只生成毛坯；必须 `audit → conform → mix`，按 `cues.json` 的 `start` 采样级放置；母带仍用 `core/render/mux.sh`。
3. **GPU/CPU 并行**：音频生成（GPU）与画面渲染（CPU）可同时跑；音频阶段渲染 `workers=2`；3D/WebGL 风格改为先音频后渲染；同一时刻只常驻一个音频大模型（**VRAM 红线 15.5 GB**）。
4. **不修改** `lemo-opuscar\core\`、`styles\`；新代码只写 `studio\` 或项目文件夹。
5. **本机/个人非商业默认**：MMAudio（CC-BY-NC）可用但必须署名；SA3（Stability AI Community License）需在简介/片尾注明；转商业前看 `studio\LICENSE-NOTES.md`。

## 3. 声音生产标准动作

```powershell
# 1) 写/改 <project>/cues.json（声音唯一事实源）
#    backend = comfy:qwen3_tts | ace_step15 | minimax_music3 | stable_audio3 | mmaudio，或 native:proc
# 2) 帧号 → cues（先跑 code-mv 的 export-sync；native:proc 音效由 proc_sfx 生成）
node <skill>\scripts\export-sync.mjs <project>
python studio\audio\proc_sfx.py <project> [--force]
# 3) 生成 ComfyUI 声音（写 audio/raw、audio/stems、audio/manifest.json）
powershell -File "$plugin\scripts\studio.ps1" gen <project> [--only id] [--force]
# 4) 混音（ducking/限幅；默认最终 −15 LUFS 目标）
powershell -File "$plugin\scripts\studio.ps1" mix <project>
# 5) 画面渲染（可与第 3 步并行，workers=2）——code-mv 管线：
node <project>\render.mjs --frames=0:<dur> --workers=3 --force
# 6) 母带（两遍 loudnorm；输出实测 I/LRA/TP）
bash lemo-opuscar\core\render\mux.sh <project>\out\video.mp4 <project>\audio\mix.wav <project>\out\final.mp4 <fps> 0
```

**模型选型（本机实测）**

| 用途 | backend | 要点 |
|---|---|---|
| 中文旁白 | `comfy:qwen3_tts` | 首选 **Clone 模式**：cue 写 `voice: {mode:"clone", model:"Qwen/Qwen3-TTS-12Hz-1.7B-Base", ref_audio:"<绝对路径>", ref_text:"…", seed:9002}`；工作流 `studio/comfy/workflows/qwen3tts_clone.json` |
| 配乐 | `comfy:ace_step15` | `bpm / keyscale / timesignature / seconds` 可控（20 s ≈ 6–9 s 生成）；默认选它 |
| 整首歌/成品感 | `comfy:minimax_music3` | 无 bpm 控制 |
| 音效/氛围 | `comfy:stable_audio3` | 2–4 s 一条；输出偏安静，conform 会归一；`ckpt` 可换 small-music/medium |
| 视频条件拟音 | `comfy:mmaudio` | `video_path` 指向项目内 mp4；**≈265 s / 8 s 音频**，只用于关键段落；**换时间轴/画面必须重生成，不能只重排** |
| 程序化卡点 | `native:proc` | `studio/audio/proc_sfx.py`；无 GPU、按样本铺；适合轻音效/兜底 |

**旁白一致性**：casting 后以**第一句成品**做 Voice Clone reference，全片同 seed；**不要逐句 VoiceDesign**（音色会漂）。每句用 faster-whisper 回读（阈值 0.92，中文；方法见 `studio\audio\ASR-NOTES.md`）。

## 4. 并行与调度

```powershell
# 一键：音频生成 ∥ 画面渲染 → mix → mux → out/pipeline-run.json
powershell -File "$plugin\scripts\studio.ps1" pipeline <project> [--serial] [--workers 3]
# 或直接调调度器
python studio\scheduler\pipeline.py --project <project> [--serial] [--skip-audio|--skip-render]
```

- 音频阶段渲染 `workers=2`；3D/WebGL 风格**先音频后渲染**。
- 同一时刻只跑一个音频大模型；`doctor` 的 VRAM 红线 15.5 GB。
- 声音生成失败先看 `audio/manifest.json` 与 ComfyUI 队列，不重跑整条 pipeline。

## 5. 资产与复用

- **声音资产打包**（与片子版本解耦）：`voice-assets/<name>/` 放 `reference.wav` + `reference.txt` + `voice.json`（model/mode/seed/许可）+ `cue-template.json` + `samples/`（全部句子 + preview.mp3）+ `SHA256SUMS` + `README.md`。
- **配乐选型**：专业/金融/严肃题材先避雷——不要马林巴、玻璃音色、儿歌/轻科普音色。
  可用配方：**无鼓 + 钢琴/合成器 pad + 稳定脉冲 + 中性严肃 + 约 96 BPM + 小调**；
  每次生 **3–6 条 40–60 s 候选**，先按客观指标预筛（频谱质心 200–500 Hz、4 s 窗 RMS 方差小、开头连续无空洞、结尾自然收束），再让用户听 20 s 小样。
- **电平**：bed 比人声低 **10–15 dB**；旁白窗 RMS 明显高于 bed 空档。连续 bed + 稀疏人声 crest 高时，旁白可做 2:1 轻压缩（保留未压缩原声），母带别让 limiter 把人声压回去。
- **改时长/节奏**：SFX 重排；MMAudio 必须在新画面上重生成；`mix.py --duration <新时长>`，静音窗按新时间给。

## 6. 验收（可测量）

- `audio/manifest.json` 每个 cue 有 backend/seed/sha256/conform 报告。
- 响度 −14~−15 LUFS、真峰值 ≤ −1.2 dBTP、无削波；`mux.sh` 打印实测值。
- 设计静音窗按成片时间核对（数字零段 ≤ −100 dBFS；细正弦段 −43…−37 dBFS）。
- 旁白存在性：旁白窗口 RMS 比 bed 空档高 10–15 dB；混音里没人声先查 `studio/audio/mix.py` 的 voice bus 是否并入 `mix_bus`。
- 旁白 ASR 回读（faster-whisper medium，阈值 0.92）。
- 听感 A/B：`python studio\bench\ab_report.py --ab-dir studio\bench\ab` 生成 mp3 reel 与客观报告。

> 声音的**重叠问题**不在这里，在 `references/audio-studio.md` §6 + `scripts/check-cues.mjs`：旁白重叠 >0.3s、配乐重叠未声明 crossfade 都会 FAIL。

## 7. 常用脚本

| 命令 | 作用 |
|---|---|
| `studio.ps1 doctor` | 环境体检 |
| `studio.ps1 start` / `stop` | 启停 ComfyUI（只关自己启动的） |
| `studio.ps1 gen <project> [--only id] [--force]` | 生成 cues.json 里的 comfy 声音 → stems + manifest |
| `studio.ps1 render <project> [--workers 3] [--encoder nvenc]` | 渲染画面（可选 GPU 编码变体） |
| `studio.ps1 mix <project>` / `mux <project>` | 混音 / 母带 |
| `studio.ps1 pipeline <project>` | 并行音频+渲染 → 混音 → 母带 |
| `studio.ps1 ab` | 重跑 A/B 报告（`studio\bench\ab\AB-REPORT.md` + reels） |
| `studio.ps1 sync` | 同步技能（现默认只同步 code-mv 到 DSH；已合并的 comfy-audio/opuscar-studio 跳过） |

## 8. 排错

| 症状 | 处理 |
|---|---|
| ComfyUI 起不来/端口占用 | `doctor` 看端口；只关闭自己启动的实例；`curl http://127.0.0.1:8188/system_stats` |
| 模型缺失 | `python studio\install\download.py --group all --verify-only`，缺的重下 |
| VRAM OOM | 清模型、缩短 `seconds`、渲染 workers 降到 2、串行 |
| 生成慢 | MMAudio 最慢（≈265 s / 8 s）；ACE/Qwen 首次含模型加载 |
| 真峰值超标 | conform 内置限幅；mix.py 限到 targets.peak；母带 `mux.sh` 两遍 loudnorm 兜底；必要时先 `alimiter` 再 mux |
| pip/HF 失败 | `NO_PROXY='*'`、`HF_ENDPOINT=https://hf-mirror.com`、`HF_HUB_DISABLE_XET=1` |

## 9. 许可与署名

- 个人非商业：MMAudio（CC-BY-NC）可用但署名；SA3（Stability AI Community License）在简介/片尾注明，商用需注册。
- 第三方资产（音乐、字体、图片、语音引擎）写进项目 `CREDITS`；成片**不加 LemoLab 署名**。
- 完整清单：`studio\LICENSE-NOTES.md`。

## 10. 相关文档

- **声音契约/帧级对位/重叠/crossfade/母带流程**：`audio-studio.md`
- **交付前自检（含字/图碰撞）**：`self-check.md`
- **反 PPT 实战经验（故事/节奏/声音 casting/QA）**：`production-notes.md`
- **本机分工与实测数据**：`studio\AI-STACK.md`；快速命令：`studio\README.md`
