#!/usr/bin/env node
// export-sync.mjs — 把项目的 events.js（帧号）导出成 audio/events.json，并同步 cues.json。
// 帧 → 样本：start_sample = round(frame × sample_rate / fps)；fps ∈ {24,25,30,50,60} 时整除，误差 0 样本。
//
//   node scripts/export-sync.mjs <project-dir> [--dry-run]
//
// 读取：<project>/src/config.js（window.CONFIG）、<project>/src/events.js（window.EVENTS）
// 写出：<project>/audio/events.json、<project>/cues.json（保留已有 comfy 声音 cue，重建 native:proc）

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import vm from 'node:vm';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const projArg = argv.find(a => !a.startsWith('--'));
if (!projArg) { console.error('usage: node export-sync.mjs <project-dir> [--dry-run]'); process.exit(1); }
const PROJ = resolve(projArg);
const SCRIPT_TYPES = new Set(['cut', 'reveal', 'vo', 'amb_start']); // 非短音效
const SAMPLE_RATE = 48000;
const GOOD_FPS = new Set([24, 25, 30, 50, 60]);

function loadScripts() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  for (const f of ['src/config.js', 'src/events.js']) {
    const p = join(PROJ, f);
    if (!existsSync(p)) throw new Error(`缺少 ${p}`);
    vm.runInContext(readFileSync(p, 'utf8'), sandbox, { filename: f });
  }
  return { CONFIG: sandbox.window.CONFIG || {}, EVENTS: sandbox.window.EVENTS || [] };
}

let CONFIG, EVENTS;
try { ({ CONFIG, EVENTS } = loadScripts()); }
catch (e) { console.error('读取失败：' + e.message); process.exit(1); }

const fps = Number(CONFIG.fps || 30);
const duration = Number(CONFIG.duration || 0);
const title = CONFIG.title || basename(PROJ);
const warnings = [];
const errors = [];

if (!GOOD_FPS.has(fps)) warnings.push(`fps=${fps} 不能整除 48000，start_sample 会有取整误差（建议 24/25/30/50/60）`);
if (!Array.isArray(EVENTS)) errors.push('window.EVENTS 不是数组');
if (!duration) warnings.push('CONFIG.duration 未设置');

const seen = new Map();
const clean = [];
for (const [i, e] of (EVENTS || []).entries()) {
  if (!e || typeof e !== 'object') { errors.push(`EVENTS[${i}] 不是对象`); continue; }
  if (!Number.isInteger(e.frame)) { errors.push(`EVENTS[${i}].frame 不是整数：${e.frame}`); continue; }
  if (e.frame < 0) { errors.push(`EVENTS[${i}].frame < 0`); continue; }
  if (duration && e.frame / fps > duration + 1e-6) warnings.push(`EVENTS[${i}] frame ${e.frame} 超出时长（${duration}s）`);
  const key = `${e.frame}:${e.type}:${e.id || ''}`;
  if (seen.has(key)) warnings.push(`重复事件 ${key}`);
  seen.set(key, true);
  const t = e.frame / fps;
  const sample = Math.round(e.frame * SAMPLE_RATE / fps);
  clean.push({ ...e, t: Number(t.toFixed(6)), sample, start: sample / SAMPLE_RATE });
}
clean.sort((a, b) => a.frame - b.frame || a.type.localeCompare(b.type));

if (errors.length) { console.error('错误：\n- ' + errors.join('\n- ')); process.exit(1); }

// cues.json：读旧文件，保留非 native:proc，重建 native:proc
const cuesPath = join(PROJ, 'cues.json');
let cuesDoc = { film: title, fps, sample_rate: SAMPLE_RATE, targets: { lufs: -14, peak: -1.2 }, cues: [] };
if (existsSync(cuesPath)) {
  try { cuesDoc = JSON.parse(readFileSync(cuesPath, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { errors.push('cues.json 解析失败：' + e.message); }
}
cuesDoc.film = cuesDoc.film || title;
cuesDoc.fps = fps;
cuesDoc.sample_rate = SAMPLE_RATE;
cuesDoc.targets = cuesDoc.targets || { lufs: -14, peak: -1.2 };
const kept = (cuesDoc.cues || []).filter(c => c.backend !== 'native:proc');
const rebuilt = [];
const notes = [];

for (const e of clean) {
  if (e.type === 'cut' || e.type === 'reveal') continue;
  if (e.type === 'vo') {
    const id = e.id || `vo_${e.frame}`;
    const has = kept.some(c => c.id === id || c.id === `vo_${id}`);
    if (!has) notes.push(`旁白事件 vo:${id} 在 cues.json 里没有对应 cue —— 请补 backend(comfy:qwen3_tts)/text/voice`);
    continue;
  }
  if (e.type === 'amb_start') {
    const id = `amb_${e.id || e.frame}`;
    const exist = kept.find(c => c.id === id);
    if (exist) { if (exist.kind === 'amb') exist.kind = 'ambience'; continue; }
    rebuilt.push({
      id, kind: 'ambience', backend: 'comfy:stable_audio3',
      start_frame: e.frame, start_sample: e.sample, start: e.start,
      seconds: Math.max(1, duration - e.start),
      prompt: `TODO: ${e.id || 'ambience'}（按 STYLE.md §7 声音调色板补）`,
      todo: true,
    });
    notes.push(`氛围 ${id}: 已建占位 cue（backend=comfy:stable_audio3），请补 prompt/seconds`);
    continue;
  }
  // 程序化短音效
  const id = `sfx_${e.type}_${e.frame}`;
  rebuilt.push({
    id, kind: 'sfx', backend: 'native:proc',
    start_frame: e.frame, start_sample: e.sample, start: e.start,
    proc: {
      type: e.type,
      pan: e.pan ?? 0,
      gain: e.gain ?? 1,
      ...(e.pitch != null ? { pitch: e.pitch } : {}),
      ...(e.dur != null ? { dur: e.dur } : {}),
    },
    sync: { frame: e.frame, sample: e.sample, expected_ms: Number((e.t * 1000).toFixed(3)) },
  });
}
cuesDoc.cues = [...kept, ...rebuilt];

const eventsDoc = {
  film: title, fps, sample_rate: SAMPLE_RATE, duration,
  events: clean, warnings,
};

if (!DRY) {
  mkdirSync(join(PROJ, 'audio'), { recursive: true });
  writeFileSync(join(PROJ, 'audio', 'events.json'), JSON.stringify(eventsDoc, null, 2));
  writeFileSync(cuesPath, JSON.stringify(cuesDoc, null, 2));
}

// 报告
console.log(`项目：${PROJ}`);
console.log(`fps=${fps}  sample_rate=${SAMPLE_RATE}  每帧样本=${(SAMPLE_RATE / fps).toFixed(3)}  时长=${duration || '?'}s`);
console.log(`事件 ${clean.length} 个；cues：保留 ${kept.length}，重建 native:proc ${rebuilt.length}`);
if (clean.length) {
  console.log('\nframe    t(s)      sample      type');
  for (const e of clean) console.log(`${String(e.frame).padStart(5)}  ${String(e.t.toFixed(3)).padStart(7)}  ${String(e.sample).padStart(9)}  ${e.type}${e.id ? ':' + e.id : ''}`);
}
for (const n of notes) console.log('! ' + n);
for (const w of warnings) console.log('! ' + w);
console.log(DRY ? '\n(dry-run：未写文件)' : `\n写出：${join(PROJ, 'audio', 'events.json')}\n      ${cuesPath}`);
