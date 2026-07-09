// Studio bootstrap and transport/inspector wiring.

import { initTheme, loadMetadata, toast, isMobileLike, uid } from '../common.js';
import { LIMITS, getSong, saveSong, newSong, saveAutosave, loadAutosave, songDuration } from '../store.js';
import { transport, renderSongToWav, stopPreview } from '../audio.js';
import { state, onChange, emitChange, beginEdit, undo, redo, findClip, snap } from './state.js';
import { initLibrary, renderLibrary } from './library.js';
import { initTimeline, renderTimeline, getPlayhead, setPlayhead, addClipToTrack } from './timeline.js';
import { initViz } from './viz.js';
import { buildExampleSong, surpriseMe } from './songs-gen.js';
import { maybeStartTutorial } from './tutorial.js';
import { selectedRecording } from './library.js';

const $ = (id) => document.getElementById(id);

async function boot() {
  initTheme();
  state.meta = await loadMetadata();

  const params = new URLSearchParams(location.search);
  const songId = params.get('song');

  if (songId) {
    state.song = getSong(songId);
    if (!state.song) {
      toast('Song not found — starting fresh');
      state.song = newSong();
    }
  } else if (params.get('example')) {
    state.song = await buildExampleSong(state.meta);
  } else {
    const auto = loadAutosave();
    if (auto?.tracks) {
      state.song = auto;
    } else {
      // First visit: preloaded example beats a blank canvas (requirements §8).
      state.song = await buildExampleSong(state.meta);
    }
  }

  initLibrary();
  initViz();

  const mobile = isMobileLike();
  if (mobile) {
    bootMobile();
    return;
  }

  initTimeline();
  wireTransport();
  wireInspector();
  wireKeyboard();

  onChange(handleChange);
  emitChange();

  if (params.get('export')) {
    doExport();
  } else {
    maybeStartTutorial();
  }

  requestAnimationFrame(playheadLoop);
}

// ── change handling / rendering ─────────────────────────────────

let autosaveTimer = null;

function handleChange(kind) {
  if (kind === 'playhead' || kind === 'preview' || kind === 'selection') {
    if (kind === 'selection') renderInspector();
    if (kind === 'selection') syncClipSelection();
    return;
  }
  renderTimeline();
  renderInspector();
  $('song-name').value = state.song.name;
  $('bpm').value = state.song.bpm;
  $('btn-undo').disabled = !state.undoStack.length;
  $('btn-redo').disabled = !state.redoStack.length;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => saveAutosave(state.song), 700);
}

function syncClipSelection() {
  for (const el of document.querySelectorAll('.clip')) {
    el.classList.toggle('selected', el.dataset.clipId === state.selectedClipId);
  }
}

// ── transport ───────────────────────────────────────────────────

function wireTransport() {
  $('btn-play').addEventListener('click', togglePlay);
  $('btn-stop').addEventListener('click', () => {
    stopPlayback();
    setPlayhead(0, { scroll: true });
  });

  $('bpm').addEventListener('change', () => {
    const next = Math.max(LIMITS.minBpm, Math.min(LIMITS.maxBpm, Number($('bpm').value) || 120));
    if (next === state.song.bpm) return;
    beginEdit();
    // Keep the groove: rescale clip positions so the whole song speeds up/slows down.
    const f = state.song.bpm / next;
    for (const t of state.song.tracks) for (const c of t.clips) c.start *= f;
    state.song.bpm = next;
    emitChange();
  });

  $('song-name').addEventListener('change', () => {
    state.song.name = $('song-name').value.trim() || 'Untitled song';
  });

  $('btn-save').addEventListener('click', saveNow);
  $('btn-export').addEventListener('click', doExport);
  $('btn-undo').addEventListener('click', undo);
  $('btn-redo').addEventListener('click', redo);
  $('btn-surprise').addEventListener('click', async () => {
    const hasClips = state.song.tracks.some((t) => t.clips.length);
    if (hasClips && !confirm('Replace the current arrangement with a surprise one?')) return;
    stopPlayback();
    $('btn-surprise').disabled = true;
    try {
      await surpriseMe();
      toast('🎲 Here’s something to remix!');
    } finally {
      $('btn-surprise').disabled = false;
    }
  });
}

