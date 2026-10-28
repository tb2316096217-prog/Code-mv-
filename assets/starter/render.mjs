#!/usr/bin/env node
// render.mjs — frame-accurate renderer for code-drawn music videos.
//
//   node render.mjs --sheet=0.5,2.2,4.8 [--cols=3] [--w=640] --out=out/check/sheet.jpg
//   node render.mjs --stills=1,2,3 --out=out/stills
//   node render.mjs --clip=0:8 --out=out/clip.mp4 [--audio=assets/song.mp3]
//   node render.mjs --frames=0:24 [--workers=3]
//   node render.mjs --encode --out=out/mv.mp4 [--audio=assets/song.mp3]
//
// Zero dependencies: it serves the project over http, drives one headless Chrome
// over the DevTools protocol, asks the page for a PNG/JPEG of any time t, and
// pipes the frames into ffmpeg. Every frame is a pure function of t, so frames
// can be rendered in any order and a crashed render can be resumed.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, renameSync, readdirSync } from 'node:fs';
import { extname, join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const ROOT = process.cwd();
const OUT = args.out || 'out';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ---------------------------------------------------------------- static server
function startServer() {
  const server = createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p.endsWith('/')) p += 'studio.html';
    const file = resolve(join(ROOT, p));
    if (!file.startsWith(resolve(ROOT))) { res.writeHead(403).end('forbidden'); return; }
    if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// ---------------------------------------------------------------- chrome + cdp
function findChrome() {
  const candidates = [args.chrome, process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find((c) => c && existsSync(c));
}

async function launchChrome() {
  const exe = findChrome();
  if (!exe) throw new Error('Chrome not found — pass --chrome=<path to chrome.exe>');
  const profile = join(tmpdir(), `code-mv-chrome-${process.pid}`);
  const child = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--mute-audio', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', '--window-size=1920,1080',
    '--ignore-gpu-blocklist', '--enable-gpu-rasterization', 'about:blank'], { stdio: 'ignore' });
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200; i++) {
    if (existsSync(portFile)) {
      const txt = readFileSync(portFile, 'utf8').split('\n');
      if (txt[0]) return { child, port: +txt[0], exe };
    }
    await sleep(100);
  }
  child.kill();
  throw new Error('Chrome did not expose a debugging port');
}

async function connect(port) {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = () => bad(new Error('cannot open devtools websocket')); });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, bad } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) bad(new Error(`${msg.error.message}${msg.error.data ? ' — ' + msg.error.data : ''}`));
      else ok(msg.result);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, bad) => {
    const i = ++id;
    pending.set(i, { ok, bad });
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  return { send, close: () => ws.close() };
}

async function openPage(cdp, url, { width = 1920, height = 1080 } = {}) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const page = { sessionId };
  page.send = (m, p) => cdp.send(m, p, sessionId);
  const evaluate = async (expression) => {
    const r = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  page.evaluate = evaluate;
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  page.send('Runtime.consoleAPICalled').catch(() => {});
  await page.send('Page.navigate', { url });
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try { if (await evaluate('window.ready === true')) return page; } catch { /* still loading */ }
    await sleep(100);
  }
  throw new Error('page never became ready (window.ready) — check console errors');
}

const dataOf = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
const frame = async (page, t, mime = 'image/jpeg', q = 0.92) => dataOf(await page.evaluate(`window.renderAt(${t}, ${JSON.stringify(mime)}, ${q})`));
const timesOf = (s) => String(s).split(',').map(Number);

// ---------------------------------------------------------------- ffmpeg
function ffmpeg(a, opts = {}) {
  const p = spawn('ffmpeg', a, { stdio: ['pipe', 'inherit', 'inherit'], ...opts });
  p.done = new Promise((ok, bad) => p.on('close', (c) => (c ? bad(new Error('ffmpeg exited ' + c)) : ok())));
  return p;
}

// ---------------------------------------------------------------- main
const server = await startServer();
const url = `http://127.0.0.1:${server.address().port}/studio.html?render`;
const chrome = await launchChrome();
const cdp = await connect(chrome.port);
const page = await openPage(cdp, url);
const cfg = await page.evaluate('window.CONFIG');
const fps = +(args.fps || cfg.fps || 30);
const duration = +(args.duration || cfg.duration);
const audio = args.audio || cfg.audio;
log(`ready — ${cfg.width}x${cfg.height} @ ${fps}fps, ${duration}s${audio ? ', audio ' + audio : ''}`);

