// Central studio state + tiny pub/sub + undo/redo snapshots.

export const state = {
  song: null,
  meta: null,          // loaded metadata indexes (common.js loadMetadata)
  selectedClipId: null,
  clipboard: null,     // copied clip (plain object)
  pxPerSec: 60,
  undoStack: [],
  redoStack: [],
};

const listeners = new Set();

export function onChange(fn) {
  listeners.add(fn);
}

export function emitChange(kind = 'song') {
  for (const fn of listeners) fn(kind);
}

// Call before mutating state.song (once per user gesture, not per pointermove).
export function beginEdit() {
  state.undoStack.push(structuredClone(state.song));
  if (state.undoStack.length > 50) state.undoStack.shift();
  state.redoStack.length = 0;
}

export function undo() {
  if (!state.undoStack.length) return;
  state.redoStack.push(structuredClone(state.song));
  state.song = state.undoStack.pop();
  state.selectedClipId = null;
  emitChange();
}

export function redo() {
  if (!state.redoStack.length) return;
  state.undoStack.push(structuredClone(state.song));
  state.song = state.redoStack.pop();
  state.selectedClipId = null;
  emitChange();
}

export function findClip(clipId) {
  for (const track of state.song.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

export function beatSec() {
  return 60 / state.song.bpm;
}

export function snap(t) {
  const grid = beatSec() / 2;
  return Math.max(0, Math.round(t / grid) * grid);
}

export function speciesColor(speciesId) {
  // Deterministic pleasant hue per species; pairs with the text label so color
  // is never the only signal (accessibility note in requirements §8).
  let h = 0;
  for (const ch of speciesId) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h}, 42%, 42%)`;
}
