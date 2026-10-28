#!/usr/bin/env node
// check-cues.mjs — 声音时间线自检：cue 重叠、旁白语音窗口、起播一致性。
//
//   node scripts/check-cues.mjs <project-dir> [--stems audio/stems] [--warn-only]
//
// 检查：
//   1. 旁白×旁白：用 words.json 的语音窗口（没有则用 stem 长度），重叠 > --voice-overlap（默认 0.30s）→ FAIL
//   2. 音乐×音乐：重叠 > 0.05s 且没有声明 crossfade ≥ 重叠 → FAIL（交叉淡化必须显式声明）
//   3. 氛围×氛围：同上
//   4. 音效×音效：只 WARN（章/撞击这类叠加是设计内的）
//   5. start / start_sample 不一致 → FAIL
//   6. cue 超出片长、负起点 → WARN / FAIL
//
// 写出 <project>/audio/timeline-check.json；默认有 FAIL 时 exit 1（--warn-only 则 exit 0）。
// 说明：这是"重叠"检查，不是"对位"检查——样本级对位见 sync_audit.py。

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const WARN_ONLY = argv.includes('--warn-only');
const projArg = argv.find(a => !a.startsWith('--'));
if (!projArg) { console.error('usage: node check-cues.mjs <project-dir> [--stems audio/stems] [--warn-only]'); process.exit(1); }
const PROJ = resolve(projArg);
const stemsArg = argv.includes('--stems') ? argv[argv.indexOf('--stems') + 1] : join(PROJ, 'audio', 'stems');
const STEMS = resolve(stemsArg);
const VOICE_OVERLAP = Number((argv.includes('--voice-overlap') ? argv[argv.indexOf('--voice-overlap') + 1] : 0.30));

const cuesPath = join(PROJ, 'cues.json');
if (!existsSync(cuesPath)) { console.error('找不到 ' + cuesPath); process.exit(1); }
const doc = JSON.parse(readFileSync(cuesPath, 'utf8').replace(/^\uFEFF/, ''));
const fps = Number(doc.fps || 30);
const SR = Number(doc.sample_rate || 48000);
const DUR = Number(doc.duration || 0);

// ── 读 WAV 时长（不依赖第三方库） ───────────────────────────────────────
function wavDuration(path) {
  try {
    const b = readFileSync(path);
    if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return null;
    let off = 12, byteRate = 0, dataSize = 0;
    while (off + 8 <= b.length) {
      const id = b.toString('ascii', off, off + 4);
      const size = b.readUInt32LE(off + 4);
      if (id === 'fmt ' && off + 16 <= b.length) byteRate = b.readUInt32LE(off + 16);
      if (id === 'data') { dataSize = size; break; }
      off += 8 + size + (size & 1);
    }
    return byteRate > 0 ? dataSize / byteRate : null;
  } catch { return null; }
}

function readWords() {
  const p = join(STEMS, 'words.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}
const words = readWords();

const cues = (doc.cues || []).filter(c => typeof c.start === 'number');
const rows = cues.map((c) => {
  const stem = join(STEMS, `${c.id}.wav`);
  const stemDur = existsSync(stem) ? wavDuration(stem) : null;
  const dur = stemDur ?? (typeof c.seconds === 'number' ? c.seconds : null);
  let speech = null;
  if (words && Array.isArray(words[c.id]) && words[c.id].length) {
    const ws = words[c.id];
    // words.json 的时间已减去 0.6s pad，首个词可能为负；语音不可能早于 cue 起点，夹到 0
    const s0 = Math.max(0, Math.min(...ws.map(w => w[1])));
    const s1 = Math.max(0, Math.max(...ws.map(w => w[2])));
    speech = { start: c.start + s0, end: c.start + s1 };
  }
  return {
    id: c.id, kind: c.kind, backend: c.backend,
    start: c.start, dur, end: dur == null ? null : c.start + dur,
    speech, crossfade: Number(c.crossfade || (c.conform && c.conform.crossfade) || 0),
    cue: c,
  };
});

const fails = [], warns = [];
const overlap = (a, b) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
const win = (r) => r.speech ? [r.speech.start, r.speech.end] : (r.end == null ? null : [r.start, r.end]);

// 1) voice × voice（优先用语音窗口）
for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
  const a = rows[i], b = rows[j];
  if (a.kind !== 'voice' || b.kind !== 'voice') continue;
  const wa = win(a), wb = win(b); if (!wa || !wb) continue;
  const ov = overlap(wa, wb);
  if (ov > VOICE_OVERLAP) fails.push({ rule: 'voice-overlap', a: a.id, b: b.id, overlap: +ov.toFixed(3), detail: `${a.id} 语音 [${wa[0].toFixed(2)}–${wa[1].toFixed(2)}] × ${b.id} [${wb[0].toFixed(2)}–${wb[1].toFixed(2)}]` });
}

// 2/3) music × music, ambience × ambience
for (const kind of ['music', 'ambience']) {
  const list = rows.filter(r => r.kind === kind);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.end == null || b.end == null) continue;
    const ov = overlap([a.start, a.end], [b.start, b.end]);
    if (ov <= 0.05) continue;
    const declared = Math.max(a.crossfade || 0, b.crossfade || 0);
    if (declared >= ov) continue;
    fails.push({ rule: kind + '-overlap', a: a.id, b: b.id, overlap: +ov.toFixed(3), detail: `${a.id} [${a.start.toFixed(2)}–${a.end.toFixed(2)}] × ${b.id} [${b.start.toFixed(2)}–${b.end.toFixed(2)}]，且未声明 crossfade ≥ ${ov.toFixed(2)}s` });
  }
}