try {
  if (args.sheet) {
    const out = args.out || 'out/sheet.jpg';
    mkdirSync(dirname(out), { recursive: true });
    const { url: data, ms } = await page.evaluate(`window.renderSheet(${JSON.stringify(timesOf(args.sheet))}, ${+(args.cols || 3)}, ${+(args.w || 640)})`);
    writeFileSync(out, dataOf(data));
    log(`${out}  ms/frame: ${ms.map((m) => m.toFixed(0)).join(' ')}`);
  } else if (args.stills) {
    const out = args.out || 'out/stills';
    mkdirSync(out, { recursive: true });
    for (const t of timesOf(args.stills)) {
      const t0 = Date.now();
      // JPEG by default: a photographic 1080p PNG over the devtools socket can
      // exceed the websocket frame limit and stall the call. `--png` opts in.
      const png = !!args.png;
      const f = `${out}/t${t.toFixed(2).replace('.', '_')}.${png ? 'png' : 'jpg'}`;
      writeFileSync(f, await frame(page, t, png ? 'image/png' : 'image/jpeg', 0.95));
      log(`${f}  ${Date.now() - t0} ms`);
    }
  } else if (args.frames) {
    const [a, b] = String(args.frames).split(':').map(Number);
    const dir = join(OUT, 'frames');
    mkdirSync(dir, { recursive: true });
    const workers = Math.max(1, +(args.workers || 1));
    const first = Math.round(a * fps);
    const last = Math.min(Math.ceil((b || duration) * fps) - 1, Math.round((b || duration) * fps) - 1);
    const todo = [];
    for (let i = first; i <= last; i++) {
      const f = join(dir, `f${String(i).padStart(5, '0')}.jpg`);
      if (!existsSync(f) || statSync(f).size < 1000) todo.push(i);
    }
    log(`${todo.length} frames to render (${last - first + 1 - todo.length} already done), ${workers} worker(s)`);
    const pages = [page];
    for (let w = 1; w < workers; w++) pages.push(await openPage(cdp, url));
    let next = 0, done = 0;
    const start = Date.now();
    await Promise.all(pages.map(async (p) => {
      while (next < todo.length) {
        const i = todo[next++];
        const f = join(dir, `f${String(i).padStart(5, '0')}.jpg`);
        writeFileSync(f + '.tmp', await frame(p, i / fps));
        renameSync(f + '.tmp', f);
        done++;
        if (done % 24 === 0 || done === todo.length) {
          const el = (Date.now() - start) / 1000;
          log(`frame ${done}/${todo.length}  ${(el / done * 1000).toFixed(0)} ms/frame  eta ${((todo.length - done) * el / done / 60).toFixed(1)} min`);
        }
      }
    }));
  } else if (args.encode) {
    const dir = join(OUT, 'frames');
    const n = readdirSync(dir).filter((f) => f.endsWith('.jpg')).length;
    if (!n) throw new Error('no frames in ' + dir + ' — run --frames first');
    const out = args.out || join(OUT, 'mv.mp4');
    log(`encoding ${n} frames → ${out}`);
    const a = ['-y', '-loglevel', 'error', '-stats', '-framerate', String(fps), '-i', join(dir, 'f%05d.jpg'), ...(audio ? ['-i', audio] : []),
      ...(audio ? ['-map', '0:v', '-map', '1:a'] : []), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', ...(audio ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []), out];
    await ffmpeg(a).done;
    log('wrote ' + out);
  } else {
    const [a, b] = args.clip ? String(args.clip).split(':').map(Number) : [0, duration];
    const out = args.out || join(OUT, 'clip.mp4');
    mkdirSync(dirname(out), { recursive: true });
    const ff = ffmpeg(['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      ...(audio ? ['-ss', String(a), '-t', String(b - a), '-i', audio] : []),
      ...(audio ? ['-map', '0:v', '-map', '1:a'] : []), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
      ...(audio ? ['-c:a', 'aac', '-b:a', '192k'] : []), '-shortest', out]);
    const n = Math.round((b - a) * fps);
    const start = Date.now();
    for (let i = 0; i < n; i++) {
      const buf = await frame(page, a + i / fps);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % 30 === 0 || i === n - 1) log(`frame ${i + 1}/${n}  ${((Date.now() - start) / (i + 1)).toFixed(0)} ms/frame  ${out}`);
    }
    ff.stdin.end();
    await ff.done;
    log(`wrote ${out}  (${((Date.now() - start) / 1000).toFixed(1)}s)`);
  }
} finally {
  try { await cdp.send('Browser.close'); } catch { /* already gone */ }
  cdp.close();
  server.close();
  try { chrome.child.kill(); } catch { /* noop */ }
}
