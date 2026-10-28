#!/usr/bin/env node
// check-anti-ppt.mjs — 机械检查 DECISION-LIST.md（反 PPT 门禁 G1/G2/G3/G4/G5/G6/G8/G9）。
//
//   node scripts/check-anti-ppt.mjs <project-dir|DECISION-LIST.md> [--strict]
//
// 机械能查的：字段齐全、禁用词、有没有数字、相机有没有理由、风险有没有标、变化有没有中间姿态。
// 机械查不了的（G7 的"从技法反推"、G9 的语义质量）标成人工项，不冒充通过。
// --strict：有 FAIL 时 exit 1（给 CI/流水线用）。

import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const STRICT = argv.includes('--strict');
const arg = argv.find(a => !a.startsWith('--'));
if (!arg) { console.error('usage: node check-anti-ppt.mjs <project-dir|DECISION-LIST.md> [--strict]'); process.exit(1); }
let file = resolve(arg);
if (existsSync(file) && !file.toLowerCase().endsWith('.md')) file = join(file, 'DECISION-LIST.md');

if (!existsSync(file)) { console.error('找不到：' + file); process.exit(1); }
const src = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');

const BANNED = ['轻微', '微微', '淡淡', '缓慢地', '大约', '稍微', '些许', '一丝', '隐约', '轻轻地', '略显'];
const blocks = src.split(/^###\s+/m).slice(1);
const results = [];

function line(block, prefix) {
  const m = block.match(new RegExp('^-\\s*' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[:：]\\s*(.*)$', 'm'));
  return m ? m[1].trim() : '';
}
const hasNumber = s => /(\d+(?:\.\d+)?\s*(px|s|秒|帧|fps|°|度|dB|%|个|次|条)?)/.test(s);
const badWords = s => BANNED.filter(w => s.includes(w));

if (!blocks.length) {
  console.error('没有找到任何 `### Sxx` 镜头条目。模板见 assets/starter/DECISION-LIST.md');
  process.exit(1);
}

for (const [i, b] of blocks.entries()) {
  const header = (b.split('\n')[0] || '').trim();
  const change = line(b, '变化');
  const env = line(b, '环境持续变化');
  const cam = line(b, '相机');
  const del = line(b, '删镜测试');
  const emo = line(b, '情绪 → 参数');
  const tech = line(b, '技法稳定性');
  const sync = line(b, '声音对位');
  const fails = [], warns = [];

  if (!change) fails.push('G1 缺"变化"');
  else {
    if (!hasNumber(change)) fails.push('G1 变化没有时间/进度数字');
    const arrows = (change.match(/→|->/g) || []).length;
    if (arrows < 3) fails.push(`G1 变化只有 ${arrows} 段（需要 A→P1→P2→P3→B，至少 3 个箭头）`);
    const bw = badWords(change); if (bw.length) fails.push('G2 变化里有禁用词：' + bw.join('/'));
  }
  if (!env) fails.push('G3 缺"环境持续变化"');
  else if (!hasNumber(env)) fails.push('G3 环境变化没有公式/频率数字');
  if (!cam || !/理由/.test(cam)) fails.push('G4 相机缺理由');
  if (!del || !/删掉会缺/.test(del)) fails.push('G5 删镜测试缺"删掉会缺"');
  if (!emo) fails.push('G6 缺"情绪 → 参数"');
  else {
    if (!hasNumber(emo)) fails.push('G6 情绪→参数没有数字');
    const bw = badWords(emo); if (bw.length) fails.push('G2 情绪→参数里有禁用词：' + bw.join('/'));
  }
  if (!tech) fails.push('G8 缺"技法稳定性"');
  else if (!/风险\s*[:：]?\s*(低|中|高)/.test(tech)) fails.push('G8 没标风险（低/中/高）');
  if (sync && !/frame\s*\d+/.test(sync)) warns.push('声音对位建议写成 "frame <整数>"');
  if (!sync) warns.push('G7/声音：未写声音对位帧号');

  results.push({ header, fails, warns });
}

const fileWarn = [];
if (!/反推/.test(src)) fileWarn.push('G7：全篇没有标出"从技法反推"的镜头（请在至少一镜写明）');
const totalFails = results.reduce((n, r) => n + r.fails.length, 0);
const totalWarns = results.reduce((n, r) => n + r.warns.length, 0);

console.log(`检查：${file}`);
console.log(`镜头：${results.length} 个   FAIL：${totalFails}   WARN：${totalWarns + fileWarn.length}\n`);
results.forEach((r, i) => {
  const mark = r.fails.length ? 'FAIL' : r.warns.length ? 'WARN' : 'PASS';
  console.log(`${mark}  ${String(i + 1).padStart(2)}. ${r.header}`);
  for (const f of r.fails) console.log('       ✗ ' + f);
  for (const w of r.warns) console.log('       ! ' + w);
});
for (const w of fileWarn) console.log('WARN  ' + w);

console.log('\n机械检查只覆盖可判定项；G7 语义 / 故事质量 / 镜头内容仍需人看渲染帧。');
if (STRICT && totalFails) process.exit(1);
