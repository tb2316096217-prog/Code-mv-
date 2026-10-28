# starter — 项目骨架说明

这是一个 code-mv 项目骨架：画面全部由代码绘制，逐帧是时间的纯函数。

## 目录

```
src/config.js     时长/帧率/BPM/音频——渲染器唯一读取的时间配置
src/style.js      本片风格令牌（唯一取色/字号/运镜/声音来源；填满后冻结）
src/events.js     帧号事件（画面与声音同一份数据）
src/engine.js     U.* 画笔工具（不要改，除非加通用工具）
src/scene.js      影片本体：drawScene(t, ctx, U)（骨架，按 style/STYLE.md 重写）
style/STYLE.md    本片风格的完整设计规范（只读参考；不复制 DEMO.md）
STORYBOARD.md     分镜（先写它）
DECISION-LIST.md  逐镜反 PPT 决策清单（写代码前过审）
assets/demo.wav   演示音轨（可用 node make-audio.mjs 重新生成；最终用 studio 声音）
```

## 常用命令

```bash
node render.mjs --stills=1.5 --out=out/check          # 全分辨率静帧
node render.mjs --sheet=1,3,5,7,9 --cols=3 --w=640 --out=out/check/sheet.jpg
node render.mjs --sheet=5,5.2,5.4,5.6 --cols=4 --w=480 --out=out/check/strip.jpg
node render.mjs --clip=0:4 --out=out/preview.mp4      # 带音频快速预览
node render.mjs --frames=0:12 --workers=3             # 全量逐帧（可断点续渲）
node render.mjs --encode --audio=audio/mix.wav --out=out/mv.mp4
```

改过 `scene.js` 后重渲必须加 `--force`（否则跳到旧帧）。

## 工作顺序

1. `TREATMENT.md`（结构/镜头/节奏/声音设计/标题设计）
2. `DECISION-LIST.md` → `node <skill>/scripts/check-anti-ppt.mjs .`
3. 填 `src/style.js`（照 `style/STYLE.md` 的 §3/§4/§5/§6/§7）
4. 渲定调样张 → 选一个方向
5. 逐段实现 `scene.js`；每段联系表 + 0.2s 运动条
6. `node <skill>/scripts/export-sync.mjs .` → `audio/events.json` + `cues.json`（帧→样本）
7. studio 生成声音 → mix → sync 审计 → `--encode` 母带
8. 自检：反 PPT 复检 + STYLE.md 逐条 + 帧级对位报告 → 交付
