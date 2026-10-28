#!/usr/bin/env node
// build-style-cards.mjs — 从本地 Lemo-Opuscar 库生成 59 张「风格卡」+ 中文索引。
// 每张卡 = 元信息 + STYLE.md 全文（生成方法），自包含，不依赖库在线。
//
//   node scripts/build-style-cards.mjs            # 生成 references/style-index.md + references/styles/<slug>.md
//   node scripts/build-style-cards.mjs --check    # 只校验，不写文件
//
// 只读库（lemo-opuscar/），不写库。来源：github.com/lemomo-ai/lemo-opuscar（MIT）。

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL = resolve(here, '..');
const OUT_INDEX = join(SKILL, 'references', 'style-index.md');
const OUT_DIR = join(SKILL, 'references', 'styles');
const CHECK = process.argv.includes('--check');

const CATEGORY_ORDER = [
  '剪辑与纪实', '实证影像', '手绘与绘画', '东方传统', '印刷与版画',
  '图形与排版', '信息与发布', '卡通与动画', '游戏', '电影与时代', '材质与 3D',
];

function findLibrary() {
  const cands = [
    process.env.LEMO_OPUSCAR_HOME,
    resolve(SKILL, '..', '..', 'lemo-opuscar'),
    resolve(SKILL, '..', '..', '..', 'lemo-opuscar'),
    join(homedir(), 'lemo-opuscar'),
  ].filter(Boolean);
  for (const c of cands) {
    if (c && existsSync(join(c, 'AGENTS.md')) && existsSync(join(c, 'styles'))) return c;
  }
  throw new Error('找不到 lemo-opuscar 库：设置 LEMO_OPUSCAR_HOME 或把库放在 <workspace>/lemo-opuscar');
}

const LIB = findLibrary();
const STYLES = join(LIB, 'styles');
const slugs = readdirSync(STYLES, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== '_template')
  .map(d => d.name)
  .sort();

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}

function sha256(s) { return createHash('sha256').update(s).digest('hex'); }

const rows = [];
for (const slug of slugs) {
  const dir = join(STYLES, slug);
  const metaPath = join(dir, 'style.json');
  const stylePath = join(dir, 'STYLE.md');
  if (!existsSync(metaPath) || !existsSync(stylePath)) {
    console.warn(`跳过 ${slug}（缺 style.json 或 STYLE.md）`);
    continue;
  }
  const meta = readJson(metaPath);
  const style = readFileSync(stylePath, 'utf8').replace(/^\uFEFF/, '');
  const demoPath = join(dir, 'DEMO.md');
  const demo = existsSync(demoPath) ? readFileSync(demoPath, 'utf8') : '';

  // 渲染栈提示：只看 §10 Engine，做保守标注
  const engineSec = (style.match(/##\s*10\.?\s*Engine[\s\S]*?(?=\n##\s|$)/i) || [''])[0];
  let tier;
  if (/footage|素材|archive|satellit|lidar|点云|卫星|档案|scan|照片|影像/i.test(engineSec)) tier = '需真实素材/数据工具（见 §10）';
  else if (/three\.js|WebGL|shader|\b3D\b/i.test(engineSec)) tier = '3D（three.js/WebGL，见 §10）';
  else if (/2D|canvas|DOM|SVG|CSS|page/i.test(engineSec)) tier = '2D 优先（见 §10）';
  else tier = '见 §10 Engine';
  const hasRefCode = existsSync(join(SKILL, 'vendor', 'lemo-demos', 'styles', slug));

  rows.push({ slug, meta, style, demo, tier, hasRefCode, styleBytes: Buffer.byteLength(style) });
}

if (!rows.length) throw new Error('没有读到任何风格');
const libVersion = (() => {
  try { return JSON.parse(readFileSync(join(LIB, '.lemo-tree.json'), 'utf8').replace(/^\uFEFF/, '')).sha || 'unknown'; }
  catch { return 'unknown'; }
})();
const metaHash = sha256(rows.map(r => JSON.stringify(r.meta)).join('\n'));

// 按 category_cn 排序（未知类别排最后），同类别内按 num
const catIndex = c => { const i = CATEGORY_ORDER.indexOf(c); return i < 0 ? 999 : i; };
rows.sort((a, b) => catIndex(a.meta.category_cn) - catIndex(b.meta.category_cn) || (a.meta.num || '').localeCompare(b.meta.num || ''));

const stamp = new Date().toISOString().slice(0, 10);
// 我们的编号（按类别顺序 01..59），与库的 gallery num 分开显示
for (let i = 0; i < rows.length; i++) rows[i].seq = String(i + 1).padStart(2, '0');

// ── 单卡 ──────────────────────────────────────────────────────────────────
for (const r of rows) {
  const { meta, style } = r;
  const refLine = r.hasRefCode
    ? `\`vendor/lemo-demos/styles/${r.slug}/\`（本地参考代码，只学技法；按 lemo 规则，TREATMENT 写完后再读该风格的 \`DEMO.md\`）`
    : '（本地参考代码未拉取：`node scripts/fetch-demos.mjs --only ' + r.slug + '`）';
  const md = `# ${r.seq} · ${meta.cn} ${meta.en}

> **类别**：${meta.category_cn} / ${meta.category_en}
> **文件夹**：\`${meta.slug}\`（库内编号 ${meta.num || '—'}）
> **示例片**：*${meta.film || '—'}*${meta.dur ? `（${meta.frame_sec ? '风格帧 ' + meta.frame_sec + 's · ' : ''}${meta.dur}s）` : ''}
> **一句话（中）**：${meta.line_cn || '—'}
> **一句话（英）**：${meta.line || '—'}
> **适用**：${(meta.uses || []).join(' / ') || '—'}
> **渲染栈提示**：${r.tier}
> **规范来源**：\`lemo-opuscar/styles/${r.slug}/STYLE.md\`（Lemo-Opuscar，MIT；库版本 \`${libVersion.slice(0, 12)}\`，生成于 ${stamp}）
> **参考实现**：${refLine}

> ⚠️ 本卡是**设计规范**，不是成品模板：照它画，不照 demo 抄故事。排版/字幕以本卡 §4 为准。

---

${style.trim()}

---

## 附：取用顺序（本技能工作流）

1. 先写 \`TREATMENT.md\`（结构/镜头/节奏/声音设计/标题设计）——**此时不读 demo**。
2. 再照本卡定 \`src/style.js\` 令牌（§3 颜色 / §4 排版 / §5 运动 / §6 镜头 / §7 声音 / §8 母题 / §9 坑）。
3. 渲染定调样张，逐条对照 §1/§3/§4；过反 PPT 门禁后才展开。
4. 需要学技法时才读 \`DEMO.md\` 与 \`vendor/lemo-demos/styles/${r.slug}/\` 的参考代码。
`;
  if (!CHECK) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, `${r.slug}.md`), md, 'utf8');
  }
}

