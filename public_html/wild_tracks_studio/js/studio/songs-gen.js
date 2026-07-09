// Generated arrangements: the preloaded example song and "Surprise me".

import { state, beginEdit, emitChange, beatSec } from './state.js';
import { newSong, newClip, newTrack } from '../store.js';
import { loadRecording, getRegion } from '../audio.js';
import { uid } from '../common.js';

function clipFor(rec, buf, startSec, { semitones = 0, rate = 1, maxLen = Infinity } = {}) {
  // Trim to the recording's active region so generated clips hit the bird
  // sound immediately instead of the recording's quiet lead-in.
  const region = getRegion(rec.id) ?? { start: 0, end: buf.duration };
  const c = newClip(rec.id, startSec, Math.max(0.1, Math.min(region.end - region.start, maxLen)));
  c.offset = region.start;
  c.semitones = semitones;
  c.rate = rate;
  return c;
}

// Deterministic starter song — the "blank canvas" antidote (requirements §8).
export async function buildExampleSong(meta) {
  const song = newSong('Backyard Chorus (example)');
  song.id = 'example-' + uid();
  const beat = 60 / song.bpm;
  const bar = beat * 4;

  const pick = (id) => meta.recordingsById.get(id);
  const drum = pick('downy-woodpecker-1');
  const chick = pick('black-capped-chickadee-1');
  const card = pick('northern-cardinal-1');
  const dove = pick('mourning-dove-1');

  const [drumBuf, chickBuf, cardBuf, doveBuf] = await Promise.all(
    [drum, chick, card, dove].map(loadRecording),
  );

  const rhythm = newTrack('Woodpecker beat');
  for (let barN = 0; barN < 8; barN++) {
    rhythm.clips.push(clipFor(drum, drumBuf, barN * bar, { maxLen: bar * 0.9, rate: 1.25 }));
  }
  rhythm.volume = 0.8;

  const melody = newTrack('Chickadee melody');
  const pitches = [0, 3, 5, 0];
  for (let i = 0; i < 4; i++) {
    melody.clips.push(
      clipFor(chick, chickBuf, i * bar * 2 + beat, { semitones: pitches[i], maxLen: bar * 1.5 }),
    );
  }
  melody.volume = 0.9;

  const feature = newTrack('Cardinal & dove');
  feature.clips.push(clipFor(card, cardBuf, bar * 2, { maxLen: bar * 2 }));
  feature.clips.push(clipFor(dove, doveBuf, bar * 5, { semitones: -2, maxLen: bar * 2.5 }));
  feature.clips.push(clipFor(card, cardBuf, bar * 6.5, { semitones: 5, rate: 1.5, maxLen: bar }));
  feature.volume = 0.85;

  song.tracks = [rhythm, melody, feature];
  return song;
}

// Random-but-reasonable starter arrangement dropped into the current song.
export async function surpriseMe() {
  const meta = state.meta;
  const recs = [...meta.raw.recordings];
  shuffle(recs);
  const picks = recs.slice(0, 3);
  const bufs = await Promise.all(picks.map(loadRecording));

  beginEdit();
  const beat = beatSec();
  const bar = beat * 4;
  const bars = 8;
  const scale = [0, -5, -3, 2, 4, 7]; // loosely pentatonic offsets
  const tracks = [];

  // rhythm: shortest sample, tight loop
  const order = picks.map((r, i) => ({ rec: r, buf: bufs[i] })).sort((a, b) => a.buf.duration - b.buf.duration);
  const rhythm = newTrack('Rhythm');
  const interval = order[0].buf.duration > beat * 1.6 ? 2 * beat : beat;
  for (let t = 0; t < bars * bar; t += interval * 2) {
    rhythm.clips.push(clipFor(order[0].rec, order[0].buf, t, { maxLen: interval * 0.95, rate: rand([1, 1.25, 1.5]) }));
  }
  tracks.push(rhythm);

  const melody = newTrack('Melody');
  for (let t = beat; t < bars * bar; t += bar) {
    if (Math.random() < 0.3) continue;
    melody.clips.push(
      clipFor(order[1].rec, order[1].buf, t, { semitones: rand(scale), maxLen: bar * 0.9, rate: rand([0.75, 1, 1]) }),
    );
  }
  tracks.push(melody);

  const texture = newTrack('Texture');
  for (let t = 0; t < bars * bar; t += bar * 2) {
    texture.clips.push(
      clipFor(order[2].rec, order[2].buf, t + rand([0, beat, 2 * beat]), { semitones: rand([-7, -5, 0]), rate: rand([0.5, 0.75]), maxLen: bar * 1.8 }),
    );
  }
  texture.volume = 0.6;
  tracks.push(texture);

  state.song.tracks = tracks;
  state.selectedClipId = null;
  emitChange();
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
