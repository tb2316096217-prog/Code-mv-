# 声音：studio（ComfyUI）+ 帧级对位

> 引擎用本机 studio（Qwen3-TTS / ACE-Step / Stable Audio 3 / MMAudio），**纪律学 lemo**：声音设计表、cue map、0 ms 对位、字幕停留、−14 LUFS 母带。
> 本文件规定接口与数据流；具体模型参数见 `studio\AI-STACK.md`，安装/排错见 `studio-plugin` 的 `opuscar-studio` 技能。

## 1. 数据流（两级时间源）

```
TREATMENT.md 声音设计表
        │
        ▼
src/events.js  ──帧号（整数）──►  画面事件（切点/显现/脉冲，同一份数据）
        │                            │
        │ export-sync.mjs            │ drawScene(t) 使用同一事件
        ▼                            ▼
cues.json  {start_frame, start_sample, t, backend…}   out/frames/*.jpg
        │
        ├─ comfy:qwen3_tts / ace_step15 / stable_audio3 / mmaudio ──► studio 生成 → conform
        └─ native:proc（程序化 SFX，按 events 直接铺样本）──────────► stems
        ▼
mix.py（按 start_sample 放置）→ mix.wav → sync_audit.py（0 样本审计）
        ▼
render.mjs --encode --audio=mix.wav → out/mv.mp4（ffmpeg 母带 −14 LUFS）
```

**两条时间源**：音乐/旁白以 `cues.json` 的秒/样本为准；音效以 `events.js` 的帧号为准。两者在导出时合并为同一份 `cues.json`，所以**画面切点、音效、音乐都落在同一帧**。

## 2. events.js（帧级单一事实源）

```js
// src/events.js —— 事件用整数帧号。视觉与声音都从这里取，保证同帧。
export const EVENTS = [
  { frame: 0,   type: 'amb_start',  id: 'rain' },                 // 氛围（长音，交给 comfy:stable_audio3）
  { frame: 90,  type: 'whoosh',     pan: -0.3, gain: 0.8 },       // 程序化音效
  { frame: 90,  type: 'cut',        to: 'S2' },                   // 画面事件（同一帧）
  { frame: 180, type: 'ding',       pan: 0.2,  gain: 1.0 },
  { frame: 300, type: 'thump',      pan: 0.0,  gain: 0.9 },
  { frame: 240, type: 'vo',         id: 'l1' },                   // 旁白行（交给 comfy:qwen3_tts）
];
```

- `frame` 必须是整数；`scene.js` 里用同一份 `EVENTS` 驱动画面（例如 `EVENTS.find(e => e.frame === f)` 决定切点），所以不存在"音画各写一遍"。
- 可用的程序化音色（移植 `core/audio/sfx.py`）：`click clack crash whoosh creak thump step ding pop brown noise …`；每个事件可带 `pan/gain/pitch`。
- 长音/氛围/旁白不进 `events.js` 的短事件，放 `cues.json`（见 §3），但仍可用 `frame` 对齐起点。

## 3. cues.json（唯一混音事实源）

沿用 studio schema，追加两个字段：

```json
{
  "film": "x", "fps": 24, "sample_rate": 48000,
  "targets": { "lufs": -14, "peak": -1.2 },
  "cues": [
    { "id": "vo_l1", "kind": "voice", "backend": "comfy:qwen3_tts",
      "start_frame": 240, "start_sample": 480000, "start": 10.0,
      "text": "……", "voice": { "ref_audio": "voice-assets/vivian/reference.wav",
      "ref_text": "……", "seed": 42 }, "target_lufs": -18 },
    { "id": "bgm_main", "kind": "music", "backend": "comfy:ace_step15",
      "start": 0, "seconds": 45, "bpm": 96, "keyscale": "A minor", "seed": 11,
      "prompt": "……", "conform": { "fade_in": 0.3, "fade_out": 1.5 } },
    { "id": "sfx_whoosh_90", "kind": "sfx", "backend": "native:proc",
      "start_frame": 90, "start_sample": 180000, "start": 3.75,
      "proc": { "type": "whoosh", "pan": -0.3, "gain": 0.8 } }
  ]
}
```

字段规则：

- `start_sample = round(start_frame × sample_rate / fps)`；fps ∈ {24,25,30,50,60} 时整除，**误差 0 样本**。
- 所有 comfy 生成物先 conform（去前置静音、单声道/立体声统一、采样率 48 kHz），再按 `start_sample` 放置；生成模型自身延迟由 `sync_audit.py` 检出并补偿。
- 旁白/音乐保留 `start`（秒）给模型做长度与节拍参考；**实际放置以 `start_sample` 为准**。
- `backend`：`comfy:qwen3_tts`｜`comfy:ace_step15`｜`comfy:minimax_music3`｜`comfy:stable_audio3`｜`comfy:mmaudio`（需 `video_path`）｜`native:proc`。

## 4. 工具链命令（工作区根目录执行）

