// Audio engine: sample loading, per-clip pitch/stretch (SoundTouchJS, rendered
// offline to plain AudioBuffers), transport scheduling, and WAV export.
//
// Pitch and speed are independent: `semitones` uses SoundTouch's pitch shifter,
// `rate` its tempo engine, so a sped-up call keeps its natural pitch.

import { SoundTouch, SimpleFilter, WebAudioBufferSource } from '../vendor/soundtouch.js';

let ctx = null;

export function audioContext() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ── Sample loading ──────────────────────────────────────────────

const rawBuffers = new Map(); // recordingId -> AudioBuffer
const regions = new Map();    // recordingId -> { start, end, peak, gain }

export async function loadRecording(rec) {
  if (rawBuffers.has(rec.id)) return rawBuffers.get(rec.id);
  const res = await fetch(rec.file);
  if (!res.ok) throw new Error(`Failed to load ${rec.file}: HTTP ${res.status}`);
  const arr = await res.arrayBuffer();
  const buf = await audioContext().decodeAudioData(arr);
  rawBuffers.set(rec.id, buf);
  regions.set(rec.id, computeRegion(buf));
  return buf;
}

export function getRawBuffer(recordingId) {
  return rawBuffers.get(recordingId) ?? null;
}

// Field recordings tend to have quiet ambient lead-ins/tails and wildly varying
// levels. We detect the "active" region (first/last louder-than-threshold
// window) so new clips start on the bird, not the silence — and a normalization
// gain so all samples sit at a comparable loudness in the mix.
export function getRegion(recordingId) {
  return regions.get(recordingId) ?? null;
}

function computeRegion(buf) {
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const win = Math.max(1, Math.floor(sr * 0.02));
  const nWin = Math.ceil(d.length / win);
  const winPeaks = new Float32Array(nWin);
  let peak = 0;
  for (let w = 0; w < nWin; w++) {
    let m = 0;
    const end = Math.min(d.length, (w + 1) * win);
    for (let i = w * win; i < end; i += 4) m = Math.max(m, Math.abs(d[i]));
    winPeaks[w] = m;
    if (m > peak) peak = m;
  }
  const th = peak * 0.08; // ~-22 dB below recording peak
  let first = 0;
  let last = nWin - 1;
  while (first < nWin && winPeaks[first] < th) first++;
  while (last > first && winPeaks[last] < th) last--;
  const start = Math.max(0, (first * win) / sr - 0.03);
  const end = Math.min(buf.duration, ((last + 1) * win) / sr + 0.08);
  return {
    start,
    end,
    peak,
    gain: peak > 0.001 ? Math.min(6, 0.9 / peak) : 1,
  };
}

// ── Clip processing (trim + pitch + stretch) ────────────────────

const processedCache = new Map(); // cache key -> AudioBuffer

function clipKey(clip) {
  return [clip.recordingId, clip.offset.toFixed(3), clip.duration.toFixed(3), clip.semitones, clip.rate].join('|');
}

function sliceBuffer(buf, offsetSec, durationSec, gain = 1) {
  const sr = buf.sampleRate;
  const start = Math.max(0, Math.floor(offsetSec * sr));
  const len = Math.min(buf.length - start, Math.max(1, Math.floor(durationSec * sr)));
  const out = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: len, sampleRate: sr });
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < len; i++) dst[i] = src[start + i] * gain;
  }
  return out;
}

function soundTouchRender(buf, semitones, rate) {
  const st = new SoundTouch();
  st.pitchSemitones = semitones;
  st.tempo = rate;
  const source = new WebAudioBufferSource(buf);
  const filter = new SimpleFilter(source, st);
  const CHUNK = 16384;
  const inter = new Float32Array(CHUNK * 2);
  const pieces = [];
  let total = 0;
  let frames;
  while ((frames = filter.extract(inter, CHUNK)) > 0) {
    pieces.push(inter.slice(0, frames * 2));
    total += frames;
  }
  if (total === 0) return buf;
  const out = new AudioBuffer({ numberOfChannels: 2, length: total, sampleRate: buf.sampleRate });
  const L = out.getChannelData(0);
  const R = out.getChannelData(1);
  let w = 0;
  for (const piece of pieces) {
    for (let i = 0; i < piece.length; i += 2) {
      L[w] = piece[i];
      R[w] = piece[i + 1];
      w++;
    }
  }
  return out;
}

// Returns the ready-to-play AudioBuffer for a clip (trimmed window, pitch and
// speed applied). Loads/decodes the source recording if needed.
export async function clipBuffer(clip, recordingsById) {
  const key = clipKey(clip);
  if (processedCache.has(key)) return processedCache.get(key);
  const raw = await loadRecording(recordingsById.get(clip.recordingId));
  const gain = regions.get(clip.recordingId)?.gain ?? 1;
  let buf = sliceBuffer(raw, clip.offset, clip.duration, gain);
  if (clip.semitones !== 0 || clip.rate !== 1) {
    buf = soundTouchRender(buf, clip.semitones, clip.rate);
  }
  processedCache.set(key, buf);
  return buf;
}

