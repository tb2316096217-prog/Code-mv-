#!/usr/bin/env node
// fetch-demos.mjs — 一次性拉取 Lemo-Opuscar 59 个风格的 demo 参考代码（含参考素材，约 46 MB）。
// 用 git sparse clone（只 checkout styles/*/demo），不写库；输出到 <skill>/vendor/lemo-demos/。
//
//   node scripts/fetch-demos.mjs                 # 全部风格
//   node scripts/fetch-demos.mjs --only impasto,blueprint
//   node scripts/fetch-demos.mjs --ref main      # 默认钉当前 main 的 commit
//   node scripts/fetch-demos.mjs --dry-run       # 只打印计划
//
// 依赖：git（sparse checkout, filter）。来源：github.com/lemomo-ai/lemo-opuscar（MIT）。

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const SKILL = resolve(here, '..');
const OUT = join(SKILL, 'vendor', 'lemo-demos');
const CLONE = join(SKILL, 'vendor', '.lemo-clone');
const REPO = 'https://github.com/lemomo-ai/lemo-opuscar.git';

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf('--' + name);
  if (i < 0) return null;
  return argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
};
const ONLY = String(opt('only') || '').split(',').map(s => s.trim()).filter(Boolean);
const REF = opt('ref') || 'main';
const DRY = !!opt('dry-run');

const git = (...args) => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();

function main() {
  if (DRY) {
    console.log(`repo: ${REPO} ref: ${REF}`);
    console.log(`将 sparse checkout styles/*/demo → ${OUT}`);
    if (ONLY.length) console.log('only: ' + ONLY.join(', '));
    return;
  }
  mkdirSync(join(SKILL, 'vendor'), { recursive: true });
  rmSync(CLONE, { recursive: true, force: true });
  console.log(`git clone --depth 1 --filter=blob:none --sparse ${REPO}`);
  git('clone', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', REF, REPO, CLONE);
  const sha = git('-C', CLONE, 'rev-parse', 'HEAD');
  console.log(`commit ${sha}`);
  console.log('sparse-checkout: styles/*/demo + DEMO.md');
  git('-C', CLONE, 'sparse-checkout', 'set', '--no-cone',
    'styles/*/demo/', 'styles/*/DEMO.md');

  const stylesDir = join(CLONE, 'styles');
  const slugs = readdirSync(stylesDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== '_template')
    .map(d => d.name).sort()
    .filter(s => ONLY.length === 0 || ONLY.includes(s));

  let files = 0, bytes = 0, copied = 0;
  const manifest = { source: REPO, ref: REF, commit: sha, fetchedAt: new Date().toISOString(), styles: [] };
  mkdirSync(OUT, { recursive: true });
  rmSync(join(OUT, 'styles'), { recursive: true, force: true }); // 清掉旧的半成品，保证与 commit 一致
  for (const slug of slugs) {
    const srcDemo = join(stylesDir, slug, 'demo');
    if (!existsSync(srcDemo)) continue;
    const dst = join(OUT, 'styles', slug);
    mkdirSync(dst, { recursive: true });
    cpSync(srcDemo, join(dst, 'demo'), { recursive: true });
    if (existsSync(join(stylesDir, slug, 'DEMO.md'))) cpSync(join(stylesDir, slug, 'DEMO.md'), join(dst, 'DEMO.md'));
    const count = (function walk(p) {
      let n = 0, b = 0;
      for (const e of readdirSync(p, { withFileTypes: true })) {
        const q = join(p, e.name);
        if (e.isDirectory()) { const r = walk(q); n += r[0]; b += r[1]; }
        else { n++; b += statSync(q).size; }
      }
      return [n, b];
    })(dst);
    files += count[0]; bytes += count[1]; copied++;
    manifest.styles.push({ slug, files: count[0], bytes: count[1] });
    if (copied % 10 === 0) console.log(`  ${copied}/${slugs.length}  ${(bytes / 1e6).toFixed(1)} MB`);
  }
  manifest.fileCount = files; manifest.bytes = bytes;
  writeFileSync(join(OUT, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
  rmSync(CLONE, { recursive: true, force: true });
  console.log(`完成：${copied} 个风格，${files} 文件，${(bytes / 1e6).toFixed(1)} MB → ${OUT}`);
  console.log(`commit ${sha}`);
}

try { main(); }
catch (e) {
  rmSync(CLONE, { recursive: true, force: true });
  console.error('下载失败：' + (e.stderr || e.message));
  console.error('排查：git 是否可用/能否访问 github.com；或设置 HTTP(S)_PROXY 后重试。');
  process.exit(1);
}
