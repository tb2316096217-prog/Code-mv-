// config.js — 渲染器唯一读取的时间配置。
// duration × fps 取整；duration 尽量取整小节。
window.CONFIG = {
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 24,          // 秒；演示音轨 24 s
  bpm: 100,
  audio: 'assets/demo.wav', // make-audio.mjs 生成；最终用 audio/mix.wav
  title: 'Untitled',
};
