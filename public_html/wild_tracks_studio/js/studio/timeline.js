// Timeline editor: ruler, tracks, clips (move/trim/drop), playhead.

import { state, beginEdit, emitChange, findClip, beatSec, snap, speciesColor } from './state.js';
import { LIMITS, newTrack, newClip, songDuration } from '../store.js';
import { loadRecording, getRawBuffer, getRegion } from '../audio.js';
import { selectRecording } from './library.js';

const HEAD_W = 190;

let playheadSec = 0;
let playheadEl = null;
let scrubbing = false;

export function getPlayhead() {
  return playheadSec;
}

export function setPlayhead(t, { scroll = false } = {}) {
  playheadSec = Math.max(0, Math.min(LIMITS.maxSongSeconds, t));
  positionPlayhead();
  if (scroll) {
    const sc = document.getElementById('timeline-scroll');
    const x = playheadSec * state.pxPerSec;
    if (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - HEAD_W - 60) {
      sc.scrollLeft = Math.max(0, x - 120);
    }
  }
}

function positionPlayhead() {
  if (playheadEl) playheadEl.style.left = `${HEAD_W + playheadSec * state.pxPerSec}px`;
  const readout = document.getElementById('time-readout');
  if (readout) {
    const m = Math.floor(playheadSec / 60);
    const s = (playheadSec % 60).toFixed(1).padStart(4, '0');
    readout.textContent = `${m}:${s}`;
  }
}

function timelineSeconds() {
  return Math.min(LIMITS.maxSongSeconds, Math.max(songDuration(state.song) + 8 * beatSec(), 40));
}

export function initTimeline() {
  document.getElementById('btn-add-track').addEventListener('click', () => {
    if (state.song.tracks.length >= LIMITS.maxTracks) return;
    beginEdit();
    state.song.tracks.push(newTrack(`Track ${state.song.tracks.length + 1}`));
    emitChange();
  });
  document.getElementById('zoom-in').addEventListener('click', () => zoom(1.4));
  document.getElementById('zoom-out').addEventListener('click', () => zoom(1 / 1.4));
}

function zoom(f) {
  state.pxPerSec = Math.max(20, Math.min(200, state.pxPerSec * f));
  renderTimeline();
}

export function renderTimeline() {
  const grid = document.getElementById('timeline-grid');
  grid.textContent = '';
  grid.style.position = 'relative';

  const px = state.pxPerSec;
  const total = timelineSeconds();
  const laneW = total * px;
  const beatPx = beatSec() * px;
  grid.style.setProperty('--beat-px', `${beatPx}px`);

  // ── ruler row ──
  const spacer = document.createElement('div');
  spacer.className = 'ruler-spacer';
  const ruler = document.createElement('div');
  ruler.className = 'ruler';
  ruler.style.width = `${laneW}px`;
  const nBeats = Math.ceil(total / beatSec());
  for (let b = 0; b <= nBeats; b += 1) {
    if (beatPx < 24 && b % 4 !== 0) continue;
    const tick = document.createElement('div');
    tick.className = 'tick' + (b % 4 === 0 ? ' bar' : '');
    tick.style.left = `${b * beatPx}px`;
    if (b % 4 === 0) tick.textContent = String(b / 4 + 1);
    ruler.appendChild(tick);
  }
  const scrubTo = (e) => {
    const rect = ruler.getBoundingClientRect();
    setPlayhead((e.clientX - rect.left) / px);
    emitChange('playhead');
  };
  ruler.addEventListener('pointerdown', (e) => {
    scrubbing = true;
    ruler.setPointerCapture(e.pointerId);
    scrubTo(e);
  });
  ruler.addEventListener('pointermove', (e) => scrubbing && scrubTo(e));
  ruler.addEventListener('pointerup', () => (scrubbing = false));
  grid.append(spacer, ruler);

  // ── track rows ──
  state.song.tracks.forEach((track, ti) => {
    grid.append(trackHead(track, ti), lane(track, laneW));
  });

  // ── playhead ──
  playheadEl = document.createElement('div');
  playheadEl.className = 'playhead';
  playheadEl.style.zIndex = '4'; // below sticky track headers
  grid.appendChild(playheadEl);
  positionPlayhead();

  document.getElementById('track-count').textContent =
    `${state.song.tracks.length}/${LIMITS.maxTracks} tracks · up to ${Math.round(LIMITS.maxSongSeconds / 60)} min`;
}

