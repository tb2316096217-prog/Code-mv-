# 第三方来源与许可

本仓库的原创部分（`SKILL.md`、`scripts/`、`assets/starter/`、各文档的编排与中文改写）以 MIT 发布，见 [LICENSE](LICENSE)。
以下内容来自第三方，按各自的许可保留。

## 1. Lemo-Opuscar（设计层 + 参考 demo）

- 上游：https://github.com/lemomo-ai/lemo-opuscar
- 作者：Lemomo / LemoLab
- 许可：**MIT**
- 快照：commit `413a6bd6d78ebd3bdd5abaec9538a26867f890df`（2026-10-28 拉取）

包含：

| 本仓库路径 | 上游内容 | 处理 |
|---|---|---|
| `references/styles/*.md` | 59 个 `styles/<slug>/STYLE.md` 全文 | 原文保留，卡片头部标注来源与库版本 |
| `references/lemo-director.md` | `DIRECTOR.md` | 中文改编 |
| `references/style-binding.md` | 风格令牌落地规则 | 中文整理 |
| `vendor/lemo-demos/` | 59 个风格的 demo 源码、素材、字体 | 原样快照，逐文件清单见 `MANIFEST.json` |

`vendor/` 内保留上游原有的第三方许可文件（例如各 demo `fonts/` 下的 OFL 文本）。这些文件随上游分发，未做改动。

MIT 许可允许再分发，条件是在本仓库保留上述版权与许可声明——本文档即用于满足该条件。

## 2. 声音模型（可选，不随本仓库分发）

若你自行搭建 `studio` 声音流水线，用到的模型各自许可如下：

| 模型 | 用途 | 许可 | 注意 |
|---|---|---|---|
| Qwen3-TTS | 旁白 / 配音克隆 | Apache-2.0 | 可商用 |
| ACE-Step | 配乐生成 | MIT | 可商用 |
| Stable Audio 3 | 氛围 / 音效 | Stability AI Community License | 发布作品需标注并注册 |
| MMAudio | 视频拟音 | CC-BY-NC | **仅限非商业** |

模型权重与 ComfyUI 自定义节点均不包含在本仓库内。

## 3. 字体

`references/styles/` 里推荐的字体会在成片项目的 `CREDITS.md` 中列出；本仓库不内嵌字体文件（`vendor/` 里上游自带的字体许可文件除外）。商用前请自行核对。
