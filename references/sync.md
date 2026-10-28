# Sync: song, LRC, beat grid

The picture is generated; the clock comes from the song. Get this right and a simple scene feels professional; get it wrong and no amount of design saves it.

## 1. Know the tempo before designing

Everything in a lyric video hangs off bars. One bar = 4 beats = `240 / bpm` seconds.

| BPM | beat | bar (4/4) | 8 bars |
|---|---|---|---|
| 90 | 0.667 s | 2.667 s | 21.3 s |
| 100 | 0.600 s | 2.400 s | 19.2 s |
| 120 | 0.500 s | 2.000 s | 16.0 s |
| 128 | 0.469 s | 1.875 s | 15.0 s |

Choose `CONFIG.duration` as a whole number of bars. A 24 s piece at 100 BPM is exactly 10 bars; that is why the demo feels resolved when it ends.

If the user knows the BPM, use it. If not, measure it from the audio:

```bash
ffmpeg -v error -i song.mp3 -ac 1 -ar 22050 -f f32le song.f32
```

Then in Node, compute a short-time energy envelope (20 ms hop), take the positive first difference (onset strength), and autocorrelate over 60鈥?00 BPM; the peak lag gives the tempo. Snap the result to a whole BPM and **check it by ear** against the first kick before trusting it. Never guess silently 鈥?print the detected BPM and say it is an estimate.

## 2. LRC

Standard format:

```
[ti:涓€甯т竴甯
[ar:someone]
[offset:+120]          鈫?milliseconds, positive means lyrics later
[00:04.80]鎶婃暣鐗囧 鍐欒繘涓€琛屼唬鐮?[00:09.60]鐏寒璧锋潵 鏄熸槦寮€濮嬬紪璇?[00:14.40]涓€甯т竴甯?涓栫晫鎱㈡參鎴愬舰
```

Parse into `{ t, text }[]` in the page or in Node:

```js
const lines = text.split(/\r?\n/).flatMap((row) => {
  const stamps = [...row.matchAll(/\[(\d{2}):(\d{2}(?:\.\d+)?)\]/g)];
  const body = row.replace(/\[[^\]]*\]/g, '').trim();
  return stamps.length && body
    ? [{ t: +stamps.at(-1)[1] * 60 + +stamps.at(-1)[2], text: body }]
    : [];
});
```

Rules that keep timing honest:

- Treat the **LRC as the source of truth**; do not re-time lines by eye.
- `offset` is in milliseconds and applies to every line.
- A line is usually visible from `t` until about 0.2 s before the next line. Do not hold past the next cue.
- Leave a 0.3鈥?.5 s fade-out before the next line starts; two lines overlapping reads as a bug.

## 3. Beat grid in the scene

```js
const beat = (t * BPM) / 60;
const bar = Math.floor(beat / 4);
const kick = U.kick(t, BPM, 0.22);      // 1 on the beat, decays
const onBar = Math.abs(beat % 4) < 0.02; // use for cuts, not for flashes
```

Guideline: **cut on bars, accent on beats, animate continuously underneath.** If every element flashes on every beat the eye stops reading anything.

## 4. Word-level karaoke (optional)

For a real karaoke look you need per-word timing, which LRC does not give. Two honest options:

1. **Hand-author it** 鈥?extend the line object with `words: [{ w, t }, 鈥` and reveal each word at its own `t`. Fine for a few lines, accurate to whatever you type.
2. **Forced alignment** 鈥?run the vocal through a speech aligner (WhisperX / Montreal forced aligner) and export `{ word, start, end }`. Heavier, but exact.

Do not fake word timing by dividing the line evenly across its duration: it drifts audibly against sustained notes.

## 5. Audio in ffmpeg

```bash
# loudness-normalise the delivered track to streaming-ish level (do this once, before rendering)
ffmpeg -i song.mp3 -af loudnorm=I=-14:TP=-1.5:LRA=11 -ar 48000 -c:a aac -b:a 192k song.norm.m4a

# fade in/out for the film
ffmpeg -i song.norm.m4a -af "afade=t=in:st=0:d=0.4,afade=t=out:st=22.5:d=1.5" song.cut.m4a

# check for silence / clipping
ffmpeg -hide_banner -i out/mv.mp4 -af volumedetect -f null -    # look at mean_volume / max_volume
```

`render.mjs` muxes with `-shortest`, so a track longer than the picture is trimmed to the video. If the audio is shorter than the video, the tail is silent 鈥?trim `CONFIG.duration` to the music instead of padding it.

## 6. Verify before delivering

```bash
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate -of default=nw=1 out/mv.mp4
ffmpeg -y -loglevel error -ss 8 -i out/mv.mp4 -frames:v 1 out/check/deliver.png
```

Both streams should report the same duration (卤0.05 s). Open `deliver.png` 鈥?it is the file the user will actually get, not the canvas.