function trackHead(track, index) {
  const head = document.createElement('div');
  head.className = 'track-head';

  const row1 = document.createElement('div');
  row1.className = 'row';
  const name = document.createElement('input');
  name.className = 't-name';
  name.value = track.name;
  name.setAttribute('aria-label', 'Track name');
  name.addEventListener('change', () => {
    beginEdit();
    track.name = name.value.trim() || `Track ${index + 1}`;
    emitChange();
  });
  const del = document.createElement('button');
  del.className = 'mini-btn';
  del.textContent = '✕';
  del.title = 'Delete track';
  del.addEventListener('click', () => {
    if (track.clips.length && !confirm(`Delete “${track.name}” and its ${track.clips.length} clip(s)?`)) return;
    beginEdit();
    state.song.tracks = state.song.tracks.filter((t) => t !== track);
    emitChange();
  });
  row1.append(name, del);

  const row2 = document.createElement('div');
  row2.className = 'row';
  const solo = document.createElement('button');
  solo.className = 'mini-btn' + (track.solo ? ' on' : '');
  solo.textContent = 'S';
  solo.title = 'Solo — play only this track';
  solo.addEventListener('click', () => {
    beginEdit();
    track.solo = !track.solo;
    emitChange();
  });
  const mute = document.createElement('button');
  mute.className = 'mini-btn' + (track.muted ? ' on' : '');
  mute.textContent = 'M';
  mute.title = 'Mute this track';
  mute.addEventListener('click', () => {
    beginEdit();
    track.muted = !track.muted;
    emitChange();
  });
  const vol = document.createElement('input');
  vol.type = 'range';
  vol.min = '0';
  vol.max = '100';
  vol.value = String(Math.round(track.volume * 100));
  vol.title = 'Track volume';
  vol.setAttribute('aria-label', `${track.name} volume`);
  let volEditStarted = false;
  vol.addEventListener('input', () => {
    if (!volEditStarted) {
      beginEdit();
      volEditStarted = true;
    }
    track.volume = vol.value / 100;
  });
  vol.addEventListener('change', () => {
    volEditStarted = false;
    emitChange();
  });
  row2.append(solo, mute, vol);

  head.append(row1, row2);
  return head;
}

function lane(track, laneW) {
  const el = document.createElement('div');
  el.className = 'lane' + (track.muted ? ' muted-lane' : '');
  el.style.width = `${laneW}px`;

  el.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('text/bird-recording')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      el.classList.add('drop-hover');
    }
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-hover'));
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    el.classList.remove('drop-hover');
    const recId = e.dataTransfer.getData('text/bird-recording');
    if (!recId) return;
    const rect = el.getBoundingClientRect();
    const t = snap((e.clientX - rect.left) / state.pxPerSec);
    await addClipToTrack(track, recId, t);
  });

  for (const clip of track.clips) el.appendChild(clipEl(track, clip));
  return el;
}

export async function addClipToTrack(track, recordingId, startSec) {
  const rec = state.meta.recordingsById.get(recordingId);
  await loadRecording(rec);
  // Default the clip to the recording's active region so it starts on the
  // bird, not the ambient lead-in.
  const region = getRegion(recordingId);
  const dur = Math.max(0.1, region.end - region.start);
  beginEdit();
  const clip = newClip(recordingId, Math.min(startSec, LIMITS.maxSongSeconds - dur), dur);
  clip.offset = region.start;
  track.clips.push(clip);
  state.selectedClipId = clip.id;
  selectRecording(recordingId);
  emitChange();
  return clip;
}

