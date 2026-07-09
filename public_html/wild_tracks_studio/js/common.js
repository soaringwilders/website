// Shared page helpers: theme toggle, toasts, metadata loading.

const THEME_KEY = 'birdmusic.theme';

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.dataset.theme = saved;
  }
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;
  const syncLabel = () => {
    btn.textContent = currentTheme() === 'dark' ? '☀️' : '🌙';
    btn.setAttribute('aria-label', currentTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  };
  btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    syncLabel();
  });
  syncLabel();
}

function currentTheme() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit) return explicit;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let toastWrap = null;

export function toast(message, ms = 2600) {
  if (!toastWrap) {
    toastWrap = document.createElement('div');
    toastWrap.className = 'toast-wrap';
    document.body.appendChild(toastWrap);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  toastWrap.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

let metadataPromise = null;

// Loads data/metadata.json once and returns { raw, speciesById, recordingsById,
// recordingsBySpecies, recordingsBySoundType }.
export function loadMetadata() {
  if (!metadataPromise) {
    metadataPromise = fetch('data/metadata.json')
      .then((r) => {
        if (!r.ok) throw new Error(`metadata.json: HTTP ${r.status}`);
        return r.json();
      })
      .then((raw) => {
        const speciesById = new Map(raw.species.map((s) => [s.id, s]));
        const soundTypesById = new Map(raw.soundTypes.map((t) => [t.id, t]));
        const recordingsById = new Map(raw.recordings.map((r) => [r.id, r]));
        const recordingsBySpecies = new Map();
        const recordingsBySoundType = new Map();
        for (const rec of raw.recordings) {
          if (!recordingsBySpecies.has(rec.speciesId)) recordingsBySpecies.set(rec.speciesId, []);
          recordingsBySpecies.get(rec.speciesId).push(rec);
          for (const t of rec.soundTypes) {
            if (!recordingsBySoundType.has(t)) recordingsBySoundType.set(t, []);
            recordingsBySoundType.get(t).push(rec);
          }
        }
        return { raw, speciesById, soundTypesById, recordingsById, recordingsBySpecies, recordingsBySoundType };
      });
  }
  return metadataPromise;
}

export function isMobileLike() {
  return matchMedia('(max-width: 820px), (pointer: coarse) and (max-width: 1024px)').matches;
}

export function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