export async function prepareSong(song, recordingsById) {
  const jobs = [];
  for (const t of song.tracks) for (const c of t.clips) jobs.push(clipBuffer(c, recordingsById));
  await Promise.all(jobs);
}

function makeLimiter(ac) {
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -9;
  comp.knee.value = 6;
  comp.ratio.value = 16;
  comp.attack.value = 0.002;
  comp.release.value = 0.15;
  return comp;
}

// ── Transport ───────────────────────────────────────────────────

function audibleTracks(song) {
  const soloed = song.tracks.filter((t) => t.solo);
  return (soloed.length ? soloed : song.tracks.filter((t) => !t.muted));
}

class Transport {
  constructor() {
    this.playing = false;
    this.sources = [];
    this.startedAt = 0; // ctx time when playback began
    this.startPos = 0;  // song time playback began at
    this.master = null;
    this.analyser = null;
    this.onended = null;
  }

  ensureGraph() {
    const ac = audioContext();
    if (!this.master) {
      this.master = ac.createGain();
      // safety limiter — normalized samples summed across tracks can clip
      const limiter = makeLimiter(ac);
      this.analyser = ac.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.6;
      this.master.connect(limiter);
      limiter.connect(this.analyser);
      this.analyser.connect(ac.destination);
    }
  }

  async play(song, fromSec, recordingsById, duration) {
    this.stop();
    const ac = audioContext();
    this.ensureGraph();
    await prepareSong(song, recordingsById);

    const when = ac.currentTime + 0.08;
    this.startedAt = when;
    this.startPos = fromSec;
    this.playing = true;

    for (const track of audibleTracks(song)) {
      const gain = ac.createGain();
      gain.gain.value = track.volume;
      gain.connect(this.master);
      for (const clip of track.clips) {
        const buf = processedCache.get(clipKey(clip));
        if (!buf) continue;
        const clipLen = buf.duration;
        const clipEnd = clip.start + clipLen;
        if (clipEnd <= fromSec) continue;
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.connect(gain);
        const lateBy = Math.max(0, fromSec - clip.start);
        src.start(when + Math.max(0, clip.start - fromSec), lateBy);
        this.sources.push(src);
      }
    }

    // End-of-song timer (playhead-driven, not per-source, so silence at the
    // end of the arrangement still counts).
    const remaining = Math.max(0, duration - fromSec);
    this.endTimer = setTimeout(() => {
      if (this.playing) {
        this.stop();
        this.onended?.();
      }
    }, remaining * 1000 + 150);
  }

  position() {
    if (!this.playing) return this.startPos;
    return this.startPos + (audioContext().currentTime - this.startedAt);
  }

  stop() {
    clearTimeout(this.endTimer);
    for (const s of this.sources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.sources = [];
    if (this.playing) this.startPos = this.position();
    this.playing = false;
  }
}

export const transport = new Transport();

// ── Preview (library listen) ────────────────────────────────────

let previewSource = null;

export async function playPreview(rec, onended) {
  stopPreview();
  const ac = audioContext();
  transport.ensureGraph();
  const buf = await loadRecording(rec);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const gain = ac.createGain();
  gain.gain.value = regions.get(rec.id)?.gain ?? 1;
  src.connect(gain);
  gain.connect(transport.master);
  src.onended = () => {
    if (previewSource === src) previewSource = null;
    onended?.();
  };
  src.start();
  previewSource = src;
}

export function stopPreview() {
  if (previewSource) {
    try { previewSource.stop(); } catch { /* already stopped */ }
    previewSource = null;
  }
}

// ── Export ──────────────────────────────────────────────────────

export async function renderSongToWav(song, recordingsById, duration) {
  await prepareSong(song, recordingsById);
  const sr = 44100;
  const frames = Math.max(1, Math.ceil((duration + 0.25) * sr));
  const oc = new OfflineAudioContext(2, frames, sr);
  const master = oc.createGain();
  const limiter = makeLimiter(oc);
  master.connect(limiter);
  limiter.connect(oc.destination);
  for (const track of audibleTracks(song)) {
    const gain = oc.createGain();
    gain.gain.value = track.volume;
    gain.connect(master);
    for (const clip of track.clips) {
      const buf = processedCache.get(clipKey(clip));
      if (!buf) continue;
      const src = oc.createBufferSource();
      src.buffer = buf;
      src.connect(gain);
      src.start(clip.start);
    }
  }
  const rendered = await oc.startRendering();
  return encodeWav(rendered);
}

function encodeWav(buffer) {
  const numCh = 2;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bytesPerSample = 2;
  const dataSize = len * numCh * bytesPerSample;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * bytesPerSample, true);
  view.setUint16(32, numCh * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (const ch of [L, R]) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}