async function togglePlay() {
  if (transport.playing) {
    stopPlayback();
    return;
  }
  stopPreview();
  const dur = songDuration(state.song);
  if (dur <= 0) {
    toast('Drop some bird sounds on a track first 🐦');
    return;
  }
  $('btn-play').textContent = '⏸';
  transport.onended = () => {
    $('btn-play').textContent = '▶';
    setPlayhead(0);
  };
  await transport.play(state.song, getPlayhead() >= dur ? 0 : getPlayhead(), state.meta.recordingsById, dur);
  if (getPlayhead() >= dur) setPlayhead(0);
}

function stopPlayback() {
  if (!transport.playing) return;
  transport.stop();
  setPlayhead(transport.position());
  $('btn-play').textContent = '▶';
}

function playheadLoop() {
  if (transport.playing) setPlayhead(transport.position(), { scroll: true });
  requestAnimationFrame(playheadLoop);
}

// ── save / export ───────────────────────────────────────────────

function saveNow() {
  saveSong(state.song);
  toast('Saved to this browser 💾');
}

async function doExport() {
  const dur = songDuration(state.song);
  if (dur <= 0) {
    toast('Nothing to export yet — add some clips first');
    return;
  }
  const btn = $('btn-export');
  btn.disabled = true;
  btn.textContent = '⏳ Rendering…';
  try {
    const blob = await renderSongToWav(state.song, state.meta.recordingsById, dur);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.song.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'bird_song'}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Exported! Check your downloads 🎉');
  } catch (err) {
    console.error(err);
    toast('Export failed — see console for details');
  } finally {
    btn.disabled = false;
    btn.textContent = '⬇ Export';
  }
}

// ── inspector ───────────────────────────────────────────────────

function wireInspector() {
  const pitch = $('insp-pitch');
  const rate = $('insp-rate');
  let editStarted = false;

  const startEdit = () => {
    if (!editStarted) {
      beginEdit();
      editStarted = true;
    }
  };

  pitch.addEventListener('input', () => {
    const found = findClip(state.selectedClipId);
    if (!found) return;
    startEdit();
    found.clip.semitones = Number(pitch.value);
    $('insp-pitch-val').textContent = `${pitch.value > 0 ? '+' : ''}${pitch.value} st`;
  });
  rate.addEventListener('input', () => {
    const found = findClip(state.selectedClipId);
    if (!found) return;
    startEdit();
    found.clip.rate = Number(rate.value) / 100;
    $('insp-rate-val').textContent = `${rate.value}%`;
  });
  for (const el of [pitch, rate]) {
    el.addEventListener('change', () => {
      editStarted = false;
      emitChange();
    });
  }

  $('insp-delete').addEventListener('click', deleteSelected);
  $('insp-dup').addEventListener('click', () => {
    const found = findClip(state.selectedClipId);
    if (!found) return;
    beginEdit();
    const copy = structuredClone(found.clip);
    copy.id = uid();
    copy.start = snap(found.clip.start + found.clip.duration / found.clip.rate);
    found.track.clips.push(copy);
    state.selectedClipId = copy.id;
    emitChange();
  });
  $('insp-split').addEventListener('click', () => {
    const found = findClip(state.selectedClipId);
    if (!found) return;
    const { clip, track } = found;
    const t = getPlayhead();
    const len = clip.duration / clip.rate;
    if (t <= clip.start + 0.02 || t >= clip.start + len - 0.02) {
      toast('Move the playhead over the clip to split it');
      return;
    }
    beginEdit();
    const srcSplit = (t - clip.start) * clip.rate;
    const second = structuredClone(clip);
    second.id = uid();
    second.offset = clip.offset + srcSplit;
    second.duration = clip.duration - srcSplit;
    second.start = t;
    clip.duration = srcSplit;
    track.clips.push(second);
    state.selectedClipId = second.id;
    emitChange();
  });
}