// 4) 音效重叠只提示
const sfx = rows.filter(r => r.kind === 'sfx' && r.end != null);
for (let i = 0; i < sfx.length; i++) for (let j = i + 1; j < sfx.length; j++) {
  const a = sfx[i], b = sfx[j];
  const ov = overlap([a.start, a.end], [b.start, b.end]);
  if (ov > 0.05) warns.push({ rule: 'sfx-overlap (intentional cluster?)', a: a.id, b: b.id, detail: `+${ov.toFixed(2)}s` });
}

// 5) start_sample 一致性（只在 cue 明确带 start_sample 时检查；音乐/旁白可只写 start）
for (const r of rows) {
  const c = r.cue;
  if (c.start_sample == null) continue;
  const calc = Math.round(c.start * SR);
  if (Math.abs(calc - c.start_sample) > 1) fails.push({ rule: 'start_sample-mismatch', cue: r.id, detail: `start_sample=${c.start_sample} vs round(start×sr)=${calc}` });
}

// 6) 越界
for (const r of rows) {
  if (r.start < 0) fails.push({ rule: 'negative-start', cue: r.id });
  if (DUR && r.speech && r.speech.end > DUR + 0.05) fails.push({ rule: 'voice-beyond-duration', cue: r.id, detail: `语音到 ${r.speech.end.toFixed(2)}s > 片长 ${DUR}s` });
  else if (DUR && r.end != null && r.kind === 'voice' && r.end > DUR + 0.05) warns.push({ rule: 'voice-stem-beyond-duration', cue: r.id, detail: `${r.end.toFixed(2)}s > ${DUR}s（含尾巴静音可接受）` });
}

// 报告
const report = { project: PROJ, fps, sample_rate: SR, duration: DUR, voiceOverlapThreshold: VOICE_OVERLAP, fails, warns, cues: rows.map(({ cue, ...rest }) => rest) };
writeFileSync(join(PROJ, 'audio', 'timeline-check.json'), JSON.stringify(report, null, 2));

console.log(`cue 时间线检查：${PROJ}`);
console.log(`cue ${rows.length} 个（voice ${rows.filter(r => r.kind === 'voice').length} / music ${rows.filter(r => r.kind === 'music').length} / sfx ${rows.filter(r => r.kind === 'sfx').length} / ambience ${rows.filter(r => r.kind === 'ambience').length}）`);
console.log(`旁白重叠阈值 ${VOICE_OVERLAP}s；音乐/氛围重叠 >0.05s 需显式 crossfade\n`);
console.log(`${'id'.padEnd(24)} ${'kind'.padEnd(9)} ${'start'.padStart(7)} ${'end'.padStart(7)}  语音窗口`);
for (const r of rows) {
  const sp = r.speech ? `[${r.speech.start.toFixed(2)}–${r.speech.end.toFixed(2)}]` : '';
  console.log(`${r.id.padEnd(24)} ${String(r.kind).padEnd(9)} ${r.start.toFixed(2).padStart(7)} ${(r.end == null ? '?' : r.end.toFixed(2)).padStart(7)}  ${sp}`);
}
if (fails.length) { console.log('\nFAIL:'); for (const f of fails) console.log('  ✗ ' + (f.detail || `${f.rule}: ${f.a || f.cue}`)); }
if (warns.length) { console.log('\nWARN:'); for (const w of warns) console.log('  ! ' + (w.detail ? `${w.rule}: ${w.a} × ${w.b} ${w.detail}` : `${w.rule}: ${w.cue || w.a}`)); }
console.log(`\nFAIL ${fails.length} · WARN ${warns.length} · 报告 audio/timeline-check.json`);
if (fails.length && !WARN_ONLY) process.exit(1);
