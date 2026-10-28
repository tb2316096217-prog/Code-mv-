# 许可与来源

## 设计层（references/styles/*.md、lemo-director.md、style-binding.md 的规范部分）

- 来源：[lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar)（作者 Lemomo / LemoLab）
- 许可：MIT（见 `<workspace>/lemo-opuscar/LICENSE`）
- 本地快照版本：`413a6bd6d78e…`（59 个 style.json 汇总哈希 `d683301f348881e8…`）
- 处理：`STYLE.md` 全文按 MIT 保留在 `references/styles/`；导演法为中文改编；卡片标注来源。
- 约束：用户成片**不加 LemoLab 署名**（DIRECTOR §11）；参考 demo 只学技法，不搬角色/故事/镜头。

## 管线层

- 来自原 code-mv 技能（本机自有）：`assets/starter/`、`export-sync.mjs`、`check-anti-ppt.mjs` 等。
- 程序化音效：`studio/audio/proc_sfx.py` 改编自 lemo `core/audio/sfx.py`（MIT）。
- 帧级对位审计：`studio/audio/sync_audit.py` 为本机新增。

## 声音模型

见 `studio\LICENSE-NOTES.md`（Qwen3-TTS、ACE-Step、Stable Audio 3、MMAudio 等各自的许可与署名要求；MMAudio 为 CC-BY-NC）。

## 字体

风格卡里推荐的字体会在项目 `CREDITS` 里列出；商用前核对字体许可。

## 说明

本技能只读 `lemo-opuscar/` 与 `studio/`，不修改其既有代码；新增文件只有 `studio/audio/proc_sfx.py`、`studio/audio/sync_audit.py`。
