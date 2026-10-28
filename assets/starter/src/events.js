// events.js — 帧号事件：画面与声音的唯一事实源。
//
// 规则：
//   - frame 必须是整数；画面（scene.js）和声音（export-sync.mjs → cues.json）都读这份数据。
//   - 短音效 type 用程序化音色：click clack crash whoosh creak thump step ding pop…
//   - 长音/旁白/音乐不放这里，放 cues.json（可用 frame 对齐起点）。
//   - 同一帧可以既有画面事件（cut/reveal）又有声音事件，天然同步。

window.EVENTS = [
  // 氛围底噪：交给 comfy:stable_audio3 生成，按 frame 0 起
  { frame: 0, type: 'amb_start', id: 'ambience' },

  // 第一段 → 第二段：画面切点 + 音效同一帧
  { frame: 45, type: 'cut', to: 'S2' },
  { frame: 45, type: 'whoosh', pan: -0.3, gain: 0.8 },

  // 一个重音
  { frame: 120, type: 'thump', pan: 0.0, gain: 0.9 },

  // 标题出现：画面事件 + 轻脆音（视觉与声音同源）
  { frame: 180, type: 'reveal', id: 'title' },
  { frame: 180, type: 'ding', pan: 0.2, gain: 1.0 },

  // 旁白行：需要 cues.json 里手工补 backend/text，export-sync 会提示
  { frame: 210, type: 'vo', id: 'l1' },
];
