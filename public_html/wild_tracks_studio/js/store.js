// Local song persistence (no accounts — localStorage only, per requirements §2/§7).
//
// Song shape:
// {
//   id, name, bpm, createdAt, updatedAt,
//   tracks: [{ id, name, volume (0..1), muted, solo, clips: [
//     { id, recordingId, start, offset, duration, semitones, rate }
//   ]}]
// }
// Clip times are in seconds on the timeline; `offset`/`duration` describe the
// trimmed window of the source recording (pre-stretch); audible length is
// duration / rate.

import { uid } from './common.js';

const SONGS_KEY = 'birdmusic.songs.v1';
const AUTOSAVE_KEY = 'birdmusic.autosave.v1';

export const LIMITS = {
  maxTracks: 8,
  maxSongSeconds: 180,
  minBpm: 40,
  maxBpm: 240,
  minSemitones: -12,
  maxSemitones: 12,
  minRate: 0.5,
  maxRate: 2,
};

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(SONGS_KEY)) ?? [];
  } catch {
    return [];
  }
}

function writeAll(songs) {
  localStorage.setItem(SONGS_KEY, JSON.stringify(songs));
}

export function listSongs() {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSong(id) {
  return readAll().find((s) => s.id === id) ?? null;
}

export function saveSong(song) {
  const songs = readAll();
  song.updatedAt = Date.now();
  const i = songs.findIndex((s) => s.id === song.id);
  if (i >= 0) songs[i] = song;
  else songs.push(song);
  writeAll(songs);
  return song;
}

export function deleteSong(id) {
  writeAll(readAll().filter((s) => s.id !== id));
}

export function newSong(name = 'Untitled song') {
  return {
    id: uid(),
    name,
    bpm: 120,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tracks: [newTrack('Track 1'), newTrack('Track 2'), newTrack('Track 3')],
  };
}

export function newTrack(name) {
  return { id: uid(), name, volume: 0.85, muted: false, solo: false, clips: [] };
}

export function newClip(recordingId, start, duration) {
  return { id: uid(), recordingId, start, offset: 0, duration, semitones: 0, rate: 1 };
}

export function saveAutosave(song) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(song));
  } catch {
    /* storage full — autosave is best-effort */
  }
}

export function loadAutosave() {
  try {
    return JSON.parse(localStorage.getItem(AUTOSAVE_KEY));
  } catch {
    return null;
  }
}

export function clearAutosave() {
  localStorage.removeItem(AUTOSAVE_KEY);
}

export function songDuration(song) {
  let end = 0;
  for (const t of song.tracks) {
    for (const c of t.clips) end = Math.max(end, c.start + c.duration / c.rate);
  }
  return end;
}