function clipEl(track, clip) {
  const rec = state.meta.recordingsById.get(clip.recordingId);
  const sp = state.meta.speciesById.get(rec.speciesId);
  const px = state.pxPerSec;
  const lenSec = clip.duration / clip.rate;

  const el = document.createElement('div');
  el.className = 'clip' + (clip.id === state.selectedClipId ? ' selected' : '');
  el.dataset.clipId = clip.id;
  el.style.left = `${clip.start * px}px`;
  el.style.width = `${Math.max(14, lenSec * px)}px`;
  el.style.background = speciesColor(rec.speciesId);

  const wave = document.createElement('canvas');
  el.appendChild(wave);
  drawWaveform(wave, clip);

  const label = document.createElement('div');
  label.className = 'clip-label';
  label.textContent = sp.commonName;
  el.appendChild(label);

  const edgeL = document.createElement('div');
  edgeL.className = 'edge l';
  const edgeR = document.createElement('div');
  edgeR.className = 'edge r';
  el.append(edgeL, edgeR);

  el.addEventListener('pointerdown', (e) => {
    state.selectedClipId = clip.id;
    selectRecording(clip.recordingId);
    const mode = e.target === edgeL ? 'trim-l' : e.target === edgeR ? 'trim-r' : 'move';
    startClipGesture(e, el, track, clip, mode);
    emitChange('selection');
  });

  return el;
}

function startClipGesture(e, el, track, clip, mode) {
  e.preventDefault();
  el.setPointerCapture(e.pointerId);
  const px = state.pxPerSec;
  const startX = e.clientX;
  const orig = { start: clip.start, offset: clip.offset, duration: clip.duration };
  const raw = getRawBuffer(clip.recordingId);
  const srcTotal = raw ? raw.duration : clip.offset + clip.duration;
  let edited = false;

  const onMove = (ev) => {
    const dt = (ev.clientX - startX) / px;
    if (!edited && Math.abs(dt) * px > 3) {
      beginEdit();
      edited = true;
    }
    if (!edited) return;

    if (mode === 'move') {
      clip.start = snap(Math.max(0, Math.min(orig.start + dt, LIMITS.maxSongSeconds - clip.duration / clip.rate)));
    } else if (mode === 'trim-l') {
      // dt in timeline seconds → source seconds via rate
      const dSrc = Math.max(-orig.offset, Math.min(snapSrc(dt * clip.rate), orig.duration - 0.05));
      clip.offset = orig.offset + dSrc;
      clip.duration = orig.duration - dSrc;
      clip.start = orig.start + dSrc / clip.rate;
    } else {
      const dSrc = Math.max(0.05 - orig.duration, Math.min(snapSrc(dt * clip.rate), srcTotal - orig.offset - orig.duration));
      clip.duration = orig.duration + dSrc;
    }
    // cheap live update: reposition/resize this clip only
    el.style.left = `${clip.start * px}px`;
    el.style.width = `${Math.max(14, (clip.duration / clip.rate) * px)}px`;
  };

  const onUp = () => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    if (edited) emitChange();
  };

  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}

// Trims snap to a fine grid (1/8 beat in source time) so tiny chops are possible.
function snapSrc(t) {
  const g = beatSec() / 8;
  return Math.round(t / g) * g;
}

function drawWaveform(canvas, clip) {
  const render = () => {
    const raw = getRawBuffer(clip.recordingId);
    if (!raw) return false;
    const dpr = devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    const data = raw.getChannelData(0);
    const sr = raw.sampleRate;
    const from = Math.floor(clip.offset * sr);
    const to = Math.min(data.length, Math.floor((clip.offset + clip.duration) * sr));
    const span = Math.max(1, to - from);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    const mid = h / 2;
    // normalize display to the window's own peak so quiet recordings still read
    let winPeak = 0;
    const scanStep = Math.max(1, Math.floor(span / 4000));
    for (let i = from; i < to; i += scanStep) winPeak = Math.max(winPeak, Math.abs(data[i] ?? 0));
    const scale = winPeak > 0.001 ? 0.92 / winPeak : 1;
    for (let x = 0; x < w; x++) {
      const a = from + Math.floor((x / w) * span);
      const b = from + Math.floor(((x + 1) / w) * span);
      let peak = 0;
      const step = Math.max(1, Math.floor((b - a) / 24));
      for (let i = a; i < b; i += step) peak = Math.max(peak, Math.abs(data[i] ?? 0));
      const barH = Math.max(1, Math.min(1, peak * scale) * (h * 0.82));
      g.fillRect(x, mid - barH / 2, 1, barH);
    }
    return true;
  };
  // Buffer may not be decoded yet (first drop does it async).
  if (!render()) {
    loadRecording(state.meta.recordingsById.get(clip.recordingId)).then(() => requestAnimationFrame(render));
  }
}
