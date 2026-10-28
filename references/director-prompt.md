# 导演提示词：一句话让另一个 agent 交一支 code-mv

> 给另一个 agent（或未来的自己）的一击式 brief。核心不是"帮我做个 MV"，而是**把风格规范、工具、时间轴和验收标准写死**，让执行方长程跑完。
> 设计层依据：`references/styles/<slug>.md`（STYLE.md 全文）+ `references/lemo-director.md`；门禁：`references/anti-ppt.md`。

## 模板（中文，直接改占位符）

```text
用 code-mv 技能做一支 [时长] 秒的 [类型：MV / 歌词视频 / 科普短片 / 片头]，
画幅 [16:9 1920×1080 / 9:16 1080×1920]，输出 MP4（H.264 + AAC，−14 LUFS）。

风格（唯一设计依据）：
- slug：[例如 blueprint]
- 必读：references/styles/<slug>.md（= Lemo-Opuscar STYLE.md §1–§11），设计/排版/镜头/颜色/声音设计全部照它，不得删改规范。
- Benchmark：[1–2 部参考]；只学构图/节奏/镜头/颜色/配乐，不学角色/设计/旋律/镜头/logo/字体。

素材与事实：
- 主题：[一句话]；必须出现：[…]；必须避免：[…]
- 素材：[歌/LRC/录音/照片/数据/扫描 的路径；没有就写无]
- 语言：[中文/英文]；配音：[要/不要；音色要求]

流程（缺一步都不算完成）：
1. 写 TREATMENT.md（3 候选结构+选择理由、logline/arc、benchmark、shot list 含运镜理由、
   beat sheet、cue map、声音设计表、字幕与标题设计）。TREATMENT 前不读 demo。
2. 写 DECISION-LIST.md（逐镜 G1–G9），跑 node scripts/check-anti-ppt.mjs <project>，不过不写代码。
3. 填 src/style.js 令牌（STYLE.md §3/§4/§5/§6/§7/§8/§9），渲 2–4 张定调样张，等我选。
4. 用真实代码实现 scene.js：纯 f(t)、事件写 src/events.js（帧号）、颜色/字号只从 STYLE 取。
5. 每段：联系表 + 0.2s 运动条；关键事件帧抽帧核对。
6. 声音：node scripts/export-sync.mjs <project> → cues.json → studio 生成 → mix → sync_audit（0 样本）。
7. 全片渲染 → ffprobe + 抽帧 → 自检（lemo-director §11 + STYLE.md 逐条）→ 交付清单。

硬约束：
- 画面里每个变化都必须可检查；"美/精彩/有意境"不是验收。
- 不许用别的工具拼 mockup；不许拿 demo 的故事/镜头。
- 改过场景重渲必须 --force；没看过渲染帧不许说"好了"。
- 成片不加 LemoLab 署名；第三方资产写 CREDITS。

交付：out/<name>.mp4、poster.jpg、<name>.srt（有旁白）、TREATMENT.md、DECISION-LIST.md、
CREDITS、源码与一条 build 说明；另附 sync 审计报告与 STYLE.md 逐条核对结果。
```

## 短版（只有一个风格 + 一句话主题时）

```text
code-mv：用 [slug] 风格（references/styles/<slug>.md，规范不可改）做一支 [时长]s 的 [类型]，
主题：[一句话]。先 TREATMENT + DECISION-LIST（过 check-anti-ppt），再填 style.js 出 3 张定调样张等我选；
实现用纯 f(t)，事件进 events.js；声音走 studio + 帧级对位；交付 mp4/poster/srt/CREDITS。
```

## 使用要点

- **风格必须给 slug**；不给就让执行方从 `references/style-index.md` 按主题推荐 3 个再选。
- **时长/画幅/语言**先说死；有歌给 BPM/LRC，没歌说明用合成音轨。
- 把"必须出现/必须避免"写成清单，别写形容词。
- 如果执行方是同一个 agent 的后续会话：把这份 brief 存进项目 `BRIEF.md`，比口头说可靠。