// ── 索引 ──────────────────────────────────────────────────────────────────
const byCat = new Map();
for (const r of rows) {
  const c = r.meta.category_cn || '未分类';
  if (!byCat.has(c)) byCat.set(c, []);
  byCat.get(c).push(r);
}
const lines = [];
lines.push('# Lemo-Opuscar 风格索引（59 种）');
lines.push('');
lines.push(`> 生成自本地库 \`${LIB}\`，库版本 \`${libVersion.slice(0, 12)}\`，style.json 汇总哈希 \`${metaHash.slice(0, 16)}\`，${stamp}。`);
lines.push('> 重新生成：`node scripts/build-style-cards.mjs`。每张卡的完整规范在 `references/styles/<slug>.md`（含 STYLE.md 全文）。');
lines.push('> 在线看片：https://lemomo-ai.github.io/lemo-opuscar/');
lines.push('');
for (const c of CATEGORY_ORDER) {
  const list = byCat.get(c);
  if (!list) continue;
  lines.push(`## ${c}（${list.length}）`);
  lines.push('');
  lines.push('| # | 风格 | English | Folder | 示例片 | 渲染栈提示 |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of list) {
    lines.push(`| ${r.seq} | ${r.meta.cn} | ${r.meta.en} | [\`${r.slug}\`](styles/${r.slug}.md) | *${r.meta.film || '—'}* | ${r.tier} |`);
  }
  lines.push('');
}
const unknown = [...byCat.keys()].filter(c => !CATEGORY_ORDER.includes(c));
if (unknown.length) lines.push('未分类：' + unknown.join('、'));
lines.push(`共 ${rows.length} 种风格。`);
const indexText = lines.join('\n') + '\n';
if (!CHECK) {
  mkdirSync(dirname(OUT_INDEX), { recursive: true });
  writeFileSync(OUT_INDEX, indexText, 'utf8');
}

console.log(`${CHECK ? '校验' : '生成'}完成：${rows.length} 张风格卡，库版本 ${libVersion.slice(0, 12)}，style.json 哈希 ${metaHash.slice(0, 16)}`);
console.log(`索引：${OUT_INDEX}`);
console.log(`卡片：${OUT_DIR}\\<slug>.md  （${rows.length} 个）`);
if (!CHECK) {
  const sizes = rows.map(r => r.styleBytes).reduce((a, b) => a + b, 0);
  console.log(`STYLE.md 全文合计：${(sizes / 1e6).toFixed(2)} MB`);
}
