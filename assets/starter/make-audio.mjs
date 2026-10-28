// make-audio.mjs — a small synth so a demo MV needs no external assets.
// Writes assets/demo.wav: 24 s, 100 BPM, A minor, 48 kHz stereo.
// Swap in your own song + LRC and delete this file; nothing else depends on it.

import { writeFileSync, mkdirSync } from 'node:fs';

const SR = 48000;
const BPM = 100;
const BEAT = 60 / BPM;      // 0.6 s
const BAR = BEAT * 4;       // 2.4 s
const DUR = 24;
const N = Math.round(SR * DUR);
const L = new Float32Array(N);
const R = new Float32Array(N);

let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

function add(i, v, pan = 0) {
  if (i < 0 || i >= N) return;
  const p = ((pan + 1) * Math.PI) / 4;
  L[i] += v * Math.cos(p);
  R[i] += v * Math.sin(p);
}

const hz = (n) => 440 * Math.pow(2, (n - 69) / 12); // midi -> Hz
const A1 = hz(33), F1 = hz(29), C2 = hz(36), G1 = hz(31);

const CHORDS = [
  { root: A1, notes: [hz(57), hz(60), hz(64)], arp: [hz(69), hz(72), hz(76), hz(79)] }, // Am
  { root: F1, notes: [hz(53), hz(57), hz(60)], arp: [hz(65), hz(69), hz(72), hz(77)] }, // F
  { root: C2, notes: [hz(48), hz(52), hz(55)], arp: [hz(60), hz(64), hz(67), hz(72)] }, // C
  { root: G1, notes: [hz(55), hz(59), hz(62)], arp: [hz(67), hz(71), hz(74), hz(79)] }, // G
  { root: A1, notes: [hz(57), hz(60), hz(64)], arp: [hz(69), hz(72), hz(76), hz(79)] }, // Am
];
const chordAt = (t) => CHORDS[Math.min(4, Math.floor(t / (BAR * 2)))];

// ------------------------------------------------------------------ drums
function kick(t0) {
  let ph = 0;
  for (let i = 0, n = SR * 0.38; i < n; i++) {
    const tt = i / SR;
    const env = Math.exp(-tt * 8.5) * Math.min(1, tt / 0.002);
    const f = 46 + 120 * Math.exp(-tt * 32);
    ph += (2 * Math.PI * f) / SR;
    add(t0 * SR + i, Math.tanh(Math.sin(ph) * 1.6) * env * 0.85);
  }
}
function snare(t0) {
  let prev = 0;
  for (let i = 0, n = SR * 0.24; i < n; i++) {
    const tt = i / SR;
    const env = Math.exp(-tt * 22);
    const w = rnd() * 2 - 1;
    const hp = w - prev * 0.7; prev = w;
    add(t0 * SR + i, (hp * 0.42 + Math.sin(2 * Math.PI * 190 * tt) * 0.18) * env, 0.1);
  }
}
function hat(t0, open = false) {
  let prev = 0;
  for (let i = 0, n = SR * (open ? 0.22 : 0.07); i < n; i++) {
    const tt = i / SR;
    const w = rnd() * 2 - 1;
    const hp = w - prev; prev = w;
    add(t0 * SR + i, hp * Math.exp(-tt * (open ? 18 : 70)) * 0.16, -0.25);
  }
}

// ------------------------------------------------------------------ tonal
function bass(t0, f, dur) {
  let ph = 0, lp = 0;
  for (let i = 0, n = SR * dur; i < n; i++) {
    const tt = i / SR;
    ph = (ph + f / SR) % 1;
    const saw = ph * 2 - 1;
    lp += 0.045 * (saw - lp);
    const env = Math.min(1, tt / 0.006) * Math.exp(-tt * 2.4);
    add(t0 * SR + i, Math.tanh(lp * 1.4) * env * 0.5);
  }
}
function pad(t0, freqs, dur) {
  for (const f of freqs) {
    for (const det of [-0.11, 0, 0.11]) {
      let ph = 0, lp = 0;
      const pan = det * 3;
      for (let i = 0, n = SR * dur; i < n; i++) {
        const tt = i / SR;
        ph = (ph + (f * (1 + det * 0.008)) / SR) % 1;
        lp += 0.02 * (ph * 2 - 1 - lp);
        const a = Math.min(1, tt / 0.9) * Math.min(1, (dur - tt) / 1.1);
        add(t0 * SR + i, lp * a * 0.10, pan);
      }
    }
  }
}
function pluck(t0, f, dur = 0.9) {
  for (let i = 0, n = SR * dur; i < n; i++) {
    const tt = i / SR;
    const env = Math.min(1, tt / 0.004) * Math.exp(-tt * 9);
    const v = Math.sin(2 * Math.PI * f * tt) + 0.35 * Math.sin(2 * Math.PI * f * 2 * tt) + 0.12 * Math.sin(2 * Math.PI * f * 3 * tt);
    add(t0 * SR + i, v * env * 0.085, Math.sin(f) * 0.4);
  }
}

// ------------------------------------------------------------------ arrange
const totalBars = Math.floor(DUR / BAR);
for (let bar = 0; bar < totalBars; bar++) {
  const t0 = bar * BAR;
  const ch = chordAt(t0);
  const drums = bar >= 1 && bar < totalBars - 1;

  pad(t0, ch.notes, BAR + 0.6);

  // arpeggio: 16ths
  for (let s = 0; s < 16; s++) {
    if (bar === 0 && s < 8) continue;
    const idx = [0, 1, 2, 3, 2, 1, 3, 2][s % 8];
    pluck(t0 + (s * BAR) / 16, ch.arp[idx] * (s % 8 === 7 ? 2 : 1), 0.8);
  }

  if (drums) {
    for (let b = 0; b < 4; b++) {
      kick(t0 + b * BEAT);
      if (b % 2 === 1) snare(t0 + b * BEAT);
      hat(t0 + b * BEAT + BEAT / 2, b === 3);
      hat(t0 + b * BEAT, false);
    }
    for (let e = 0; e < 8; e++) {
      const tt = t0 + (e * BEAT) / 2;
      const oct = e === 5 ? 2 : 1;
      bass(tt, ch.root * oct, 0.3);
    }
  }
}

// ping-pong echo on the arps
for (let i = 0; i < N; i++) {
  const d = Math.round(0.45 * SR);
  if (i >= d) { L[i] += R[i - d] * 0.22; R[i] += L[i - d] * 0.2; }
}

// ------------------------------------------------------------------ master
let peak = 0;
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, i / (SR * 0.6), (N - i) / (SR * 1.6));
  L[i] = Math.tanh(L[i] * 1.15) * fade;
  R[i] = Math.tanh(R[i] * 1.15) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const gain = 0.89 / (peak || 1);

mkdirSync('assets', { recursive: true });
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, (L[i] * gain * 32767) | 0)), 44 + i * 4);
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, (R[i] * gain * 32767) | 0)), 46 + i * 4);
}
writeFileSync('assets/demo.wav', buf);
console.log(`assets/demo.wav  ${DUR}s  ${BPM} BPM  peak ${(peak * gain).toFixed(2)}`);