function renderInspector() {
  const box = $('inspector');
  const found = state.selectedClipId ? findClip(state.selectedClipId) : null;
  box.classList.toggle('hidden', !found);
  if (!found) return;
  const rec = state.meta.recordingsById.get(found.clip.recordingId);
  const sp = state.meta.speciesById.get(rec.speciesId);
  $('insp-title').textContent = `${sp.commonName} · ${rec.label}`;
  $('insp-pitch').value = found.clip.semitones;
  $('insp-pitch-val').textContent = `${found.clip.semitones > 0 ? '+' : ''}${found.clip.semitones} st`;
  $('insp-rate').value = Math.round(found.clip.rate * 100);
  $('insp-rate-val').textContent = `${Math.round(found.clip.rate * 100)}%`;
}

function deleteSelected() {
  const found = findClip(state.selectedClipId);
  if (!found) return;
  beginEdit();
  found.track.clips = found.track.clips.filter((c) => c.id !== found.clip.id);
  state.selectedClipId = null;
  emitChange();
}

// ── keyboard ────────────────────────────────────────────────────

function wireKeyboard() {
  addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const mod = e.ctrlKey || e.metaKey;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (mod && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey) || e.key === 'Z')) {
      e.preventDefault();
      redo();
    } else if (mod && e.key === 's') {
      e.preventDefault();
      saveNow();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.selectedClipId) {
        e.preventDefault();
        deleteSelected();
      }
    } else if (mod && e.key === 'c') {
      const found = findClip(state.selectedClipId);
      if (found) {
        state.clipboard = { clip: structuredClone(found.clip), trackId: found.track.id };
        toast('Clip copied — Ctrl+V pastes at the playhead');
      }
    } else if (mod && e.key === 'v') {
      if (!state.clipboard) return;
      beginEdit();
      const track = state.song.tracks.find((t) => t.id === state.clipboard.trackId) ?? state.song.tracks[0];
      if (!track) return;
      const copy = structuredClone(state.clipboard.clip);
      copy.id = uid();
      copy.start = snap(getPlayhead());
      track.clips.push(copy);
      state.selectedClipId = copy.id;
      emitChange();
    } else if (e.key === 'Enter' && !mod) {
      // add selected library sample at playhead on first track with space
      const rec = selectedRecording();
      if (rec && state.song.tracks.length) {
        e.preventDefault();
        addClipToTrack(state.song.tracks[0], rec.id, snap(getPlayhead()));
      }
    }
  });
}

// ── mobile: browse + listen + simple playback ───────────────────

function bootMobile() {
  renderLibrary();
  const params = new URLSearchParams(location.search);
  if (!params.get('song') && !params.get('example')) return;

  const player = $('mobile-player');
  player.style.display = 'flex';
  $('mobile-song-name').textContent = state.song.name;
  const btn = $('mobile-play');
  let raf = null;

  const tickTime = () => {
    const t = transport.playing ? transport.position() : 0;
    const m = Math.floor(t / 60);
    $('mobile-time').textContent = `${m}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    if (transport.playing) raf = requestAnimationFrame(tickTime);
  };

  btn.addEventListener('click', async () => {
    if (transport.playing) {
      transport.stop();
      btn.textContent = '▶';
      cancelAnimationFrame(raf);
      return;
    }
    btn.textContent = '⏸';
    transport.onended = () => (btn.textContent = '▶');
    await transport.play(state.song, 0, state.meta.recordingsById, songDuration(state.song));
    tickTime();
  });
}

boot().catch((err) => {
  console.error(err);
  toast('Something went wrong loading the studio — try refreshing.');
});
