#!/usr/bin/env node
// new-mv.mjs — 从 starter 脚手架一个 code-mv 项目，并绑定一个 Lemo-Opuscar 风格。
//
//   node scripts/new-mv.mjs <project-dir> [--style <slug>] [--blank] [--force]
//
//   --style <slug>  复制该风格的 STYLE.md 到 <project>/style/，生成风格令牌骨架
//   --blank         用最小场景替换骨架（保留 style/events/engine）
//   --force         写入非空目录
//
// 库位置：$LEMO_OPUSCAR_HOME，或 <workspace>/lemo-opuscar，或 ~/lemo-opuscar。

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL = resolve(here, '..');
const starter = join(SKILL, 'assets', 'starter');
const argv = process.argv.slice(2);
const valueOf = (name) => {
  const i = argv.indexOf('--' + name);
  if (i < 0 && !argv.some(a => a.startsWith('--' + name + '='))) return null;
  if (argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  const eq = argv.find(a => a.startsWith('--' + name + '='));
  return eq ? eq.split('=').slice(1).join('=') : true;
};
const flags = new Set(argv.filter(a => a.startsWith('--')));
const target = argv.find(a => !a.startsWith('--'));
const styleSlug = valueOf('style');

if (!target || target === true) {
  console.error('usage: node new-mv.mjs <project-dir> [--style <slug>] [--blank] [--force]');
  console.error('   59 个 slug 见 references/style-index.md');
  process.exit(1);
}
const dest = resolve(target);
if (existsSync(dest) && readdirSync(dest).length && !flags.has('--force')) {
  console.error(`${dest} is not empty — pass --force to write into it anyway`);
  process.exit(1);
}

function findLibrary() {
  const cands = [
    process.env.LEMO_OPUSCAR_HOME,
    resolve(SKILL, '..', '..', 'lemo-opuscar'),
    resolve(SKILL, '..', '..', '..', 'lemo-opuscar'),
    join(homedir(), 'lemo-opuscar'),
  ].filter(Boolean);
  for (const c of cands) if (c && existsSync(join(c, 'styles'))) return c;
  return null;
}

// style 校验先于写盘
const LIB = findLibrary();
let styleMeta = null;
if (styleSlug) {
  if (!LIB) {
    console.error('找不到 Lemo-Opuscar 库：设置 LEMO_OPUSCAR_HOME 或把库放在 <workspace>/lemo-opuscar');
    process.exit(1);
  }
  const styleDir = join(LIB, 'styles', styleSlug);
  if (!existsSync(join(styleDir, 'STYLE.md'))) {
    const known = readdirSync(join(LIB, 'styles'), { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== '_template').map(d => d.name);
    console.error(`没有这个风格：${styleSlug}（共 ${known.length} 个，见 references/style-index.md）`);
    process.exit(1);
  }
  styleMeta = JSON.parse(readFileSync(join(styleDir, 'style.json'), 'utf8').replace(/^\uFEFF/, ''));
}

mkdirSync(dest, { recursive: true });
cpSync(starter, dest, {
  recursive: true,
  filter: (src) => !/[\\/](out|node_modules|__pycache__)([\\/]|$)/.test(src),
});

const title = basename(dest);
// config：标题替换，时长保持 12s 骨架
const cfgPath = join(dest, 'src', 'config.js');
let cfg = readFileSync(cfgPath, 'utf8');
cfg = cfg.replace(/title: '[^']*'/, `title: '${title.replace(/'/g, "\\'")}'`);
writeFileSync(cfgPath, cfg);

// 标题占位符
for (const f of ['STORYBOARD.md', 'DECISION-LIST.md']) {
  const p = join(dest, f);
  if (existsSync(p)) writeFileSync(p, readFileSync(p, 'utf8').replaceAll('{{TITLE}}', title));
}

// 绑定风格
if (styleMeta) {
  mkdirSync(join(dest, 'style'), { recursive: true });
  cpSync(join(LIB, 'styles', styleSlug, 'STYLE.md'), join(dest, 'style', 'STYLE.md'));
  writeFileSync(join(dest, 'style', 'README.md'),
    `# 本片风格：${styleMeta.cn} ${styleMeta.en}\n\n` +
    `- slug：\`${styleSlug}\`\n- 类别：${styleMeta.category_cn}\n- 示例片：*${styleMeta.film || '—'}*\n` +
    `- 卡片：\`${join(SKILL, 'references', 'styles', styleSlug + '.md').replace(/\\/g, '/')}\`\n` +
    `- 参考代码：\`${join(SKILL, 'vendor', 'lemo-demos', 'styles', styleSlug).replace(/\\/g, '/')}\`（TREATMENT 写完后再读 demo）\n\n` +
    `\`STYLE.md\` 是完整规范（§1–§11），设计/排版/镜头/声音设计以它为准；不要改它。\n` +
    `照它把 \`src/style.js\` 的令牌填满，再写 \`TREATMENT.md\` / \`DECISION-LIST.md\`。\n`);

  const stylePath = join(dest, 'src', 'style.js');
  let s = readFileSync(stylePath, 'utf8');
  s = s.replace(/slug: '',/, `slug: '${styleSlug}',`);
  s = s.replace(/name: '',/, `name: ${JSON.stringify(`${styleMeta.cn} ${styleMeta.en}`)},`);
  s = s.replace('// 提示：现在这些值是占位符（中性纸感），必须按所选风格 STYLE.md 改成它的真实数值。',
    '// 提示：现在这些值是占位符（中性纸感），必须按所选风格 STYLE.md 改成它的真实数值。');
  writeFileSync(stylePath, s);
}

// --blank：最小场景
if (flags.has('--blank')) {
  writeFileSync(join(dest, 'src', 'scene.js'), `// scene.js — 空白舞台（只证明管线）。风格照 style/STYLE.md 自己画。
function drawScene(t, ctx, U) {
  const { W, H } = U;
  const S = window.STYLE || {}, P = S.palette || {};
  ctx.fillStyle = P.paper || '#111';
  ctx.fillRect(0, 0, W, H);
  U.text('SCENE', W / 2, H / 2, { size: 120, align: 'center', color: P.ink || '#fff' });
  U.grain(t, 0.04);
}
`);
  writeFileSync(cfgPath, readFileSync(cfgPath, 'utf8').replace(/duration: \d+/, 'duration: 12'));
}

// 环境检查
const has = (cmd) => { try { execSync(cmd, { stdio: 'ignore' }); return true; } catch { return false; } };
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome']
  .find(p => existsSync(p));

console.log(`scaffolded → ${dest}`);
console.log(`  style   ${styleMeta ? styleMeta.cn + ' ' + styleMeta.en + ' (' + styleSlug + ')' : '未绑定（可用 --style <slug> 重新生成）'}`);
console.log(`  node    ${process.version}`);
console.log(`  ffmpeg  ${has('ffmpeg -version') ? 'ok' : 'MISSING'}`);
console.log(`  chrome  ${chrome || 'NOT FOUND — render.mjs --chrome=<path>'}`);
console.log(`\nnext:\n  cd "${dest}"\n  1) 读 style/STYLE.md，填 src/style.js\n  2) 写 TREATMENT.md 与 DECISION-LIST.md，过反 PPT 检查\n  3) node "${join(SKILL, 'scripts', 'check-anti-ppt.mjs')}" .\n  4) node render.mjs --stills=1.5 --out=out/check\n  5) node "${join(SKILL, 'scripts', 'export-sync.mjs')}" .\n`);