```powershell
$studio = "studio-plugin\plugin\scripts\studio.ps1"
$plugin = "studio-plugin\plugin"
$p = "<project>"

# 环境检查 / 起 ComfyUI
powershell -File $studio doctor
powershell -File $studio start

# 1) 从 events.js 导出 cues.json（帧→样本）+ 事件清单
node skills\code-mv\assets\starter\export-sync.mjs $p

# 2) 生成所有 comfy 声音（原生音效由 mix 阶段按 events 铺）
powershell -File $studio gen $p            # 或 --only id1,id2 / --force

# 3) 程序化音效（native:proc）：按 cues.json 生成 stems（样本起点=0，mix 按 start 放置）
python studio\audio\proc_sfx.py <project>

# 4) 混音（采样级放置；存在 comfy cue 未生成时用 --allow-missing 先验证）
python studio\audio\mix.py <project>\cues.json --stems <project>\audio\stems --out <project>\audio\mix.wav --allow-missing

# 5) 帧级对位审计（0 样本容差；生成模型延迟会报 delta 供补偿）
python studio\audio\sync_audit.py <project> --mix <project>\audio\mix.wav

# 一次性流水线：音频生成 ∥ 画面渲染 → mix → mux → out/pipeline-run.json
python studio\scheduler\pipeline.py --project $p --workers 3

# 4) 单独步骤
powershell -File $studio render $p --workers 3
powershell -File $studio mix $p
powershell -File $studio mux $p
```

降级路径（ComfyUI 不可用）：`make-audio.mjs` 合成演示音轨、用户自带音频、或用 `native:proc` 只出程序化音效（仍需 mix/mux）。

## 5. 配音纪律（学 lemo TECHNIQUE §4 + studio 实测）

- **音色先定再生成**：casting 后以**第一句成品做 Voice Clone reference**，全片同 seed；资产打包 `voice-assets/<name>/`（reference/voice.json/cue-template/samples/SHA256）。
- **每句回读**：`asr_check`（faster-whisper）逐字校验；中文短句听错一个字正常，听一遍确认，把模型听到的写进 `asr` 字段。
- 数字：TTS 文本里**拼出来**，字幕里写阿拉伯数字。
- 混音前压缩旁白（峰值因数高），按 RMS 平衡：人声约高于音乐 **10 dB**；音乐在对话/关键 foley 下压。
- 停顿 ≤ 2.5 s（拆句不字），字幕每条停留 ≥ 3.4 s；快剪后重跑回读。

## 6. 重叠与交叉淡化（交付前必查）

声音放准 ≠ 声音不打架。**对位检查（`sync_audit`）之外必须再跑 `check-cues`**：

```powershell
node <skill>\scripts\check-cues.mjs <project> [--voice-overlap 0.30]
```

规则：

- **旁白 × 旁白**：按 `audio/stems/words.json` 的语音窗口算，重叠 > **0.30s** → FAIL。移动过任何 cue 起点后必须重跑（pilot 的 v_l3a/v_l3b 就是 14.0 改点后叠了 0.55s）。
- **音乐 × 音乐**：重叠 > 0.05s 必须显式声明 `"crossfade": 0.4`（或 `conform.crossfade`）且 ≥ 实际重叠；没有声明 = 直接相加 = 双倍能量。pilot 的 bgm_a/bgm_b 叠 0.37s 就是漏了这一步。
- **氛围 × 氛围**：同上。
- **音效 × 音效**：只 WARN（章/撞击簇是设计内的），但一个簇 ≤3 个，且用 pan/音高/帧偏移错开。

报告落在 `audio/timeline-check.json`；和 `sync-report.json` 一起进交付。

## 7. 帧级对位与审计

1. `export-sync.mjs` 校验：`fps ∈ {24,25,30,50,60}`、`frame` 整数、无重复冲突；写出 `audio/events.json`（含 `frame/t/sample`）并更新 `cues.json`。
2. `studio/audio/proc_sfx.py`（新增，移植 lemo `core/audio/sfx.py`，MIT）按 `start_sample` 把程序化音效直接写进 `stems/sfx_<id>.wav`（含 pan/gain）。
3. `studio/audio/sync_audit.py`（新增）：
   - 输入 `cues.json` + `audio/stems/*.wav` + 最终 `mix.wav`；
   - 用 onset 检测每个 cue 实际起点，与 `start_sample` 比较；
   - 输出 `audio/sync-report.json`：`{id, expected_sample, actual_sample, delta_samples, ok}`；
   - 容差 **0 样本**（生成类模型若检出固定延迟，记入 `delay_samples` 并在 mix 中补偿，再复测到 0）。
4. 成片抽检：任选 2–3 个事件，抽对应帧 still + 音轨波形图，人工确认"看到即听到"。

## 8. 母带与验收

- 母带 −14 LUFS、真峰值 ≤ −1.2 dB（目标值见 cues.targets，可调）；`ffmpeg -af ebur128` 复核。
- 无黑帧（`blackdetect`）、无 NaN/空帧；音频无削波。
- 完整看一遍带声音的成片；声音设计表每一行都进 mix。
- 第三方资产进 `CREDITS`；MMAudio（CC-BY-NC）等许可按 `studio\LICENSE-NOTES.md`，个人非商业也要署名。

## 9. 与 lemo 声音栈的关系

| 我们保留 | 从 lemo 借鉴 |
|---|---|
| ComfyUI 生成（中文配音/克隆、配乐、视频条件拟音） | 声音设计表、cue map、三层声音、静音/声音转场纪律 |
| cues.json 单一事实源、studio 并行流水线 | 0 ms 对位思想、事件驱动混音 |
| — | `sfx.py` 程序化音色（移植为 `native:proc`）、ASR 回读、−14 LUFS 母带 |
