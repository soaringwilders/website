// Live spectrogram + "now singing" species readout (requirements §6).
// Bird calls are visually striking as spectrograms — frequency on the Y axis,
// time scrolling left, intensity mapped to the theme's amber accent.

import { state } from './state.js';
import { transport } from '../audio.js';
import { previewingSpecies } from './library.js';
import { getPlayhead } from './timeline.js';

let canvas, g, freq;

export function initViz() {
  canvas = document.getElementById('spectrogram');
  g = canvas.getContext('2d');
  sizeCanvas();
  addEventListener('resize', sizeCanvas);
  requestAnimationFrame(tick);
}

function sizeCanvas() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(130 * dpr);
  g.fillStyle = bgColor();
  g.fillRect(0, 0, canvas.width, canvas.height);
}

function bgColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f4f6f8';
}

const COL_W = 2;

function tick() {
  requestAnimationFrame(tick);
  if (!transport.analyser) {
    // nothing routed yet — keep canvas at theme background
    g.fillStyle = bgColor();
    g.fillRect(0, 0, canvas.width, canvas.height);
    updateNowPlaying();
    return;
  }
  const an = transport.analyser;
  if (!freq || freq.length !== an.frequencyBinCount) freq = new Uint8Array(an.frequencyBinCount);
  an.getByteFrequencyData(freq);

  // scroll left
  g.drawImage(canvas, -COL_W, 0);
  g.fillStyle = bgColor();
  g.fillRect(canvas.width - COL_W, 0, COL_W, canvas.height);

  // draw newest column; show 0–12 kHz (where bird sound lives)
  const nyquist = transport.analyser.context.sampleRate / 2;
  const maxBin = Math.min(freq.length - 1, Math.floor((12000 / nyquist) * freq.length));
  const h = canvas.height;
  const dark = isDarkBg();
  for (let y = 0; y < h; y++) {
    const bin = Math.floor(((h - 1 - y) / h) * maxBin);
    const v = freq[bin] / 255;
    if (v < 0.06) continue;
    g.fillStyle = heat(v, dark);
    g.fillRect(canvas.width - COL_W, y, COL_W, 1);
  }
  updateNowPlaying();
}

function isDarkBg() {
  const bg = bgColor();
  // parse leading channel of #rrggbb; dark theme bg is #1e2228
  return bg.startsWith('#') && parseInt(bg.slice(1, 3), 16) < 100;
}

// Amber heat ramp with real contrast against the theme background:
// light mode louder = darker/more saturated, dark mode louder = brighter.
function heat(v, dark) {
  const t = Math.min(1, (v - 0.06) / 0.94);
  if (dark) return `hsl(45, ${40 + t * 30}%, ${18 + t * 64}%)`;
  return `hsl(45, ${35 + t * 30}%, ${88 - t * 58}%)`;
}

export function audibleSpeciesAt(t) {
  const song = state.song;
  if (!song) return [];
  const soloed = song.tracks.filter((tr) => tr.solo);
  const tracks = soloed.length ? soloed : song.tracks.filter((tr) => !tr.muted);
  const ids = new Set();
  const clipIds = new Set();
  for (const tr of tracks) {
    for (const c of tr.clips) {
      if (t >= c.start && t < c.start + c.duration / c.rate) {
        const rec = state.meta.recordingsById.get(c.recordingId);
        ids.add(rec.speciesId);
        clipIds.add(c.id);
      }
    }
  }
  return { species: [...ids].map((id) => state.meta.speciesById.get(id)), clipIds };
}

let lastKey = '';

function updateNowPlaying() {
  let species = [];
  let clipIds = new Set();
  if (transport.playing) {
    const res = audibleSpeciesAt(transport.position());
    species = res.species;
    clipIds = res.clipIds;
  } else {
    const sp = previewingSpecies();
    if (sp) species = [sp];
  }

  // clip glow
  for (const el of document.querySelectorAll('.clip')) {
    el.classList.toggle('playing-now', transport.playing && clipIds.has(el.dataset.clipId));
  }

  const key = species.map((s) => s.id).join(',') + (transport.playing ? '|p' : '');
  if (key === lastKey) return;
  lastKey = key;

  const wrap = document.getElementById('now-playing');
  wrap.textContent = '';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = 'Now singing:';
  wrap.appendChild(label);
  if (!species.length) {
    const dash = document.createElement('span');
    dash.className = 'small muted';
    dash.textContent = '—';
    wrap.appendChild(dash);
    return;
  }
  for (const sp of species) {
    const chip = document.createElement('span');
    chip.className = 'chip static selected fade-up';
    chip.textContent = `🐦 ${sp.commonName}`;
    wrap.appendChild(chip);
  }
}

export function playheadForViz() {
  return transport.playing ? transport.position() : getPlayhead();
}
